// API dei Quiz GS LOFT — una sola Netlify Function che gestisce tutte le rotte /api/*
// Dati salvati in Netlify Blobs (store "quiz-gsloft"), sessione in cookie HttpOnly firmato.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";

export const config = { path: "/api/*" };

const SESSION_HOURS = 12;
const GRACE_MS = 5000; // tolleranza di rete sullo scadere del tempo
const COOKIE = "gsq";

const db = () => getStore({ name: "quiz-gsloft", consistency: "strong" });

/* ---------------- utilità ---------------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
const fail = (message, status = 400) => json({ error: message }, status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const normEmail = (e) => String(e || "").trim().toLowerCase();
const emailKey = (e) => sha("email:" + normEmail(e)).toString("hex").slice(0, 32);
const newId = () => "q" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
const newCode = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (x) => A[x % A.length]).join("");
};
const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const range = (n) => Array.from({ length: n }, (_, i) => i);

/* ---------------- sessione ---------------- */
const b64u = (s) => Buffer.from(s).toString("base64url");
function sign(payload) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + SESSION_HOURS * 3600e3 }));
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function verify(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  if (!safeEq(sig, good)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
function readSession(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return verify(m && m[1]);
}

/* ---------------- dati ---------------- */
async function getPeople() {
  return (await db().get("people", { type: "json" }))?.list || [];
}
async function listQuizzes() {
  const store = db();
  const { blobs } = await store.list({ prefix: "quizzes/" });
  const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
const getQuiz = (id) => db().get("quizzes/" + id, { type: "json" });
const attemptKey = (quizId, email) => `attempts/${quizId}/${emailKey(email)}`;
const getAttempt = (quizId, email) => db().get(attemptKey(quizId, email), { type: "json" });
const saveAttempt = (a) => db().setJSON(attemptKey(a.quizId, a.email), a);

function validateQuiz(q) {
  const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (!q || typeof q !== "object") return "Dati del quiz mancanti.";
  if (!str(q.title, 200)) return "Titolo mancante o troppo lungo.";
  if (q.desc && (typeof q.desc !== "string" || q.desc.length > 2000)) return "Istruzioni troppo lunghe.";
  if (!Number.isInteger(q.duration) || q.duration < 1 || q.duration > 300) return "Durata tra 1 e 300 minuti.";
  if (!Number.isInteger(q.passPct) || q.passPct < 0 || q.passPct > 100) return "Soglia tra 0 e 100.";
  if (!Array.isArray(q.questions) || q.questions.length < 1 || q.questions.length > 300) return "Servono da 1 a 300 domande.";
  for (const [i, x] of q.questions.entries()) {
    if (!str(x.text, 3000)) return `Domanda ${i + 1}: testo mancante.`;
    if (!Array.isArray(x.options) || x.options.length < 2 || x.options.length > 6 || !x.options.every((o) => str(o, 1000)))
      return `Domanda ${i + 1}: servono da 2 a 6 risposte compilate.`;
    if (!Number.isInteger(x.correct) || x.correct < 0 || x.correct >= x.options.length)
      return `Domanda ${i + 1}: indica la risposta corretta.`;
  }
  return null;
}

/* ---------------- email ---------------- */
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mailConfigured = () => !!process.env.MAIL_FROM && !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
const siteUrl = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");

// Invia una lista di email {to, subject, html, text}. Usa Resend se c'è RESEND_API_KEY, altrimenti SMTP.
async function sendMails(msgs) {
  const from = process.env.MAIL_FROM;
  let sent = 0;
  const failed = [];
  if (process.env.RESEND_API_KEY) {
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(chunk.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }))),
      });
      if (r.ok) sent += chunk.length;
      else { failed.push(...chunk.map((m) => m.to)); console.error("Resend:", r.status, await r.text()); }
    }
    return { sent, failed };
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, pool: true, maxConnections: 3,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const res = await Promise.allSettled(msgs.map((m) => t.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text })));
  t.close();
  res.forEach((r, i) => { if (r.status === "fulfilled") sent++; else { failed.push(msgs[i].to); console.error("SMTP:", r.reason?.message); } });
  return { sent, failed };
}

