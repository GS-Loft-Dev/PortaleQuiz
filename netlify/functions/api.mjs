// API dei Quiz GS LOFT — una sola Netlify Function che gestisce tutte le rotte /api/*
// Dati salvati in Netlify Blobs (store "quiz-gsloft"), sessione in cookie HttpOnly firmato.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { SURVEYS, getSurveyDef, cleanAnswers, nameFromEmail, validateDef, LOCKED } from "../lib/surveys.mjs";

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

/* ---------------- survey ---------------- */
// Configurazione modificabile dal responsabile: survey attiva o no, elenco nomi della domanda 1.
async function getSurveyConfig(id) {
  const c = await db().get("survey-config/" + id, { type: "json" });
  return { active: !!c?.active, names: Array.isArray(c?.names) ? c.names : [], updatedAt: c?.updatedAt || null };
}
// Domande della survey: quelle modificate dal responsabile se esistono, altrimenti l'originale nel codice.
async function getDef(id) {
  const base = getSurveyDef(id);
  if (!base) return null;
  return (await db().get("survey-defs/" + id, { type: "json" })) || base;
}
/* ---------------- email di accesso ----------------
   Variabili su Netlify: MAIL_FROM + RESEND_API_KEY (Resend) oppure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
   SITE_URL facoltativo (altrimenti l'indirizzo del sito Netlify). */
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mailConfigured = () => !!process.env.MAIL_FROM && !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
const siteUrl = () => (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");

async function sendMails(msgs) {
  const from = process.env.MAIL_FROM;
  let sent = 0;
  const failed = [];
  if (process.env.RESEND_API_KEY) {
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      try {
        const r = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify(chunk.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }))),
        });
        if (r.ok) sent += chunk.length;
        else { failed.push(...chunk.map((m) => m.to)); console.error("Resend:", r.status, await r.text()); }
      } catch (e) { failed.push(...chunk.map((m) => m.to)); console.error("Resend:", e.message); }
    }
    return { sent, failed };
  }
  const { default: nodemailer } = await import("nodemailer");
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

// Email con link, email e codice personale (accesso creato o codice rinnovato).
function accessMail(person, todo, renewed) {
  const link = siteUrl() || "(link del portale)";
  const name = nameFromEmail(person.email).split(" ")[0] || "";
  const subject = renewed ? "Il tuo nuovo codice per Learning · GS LOFT" : "Il tuo accesso a Learning · GS LOFT";
  const intro = renewed
    ? "il tuo codice di accesso a Learning è stato rinnovato: quello precedente non funziona più."
    : "ti è stato creato l'accesso a Learning, il portale GS LOFT per i quiz e le survey interne.";
  const todoLine = todo.length
    ? (todo.length === 1 ? `Trovi già da completare: ${todo[0]}.` : `Trovi già da completare: ${todo.join(", ")}.`)
    : "Quando ci sarà un quiz o una survey da completare lo troverai nel portale.";
  const text = `Ciao${name ? " " + name : ""},\n\n${intro}\n\nApri: ${link}\nScegli "Accesso" e inserisci:\nEmail: ${person.email}\nCodice di accesso: ${person.code}\n\n${todoLine}\n\nI quiz sono a tempo e si svolgono una sola volta: inizia solo quando hai il tempo indicato a disposizione.\nConserva questa email: il codice ti servirà ogni volta.\n\nGS LOFT`;
  const row = (k, v, mono) => `<tr><td style="padding:6px 18px 6px 0;color:#6b6b66;font-size:14px">${k}</td><td style="font-size:${mono ? 18 : 15}px;${mono ? "font-family:Menlo,Consolas,monospace;letter-spacing:.14em;" : ""}"><b>${escHtml(v)}</b></td></tr>`;
  const html = `<div style="background:#f1f3f1;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:540px;margin:0 auto;border-radius:16px;overflow:hidden;background:#fff;border:1px solid #e3e5e2">
    <div style="background:#0e0e0e;color:#fff;padding:20px 28px"><span style="font-weight:700;letter-spacing:.06em;font-size:20px">GS·LOFT</span><span style="color:#2ec4b0;font-size:12px;letter-spacing:.16em;font-weight:700;margin-left:12px">LEARNING</span></div>
    <div style="padding:28px">
      <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#0a7a6d;font-weight:700">${renewed ? "Nuovo codice" : "Accesso creato"}</p>
      <h1 style="margin:0 0 14px;font-size:24px;letter-spacing:-.02em">Ciao${name ? " " + escHtml(name) : ""}!</h1>
      <p style="margin:0 0 18px;line-height:1.5">${escHtml(intro.charAt(0).toUpperCase() + intro.slice(1))}</p>
      <p style="margin:0 0 6px;color:#6b6b66;font-size:14px">Apri il portale, scegli <b>Accesso</b> e inserisci:</p>
      <table style="border-collapse:collapse;margin:0 0 22px">${row("Email", person.email)}${row("Codice", person.code, true)}</table>
      <a href="${escHtml(link)}" style="display:inline-block;background:#2ec4b0;color:#06201c;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Apri Learning</a>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.5">${escHtml(todoLine)}</p>
      <p style="margin:12px 0 0;font-size:13px;color:#6b6b66;line-height:1.5">I quiz sono a tempo e si svolgono una sola volta: inizia solo quando hai il tempo indicato a disposizione. Conserva questa email: il codice ti servirà ogni volta.</p>
    </div></div></div>`;
  return { to: person.email, subject, text, html };
}

