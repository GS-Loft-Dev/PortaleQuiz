// API dei Quiz GS LOFT — una sola Netlify Function che gestisce tutte le rotte /api/*
// Dati salvati in Netlify Blobs (store "quiz-gsloft"), sessione in cookie HttpOnly firmato.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

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
// Lo stato restituito al dipendente: mai le risposte corrette, mai le domande successive.
async function publicState(a, quiz) {
  if (a.status === "in_corso" && (Date.now() > a.deadline || a.pos >= quiz.questions.length))
    await finalize(a, quiz, a.pos < quiz.questions.length);
  if (a.status === "consegnato") return { status: "consegnato", title: quiz.title, auto: a.auto };
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

      const quizId = body.quizId || url.searchParams.get("quizId");
      const quiz = quizId && (await getQuiz(quizId));
      if (!quiz || !quiz.active) return fail("Quiz non disponibile.", 404);

      if (route === "start" && method === "POST") {
        const name = String(body.name || "").trim().slice(0, 120);
        if (!name) return fail("Scrivi nome e cognome.");
        let a = await getAttempt(quiz.id, s.email);
        if (!a) {
          const n = quiz.questions.length, now = Date.now();
          a = {
            quizId: quiz.id, email: s.email, name, startedAt: now, deadline: now + quiz.duration * 60000,
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
