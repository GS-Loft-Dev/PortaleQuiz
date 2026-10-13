// Quiz lavoratori GS LOFT — interfaccia (vanilla JS). Tutta la logica sensibile è nel server (/api).
(function () {
const app = document.getElementById('app');
const S = {
  ready: false, role: null, email: null,
  quizzes: [], people: [], attempts: [],
  view: 'home', tab: 'quiz', draft: null, draftErr: null, sel: null, run: null, preview: false, lastResult: null,
  resFilter: 'all', openDetail: null, askDel: null, askReset: null, askRm: null,
  saving: false, loginRole: 'employee', loginErr: null, accErr: null,
  // survey
  surveys: [], responses: [], sv: null, svPage: 'list', svSel: null, svOpen: null, svAskDel: null, svNames: null, svEdit: null, svEditErr: null, svAskReset: false, locked: {},
};
let timerH = null;

/* ---------- utilità ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = n => Array.from({ length: n }, (_, i) => i);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const L = i => String.fromCharCode(65 + i);
const pad2 = n => String(n).padStart(2, '0');
const fmtT = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); };
const fmtD = ts => ts ? new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDur = ms => { if (!(ms >= 0)) return '—'; const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000); return m + 'm ' + pad2(s) + 's'; };
/* icone (tratto, colore dal testo) */
const ICON = {
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
};
const ic = (n) => `<span class="ic">${ICON[n]}</span>`;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }

async function api(path, { method = 'GET', body, keepalive } = {}) {
  const res = await fetch('/api/' + path, {
    method, keepalive, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* risposta vuota */ }
  if (res.status === 401 && path !== 'login' && path !== 'me') { logoutLocal(data.error || 'Sessione scaduta: accedi di nuovo.'); throw new Error('401'); }
  if (!res.ok) { const e = new Error(data.error || 'Errore di rete. Riprova.'); e.status = res.status; throw e; }
  return data;
}
function logoutLocal(msg) {
  clearInterval(timerH);
  Object.assign(S, { role: null, email: null, view: 'home', run: null, draft: null, quizzes: [], people: [], attempts: [], surveys: [], responses: [], sv: null, loginErr: msg || null, saving: false });
  render();
}

/* ---------- avvio e caricamento ---------- */
async function boot() {
  try { const me = await api('me'); S.role = me.role; S.email = me.email; await loadAll(); }
  catch (e) { S.role = null; }
  S.ready = true; render();
}
async function loadAll() {
  if (S.role === 'admin') {
    const [q, p, r, sv, sr] = await Promise.all([api('admin/quizzes'), api('admin/people'), api('admin/results'), api('admin/surveys'), api('admin/survey-responses')]);
    S.quizzes = q.quizzes; S.people = p.people; S.attempts = r.attempts; S.surveys = sv.surveys; S.locked = sv.locked || {}; S.responses = sr.responses;
  } else if (S.role === 'employee') {
    const [q, sv] = await Promise.all([api('quizzes'), api('surveys')]);
    S.quizzes = q.quizzes; S.surveys = sv.surveys;
  }
}
async function refresh() { try { await loadAll(); render(); } catch (e) { if (e.message !== '401') toast(e.message); } }

/* ---------- render ---------- */
function render() {
  if (!S.ready) { app.innerHTML = '<div class="loading">Caricamento…</div>'; return; }
  let h;
  if (!S.role) h = loginView();
  else if (S.view === 'run') h = runView();
  else if (S.view === 'done') h = doneView();
  else if (S.view === 'intro') h = introView();
  else if (S.view === 'survey') h = surveyView();
  else if (S.view === 'svdone') h = surveyDoneView();
  else if (S.role === 'admin') {
    if (S.view === 'edit') h = editView();
    else if (S.tab === 'results') h = resultsView();
    else if (S.tab === 'access') h = accessView();
    else if (S.tab === 'survey') h = S.svPage === 'responses' ? responsesView() : S.svPage === 'edit' ? svEditView() : adminSurveys();
    else h = adminHome();
  } else h = employeeHome();
  // ridisegnare la pagina toglie il focus: lo rimettiamo sul campo in cui si stava scrivendo
  const focusId = document.activeElement && document.activeElement.id;
  app.innerHTML = header() + '<main class="wrap">' + h + '</main>';
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
}
function header() {
  const tabs = S.role === 'admin' && !['edit', 'intro', 'done', 'run', 'survey', 'svdone'].includes(S.view) && S.svPage !== 'edit' ? `<nav class="tabs">
    <button class="tab" data-act="tab" data-v="quiz" aria-current="${S.tab === 'quiz'}">Quiz</button>
    <button class="tab" data-act="tab" data-v="survey" aria-current="${S.tab === 'survey'}">Survey</button>
    <button class="tab" data-act="tab" data-v="results" aria-current="${S.tab === 'results'}">Risultati</button>
    <button class="tab" data-act="tab" data-v="access" aria-current="${S.tab === 'access'}">Accessi</button></nav>` : '';
  const out = S.role && S.view !== 'run' ? `<button class="logout" data-act="logout"${tabs ? '' : ' style="margin-left:auto"'}>Esci</button>` : '';
  const sub = S.role === 'admin' ? 'Area responsabile' : S.role === 'employee' ? esc(S.email) : '';
  return `<header class="top"><div class="wrap"><div class="brand"><span class="logo" role="img" aria-label="GS LOFT"></span>
    <h1 class="sub">PORTALE QUIZ &amp; SURVEY<br>${sub}</h1></div>${tabs}${out}</div></header>`;
}

/* ----- accesso ----- */
function loginView() {
  const emp = S.loginRole === 'employee';
  return `<div class="login-wrap">
  <div class="login-hero" aria-hidden="true">
    <p class="eyebrow">GS LOFT · LEARNING</p>
    <p class="hero-t">Quiz &amp; survey<br><span>per il team</span></p>
    <p class="hero-s">Quiz e Survey interne.<br>Il portale di "Learning" di GS LOFT!</p>
    <div class="stack3d">
      <div class="fc fc3"><span class="fc-k">Survey</span><span class="fc-l"></span><span class="fc-l s"></span></div>
      <div class="fc fc2"><span class="fc-k">Quiz</span><span class="fc-l"></span><span class="fc-l s"></span><span class="fc-l xs"></span></div>
      <div class="fc fc1"><span class="fc-k">Domanda 01 / 115</span><span class="fc-q"></span><span class="fc-o on"><i>A</i></span><span class="fc-o"><i>B</i></span><span class="fc-o"><i>C</i></span></div>
    </div>
  </div>
  <form class="card stack login tilt" id="loginForm" novalidate>
    <div><h2>Accedi</h2><p class="muted small">${emp ? "Usa l'email aziendale e il tuo codice di accesso." : 'Area riservata ai responsabili.'}</p></div>
    <div class="seg" role="group" aria-label="Tipo di accesso">
      <button type="button" data-act="lrole" data-v="employee" aria-pressed="${emp}">Accesso</button>
      <button type="button" data-act="lrole" data-v="admin" aria-pressed="${!emp}">Responsabile</button></div>
    ${emp ? `<label class="f">Email<input type="text" id="lg-e" inputmode="email" autocomplete="email" placeholder="nome.cognome@gsloft.it"></label>
    <label class="f">Codice di accesso<input type="text" id="lg-c" autocomplete="one-time-code" class="mono" style="text-transform:uppercase;letter-spacing:.12em" placeholder="Es. K7PM3Q"></label>`
    : `<label class="f">Password<input type="password" id="lg-p" autocomplete="current-password"></label>`}
    ${S.loginErr ? `<div class="err">${esc(S.loginErr)}</div>` : ''}
    <button class="btn primary" type="submit" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Verifica…' : 'Entra'}</button></form></div>`;
}
async function doLogin() {
  const emp = S.loginRole === 'employee';
  const body = emp ? { role: 'employee', email: document.getElementById('lg-e').value, code: document.getElementById('lg-c').value }
    : { role: 'admin', password: document.getElementById('lg-p').value };
  if (emp ? (!body.email.trim() || !body.code.trim()) : !body.password) { S.loginErr = emp ? 'Inserisci email e codice di accesso.' : 'Inserisci la password.'; render(); return; }
  S.saving = true; S.loginErr = null; render();
  try {
    const r = await api('login', { method: 'POST', body });
    S.role = r.role; S.email = r.email || null; S.view = 'home'; S.tab = 'quiz';
    await loadAll();
  } catch (e) { S.loginErr = e.message; }
  S.saving = false; render();
}

/* ----- responsabile: quiz ----- */
function attemptRows() {
  return S.attempts.map(a => {
    const quiz = S.quizzes.find(q => q.id === a.quizId);
    const done = a.status === 'consegnato';
    const n = a.total || (quiz ? quiz.questions.length : 0);
    const score = done ? a.score : 0;
    const pct = done && n ? Math.round(score / n * 100) : 0;
    return { a, quiz, done, n, score, pct, pass: quiz ? pct >= quiz.passPct : false, name: a.name || 'Senza nome' };
  }).sort((x, y) => (y.a.startedAt || 0) - (x.a.startedAt || 0));
}
function adminHome() {
  const rows = attemptRows();
  let h = `<div class="stack"><div class="row"><div><h2>I tuoi quiz</h2><p class="muted small">Solo i quiz <b>attivi</b> sono visibili ai lavoratori.</p></div><span class="spacer"></span>
    <button class="btn primary" data-act="new">+ Nuovo quiz</button></div>`;
  if (!S.quizzes.length) return h + `<div class="empty"><h3>Nessun quiz ancora</h3><p>Crea il primo quiz: scrivi le domande o incollale in blocco, imposta durata e soglia di superamento, poi attivalo.</p><p style="margin-top:14px"><button class="btn primary" data-act="new">Crea il primo quiz</button></p></div></div>`;
  h += '<div class="qlist">';
  for (const q of S.quizzes) {
    const done = rows.filter(r => r.a.quizId === q.id && r.done).length;
    const ask = S.askDel === q.id;
    h += `<div class="card qitem lift${q.active ? ' is-live' : ''}"><div class="stack" style="gap:8px;min-width:0">
      <div class="row"><h3>${esc(q.title)}</h3>${q.active ? '<span class="chip ok">Attivo</span>' : '<span class="chip">Bozza</span>'}</div>
      ${q.desc ? `<p class="muted small">${esc(q.desc)}</p>` : ''}
      <div class="meta"><span>${q.questions.length} domande</span><span>${q.duration} min</span><span>Soglia ${q.passPct}%</span><span>${done} consegnati</span></div></div>
      <div class="actions">${ask ? `<span class="small muted">Eliminare il quiz?</span><button class="btn sm danger solid" data-act="delok" data-id="${q.id}">Elimina</button><button class="btn sm" data-act="delno">Annulla</button>` :
      `<button class="btn sm" data-act="toggle" data-id="${q.id}">${q.active ? 'Disattiva' : 'Attiva'}</button>
       <button class="btn sm" data-act="edit" data-id="${q.id}">Modifica</button>
       <button class="btn sm" data-act="preview" data-id="${q.id}">Anteprima</button>
       <button class="btn sm" data-act="seeres" data-id="${q.id}">Risultati</button>
       <button class="btn sm ghost danger" data-act="delask" data-id="${q.id}">Elimina</button>`}</div></div>`;
  }
  return h + `</div><p class="small muted">Per far svolgere un quiz: attivalo, autorizza le email nella scheda <b>Accessi</b> e manda a ogni lavoratore il link del sito con la sua email e il suo codice.</p></div>`;
}
const blankQ = () => ({ text: '', options: ['', '', '', ''], correct: null });
function editView() {
  const d = S.draft;
  let h = `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="cancel">← Torna ai quiz</button></div>
  <h2>${d.id ? 'Modifica quiz' : 'Nuovo quiz'}</h2>
  ${d.id && S.attempts.some(a => a.quizId === d.id) ? '<div class="note">Questo quiz è già stato svolto: se cambi domande o risposte corrette, i punteggi già salvati non vengono ricalcolati.</div>' : ''}
  <div class="card stack">
    <label class="f">Titolo<input type="text" id="f-title" data-f="title" value="${esc(d.title)}" placeholder="Es. Procedure di accoglienza clienti"></label>
    <label class="f">Istruzioni per i lavoratori <span class="hint">facoltativo</span><textarea id="f-desc" data-f="desc" rows="2" placeholder="Es. Rispondi da solo, senza consultare materiali.">${esc(d.desc)}</textarea></label>
    <div class="grid3">
      <label class="f">Durata (minuti)<input type="number" id="f-dur" min="1" max="300" data-f="duration" value="${d.duration}"></label>
      <label class="f">Soglia di superamento (%)<input type="number" id="f-pass" min="0" max="100" data-f="passPct" value="${d.passPct}"></label>
      <div class="f" style="justify-content:flex-end;gap:8px">
        <label class="check"><input type="checkbox" id="f-sq" data-f="shuffleQ" ${d.shuffleQ ? 'checked' : ''}>Domande in ordine casuale</label>
        <label class="check"><input type="checkbox" id="f-so" data-f="shuffleO" ${d.shuffleO ? 'checked' : ''}>Risposte in ordine casuale</label>
      </div>
    </div>
    <label class="check"><input type="checkbox" id="f-act" data-f="active" ${d.active ? 'checked' : ''}>Attivo (visibile ai lavoratori)</label>
  </div>
  <div class="card stack"><div class="row"><h3>Domande</h3><span class="chip acc">${d.questions.length}</span><span class="spacer"></span><span class="hint">Seleziona il pallino della risposta corretta</span></div>`;
  d.questions.forEach((q, qi) => {
    h += `<div class="qedit stack" style="gap:10px"><div class="row"><span class="num">Domanda ${qi + 1}</span><span class="spacer"></span>
      <button class="btn sm ghost danger" data-act="qdel" data-q="${qi}">Rimuovi domanda</button></div>
      <textarea id="q${qi}-t" data-f="qtext" data-q="${qi}" rows="2" placeholder="Testo della domanda">${esc(q.text)}</textarea>`;
    q.options.forEach((o, oi) => {
      h += `<div class="opt"><input type="radio" id="q${qi}-c${oi}" name="c${qi}" data-f="correct" data-q="${qi}" data-o="${oi}" ${q.correct === oi ? 'checked' : ''} aria-label="Risposta corretta ${L(oi)}">
        <input type="text" id="q${qi}-o${oi}" data-f="opt" data-q="${qi}" data-o="${oi}" value="${esc(o)}" placeholder="Risposta ${L(oi)}">
        <button class="btn sm ghost" data-act="odel" data-q="${qi}" data-o="${oi}" ${q.options.length <= 2 ? 'disabled' : ''} aria-label="Rimuovi risposta">✕</button></div>`;
    });
    h += `<div><button class="btn sm" data-act="oadd" data-q="${qi}" ${q.options.length >= 6 ? 'disabled' : ''}>+ Risposta</button></div></div>`;
  });
  h += `<div class="row"><button class="btn" data-act="qadd">+ Aggiungi domanda</button></div>
    <details class="imp"><summary>Incolla più domande insieme</summary><div class="stack" style="margin-top:12px">
      <p class="small muted">Una domanda per blocco, righe vuote tra i blocchi. Le risposte iniziano con A. B. C. … e l'ultima riga indica quella corretta.</p>
      <pre class="ex">Entro quanti giorni si può sospendere un abbonamento?
A. 7 giorni
B. 14 giorni
C. 30 giorni
RISPOSTA: B</pre>
      <textarea id="imp" rows="7" placeholder="Incolla qui le domande"></textarea>
      <div><button class="btn" data-act="import">Importa domande</button></div></div></details>
  </div>
  ${S.draftErr ? `<div class="err">${esc(S.draftErr)}</div>` : ''}
  <div class="savebar row"><button class="btn" data-act="cancel">Annulla</button><span class="spacer"></span>
    <button class="btn primary" data-act="save" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Salvataggio…' : 'Salva quiz'}</button></div></div>`;
  return h;
}
function openEditor(id) {
  if (id) {
    const q = S.quizzes.find(x => x.id === id);
    S.draft = { id, title: q.title, desc: q.desc || '', duration: q.duration, passPct: q.passPct, shuffleQ: !!q.shuffleQ, shuffleO: !!q.shuffleO, active: !!q.active,
      questions: q.questions.map(x => ({ text: x.text, options: x.options.slice(), correct: x.correct })) };
  } else S.draft = { id: null, title: '', desc: '', duration: 15, passPct: 70, shuffleQ: true, shuffleO: true, active: false, questions: [blankQ()] };
  S.draftErr = null; S.view = 'edit'; render(); window.scrollTo(0, 0);
}
function parseImport(txt) {
  const out = [];
  for (const b of txt.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = b.split('\n').map(s => s.trim()).filter(Boolean); if (!lines.length) continue;
    const q = { text: '', options: [], correct: null }; const qt = [];
    for (const ln of lines) {
      let m;
      if ((m = ln.match(/^(?:ANSWER|RISPOSTA|CORRETTA)\s*[:=]\s*([A-Z])/i))) q.correct = m[1].toUpperCase().charCodeAt(0) - 65;
      else if ((m = ln.match(/^([A-Za-z])[\.\)]\s+(.+)$/)) && (q.options.length || qt.length)) q.options.push(m[2]);
      else if (!q.options.length) qt.push(ln);
    }
    q.text = qt.join(' ');
    if (q.text && q.options.length >= 2) { if (!(q.correct >= 0 && q.correct < q.options.length)) q.correct = null; out.push(q); }
  }
  return out;
}
async function saveDraft() {
  const d = S.draft; S.draftErr = null;
  const questions = [];
  for (const [i, q] of d.questions.entries()) {
    const opts = q.options.map((o, oi) => ({ t: o.trim(), oi })).filter(o => o.t);
    const c = opts.findIndex(o => o.oi === q.correct);
    if (!q.text.trim()) { S.draftErr = `La domanda ${i + 1} non ha testo.`; break; }
    if (opts.length < 2) { S.draftErr = `La domanda ${i + 1} ha bisogno di almeno 2 risposte.`; break; }
    if (c < 0) { S.draftErr = `Indica la risposta corretta della domanda ${i + 1}.`; break; }
    questions.push({ text: q.text.trim(), options: opts.map(o => o.t), correct: c });
  }
  if (!S.draftErr && !d.title.trim()) S.draftErr = 'Dai un titolo al quiz.';
  if (!S.draftErr && !questions.length) S.draftErr = 'Aggiungi almeno una domanda.';
  if (S.draftErr) { render(); return; }
  S.saving = true; render();
  try {
    await api('admin/quizzes', { method: 'PUT', body: { quiz: { id: d.id, title: d.title, desc: d.desc, duration: Math.round(+d.duration), passPct: Math.round(+d.passPct),
      shuffleQ: d.shuffleQ, shuffleO: d.shuffleO, active: d.active, questions } } });
    S.saving = false; S.draft = null; S.view = 'home'; S.tab = 'quiz';
    toast('Quiz salvato'); await refresh();
  } catch (e) { S.saving = false; if (e.message !== '401') { S.draftErr = e.message; render(); } }
}

/* ----- responsabile: risultati ----- */
function resultsView() {
  let rows = attemptRows();
  if (S.resFilter !== 'all') rows = rows.filter(r => r.a.quizId === S.resFilter);
  const done = rows.filter(r => r.done), passed = done.filter(r => r.pass);
  const avg = done.length ? Math.round(done.reduce((s, r) => s + r.pct, 0) / done.length) : 0;
  let h = `<div class="stack"><div class="row"><h2>Risultati</h2><span class="spacer"></span>
    <button class="btn" data-act="reload">Aggiorna</button>
    <select id="resf" data-f="resFilter" aria-label="Filtra per quiz" style="width:auto;max-width:100%"><option value="all">Tutti i quiz</option>
    ${S.quizzes.map(q => `<option value="${q.id}" ${S.resFilter === q.id ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}</select>
    ${rows.length ? '<button class="btn" data-act="csv">Esporta CSV</button>' : ''}</div>
    <div class="stats"><div class="stat"><b>${done.length}</b><span>Consegnati</span></div><div class="stat"><b>${passed.length}</b><span>Superati</span></div>
    <div class="stat"><b>${done.length - passed.length}</b><span>Non superati</span></div><div class="stat"><b>${avg}%</b><span>Punteggio medio</span></div></div>`;
  if (!rows.length) return h + `<div class="empty"><h3>Nessun risultato ancora</h3><p>Quando un lavoratore consegna un quiz, qui trovi punteggio, tempo impiegato ed esito.</p></div></div>`;
  h += `<div class="tbl-wrap"><table><thead><tr><th>lavoratore</th><th>Quiz</th><th>Inizio</th><th>Durata</th><th>Punteggio</th><th>Esito</th><th>Uscite</th><th></th></tr></thead><tbody>`;
  for (const r of rows) {
    const k = r.a.key, open = S.openDetail === k;
    const esito = !r.done ? '<span class="chip warn">In corso</span>' : r.pass ? '<span class="chip ok">Superato</span>' : '<span class="chip bad">Non superato</span>';
    h += `<tr><td>${esc(r.name)}<div class="small muted">${esc(r.a.email)}</div></td><td>${esc(r.quiz ? r.quiz.title : 'Quiz eliminato')}</td><td class="num">${fmtD(r.a.startedAt)}</td>
      <td class="num">${r.done ? fmtDur(r.a.finishedAt - r.a.startedAt) : '—'}${r.a.auto ? ' <span class="chip warn">tempo scaduto</span>' : ''}</td>
      <td class="num">${r.done ? `${r.score}/${r.n} · ${r.pct}%` : '—'}</td><td>${esito}</td><td class="num">${r.a.leaves || 0}</td>
      <td><div class="row" style="flex-wrap:nowrap">${r.quiz ? `<button class="btn sm" data-act="detail" data-k="${esc(k)}">${open ? 'Chiudi' : 'Dettaglio'}</button>` : ''}
      ${S.askReset === k ? `<button class="btn sm danger solid" data-act="resetok" data-k="${esc(k)}">Conferma</button><button class="btn sm" data-act="resetno">No</button>` :
      `<button class="btn sm ghost" data-act="resetask" data-k="${esc(k)}" title="Cancella questo tentativo e permetti di rifarlo">Nuovo tentativo</button>`}</div></td></tr>`;
    if (open && r.quiz) {
      h += `<tr><td colspan="8" class="detail"><div class="ans">${r.quiz.questions.map((q, i) => {
        const g = (r.a.answers || {})[i]; const ok = g !== undefined && g === q.correct;
        return `<div><span class="k ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</span><span><b>${i + 1}. ${esc(q.text)}</b><br>
          <span class="muted">Risposta data:</span> ${g === undefined ? '<i>nessuna</i>' : esc(q.options[g])}
          ${ok ? '' : ` · <span class="muted">Corretta:</span> ${esc(q.options[q.correct])}`}</span></div>`;
      }).join('')}</div></td></tr>`;
    }
  }
  return h + `</tbody></table></div><p class="small muted">"Uscite" conta quante volte il lavoratore ha lasciato la pagina durante il quiz (cambio scheda o app).</p></div>`;
}
function exportCsv() {
  let rows = attemptRows(); if (S.resFilter !== 'all') rows = rows.filter(r => r.a.quizId === S.resFilter);
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['lavoratore', 'Email', 'Quiz', 'Inizio', 'Fine', 'Durata', 'Corrette', 'Totale', 'Percentuale', 'Esito', 'Uscite dalla pagina', 'Tempo scaduto'].map(q).join(';')];
  for (const r of rows) lines.push([r.name, r.a.email, r.quiz ? r.quiz.title : 'Quiz eliminato', fmtD(r.a.startedAt), fmtD(r.a.finishedAt), r.done ? fmtDur(r.a.finishedAt - r.a.startedAt) : '',
    r.done ? r.score : '', r.n, r.done ? r.pct + '%' : '', !r.done ? 'In corso' : r.pass ? 'Superato' : 'Non superato', r.a.leaves || 0, r.a.auto ? 'Sì' : 'No'].map(q).join(';'));
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'risultati-quiz.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ----- responsabile: accessi ----- */
function accessView() {
  const list = S.people.slice().sort((a, b) => a.email.localeCompare(b.email));
  let h = `<div class="stack"><div><h2>Accessi</h2><p class="muted small">Solo le persone in questo elenco possono entrare.<br>Ognuna accede con la sua email e il codice personale generato qui.</p></div>
  <div class="card stack"><label class="f">Aggiungi email <span class="hint">anche più di una, separate da virgola o a capo</span>
    <textarea id="accin" rows="3" placeholder="mario.rossi@gsloft.it, giulia.bianchi@gsloft.it"></textarea></label>
    ${S.accErr ? `<div class="err">${esc(S.accErr)}</div>` : ''}
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="accadd" ${S.saving ? 'disabled' : ''}>Autorizza e genera codici</button></div></div>`;
  if (!list.length) return h + `<div class="empty"><h3>Nessuna email autorizzata</h3><p>Finché l'elenco è vuoto nessun lavoratore può entrare.</p></div></div>`;
  h += `<div class="tbl-wrap"><table><thead><tr><th>Email autorizzate · ${list.length}</th><th>Codice</th><th></th></tr></thead><tbody>`;
  for (const p of list) {
    const msg = `Link: ${location.origin}\nEmail: ${p.email}\nCodice di accesso: ${p.code}`;
    h += `<tr><td>${esc(p.email)}</td><td class="num"><b>${esc(p.code)}</b> <button class="btn sm ghost" data-act="copy" data-t="${esc(msg)}">Copia</button>
      <button class="btn sm ghost" data-act="regen" data-e="${esc(p.email)}" title="Genera un nuovo codice: quello vecchio smette di funzionare">Nuovo codice</button></td>
      <td style="text-align:right">${S.askRm === p.email ? `<span class="small muted">Togliere l'accesso?</span> <button class="btn sm danger solid" data-act="accrmok" data-e="${esc(p.email)}">Rimuovi</button> <button class="btn sm" data-act="accrmno">Annulla</button>`
      : `<button class="btn sm ghost danger" data-act="accrm" data-e="${esc(p.email)}">Rimuovi</button>`}</td></tr>`;
  }
  return h + `</tbody></table></div><p class="small muted">"Copia" prepara il messaggio con link, email e codice da mandare al lavoratore.</p></div>`;
}
async function addAccess() {
  const emails = document.getElementById('accin').value.split(/[\s,;]+/).filter(Boolean);
  S.saving = true; S.accErr = null; render();
  try { const r = await api('admin/people', { method: 'POST', body: { emails } }); S.people = r.people; toast(r.added ? (r.added === 1 ? 'Email autorizzata' : r.added + ' email autorizzate') : 'Email già autorizzate'); }
  catch (e) { if (e.message !== '401') S.accErr = e.message; }
  S.saving = false; render();
}

/* ----- lavoratore ----- */
function employeeHome() {
  const todo = S.quizzes.filter(q => q.status !== 'consegnato').length + S.surveys.filter(s => !s.submittedAt).length;
  let h = `<div class="stack"><div class="row hello"><div><p class="eyebrow">${todo ? `${todo} ${todo === 1 ? 'attività aperta' : 'attività aperte'}` : 'Tutto completato'}</p><h2>Da completare</h2><p class="muted small">Qui trovi le survey e i quiz attivati dal responsabile.</p></div><span class="spacer"></span><button class="btn" data-act="reload">Aggiorna</button></div>`;
  if (!S.quizzes.length && !S.surveys.length) return h + `<div class="empty"><h3>Niente da completare</h3><p>Quando il responsabile attiva una survey o un quiz, lo trovi qui.</p></div></div>`;
  if (S.surveys.length) {
    h += '<h3 class="sec-t">Survey</h3><div class="tiles">';
    for (const s of S.surveys) {
      h += `<article class="tile tilt kind-survey${s.submittedAt ? ' is-done' : ''}"><div class="tile-in">
        <div class="tile-top"><span class="kind">${ic('doc')}Survey</span>${s.submittedAt ? `<span class="chip ok">${ic('check')}Inviata</span>` : '<span class="chip acc">Da compilare</span>'}</div>
        <h3>${esc(s.title)}</h3><p class="muted small">${esc(s.subtitle)}</p>
        <div class="meta">${ic('clock')}<span>${esc(s.estimate.replace('Tempo di compilazione: circa', 'Circa').replace(/\.$/, ''))}</span>${s.submittedAt ? `<span>· Inviata il ${fmtD(s.submittedAt)}</span>` : ''}</div>
        <div class="tile-foot">${s.submittedAt ? `<button class="btn" data-act="svopen" data-id="${s.id}">Modifica risposte</button>`
          : `<button class="btn primary" data-act="svopen" data-id="${s.id}">Compila ${ic('arrow')}</button>`}</div></div></article>`;
    }
    h += '</div>';
  }
  if (!S.quizzes.length) return h + '</div>';
  h += `<h3 class="sec-t">Quiz</h3><p class="muted small" style="margin-top:-10px">Ogni quiz si può svolgere una sola volta.</p><div class="tiles">`;
  for (const q of S.quizzes) {
    const done = q.status === 'consegnato';
    const act = q.status === 'da_fare' ? `<button class="btn primary" data-act="intro" data-id="${q.id}">Inizia ${ic('arrow')}</button>`
      : done ? `<span class="small muted">Consegnato il ${fmtD(q.finishedAt)}</span>`
      : `<button class="btn primary" data-act="resume" data-id="${q.id}">Riprendi ${ic('arrow')}</button>`;
    const chip = done ? `<span class="chip ok">${ic('check')}Consegnato</span>` : q.status === 'da_fare' ? '<span class="chip acc">Da fare</span>' : '<span class="chip warn">In corso</span>';
    h += `<article class="tile tilt kind-quiz${done ? ' is-done' : ''}"><div class="tile-in">
      <div class="tile-top"><span class="kind">${ic('list')}Quiz</span>${chip}</div>
      <h3>${esc(q.title)}</h3>${q.desc ? `<p class="muted small">${esc(q.desc)}</p>` : ''}
      <div class="tile-nums"><div><b>${q.count}</b><span>domande</span></div><div><b>${q.duration}</b><span>minuti</span></div></div>
      <div class="tile-foot">${act}</div></div></article>`;
  }
  return h + '</div></div>';
}
function introView() {
  const q = S.quizzes.find(x => x.id === S.sel); if (!q) return '';
  const n = q.count ?? q.questions.length;
  return `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="home">← Indietro</button>${S.preview ? '<span class="chip acc">Anteprima: nessun dato salvato</span>' : ''}</div>
  <div class="card stack intro-card"><p class="eyebrow">Prima di iniziare</p><h2>${esc(q.title)}</h2>${q.desc ? `<p>${esc(q.desc)}</p>` : ''}
    <div class="tile-nums"><div><b>${n}</b><span>domande</span></div><div><b>${q.duration}</b><span>minuti</span></div></div>
    <ol class="rules steps">
      <li>Hai <b>${q.duration} minuti</b> per rispondere a <b>${n} domande</b>.</li>
      <li>Le domande compaiono una alla volta.</li>
      <li>Quando confermi una risposta <b>non puoi più cambiarla</b> né tornare alle domande precedenti.</li>
      <li>Allo scadere del tempo il quiz viene consegnato automaticamente, con le risposte date fino a quel momento.</li>
      <li>Resta su questa pagina: le uscite dalla pagina vengono registrate.</li>
    </ol>
    <p class="small muted">${S.preview ? 'Anteprima del responsabile.' : `Il quiz viene registrato a nome di <b>${esc(S.email)}</b>.`}</p>
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="start" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Avvio…' : 'Inizia il quiz'}</button></div>
  </div></div>`;
}
function runView() {
  const r = S.run, q = r.question, last = r.pos === r.total - 1;
  return `<div class="runbar"><div style="min-width:0"><b>${esc(r.title)}</b><div class="small muted mono">( ${pad2(r.pos + 1)} / ${pad2(r.total)} )${S.preview ? ' · anteprima' : ''}</div></div>
    <span class="spacer"></span><div class="timer" id="timer" role="timer" aria-label="Tempo rimanente">${fmtT(r.deadlineLocal - Date.now())}</div>
    <div class="progress"><i style="width:${r.pos / r.total * 100}%"></i></div></div>
  <div class="stack qcard" style="margin-top:24px"><p class="question">${esc(q.text)}</p>
    <div class="choices" role="radiogroup">${q.options.map((o, k) => `<button class="choice" role="radio" data-act="pick" data-o="${o.i}" aria-checked="${r.pick === o.i}"><span class="l">${L(k)}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
    <div class="row"><span class="small muted">La risposta confermata non si può modificare.</span><span class="spacer"></span>
    <button class="btn primary" data-act="confirm" ${r.pick == null || S.saving ? 'disabled' : ''}>${S.saving ? 'Invio…' : last ? 'Conferma e consegna' : 'Conferma e vai avanti →'}</button></div></div>`;
}
function doneView() {
  const r = S.lastResult || {};
  let h = `<div class="card stack done-card" style="text-align:center;align-items:center;padding:40px 20px;margin-top:8px"><div class="badge3d">${ICON.check}</div><span class="chip ok">Quiz consegnato</span>
    <h2>${esc(r.title || '')}</h2>${r.auto ? '<p class="muted">Il tempo è scaduto: il quiz è stato consegnato con le risposte date fino a quel momento.</p>' : ''}`;
  if (S.preview && r.n) h += `<div class="big">${r.score}/${r.n}</div><p class="muted">Anteprima: ${r.pct}% · ${r.pass ? 'superato' : 'non superato'} (soglia ${r.passPct}%). Nessun dato è stato salvato.</p>`;
  else h += `<p class="muted">Grazie. Il responsabile vedrà il risultato.</p>`;
  return h + `<button class="btn" data-act="home">Torna ai quiz</button></div>`;
}

/* ---------- survey ---------- */
// Le risposte hanno questa forma: { main: {q2:…, q3:…}, groups: { tools: [ {q4:…}, {q4:…} ] }, ack: true }
const asList = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
const svMatch = (c, scope) => asList(scope && scope[c.q]).some(x => c.in.includes(x));
const svOpts = (q, names) => { const o = q.optionsFrom === 'names' ? names : (q.options || []); return q.other && !o.includes(q.other) ? [...o, q.other] : o; };
const svFree = (q, names) => q.optionsFrom === 'names' && !names.length;
const svScope = (sv, scope) => scope === 'main' ? sv.ans.main : sv.ans.groups[scope.split(':')[0]][+scope.split(':')[1]];
const svDraftKey = id => `gsq-survey-${S.email}-${id}`;
function svDraftSave() {
  const sv = S.sv; if (!sv || sv.preview) return;
  clearTimeout(svDraftSave.h);
  svDraftSave.h = setTimeout(() => { try { localStorage.setItem(svDraftKey(sv.def.id), JSON.stringify({ ans: sv.ans, savedAt: Date.now() })); } catch (e) { /* archivio del browser non disponibile */ } }, 400);
}
function svDraftLoad(id) { try { return JSON.parse(localStorage.getItem(svDraftKey(id)) || 'null'); } catch (e) { return null; } }
function svDraftClear(id) { try { localStorage.removeItem(svDraftKey(id)); } catch (e) { /* niente */ } }
function svBlank(def) {
  const groups = {}; def.sections.filter(s => s.repeat).forEach(s => groups[s.id] = [{}]);
  return { main: {}, groups, ack: false };
}
function svNormalize(def, ans) { // garantisce la struttura anche con bozze vecchie o parziali
  const b = svBlank(def); ans = ans || {};
  b.main = ans.main || {}; b.ack = !!ans.ack;
  for (const k of Object.keys(b.groups)) if (Array.isArray(ans.groups?.[k]) && ans.groups[k].length) b.groups[k] = ans.groups[k];
  return b;
}
async function openSurvey(id, preview) {
  try {
    let def, names, mine = null, submittedAt = null;
    if (preview) { const s = S.surveys.find(x => x.def.id === id); def = s.def; names = s.names; }
    else ({ survey: def, names, mine, submittedAt } = await api('survey?id=' + encodeURIComponent(id)));
    let ans = mine, resumed = false;
    const draft = !preview && svDraftLoad(id);
    if (draft && draft.savedAt > (submittedAt || 0)) { ans = draft.ans; resumed = true; }
    S.sv = { def, names, ans: svNormalize(def, ans), preview: !!preview, submittedAt, errs: {}, errList: [] };
    S.view = 'survey'; render(); window.scrollTo(0, 0);
    if (resumed) toast('Abbiamo ripreso la bozza salvata su questo dispositivo');
  } catch (e) { if (e.message !== '401') toast(e.message); }
}

function svQuestion(q, scope, ans) {
  const sv = S.sv, names = sv.names, base = `sv-${scope.replace(':', '-')}-${q.id}`, v = ans[q.id];
  const err = sv.errs[scope + '|' + q.id];
  const num = q.n ? `<span class="svn">${q.n}</span>` : '';
  let h = `<div class="svq${q.n ? '' : ' sub'}${err ? ' has-err' : ''}" id="${base}-w"><div class="svl" id="${base}-l">${num}<span>${esc(q.label)}${q.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</span></div>`;
  if (q.help) h += `<p class="hint">${esc(q.help)}</p>`;
  if (q.type === 'multi') h += `<p class="hint">Puoi scegliere più risposte</p>`;
  const data = `data-svs="${scope}" data-svq="${q.id}"`;
  const lab = `aria-labelledby="${base}-l"`;
  if (q.type === 'text' || svFree(q, names)) {
    h += `<input type="text" id="${base}" ${data} data-svk="text" ${lab} value="${esc(v)}" maxlength="300" placeholder="${esc(q.placeholder || (svFree(q, names) ? 'Es. Maria Rossi' : ''))}">`;
  } else if (q.type === 'textarea') {
    h += `<textarea id="${base}" ${data} data-svk="text" ${lab} rows="3" maxlength="3000" placeholder="${esc(q.placeholder || '')}">${esc(v)}</textarea>`;
  } else if (q.type === 'select') {
    h += `<select id="${base}" ${data} data-svk="select" ${lab}><option value="">Scegli…</option>${svOpts(q, names).map(o => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else {
    const multi = q.type === 'multi', sel = asList(v);
    h += `<div class="svopts" role="${multi ? 'group' : 'radiogroup'}" ${lab}>` + svOpts(q, names).map((o, k) =>
      `<label class="svopt"><input type="${multi ? 'checkbox' : 'radio'}" id="${base}-${k}" name="${base}" ${data} data-svk="${multi ? 'multi' : 'single'}" value="${esc(o)}" ${sel.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('') + '</div>';
  }
  if (q.other && !svFree(q, names) && asList(v).includes(q.other))
    h += `<input type="text" class="svother" id="${base}-altro" ${data} data-svk="other" aria-label="${esc(q.other)}" maxlength="200" value="${esc(ans[q.id + '__altro'])}" placeholder="${esc(q.otherPlaceholder || 'Specifica')}">`;
  if (err) h += `<div class="sverr">${esc(err)}</div>`;
  return h + '</div>';
}
function svQuestions(questions, scope, ans) {
  return questions.filter(q => !q.showIf || svMatch(q.showIf, ans)).map(q => svQuestion(q, scope, ans)).join('');
}
function surveyView() {
  const sv = S.sv, def = sv.def, main = sv.ans.main;
  let h = `<div class="stack survey"><div class="row"><button class="btn ghost sm" data-act="svback">← ${sv.preview ? 'Torna alle survey' : 'Indietro'}</button>
    ${sv.preview ? '<span class="chip acc">Anteprima: nessun dato salvato</span>' : sv.submittedAt ? `<span class="chip ok">Inviata il ${fmtD(sv.submittedAt)}</span>` : ''}</div>
  <div class="card stack svhead"><div><h2>${esc(def.title)}</h2><p class="svsub">${esc(def.subtitle)}</p></div>
    <p class="muted small">${esc(def.estimate)}</p>${def.intro.map(p => `<p>${esc(p)}</p>`).join('')}
    <div class="note"><b>Importante:</b> ${esc(def.warning)}</div>
    <p class="small muted">${sv.preview ? 'Anteprima del responsabile.' : `Stai compilando come <b>${esc(S.email)}</b>: le risposte vengono registrate con questa email.`} Le domande con <span class="req">*</span> sono obbligatorie. ${sv.preview ? '' : 'Le risposte restano salvate come bozza su questo dispositivo finché non le invii.'}</p></div>`;
  for (const sec of def.sections) {
    if (sec.repeat) {
      if (sec.showIf && !svMatch(sec.showIf, main)) {
        h += `<section class="svsec"><h3>${esc(sec.title)}</h3>${sec.hiddenIf && svMatch(sec.hiddenIf, main) ? `<div class="note">${esc(sec.hiddenNote)}</div>`
          : `<p class="muted small">Rispondi alla domanda sull'uso dell'IA per vedere questa sezione.</p>`}</section>`;
        continue;
      }
      const items = sv.ans.groups[sec.id];
      h += `<section class="svsec stack"><div><h3>${esc(sec.title)}</h3></div><div class="note">${esc(sec.note)}</div>`;
      items.forEach((it, i) => {
        const tool = it.q4 === svQ(def, 'q4').other ? it.q4__altro : it.q4;
        h += `<div class="card stack svitem" id="sv-item-${sec.id}-${i}"><div class="row svitem-h"><span class="svbadge">${esc(sec.repeat.item)} ${i + 1}</span>
          <b class="svtool">${esc(tool || '')}</b><span class="spacer"></span>
          ${items.length > 1 ? `<button class="btn sm ghost danger" data-act="svrm" data-g="${sec.id}" data-i="${i}">Rimuovi scheda</button>` : ''}</div>
          ${svQuestions(sec.questions, sec.id + ':' + i, it)}</div>`;
      });
      if (sv.errs['group|' + sec.id]) h += `<div class="err">${esc(sv.errs['group|' + sec.id])}</div>`;
      h += items.length < (sec.repeat.max || 20) ? `<div class="svadd"><p>${esc(sec.repeat.ask)}</p><button class="btn" data-act="svadd" data-g="${sec.id}">${esc(sec.repeat.add)}</button></div>` : '';
      h += '</section>';
    } else {
      h += `<section class="svsec stack"><h3>${esc(sec.title)}</h3><div class="card stack">${svQuestions(sec.questions, 'main', main)}</div></section>`;
    }
  }
  const p = def.privacy;
  h += `<section class="svsec stack"><h3>${esc(p.title)}</h3><div class="card stack privacy">${p.paragraphs.map(x => `<p>${esc(x)}</p>`).join('')}
    <div class="svq${sv.errs['ack'] ? ' has-err' : ''}" id="sv-ack-w"><label class="check svack"><input type="checkbox" id="sv-ack" data-svk="ack" ${sv.ans.ack ? 'checked' : ''}>
    <span>${esc(p.ack)} <span class="req" aria-hidden="true">*</span></span></label><p class="hint">${esc(p.ackNote)}</p>
    ${sv.errs['ack'] ? `<div class="sverr">${esc(sv.errs['ack'])}</div>` : ''}</div></div></section>`;
  if (sv.errList.length) h += `<div class="err" role="alert"><b>Mancano ${sv.errList.length === 1 ? 'una risposta' : sv.errList.length + ' risposte'}.</b> ${esc(sv.errList.slice(0, 4).join(' · '))}${sv.errList.length > 4 ? '…' : ''}</div>`;
  h += `<div class="savebar row"><span class="small muted">${sv.preview ? 'Anteprima: puoi provare tutto, niente viene salvato.' : sv.submittedAt ? 'Puoi aggiornare le risposte finché la survey resta aperta.' : ''}</span><span class="spacer"></span>
    <button class="btn primary" data-act="svsend" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Invio…' : sv.preview ? 'Verifica le risposte' : sv.submittedAt ? 'Aggiorna le risposte' : 'Invia le risposte'}</button></div></div>`;
  return h;
}
// Controllo delle obbligatorie (lo stesso lo ripete il server).
function svValidate() {
  const sv = S.sv, def = sv.def, errs = {}, list = [];
  const check = (questions, scope, ans, where) => {
    for (const q of questions) {
      if (q.showIf && !svMatch(q.showIf, ans)) continue;
      const v = asList(ans[q.id]), name = q.n ? 'domanda ' + q.n : q.short.toLowerCase();
      if (q.required && !v.length) { errs[scope + '|' + q.id] = 'Risposta obbligatoria.'; list.push(where + name); }
      else if (q.other && !svFree(q, sv.names) && v.includes(q.other) && !String(ans[q.id + '__altro'] || '').trim()) { errs[scope + '|' + q.id] = `Specifica “${q.other}”.`; list.push(where + name); }
    }
  };
  for (const sec of def.sections) if (!sec.repeat) check(sec.questions, 'main', sv.ans.main, '');
  for (const sec of def.sections) {
    if (!sec.repeat || (sec.showIf && !svMatch(sec.showIf, sv.ans.main))) continue;
    sv.ans.groups[sec.id].forEach((it, i) => check(sec.questions, sec.id + ':' + i, it, `${sec.repeat.item} ${i + 1}, `));
  }
  if (!sv.ans.ack) { errs.ack = "Conferma la presa visione dell'informativa."; list.push('informativa privacy'); }
  sv.errs = errs; sv.errList = list;
  return !list.length;
}
function svPayload() { // toglie le schede strumento se la sezione B non serve (es. risposta "No")
  const sv = S.sv, out = JSON.parse(JSON.stringify(sv.ans));
  for (const sec of sv.def.sections) if (sec.repeat && sec.showIf && !svMatch(sec.showIf, out.main)) out.groups[sec.id] = [];
  return out;
}
async function submitSurvey() {
  const sv = S.sv;
  if (!svValidate()) {
    render();
    const first = document.querySelector('.svq.has-err'); if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); const f = first.querySelector('input,select,textarea'); if (f) f.focus({ preventScroll: true }); }
    return;
  }
  if (sv.preview) { render(); toast('Anteprima: tutte le risposte obbligatorie sono compilate'); return; }
  S.saving = true; render();
  try {
    const r = await api('survey', { method: 'PUT', body: { id: sv.def.id, answers: svPayload() } });
    svDraftClear(sv.def.id);
    S.saving = false; S.lastResult = { title: sv.def.title, again: !!sv.submittedAt, at: r.submittedAt };
    S.sv = null; S.view = 'svdone'; render(); window.scrollTo(0, 0);
    api('surveys').then(x => { S.surveys = x.surveys; }).catch(() => {});
  } catch (e) { S.saving = false; render(); if (e.message !== '401') toast(e.message); }
}
function surveyDoneView() {
  const r = S.lastResult || {};
  return `<div class="card stack done-card" style="text-align:center;align-items:center;padding:40px 20px;margin-top:8px"><div class="badge3d">${ICON.check}</div><span class="chip ok">${r.again ? 'Risposte aggiornate' : 'Risposte inviate'}</span>
    <h2>Grazie!</h2><p class="muted">Abbiamo ricevuto le tue risposte a “${esc(r.title || '')}”.<br>Se ti accorgi di aver dimenticato qualcosa, puoi modificarle dalla pagina iniziale finché la survey resta aperta.</p>
    <button class="btn" data-act="home">Torna alla pagina iniziale</button></div>`;
}
function svChange(t) { // radio, caselle, menu: aggiorna e ridisegna (alcune domande compaiono o spariscono)
  const sv = S.sv; if (!sv) return;
  if (t.dataset.svk === 'ack') { sv.ans.ack = t.checked; delete sv.errs.ack; }
  else {
    const scope = t.dataset.svs, qid = t.dataset.svq, ans = svScope(sv, scope);
    const q = sv.def.sections.flatMap(s => s.questions).find(x => x.id === qid);
    if (t.dataset.svk === 'multi') {
      let cur = asList(ans[qid]).filter(x => x !== t.value);
      if (t.checked) { const ex = q.exclusive || []; cur = ex.includes(t.value) ? [t.value] : [...cur.filter(x => !ex.includes(x)), t.value]; }
      ans[qid] = cur;
    } else ans[qid] = t.value;
    delete sv.errs[scope + '|' + qid];
  }
  sv.errList = sv.errList.length ? (svValidate(), sv.errList) : [];
  svDraftSave(); render();
}
function svInput(t) { // testo: aggiorna senza ridisegnare, così il cursore resta dove sta
  const sv = S.sv; if (!sv) return;
  const scope = t.dataset.svs, qid = t.dataset.svq, ans = svScope(sv, scope);
  if (t.dataset.svk === 'other') ans[qid + '__altro'] = t.value; else ans[qid] = t.value;
  if (t.value.trim() && sv.errs[scope + '|' + qid]) {
    delete sv.errs[scope + '|' + qid];
    const w = t.closest('.svq'); if (w) { w.classList.remove('has-err'); const m = w.querySelector('.sverr'); if (m) m.remove(); }
  }
  svDraftSave();
}

/* ----- responsabile: survey ----- */
const svName = r => r.name || 'Senza nome';
const svQ = (def, id) => def.sections.flatMap(s => s.questions).find(q => q.id === id) || {};
function svToolName(def, it) { const q = svQ(def, 'q4'); return it.q4 === q.other ? (it.q4__altro || 'Altro') : (it.q4 || '—'); }
function adminSurveys() {
  let h = `<div class="stack"><div><h2>Survey</h2><p class="muted small">Le survey <b>attive</b> compaiono a tutte le persone autorizzate nella scheda Accessi, insieme ai quiz.<br>Ognuno può aggiornare le proprie risposte finché la survey resta attiva.</p></div><div class="qlist">`;
  for (const s of S.surveys) {
    const d = s.def;
    h += `<div class="card stack lift${s.active ? ' is-live' : ''}"><div class="qitem" style="padding:0;border:0"><div class="stack" style="gap:8px;min-width:0">
      <div class="row"><h3>${esc(d.title)}</h3>${s.active ? '<span class="chip ok">Attiva</span>' : '<span class="chip">Bozza</span>'}${s.edited ? '<span class="chip acc">Domande modificate</span>' : ''}</div>
      <p class="muted small">${esc(d.subtitle)}</p>
      <div class="meta"><span>${s.count} ${s.count === 1 ? 'risposta' : 'risposte'}</span><span>${S.people.length} ${S.people.length === 1 ? 'persona autorizzata' : 'persone autorizzate'}</span></div></div>
      <div class="actions"><button class="btn sm" data-act="svtoggle" data-id="${d.id}">${s.active ? 'Disattiva' : 'Attiva'}</button>
      <button class="btn sm" data-act="svprev" data-id="${d.id}">Anteprima</button>
      <button class="btn sm" data-act="svedit" data-id="${d.id}">Modifica domande</button>
      <button class="btn sm primary" data-act="svres" data-id="${d.id}">Risposte</button></div></div>
      </div>`;
  }
  return h + '</div></div>';
}
/* ----- responsabile: modifica delle domande ----- */
const SE_TYPES = [['single', 'Una sola risposta'], ['multi', 'Più risposte'], ['select', 'Menu a tendina'], ['text', 'Testo breve'], ['textarea', 'Testo lungo']];
const seGet = (o, path) => path.split('.').reduce((x, k) => x == null ? x : x[k], o);
function seSet(o, path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; }
const seParas = a => (a || []).join('\n\n');
function seNumbers(def) { const m = {}; let n = 1; for (const s of def.sections) for (const q of s.questions) if (!q.sub && !q.showIf) m[q.id] = n++; return m; }
function openSvEdit(id) {
  const s = S.surveys.find(x => x.def.id === id);
  S.svEdit = JSON.parse(JSON.stringify(s.def)); S.svSel = id; S.svEditErr = null; S.svAskReset = false; S.svPage = 'edit'; render(); window.scrollTo(0, 0);
}
function seQuestion(q, si, qi, sec, nums) {
  const p = `sections.${si}.questions.${qi}`, lock = S.locked[q.id], choice = ['single', 'multi', 'select'].includes(q.type);
  const all = S.svEdit.sections.flatMap(x => x.questions), parent = q.showIf && all.find(x => x.id === q.showIf.q);
  const tag = nums[q.id] ? `Domanda ${nums[q.id]}` : 'Sotto-domanda';
  let h = `<div class="qedit stack seq" style="gap:10px" id="seq-${q.id}"><div class="row"><span class="num">${tag}</span>${lock ? '<span class="chip">Necessaria</span>' : ''}<span class="spacer"></span>
    <button class="btn sm ghost" data-act="seup" data-s="${si}" data-i="${qi}" ${qi === 0 ? 'disabled' : ''} aria-label="Sposta su">↑</button>
    <button class="btn sm ghost" data-act="sedown" data-s="${si}" data-i="${qi}" ${qi === sec.questions.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">↓</button>
    <button class="btn sm ghost danger" data-act="sedel" data-s="${si}" data-i="${qi}" ${lock ? 'disabled title="Domanda necessaria al portale"' : ''}>Elimina</button></div>
    ${lock ? `<p class="small muted">${esc(lock)}</p>` : ''}
    ${parent ? `<div class="note small">Compare solo se alla ${nums[parent.id] ? 'domanda ' + nums[parent.id] : '“' + esc(parent.short) + '”'} si risponde: ${q.showIf.in.map(esc).join(' · ')}</div>` : ''}
    <label class="f">Testo della domanda<textarea id="se-${q.id}-label" data-se="${p}.label" rows="2">${esc(q.label)}</textarea></label>
    <div class="grid3">
      <label class="f">Tipo di risposta<select id="se-${q.id}-type" data-se="${p}.type" data-sek="type" ${lock ? 'disabled' : ''}>${SE_TYPES.map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Nome breve <span class="hint">per risultati e CSV</span><input type="text" id="se-${q.id}-short" data-se="${p}.short" value="${esc(q.short)}" maxlength="60"></label>
      <div class="f" style="justify-content:flex-end;gap:6px">
        <label class="check"><input type="checkbox" id="se-${q.id}-req" data-se="${p}.required" data-sek="bool" ${q.required ? 'checked' : ''} ${lock ? 'disabled' : ''}>Obbligatoria</label>
        <label class="check"><input type="checkbox" id="se-${q.id}-sub" data-se="${p}.sub" data-sek="bool" ${q.sub || q.showIf ? 'checked' : ''} ${q.showIf || lock ? 'disabled' : ''}>Senza numero (sotto-domanda)</label></div>
    </div>
    <label class="f">Nota sotto la domanda <span class="hint">facoltativa</span><input type="text" id="se-${q.id}-help" data-se="${p}.help" value="${esc(q.help)}" maxlength="600"></label>`;
  if (choice) {
    h += `<label class="f">Risposte possibili <span class="hint">una per riga</span><textarea id="se-${q.id}-opts" data-se="${p}.options" data-sek="lines" rows="${Math.min(12, (q.options || []).length + 1)}" ${q.id === 'q3' ? 'disabled' : ''}>${esc((q.options || []).join('\n'))}</textarea></label>`;
    if (q.type === 'multi' && (q.options || []).length) h += `<div class="f"><span>Risposte che escludono le altre <span class="hint">es. “No”, “Non so”: se scelte, tolgono le altre spunte</span></span><div class="row">${q.options.map((o, k) =>
      `<label class="check small"><input type="checkbox" id="se-${q.id}-ex${k}" data-se="${p}" data-sek="ex" value="${esc(o)}" ${(q.exclusive || []).includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div></div>`;
    if (q.id !== 'q3') h += `<div class="row"><label class="check"><input type="checkbox" id="se-${q.id}-oth" data-se="${p}" data-sek="other" ${q.other ? 'checked' : ''} ${q.id === 'q4' ? 'disabled' : ''}>Aggiungi una scelta “Altro” con campo da scrivere</label>
      ${q.other ? `<input type="text" id="se-${q.id}-othl" data-se="${p}.other" value="${esc(q.other)}" maxlength="100" style="width:auto;flex:1;min-width:200px" aria-label="Testo della scelta Altro">` : ''}</div>`;
  }
  return h + '</div>';
}
function svEditView() {
  const d = S.svEdit, s = S.surveys.find(x => x.def.id === S.svSel), nums = seNumbers(d);
  let h = `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="secancel">← Torna alle survey</button></div>
  <h2>Modifica domande</h2>
  ${s && s.count ? `<div class="note">Questa survey ha già ${s.count} ${s.count === 1 ? 'risposta' : 'risposte'}: le risposte già inviate restano come sono. Se cambi il testo di una scelta, nelle vecchie risposte resta il testo precedente.</div>` : ''}
  <div class="card stack"><h3>Introduzione</h3>
    <label class="f">Titolo<input type="text" id="se-title" data-se="title" value="${esc(d.title)}" maxlength="120"></label>
    <label class="f">Sottotitolo<input type="text" id="se-subtitle" data-se="subtitle" value="${esc(d.subtitle)}" maxlength="300"></label>
    <label class="f">Tempo di compilazione<input type="text" id="se-estimate" data-se="estimate" value="${esc(d.estimate)}" maxlength="200"></label>
    <label class="f">Testo introduttivo <span class="hint">una riga vuota tra un paragrafo e l'altro</span><textarea id="se-intro" data-se="intro" data-sek="paras" rows="6">${esc(seParas(d.intro))}</textarea></label>
    <label class="f">Avviso “Importante”<textarea id="se-warning" data-se="warning" rows="3">${esc(d.warning)}</textarea></label></div>`;
  d.sections.forEach((sec, si) => {
    h += `<div class="card stack"><div class="row"><h3>Sezione</h3><span class="chip acc">${sec.questions.length} domande</span>${sec.repeat ? '<span class="chip">si ripete per ogni strumento</span>' : ''}</div>
      <label class="f">Titolo della sezione<input type="text" id="se-sec${si}-title" data-se="sections.${si}.title" value="${esc(sec.title)}" maxlength="200"></label>
      ${sec.note != null ? `<label class="f">Istruzioni della sezione<textarea id="se-sec${si}-note" data-se="sections.${si}.note" rows="2">${esc(sec.note)}</textarea></label>` : ''}
      ${sec.showIf ? '<p class="small muted">Questa sezione compare solo a chi usa o ha provato strumenti di IA (domanda sull’uso dell’IA).</p>' : ''}
      ${sec.questions.map((q, qi) => seQuestion(q, si, qi, sec, nums)).join('')}
      <div class="row"><button class="btn" data-act="seadd" data-s="${si}">+ Aggiungi domanda in questa sezione</button></div></div>`;
  });
  const pr = d.privacy;
  h += `<div class="card stack"><h3>Informativa privacy</h3>
    <label class="f">Titolo<input type="text" id="se-pr-title" data-se="privacy.title" value="${esc(pr.title)}" maxlength="200"></label>
    <label class="f">Testo <span class="hint">una riga vuota tra un paragrafo e l'altro</span><textarea id="se-pr-text" data-se="privacy.paragraphs" data-sek="paras" rows="12">${esc(seParas(pr.paragraphs))}</textarea></label>
    <label class="f">Frase da spuntare (obbligatoria)<input type="text" id="se-pr-ack" data-se="privacy.ack" value="${esc(pr.ack)}" maxlength="500"></label>
    <label class="f">Nota sotto la spunta<input type="text" id="se-pr-note" data-se="privacy.ackNote" value="${esc(pr.ackNote)}" maxlength="500"></label></div>
  ${S.svEditErr ? `<div class="err" role="alert">${esc(S.svEditErr)}</div>` : ''}
  <div class="savebar row">${s && s.edited ? (S.svAskReset ? `<span class="small muted">Tornare alle domande originali? Le modifiche si perdono.</span><button class="btn sm danger solid" data-act="seresetok">Ripristina</button><button class="btn sm" data-act="seresetno">No</button>`
      : '<button class="btn ghost danger" data-act="sereset">Ripristina originale</button>') : ''}<span class="spacer"></span>
    <button class="btn" data-act="secancel">Annulla</button><button class="btn primary" data-act="sesave" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Salvataggio…' : 'Salva domande'}</button></div></div>`;
  return h;
}
function seField(t) { // aggiorna la bozza dal campo modificato; true se serve ridisegnare
  const d = S.svEdit, path = t.dataset.se, k = t.dataset.sek;
  if (k === 'bool') { seSet(d, path, t.checked); return true; }
  if (k === 'type') { const q = seGet(d, path.replace(/\.type$/, '')); q.type = t.value;
    if (['single', 'multi', 'select'].includes(q.type) && !(q.options || []).length) q.options = ['', ''];
    if (q.type !== 'multi') delete q.exclusive; return true; }
  if (k === 'ex') { const q = seGet(d, path), ex = new Set(q.exclusive || []); t.checked ? ex.add(t.value) : ex.delete(t.value); q.exclusive = [...ex]; return false; }
  if (k === 'other') { const q = seGet(d, path); if (t.checked) { q.other = 'Altro'; q.otherPlaceholder = 'Specifica'; } else delete q.other; return true; }
  if (k === 'lines') { seSet(d, path, t.value.split('\n').map(x => x.trim()).filter(Boolean)); return false; }
  if (k === 'paras') { seSet(d, path, t.value.split(/\n\s*\n/).map(x => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)); return false; }
  seSet(d, path, t.value); return false;
}
async function saveSvEdit() {
  const d = S.svEdit; S.svEditErr = null;
  for (const sec of d.sections) for (const q of sec.questions) if (!String(q.label || '').trim()) { S.svEditErr = 'C\'è una domanda senza testo: scrivila o eliminala.'; render(); document.getElementById('se-' + q.id + '-label')?.focus(); return; }
  S.saving = true; render();
  try {
    await api('admin/survey-def', { method: 'PUT', body: { id: S.svSel, def: d } });
    S.saving = false; S.svEdit = null; S.svPage = 'list'; toast('Domande salvate'); await refresh(); window.scrollTo(0, 0);
  } catch (e) { S.saving = false; if (e.message !== '401') { S.svEditErr = e.message; render(); } }
}

function svFormat(q, ans) {
  const v = asList(ans[q.id]); if (!v.length) return '';
  const alt = ans[q.id + '__altro'];
  return v.map(x => x === q.other && alt ? (q.type === 'select' ? alt : `${x}: ${alt}`) : x);
}
function svDetail(def, r) {
  const block = (questions, ans) => questions.map(q => { const v = svFormat(q, ans); return v ? `<div><span class="muted">${q.n ? q.n + '. ' : ''}${esc(q.short)}</span><span>${v.map(esc).join('<br>')}</span></div>` : ''; }).join('');
  let h = '';
  for (const sec of def.sections) {
    if (!sec.repeat) { h += `<h4>${esc(sec.title)}</h4><div class="svans">${block(sec.questions, r.answers.main)}</div>`; continue; }
    const items = r.answers.groups[sec.id] || [];
    h += `<h4>${esc(sec.title)}</h4>` + (items.length ? items.map((it, i) => `<div class="svans-item"><b>${esc(sec.repeat.item)} ${i + 1}: ${esc(svToolName(def, it))}</b><div class="svans">${block(sec.questions.filter(q => q.id !== 'q4'), it)}</div></div>`).join('') : '<p class="muted small">Nessuno strumento indicato.</p>');
  }
  return h;
}
function responsesView() {
  const s = S.surveys.find(x => x.def.id === S.svSel); if (!s) { S.svPage = 'list'; return adminSurveys(); }
  const def = s.def, rows = S.responses.filter(r => r.surveyId === def.id);
  const tools = rows.flatMap(r => (r.answers.groups.tools || []).map(it => ({ r, it })));
  const usa = rows.filter(r => ['Sì, spesso', 'Sì, ogni tanto'].includes(r.answers.main.q3)).length;
  const health = tools.filter(t => asList(t.it.q10).includes('Informazioni sulla salute, esami o percorsi dei clienti'));
  const personal = t => asList(t.it.q5).some(x => x.startsWith('Account personale'));
  const byTool = {};
  for (const t of tools) { const n = svToolName(def, t.it); const b = byTool[n] || (byTool[n] = { n, people: new Set(), personal: 0, clients: 0, health: 0 });
    b.people.add(t.r.email); if (personal(t)) b.personal++;
    if (asList(t.it.q10).includes('Nomi o recapiti di clienti e potenziali clienti')) b.clients++;
    if (asList(t.it.q10).includes('Informazioni sulla salute, esami o percorsi dei clienti')) b.health++; }
  const toolRows = Object.values(byTool).sort((a, b) => b.people.size - a.people.size);
  const missing = S.people.filter(p => !rows.some(r => r.email === p.email));
  let h = `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="svlist">← Tutte le survey</button></div>
    <div class="row"><div><h2>${esc(def.title)} · risposte</h2><p class="muted small">${esc(def.subtitle)}</p></div><span class="spacer"></span>
    <button class="btn" data-act="reload">Aggiorna</button>${rows.length ? '<button class="btn" data-act="svcsv">Esporta CSV</button>' : ''}</div>
    <div class="stats"><div class="stat"><b>${rows.length}<small>/${S.people.length}</small></b><span>Risposte ricevute</span></div><div class="stat"><b>${usa}</b><span>Usano l'IA (spesso o ogni tanto)</span></div>
    <div class="stat"><b>${toolRows.length}</b><span>Strumenti diversi indicati</span></div><div class="stat"><b>${health.length}</b><span>Schede con dati sanitari dei clienti</span></div></div>`;
  if (!rows.length) return h + `<div class="empty"><h3>Nessuna risposta ancora</h3><p>${s.active ? 'Quando qualcuno invia la survey, qui trovi le risposte e il riepilogo degli strumenti.' : 'La survey è in bozza: attivala dalla pagina Survey per renderla visibile.'}</p></div></div>`;
  h += `<h3 class="sec-t">Strumenti indicati</h3><div class="tbl-wrap"><table><thead><tr><th>Strumento</th><th>Persone</th><th>Con account personale</th><th>Con dati di clienti</th><th>Con dati sanitari</th></tr></thead><tbody>
    ${toolRows.map(b => `<tr><td>${esc(b.n)}</td><td class="num">${b.people.size}</td><td class="num">${b.personal}</td><td class="num">${b.clients}</td><td class="num">${b.health ? `<span class="chip bad">${b.health}</span>` : '0'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessuno strumento indicato.</td></tr>'}</tbody></table></div>
    <h3 class="sec-t">Risposte</h3><div class="tbl-wrap"><table><thead><tr><th>Persona</th><th>Area</th><th>Uso dell'IA</th><th>Strumenti</th><th>Inviata</th><th></th></tr></thead><tbody>`;
  for (const r of rows) {
    const k = r.key, open = S.svOpen === k, m = r.answers.main, its = r.answers.groups.tools || [];
    h += `<tr><td>${esc(svName(r))}<div class="small muted">${esc(r.email)}</div></td><td>${esc(m.q2 || '—')}${m.q2r ? `<div class="small muted">${esc(m.q2r)}</div>` : ''}</td><td>${esc(m.q3 || '—')}</td>
      <td class="wrapcell">${its.length ? its.map(it => esc(svToolName(def, it))).join(', ') : '—'}</td><td class="num">${fmtD(r.updatedAt)}${r.edits ? `<div class="small muted">modificata ${r.edits}×</div>` : ''}</td>
      <td><button class="btn sm" data-act="svdetail" data-k="${esc(k)}">${open ? 'Chiudi' : 'Dettaglio'}</button></td></tr>`;
    if (open) h += `<tr><td colspan="6" class="detail svdetail">${svDetail(def, r)}<div class="row svdel">
      ${S.svAskDel === k ? `<span class="small muted">Eliminare questa risposta? La persona potrà compilare di nuovo la survey.</span><button class="btn sm danger solid" data-act="svdelok" data-k="${esc(k)}">Elimina</button><button class="btn sm" data-act="svdelno">Annulla</button>`
        : `<button class="btn sm ghost danger" data-act="svdelask" data-k="${esc(k)}">Elimina questa risposta</button>`}</div></td></tr>`;
  }
  h += '</tbody></table></div>';
  if (missing.length) h += `<p class="small muted"><b>Non hanno ancora risposto (${missing.length}):</b> ${missing.map(p => esc(p.email)).join(', ')}</p>`;
  return h + `<p class="small muted">Il CSV ha una riga per ogni strumento indicato (chi non usa l'IA ha una sola riga), così si può filtrare e costruire la mappatura in Excel.</p></div>`;
}
function exportSurveyCsv() {
  const s = S.surveys.find(x => x.def.id === S.svSel), def = s.def;
  const si = def.sections.findIndex(x => x.repeat), sec = def.sections[si], toolQ = sec.questions;
  const firstQ = [{ id: '' }, ...def.sections.slice(0, si).flatMap(x => x.questions).filter(q => q.id !== 'q1')], lastQ = def.sections.slice(si + 1).flatMap(x => x.questions);
  const cell = v => '"' + String(Array.isArray(v) ? v.join(' | ') : v ?? '').replace(/"/g, '""') + '"';
  const head = ['Nome', 'Email', ...firstQ.slice(1).map(q => q.short), 'N. strumento', ...toolQ.map(q => q.short), ...lastQ.map(q => q.short), 'Inviata', 'Modifiche'];
  const lines = [head.map(cell).join(';')];
  for (const r of S.responses.filter(x => x.surveyId === def.id)) {
    const m = r.answers.main, its = r.answers.groups[sec.id] || [];
    for (const [i, it] of (its.length ? its : [null]).entries())
      lines.push([svName(r), r.email, ...firstQ.slice(1).map(q => svFormat(q, m)), it ? i + 1 : '', ...toolQ.map(q => it ? svFormat(q, it) : ''), ...lastQ.map(q => svFormat(q, m)), fmtD(r.updatedAt), r.edits || 0].map(cell).join(';'));
  }
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'survey-ai-risposte.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- svolgimento: server (lavoratore) o locale (anteprima) ---------- */
function applyState(st) {
  if (st.status === 'consegnato') {
    clearInterval(timerH);
    S.lastResult = { title: st.title, auto: st.auto, ...(st.preview || {}) };
    S.run = null; S.view = 'done'; render(); refreshQuietly(); return;
  }
  const same = S.run && S.run.pos === st.pos && S.run.quizId === st.quizId;
  S.run = { ...st, pick: same ? S.run.pick : null, deadlineLocal: Date.now() + st.remainingMs };
  S.view = 'run'; render(); if (!same) window.scrollTo(0, 0); startTimer();
}
function refreshQuietly() { if (!S.preview && S.role === 'employee') api('quizzes').then(r => { S.quizzes = r.quizzes; if (S.view === 'home') render(); }).catch(() => {}); }
function startTimer() {
  clearInterval(timerH);
  timerH = setInterval(() => {
    if (!S.run || S.view !== 'run') { clearInterval(timerH); return; }
    const left = S.run.deadlineLocal - Date.now(); const el = document.getElementById('timer');
    if (el) { el.textContent = fmtT(left); el.className = 'timer' + (left <= 60000 ? ' bad' : left <= 180000 ? ' warn' : ''); }
    if (left <= 0 && !S.run.expiring) { S.run.expiring = true; onExpire(); }
  }, 500);
}
async function onExpire() {
  if (S.preview) { applyState(Preview.finish(true)); return; }
  try { await new Promise(r => setTimeout(r, 1200)); applyState(await api('attempt?quizId=' + encodeURIComponent(S.run.quizId))); }
  catch (e) { if (e.message !== '401') { toast('Connessione assente: il quiz verrà consegnato appena possibile.'); S.run.expiring = false; } }
}
async function startQuiz() {
  if (S.preview) { applyState(Preview.start(S.quizzes.find(x => x.id === S.sel))); return; }
  S.saving = true; render();
  try { const st = await api('start', { method: 'POST', body: { quizId: S.sel } }); S.saving = false; applyState(st); }
  catch (e) { S.saving = false; render(); if (e.message !== '401') toast(e.message); }
}
async function confirmAnswer() {
  const r = S.run; if (!r || r.pick == null || S.saving) return;
  if (S.preview) { applyState(Preview.answer(r.pick)); return; }
  S.saving = true; render();
  try { const st = await api('answer', { method: 'POST', body: { quizId: r.quizId, pos: r.pos, choice: r.pick } }); S.saving = false; applyState(st); }
  catch (e) { S.saving = false; render(); if (e.message !== '401') toast('Risposta non inviata: ' + e.message); }
}
async function resumeQuiz(id) {
  try { S.preview = false; applyState(await api('attempt?quizId=' + encodeURIComponent(id))); }
  catch (e) { if (e.message !== '401') toast(e.message); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.view === 'run' && S.run && !S.preview)
    api('leave', { method: 'POST', body: { quizId: S.run.quizId }, keepalive: true }).catch(() => {});
});

// Anteprima per il responsabile: stessa interfaccia, tutto in locale, niente salvato.
const Preview = {
  q: null, a: null,
  start(quiz) {
    const n = quiz.questions.length;
    this.q = quiz;
    this.a = { pos: 0, answers: {}, deadline: Date.now() + quiz.duration * 60000,
      order: quiz.shuffleQ ? shuffle(range(n)) : range(n),
      optOrder: quiz.questions.map(x => quiz.shuffleO ? shuffle(range(x.options.length)) : range(x.options.length)) };
    return this.state();
  },
  state() {
    const { q, a } = this, qi = a.order[a.pos], x = q.questions[qi];
    return { status: 'in_corso', quizId: q.id, title: q.title, pos: a.pos, total: q.questions.length, remainingMs: a.deadline - Date.now(),
      question: { text: x.text, options: a.optOrder[qi].map(i => ({ i, text: x.options[i] })) } };
  },
  answer(choice) { this.a.answers[this.a.order[this.a.pos]] = choice; this.a.pos++; return this.a.pos >= this.q.questions.length ? this.finish(false) : this.state(); },
  finish(auto) {
    const { q, a } = this, n = q.questions.length;
    const score = q.questions.reduce((s, x, i) => s + (a.answers[i] === x.correct ? 1 : 0), 0), pct = Math.round(score / n * 100);
    return { status: 'consegnato', title: q.title, auto, preview: { score, n, pct, pass: pct >= q.passPct, passPct: q.passPct } };
  },
};

/* ---------- eventi ---------- */
app.addEventListener('submit', e => { if (e.target.id === 'loginForm') { e.preventDefault(); doLogin(); } });
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, d = S.draft, qi = +b.dataset.q, oi = +b.dataset.o;
  try {
    switch (a) {
      case 'lrole': S.loginRole = b.dataset.v; S.loginErr = null; render(); break;
      case 'logout': await api('logout', { method: 'POST' }).catch(() => {}); logoutLocal(); break;
      case 'tab': S.tab = b.dataset.v; S.view = 'home'; S.svPage = 'list'; render(); if (S.tab !== 'quiz') await refresh(); break;
      // survey
      case 'svopen': openSurvey(b.dataset.id, false); break;
      case 'svprev': openSurvey(b.dataset.id, true); break;
      case 'svback': { const prev = S.sv && S.sv.preview; S.sv = null; S.view = 'home'; if (prev) { S.tab = 'survey'; S.svPage = 'list'; } render(); window.scrollTo(0, 0); break; }
      case 'svadd': { const g = S.sv.ans.groups[b.dataset.g]; g.push({}); svDraftSave(); render();
        const el = document.getElementById(`sv-item-${b.dataset.g}-${g.length - 1}`); if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); const f = el.querySelector('select'); if (f) f.focus({ preventScroll: true }); } break; }
      case 'svrm': S.sv.ans.groups[b.dataset.g].splice(+b.dataset.i, 1); S.sv.errs = {}; S.sv.errList = []; svDraftSave(); render(); toast('Scheda rimossa'); break;
      case 'svsend': submitSurvey(); break;
      case 'svtoggle': { const s = S.surveys.find(x => x.def.id === b.dataset.id); await api('admin/surveys', { method: 'PATCH', body: { id: s.def.id, active: !s.active } }); toast(s.active ? 'Survey disattivata' : 'Survey attivata: ora è visibile alle persone autorizzate'); await refresh(); break; }
      case 'svres': S.svSel = b.dataset.id; S.svPage = 'responses'; S.svOpen = null; render(); window.scrollTo(0, 0); await refresh(); break;
      case 'svlist': S.svPage = 'list'; render(); break;
      case 'svdetail': S.svOpen = S.svOpen === b.dataset.k ? null : b.dataset.k; render(); break;
      case 'svdelask': S.svAskDel = b.dataset.k; render(); break;
      case 'svdelno': S.svAskDel = null; render(); break;
      case 'svdelok': S.svAskDel = null; await api('admin/survey-response?key=' + encodeURIComponent(b.dataset.k), { method: 'DELETE' }); toast('Risposta eliminata'); await refresh(); break;
      case 'svcsv': exportSurveyCsv(); break;
      // modifica delle domande
      case 'svedit': openSvEdit(b.dataset.id); break;
      case 'secancel': S.svEdit = null; S.svPage = 'list'; render(); window.scrollTo(0, 0); break;
      case 'sesave': saveSvEdit(); break;
      case 'seadd': { const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        S.svEdit.sections[+b.dataset.s].questions.push({ id, label: '', short: '', type: 'single', options: ['', ''], required: false });
        render(); const el = document.getElementById('se-' + id + '-label'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); } break; }
      case 'sedel': { const qs = S.svEdit.sections[+b.dataset.s].questions, q = qs[+b.dataset.i];
        const kids = S.svEdit.sections.flatMap(x => x.questions).filter(x => x.showIf && x.showIf.q === q.id);
        qs.splice(+b.dataset.i, 1); for (const k of kids) { const sq = S.svEdit.sections.find(x => x.questions.includes(k)).questions; sq.splice(sq.indexOf(k), 1); }
        render(); toast(kids.length ? 'Domanda eliminata, insieme alla sua sotto-domanda' : 'Domanda eliminata'); break; }
      case 'seup': case 'sedown': { const qs = S.svEdit.sections[+b.dataset.s].questions, i = +b.dataset.i, j = a === 'seup' ? i - 1 : i + 1;
        [qs[i], qs[j]] = [qs[j], qs[i]]; render(); break; }
      case 'sereset': S.svAskReset = true; render(); break;
      case 'seresetno': S.svAskReset = false; render(); break;
      case 'seresetok': await api('admin/survey-def?id=' + encodeURIComponent(S.svSel), { method: 'DELETE' }); S.svAskReset = false; S.svEdit = null; S.svPage = 'list'; toast('Ripristinate le domande originali'); await refresh(); break;
      case 'reload': await refresh(); toast('Aggiornato'); break;
      case 'new': openEditor(null); break;
      case 'edit': openEditor(b.dataset.id); break;
      case 'cancel': S.draft = null; S.view = 'home'; render(); break;
      case 'save': saveDraft(); break;
      case 'qadd': d.questions.push(blankQ()); render(); break;
      case 'qdel': d.questions.splice(qi, 1); render(); break;
      case 'oadd': d.questions[qi].options.push(''); render(); break;
      case 'odel': { const q = d.questions[qi]; q.options.splice(oi, 1); if (q.correct === oi) q.correct = null; else if (q.correct > oi) q.correct--; render(); break; }
      case 'import': {
        const qs = parseImport(document.getElementById('imp').value);
        if (!qs.length) { toast('Nessuna domanda riconosciuta. Controlla il formato.'); break; }
        d.questions = d.questions.filter(q => q.text.trim() || q.options.some(o => o.trim())).concat(qs);
        const miss = qs.filter(q => q.correct == null).length; render();
        toast(`${qs.length} domande importate` + (miss ? ` · ${miss} senza risposta corretta` : '')); break;
      }
      case 'toggle': { const q = S.quizzes.find(x => x.id === b.dataset.id); await api('admin/quizzes', { method: 'PATCH', body: { id: q.id, active: !q.active } }); toast(q.active ? 'Quiz disattivato' : 'Quiz attivato'); await refresh(); break; }
      case 'delask': S.askDel = b.dataset.id; render(); break;
      case 'delno': S.askDel = null; render(); break;
      case 'delok': S.askDel = null; await api('admin/quizzes?id=' + encodeURIComponent(b.dataset.id), { method: 'DELETE' }); toast('Quiz eliminato'); await refresh(); break;
      case 'seeres': S.resFilter = b.dataset.id; S.tab = 'results'; render(); break;
      case 'detail': S.openDetail = S.openDetail === b.dataset.k ? null : b.dataset.k; render(); break;
      case 'resetask': S.askReset = b.dataset.k; render(); break;
      case 'resetno': S.askReset = null; render(); break;
      case 'resetok': S.askReset = null; await api('admin/attempt?key=' + encodeURIComponent(b.dataset.k), { method: 'DELETE' }); toast('Tentativo cancellato: il lavoratore può rifare il quiz'); await refresh(); break;
      case 'csv': exportCsv(); break;
      case 'accadd': addAccess(); break;
      case 'accrm': S.askRm = b.dataset.e; render(); break;
      case 'accrmno': S.askRm = null; render(); break;
      case 'accrmok': S.askRm = null; S.people = (await api('admin/people?email=' + encodeURIComponent(b.dataset.e), { method: 'DELETE' })).people; toast('Accesso rimosso'); render(); break;
      case 'regen': S.people = (await api('admin/people', { method: 'PATCH', body: { email: b.dataset.e } })).people; toast('Nuovo codice generato'); render(); break;
      case 'copy': navigator.clipboard.writeText(b.dataset.t).then(() => toast('Copiato'), () => toast('Copia non riuscita: seleziona il testo a mano')); break;
      case 'preview': S.preview = true; S.sel = b.dataset.id; S.view = 'intro'; render(); window.scrollTo(0, 0); break;
      case 'intro': S.preview = false; S.sel = b.dataset.id; S.view = 'intro'; render(); window.scrollTo(0, 0); break;
      case 'resume': resumeQuiz(b.dataset.id); break;
      case 'start': startQuiz(); break;
      case 'pick': S.run.pick = oi; app.querySelectorAll('.choice').forEach(c => c.setAttribute('aria-checked', String(+c.dataset.o === oi))); app.querySelector('[data-act="confirm"]').disabled = false; break;
      case 'confirm': confirmAnswer(); break;
      case 'home': S.view = 'home'; S.preview = false; S.lastResult = null; render(); window.scrollTo(0, 0); break;
    }
  } catch (err) { if (err.message !== '401') toast(err.message); }
});
app.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.svk) { if (t.dataset.svk === 'text' || t.dataset.svk === 'other') svInput(t); return; }
  if (t.dataset.se && S.svEdit) { if (!['bool', 'type', 'ex', 'other'].includes(t.dataset.sek)) seField(t); return; }
  const f = t.dataset.f; if (!f) return;
  if (f === 'resFilter') { S.resFilter = t.value; S.openDetail = null; render(); return; }
  const d = S.draft; if (!d) return;
  const qi = +t.dataset.q, oi = +t.dataset.o;
  if (f === 'qtext') d.questions[qi].text = t.value;
  else if (f === 'opt') d.questions[qi].options[oi] = t.value;
  else if (f === 'correct') d.questions[qi].correct = oi;
  else if (t.type === 'checkbox') d[f] = t.checked;
  else d[f] = t.value;
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.svk && t.dataset.svk !== 'text' && t.dataset.svk !== 'other') { svChange(t); return; }
  if (t.dataset.se && S.svEdit) { // caselle e menu ridisegnano; l'elenco risposte aggiorna le "esclusive" quando si esce dal campo
    if (seField(t) || (t.dataset.sek === 'lines' && seGet(S.svEdit, t.dataset.se.replace(/\.options$/, '')).type === 'multi')) render();
    return;
  }
  if (t.dataset.f === 'correct' && S.draft) S.draft.questions[+t.dataset.q].correct = +t.dataset.o;
});
window.addEventListener('beforeunload', e => { if (S.view === 'run' && !S.preview) { e.preventDefault(); e.returnValue = ''; } });

/* Effetto 3D delle card: si inclinano seguendo il puntatore (solo mouse, rispetta "riduci movimento") */
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let cur = null;
  app.addEventListener('pointermove', e => {
    const el = e.target.closest('.tilt');
    if (cur && cur !== el) { cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); cur.classList.remove('is-tilting'); }
    cur = el; if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const max = el.classList.contains('login') ? 4 : 7;
    el.style.setProperty('--rx', ((0.5 - y) * max).toFixed(2) + 'deg');
    el.style.setProperty('--ry', ((x - 0.5) * max).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.classList.add('is-tilting');
  });
  app.addEventListener('pointerleave', () => { if (cur) { cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); cur.classList.remove('is-tilting'); cur = null; } });
}

boot();
})();