// Cosa trova la persona appena entra (quiz e survey attivi), per la riga dell'email.
async function activeTitles() {
  const t = (await listQuizzes()).filter((q) => q.active).map((q) => `il quiz "${q.title}"`);
  for (const base of SURVEYS) if ((await getSurveyConfig(base.id)).active) t.push(`la survey "${(await getDef(base.id)).title}"`);
  return t;
}

// Invia l'email di accesso e registra data di invio (o errore) nell'elenco.
async function sendAccess(emails, renewed = false) {
  if (!mailConfigured() || !emails.length) return { configured: mailConfigured(), sent: 0, failed: [] };
  const people = await getPeople();
  const targets = people.filter((p) => emails.includes(p.email));
  const todo = await activeTitles();
  const r = await sendMails(targets.map((p) => accessMail(p, todo, renewed)));
  const now = Date.now();
  const list = (await getPeople()).map((p) => {
    if (!emails.includes(p.email)) return p;
    return r.failed.includes(p.email) ? { ...p, mailError: now } : { ...p, mailedAt: now, mailError: null };
  });
  await db().setJSON("people", { list });
  return { configured: true, ...r, people: list };
}

const responseKey = (surveyId, email) => `survey-responses/${surveyId}/${emailKey(email)}`;
async function listResponses(prefix = "survey-responses/") {
  const store = db();
  const { blobs } = await store.list({ prefix });
  const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }).then((r) => r && { ...r, key: b.key })));
  return all.filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
const cleanNames = (list) =>
  [...new Set((Array.isArray(list) ? list : []).map((n) => String(n || "").trim().replace(/\s+/g, " ").slice(0, 120)).filter(Boolean))].slice(0, 500);

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