function quizMail(quiz, person) {
  const link = siteUrl() || "(link del sito)";
  const n = quiz.questions.length;
  const nd = n === 1 ? "1 domanda" : `${n} domande`;
  const subject = `Nuovo quiz disponibile: ${quiz.title}`;
  const text = `Ciao,\n\nè disponibile un nuovo quiz: "${quiz.title}".\n${nd}, ${quiz.duration} minuti.\n\nAccedi da: ${link}\nEmail: ${person.email}\nCodice di accesso: ${person.code}\n\nLe domande compaiono una alla volta e non si può tornare indietro: mettiti in un momento tranquillo prima di iniziare.\n\nGS LOFT`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
  <div style="background:#111;color:#fff;padding:18px 24px;font-weight:700;letter-spacing:.04em;font-size:20px">GS·LOFT</div>
  <div style="padding:24px;border:1px solid #e1e1de;border-top:0">
    <p style="margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:#0a7a6d;font-weight:700">Nuovo quiz</p>
    <h1 style="margin:0 0 12px;font-size:22px">${escHtml(quiz.title)}</h1>
    <p style="margin:0 0 18px;color:#5f5f5c">${nd} · ${quiz.duration} minuti</p>
    ${quiz.desc ? `<p style="margin:0 0 18px">${escHtml(quiz.desc)}</p>` : ""}
    <table style="border-collapse:collapse;margin:0 0 20px;font-size:15px"><tr><td style="padding:4px 16px 4px 0;color:#5f5f5c">Email</td><td><b>${escHtml(person.email)}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#5f5f5c">Codice</td><td style="font-family:Menlo,monospace;font-size:17px;letter-spacing:.12em"><b>${escHtml(person.code)}</b></td></tr></table>
    <a href="${escHtml(link)}" style="display:inline-block;background:#2ec4b0;color:#0b0b0b;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px">Vai al quiz</a>
    <p style="margin:20px 0 0;font-size:13px;color:#5f5f5c">Le domande compaiono una alla volta e non si può tornare indietro: mettiti in un momento tranquillo prima di iniziare.</p>
  </div></div>`;
  return { to: person.email, subject, text, html };
}

// Avvisa tutti i lavoratori abilitati e segna il quiz come notificato.
async function notifyQuiz(quiz) {
  if (!mailConfigured()) return { configured: false, sent: 0, failed: [] };
  const people = await getPeople();
  if (!people.length) return { configured: true, sent: 0, failed: [] };
  const r = await sendMails(people.map((p) => quizMail(quiz, p)));
  quiz.notifiedAt = Date.now();
  quiz.notifiedCount = r.sent;
  await db().setJSON("quizzes/" + quiz.id, quiz);
  return { configured: true, ...r };
}

/* ---------------- logica del tentativo ---------------- */
async function finalize(a, quiz, auto) {
  const now = Date.now();
  a.status = "consegnato";
  a.auto = !!auto;
  a.finishedAt = auto ? Math.min(now, a.deadline) : now;
  a.total = quiz.questions.length;
  a.score = quiz.questions.reduce((s, q, i) => s + (a.answers[i] === q.correct ? 1 : 0), 0);
  await saveAttempt(a);
  return a;
}
// Lo stato restituito al lavoratore: mai le risposte corrette, mai le domande successive.
async function publicState(a, quiz) {
  if (a.status === "in_corso" && (Date.now() > a.deadline || a.pos >= quiz.questions.length))
    await finalize(a, quiz, a.pos < quiz.questions.length);
  if (a.status === "consegnato") return { status: "consegnato", title: quiz.title, auto: a.auto, score: a.score, total: a.total };
  const qi = a.order[a.pos];
  const q = quiz.questions[qi];
  return {
    status: "in_corso",
    quizId: quiz.id,
    title: quiz.title,
    pos: a.pos,
    total: quiz.questions.length,
    remainingMs: Math.max(0, a.deadline - Date.now()),
    question: { text: q.text, options: a.optOrder[qi].map((i) => ({ i, text: q.options[i] })) },
  };
}

/* ---------------- router ---------------- */
export default async (req) => {
  if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD)
    return fail("Configurazione mancante: imposta ADMIN_PASSWORD e SESSION_SECRET nelle variabili d'ambiente di Netlify.", 500);

  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = req.method;
  let body = {};
  if (method !== "GET" && method !== "DELETE") {
    try { body = await req.json(); } catch { body = {}; }
  }

  try {
    /* ----- accesso ----- */
    if (route === "login" && method === "POST") {
      if (body.role === "admin") {
        if (!safeEq(body.password || "", process.env.ADMIN_PASSWORD)) {
          await sleep(600);
          return fail("Password non corretta.", 401);
        }
        return json({ role: "admin" }, 200, { "set-cookie": sessionCookie(sign({ role: "admin" }), SESSION_HOURS * 3600) });
      }
      const email = normEmail(body.email);
      const code = String(body.code || "").trim().toUpperCase();
      const p = (await getPeople()).find((x) => x.email === email);
      if (!p || !safeEq(code, p.code)) {
        await sleep(600);
        return fail("Email o codice non corretti.", 401);
      }
      return json({ role: "employee", email }, 200, {
        "set-cookie": sessionCookie(sign({ role: "employee", email }), SESSION_HOURS * 3600),
      });
    }
    if (route === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });

    const s = readSession(req);
    if (!s) return fail("Sessione scaduta: accedi di nuovo.", 401);

    if (route === "me" && method === "GET") {
      if (s.role === "employee" && !(await getPeople()).some((p) => p.email === s.email))
        return fail("Accesso revocato.", 401);
      return json({ role: s.role, email: s.email || null });
    }

    /* ----- area lavoratore ----- */
    if (s.role === "employee") {
      if (!(await getPeople()).some((p) => p.email === s.email)) return fail("Accesso revocato.", 401);

      if (route === "quizzes" && method === "GET") {
        const quizzes = (await listQuizzes()).filter((q) => q.active);
        const out = [];
        for (const q of quizzes) {
          const a = await getAttempt(q.id, s.email);
          out.push({ id: q.id, title: q.title, desc: q.desc || "", duration: q.duration, count: q.questions.length,
            status: a ? a.status : "da_fare", finishedAt: a?.finishedAt || null,
            score: a?.status === "consegnato" ? a.score : null, total: a?.status === "consegnato" ? a.total : null });
        }
        return json({ quizzes: out });
      }

      const quizId = body.quizId || url.searchParams.get("quizId");
      const quiz = quizId && (await getQuiz(quizId));
      if (!quiz || !quiz.active) return fail("Quiz non disponibile.", 404);

      if (route === "start" && method === "POST") {
        let a = await getAttempt(quiz.id, s.email);
        if (!a) {
          const n = quiz.questions.length, now = Date.now();
          a = {
            quizId: quiz.id, email: s.email, startedAt: now, deadline: now + quiz.duration * 60000,
            order: quiz.shuffleQ ? shuffle(range(n)) : range(n),
            optOrder: quiz.questions.map((x) => (quiz.shuffleO ? shuffle(range(x.options.length)) : range(x.options.length))),
            answers: {}, pos: 0, status: "in_corso", leaves: 0,
          };
          await saveAttempt(a);
        }
        return json(await publicState(a, quiz));
      }
      const a = await getAttempt(quiz.id, s.email);
      if (!a) return fail("Quiz non ancora iniziato.", 404);

      if (route === "attempt" && method === "GET") return json(await publicState(a, quiz));

      if (route === "answer" && method === "POST") {
        if (a.status !== "in_corso") return json(await publicState(a, quiz));
        if (Date.now() > a.deadline + GRACE_MS) return json(await publicState(a, quiz));
        if (body.pos !== a.pos) return json(await publicState(a, quiz)); // risposta già data o fuori sequenza
        const qi = a.order[a.pos];
        const choice = body.choice;
        if (!Number.isInteger(choice) || choice < 0 || choice >= quiz.questions[qi].options.length) return fail("Risposta non valida.");
        a.answers[qi] = choice;
        a.pos += 1;
        if (a.pos >= quiz.questions.length) await finalize(a, quiz, false);
        else await saveAttempt(a);
        return json(await publicState(a, quiz));
      }

      if (route === "leave" && method === "POST") {
        if (a.status === "in_corso") { a.leaves = (a.leaves || 0) + 1; await saveAttempt(a); }
        return json({ ok: true });
      }
      return fail("Operazione non trovata.", 404);
    }

    /* ----- area responsabile ----- */
    if (s.role !== "admin") return fail("Non autorizzato.", 403);

    if (route === "admin/quizzes") {
      if (method === "GET") return json({ quizzes: await listQuizzes() });
      if (method === "PUT") {
        const q = body.quiz;
        const err = validateQuiz(q);
        if (err) return fail(err);
        const old = q.id ? await getQuiz(q.id) : null;
        const id = old ? old.id : newId();
        const clean = {
          id, title: q.title.trim(), desc: (q.desc || "").trim(), duration: q.duration, passPct: q.passPct,
          shuffleQ: !!q.shuffleQ, shuffleO: !!q.shuffleO, active: !!q.active,
          createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(),
          notifiedAt: old?.notifiedAt || null, notifiedCount: old?.notifiedCount || 0,
          questions: q.questions.map((x) => ({ text: x.text.trim(), options: x.options.map((o) => o.trim()), correct: x.correct })),
        };
        await db().setJSON("quizzes/" + id, clean);
        // Prima attivazione: avvisa via email tutti i lavoratori abilitati
        const notify = clean.active && !clean.notifiedAt ? await notifyQuiz(clean) : null;
        return json({ quiz: clean, notify });
      }
      if (method === "PATCH") {
        const q = await getQuiz(body.id);
        if (!q) return fail("Quiz non trovato.", 404);
        q.active = !!body.active; q.updatedAt = Date.now();
        await db().setJSON("quizzes/" + q.id, q);
        const notify = q.active && !q.notifiedAt ? await notifyQuiz(q) : null;
        return json({ quiz: q, notify });
      }
      if (method === "DELETE") {
        await db().delete("quizzes/" + url.searchParams.get("id"));
        return json({ ok: true });
      }
    }

    if (route === "admin/notify" && method === "POST") {
      const q = await getQuiz(body.id);
      if (!q) return fail("Quiz non trovato.", 404);
      if (!q.active) return fail("Attiva il quiz prima di inviare l'avviso.");
      if (!mailConfigured()) return fail("Invio email non configurato: imposta MAIL_FROM e RESEND_API_KEY (oppure SMTP_*) su Netlify.");
      return json({ notify: await notifyQuiz(q) });
    }
    if (route === "admin/mailstatus" && method === "GET") return json({ configured: mailConfigured() });

    if (route === "admin/people") {
      const people = await getPeople();
      if (method === "GET") return json({ people });
      if (method === "POST") {
        const emails = [...new Set((body.emails || []).map(normEmail).filter(Boolean))];
        const bad = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
        if (!emails.length) return fail("Scrivi almeno un indirizzo email.");
        if (bad.length) return fail("Indirizzi non validi: " + bad.join(", "));
        const add = emails.filter((e) => !people.some((p) => p.email === e)).map((email) => ({ email, code: newCode(), addedAt: Date.now() }));
        const list = [...people, ...add];
        await db().setJSON("people", { list });
        return json({ people: list, added: add.length });
      }
      if (method === "PATCH") { // nuovo codice per una persona
        const email = normEmail(body.email);
        const list = people.map((p) => (p.email === email ? { ...p, code: newCode() } : p));
        await db().setJSON("people", { list });
        return json({ people: list });
      }
      if (method === "DELETE") {
        const email = normEmail(url.searchParams.get("email"));
        const list = people.filter((p) => p.email !== email);
        await db().setJSON("people", { list });
        return json({ people: list });
      }
    }

    if (route === "admin/results" && method === "GET") {
      const store = db();
      const quizzes = Object.fromEntries((await listQuizzes()).map((q) => [q.id, q]));
      const { blobs } = await store.list({ prefix: "attempts/" });
      const attempts = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }).then((a) => a && { ...a, key: b.key })))).filter(Boolean);
      for (const a of attempts) {
        const q = quizzes[a.quizId];
        if (q && a.status === "in_corso" && Date.now() > a.deadline + GRACE_MS) await finalize(a, q, true);
      }
      return json({ attempts });
    }

    if (route === "admin/attempt" && method === "DELETE") {
      const key = url.searchParams.get("key") || "";
      if (!/^attempts\/[\w-]+\/[a-f0-9]{32}$/.test(key)) return fail("Tentativo non valido.");
      await db().delete(key);
      return json({ ok: true });
    }

    return fail("Operazione non trovata.", 404);
  } catch (e) {
    console.error(e);
    return fail("Errore del server. Riprova tra qualche secondo.", 500);
  }
};