/* ---------------- logica del tentativo ---------------- */
// Domande del tentativo: la copia salvata all'inizio (se il quiz viene modificato dopo, il tentativo resta coerente).
const qsOf = (a, quiz) => (Array.isArray(a.questions) && a.questions.length ? a.questions : quiz.questions);
async function finalize(a, quiz, auto) {
  const now = Date.now(), Q = qsOf(a, quiz);
  a.status = "consegnato";
  a.auto = !!auto;
  a.finishedAt = auto ? Math.min(now, a.deadline) : now;
  a.total = Q.length;
  a.score = Q.reduce((s, q, i) => s + (a.answers[i] === q.correct ? 1 : 0), 0);
  await saveAttempt(a);
  return a;
}
// Lo stato restituito al dipendente: mai le risposte corrette, mai le domande successive.
async function publicState(a, quiz) {
  const Q = qsOf(a, quiz);
  if (a.status === "in_corso" && (Date.now() > a.deadline || a.pos >= Q.length))
    await finalize(a, quiz, a.pos < Q.length);
  if (a.status === "consegnato") return { status: "consegnato", title: quiz.title, auto: a.auto };
  const qi = a.order[a.pos];
  const q = Q[qi];
  return {
    status: "in_corso",
    quizId: quiz.id,
    title: quiz.title,
    pos: a.pos,
    total: Q.length,
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

    /* ----- area dipendente ----- */
    if (s.role === "employee") {
      if (!(await getPeople()).some((p) => p.email === s.email)) return fail("Accesso revocato.", 401);

      if (route === "quizzes" && method === "GET") {
        const quizzes = (await listQuizzes()).filter((q) => q.active);
        const out = [];
        for (const q of quizzes) {
          const a = await getAttempt(q.id, s.email);
          out.push({ id: q.id, title: q.title, desc: q.desc || "", duration: q.duration, count: q.questions.length,
            status: a ? a.status : "da_fare", finishedAt: a?.finishedAt || null, name: a?.name || null });
        }
        return json({ quizzes: out });
      }

      /* survey: elenco, apertura, invio (le risposte si possono aggiornare finché la survey è attiva) */
      if (route === "surveys" && method === "GET") {
        const out = [];
        for (const base of SURVEYS) {
          const cfg = await getSurveyConfig(base.id);
          if (!cfg.active) continue;
          const def = await getDef(base.id);
          const r = await db().get(responseKey(def.id, s.email), { type: "json" });
          out.push({ id: def.id, title: def.title, subtitle: def.subtitle, estimate: def.estimate, submittedAt: r?.updatedAt || null });
        }
        return json({ surveys: out });
      }
      if (route === "survey") {
        const def = await getDef(body.id || url.searchParams.get("id"));
        const cfg = def && (await getSurveyConfig(def.id));
        if (!def || !cfg.active) return fail("Survey non disponibile.", 404);
        const key = responseKey(def.id, s.email);
        const old = await db().get(key, { type: "json" });
        if (method === "GET") return json({ survey: def, names: cfg.names, mine: old?.answers || null, submittedAt: old?.updatedAt || null });
        if (method === "PUT") {
          const { answers, errors } = cleanAnswers(def, body.answers, cfg.names);
          if (errors.length) return fail("Risposte incomplete: " + errors.slice(0, 3).join(" "), 400);
          const now = Date.now();
          const rec = { surveyId: def.id, email: s.email, name: nameFromEmail(s.email), answers,
            createdAt: old?.createdAt || now, updatedAt: now, edits: (old?.edits || 0) + (old ? 1 : 0) };
          await db().setJSON(key, rec);
          return json({ ok: true, submittedAt: now });
        }
      }

      const quizId = body.quizId || url.searchParams.get("quizId");
      const quiz = quizId && (await getQuiz(quizId));
      if (!quiz || !quiz.active) return fail("Quiz non disponibile.", 404);

      if (route === "start" && method === "POST") {
        const name = nameFromEmail(s.email); // la persona è quella dell'email con cui è entrata
        let a = await getAttempt(quiz.id, s.email);
        if (!a) {
          const n = quiz.questions.length, now = Date.now();
          a = {
            quizId: quiz.id, email: s.email, name, startedAt: now, deadline: now + quiz.duration * 60000,
            order: quiz.shuffleQ ? shuffle(range(n)) : range(n),
            optOrder: quiz.questions.map((x) => (quiz.shuffleO ? shuffle(range(x.options.length)) : range(x.options.length))),
            answers: {}, pos: 0, status: "in_corso", leaves: 0,
            // copia delle domande com'erano all'inizio del tentativo
            questions: quiz.questions.map((x) => ({ text: x.text, options: x.options.slice(), correct: x.correct, ...(x.section ? { section: x.section } : {}) })),
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
        const Q = qsOf(a, quiz);
        if (!Number.isInteger(choice) || choice < 0 || choice >= Q[qi].options.length) return fail("Risposta non valida.");
        a.answers[qi] = choice;
        a.pos += 1;
        if (a.pos >= Q.length) await finalize(a, quiz, false);
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
          questions: q.questions.map((x) => ({ text: x.text.trim(), options: x.options.map((o) => o.trim()), correct: x.correct })),
        };
        await db().setJSON("quizzes/" + id, clean);
        return json({ quiz: clean });
      }
      if (method === "PATCH") {
        const q = await getQuiz(body.id);
        if (!q) return fail("Quiz non trovato.", 404);
        q.active = !!body.active; q.updatedAt = Date.now();
        await db().setJSON("quizzes/" + q.id, q);
        return json({ quiz: q });
      }
      if (method === "DELETE") {
        await db().delete("quizzes/" + url.searchParams.get("id"));
        return json({ ok: true });
      }
    }

    if (route === "admin/people/mail" && method === "POST") { // (re)invia l'email di accesso
      const email = normEmail(body.email);
      if (!(await getPeople()).some((p) => p.email === email)) return fail("Email non autorizzata.", 404);
      if (!mailConfigured()) return fail("L'invio delle email non è configurato.");
      const r = await sendAccess([email]);
      if (r.failed.length) return fail("Invio non riuscito. Controlla le impostazioni email e riprova.", 502);
      return json(r);
    }

    if (route === "admin/people") {
      const people = await getPeople();
      if (method === "GET") return json({ people, mail: mailConfigured() });
      if (method === "POST") {
        const emails = [...new Set((body.emails || []).map(normEmail).filter(Boolean))];
        const bad = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
        if (!emails.length) return fail("Scrivi almeno un indirizzo email.");
        if (bad.length) return fail("Indirizzi non validi: " + bad.join(", "));
        const add = emails.filter((e) => !people.some((p) => p.email === e)).map((email) => ({ email, code: newCode(), addedAt: Date.now() }));
        const list = [...people, ...add];
        await db().setJSON("people", { list });
        const m = body.sendMail !== false && add.length ? await sendAccess(add.map((p) => p.email)) : { configured: mailConfigured(), sent: 0, failed: [] };
        return json({ people: m.people || list, added: add.length, mail: { configured: m.configured, sent: m.sent, failed: m.failed } });
      }
      if (method === "PATCH") { // nuovo codice per una persona (con email, se configurata)
        const email = normEmail(body.email);
        const list = people.map((p) => (p.email === email ? { ...p, code: newCode(), mailedAt: null } : p));
        await db().setJSON("people", { list });
        const m = body.sendMail !== false ? await sendAccess([email], true) : { configured: mailConfigured(), sent: 0, failed: [] };
        return json({ people: m.people || list, mail: { configured: m.configured, sent: m.sent, failed: m.failed } });
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

    if (route === "admin/surveys") {
      if (method === "GET") {
        const responses = await listResponses();
        const surveys = await Promise.all(SURVEYS.map(async (base) => {
          const custom = await db().get("survey-defs/" + base.id, { type: "json" });
          return { ...(await getSurveyConfig(base.id)), def: custom || base, edited: custom ? custom.editedAt || true : false,
            count: responses.filter((r) => r.surveyId === base.id).length };
        }));
        return json({ surveys, locked: LOCKED });
      }
      if (method === "PATCH") {
        const def = getSurveyDef(body.id);
        if (!def) return fail("Survey non trovata.", 404);
        const cfg = await getSurveyConfig(def.id);
        if ("active" in body) cfg.active = !!body.active;
        if ("names" in body) cfg.names = cleanNames(body.names);
        cfg.updatedAt = Date.now();
        await db().setJSON("survey-config/" + def.id, cfg);
        return json({ ok: true, ...cfg });
      }
    }

    if (route === "admin/survey-def") {
      const base = getSurveyDef(body.id || url.searchParams.get("id"));
      if (!base) return fail("Survey non trovata.", 404);
      if (method === "PUT") {
        const { def, error } = validateDef(body.def, base);
        if (error) return fail(error);
        def.editedAt = Date.now();
        await db().setJSON("survey-defs/" + base.id, def);
        return json({ def });
      }
      if (method === "DELETE") { // torna alla versione originale
        await db().delete("survey-defs/" + base.id);
        return json({ def: base });
      }
    }

    if (route === "admin/survey-responses" && method === "GET") return json({ responses: await listResponses() });

    if (route === "admin/survey-response" && method === "DELETE") {
      const key = url.searchParams.get("key") || "";
      if (!/^survey-responses\/[\w-]+\/[a-f0-9]{32}$/.test(key)) return fail("Risposta non valida.");
      await db().delete(key);
      return json({ ok: true });
    }

    // Pulizia degli invii: elimina consegne dei quiz e/o risposte delle survey. Quiz, survey e accessi restano.
    // body: { quizzes: "all" | "<idQuiz>" | null, surveys: "all" | "<idSurvey>" | null }
    if (route === "admin/purge" && method === "POST") {
      const ok = (v) => v === "all" || (typeof v === "string" && /^[\w-]+$/.test(v));
      const prefixes = [];
      if (body.quizzes) { if (!ok(body.quizzes)) return fail("Quiz non valido."); prefixes.push(body.quizzes === "all" ? "attempts/" : `attempts/${body.quizzes}/`); }
      if (body.surveys) { if (!ok(body.surveys)) return fail("Survey non valida."); prefixes.push(body.surveys === "all" ? "survey-responses/" : `survey-responses/${body.surveys}/`); }
      if (!prefixes.length) return fail("Scegli cosa eliminare.");
      const store = db();
      let deleted = 0;
      for (const prefix of prefixes) {
        const { blobs } = await store.list({ prefix });
        await Promise.all(blobs.map((b) => store.delete(b.key)));
        deleted += blobs.length;
      }
      return json({ ok: true, deleted });
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
