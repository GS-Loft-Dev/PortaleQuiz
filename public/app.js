// Quiz Lavoratori GS LOFT — interfaccia (vanilla JS). Tutta la logica sensibile è nel server (/api).
(function () {
const app = document.getElementById('app');
const S = {
  ready: false, role: null, email: null,
  quizzes: [], people: [], attempts: [],
  view: 'home', tab: 'quiz', draft: null, draftErr: null, sel: null, run: null, preview: false, lastResult: null,
  resFilter: 'all', openDetail: null, askDel: null, askReset: null, askRm: null,
  saving: false, loginRole: 'employee', loginErr: null, accErr: null, mailOk: null, importTarget: 'new',
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
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }

/* sezioni: nomi nell'ordine del quiz e punteggio per sezione */
const secNames = quiz => [...new Set(quiz.questions.map(q => q.section || '').filter(Boolean))];
function secScores(quiz, answers) {
  return secNames(quiz).map(name => {
    const idx = quiz.questions.map((q, i) => q.section === name ? i : -1).filter(i => i >= 0);
    return { name, score: idx.filter(i => (answers || {})[i] === quiz.questions[i].correct).length, total: idx.length };
  });
}
const pctOf = (s, t) => t ? Math.round(s / t * 100) : 0;
function secBars(list, opts = {}) {
  if (!list || !list.length) return '';
  return `<div class="secbars">${list.map(x => { const p = x.pct ?? pctOf(x.score, x.total);
    const cls = p >= 80 ? 'ok' : p >= 60 ? 'warn' : 'bad';
    return `<div class="secrow"><span class="secname">${esc(x.name)}</span><span class="secbar"><i class="${cls}" style="width:${p}%"></i></span>
      <span class="secval">${x.label ?? `${x.score}/${x.total}`} · ${p}%</span></div>`; }).join('')}</div>${opts.legend ? '<p class="small muted">Colori: verde da 80%, arancio 60-79%, rosso sotto 60%.</p>' : ''}`;
}

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
  Object.assign(S, { role: null, email: null, view: 'home', run: null, draft: null, quizzes: [], people: [], attempts: [], loginErr: msg || null, saving: false });
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
    const [q, p, r, m] = await Promise.all([api('admin/quizzes'), api('admin/people'), api('admin/results'), api('admin/mailstatus')]);
    S.quizzes = q.quizzes; S.people = p.people; S.attempts = r.attempts; S.mailOk = m.configured;
  } else if (S.role === 'employee') {
    S.quizzes = (await api('quizzes')).quizzes;
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
  else if (S.role === 'admin') {
    if (S.view === 'edit') h = editView();
    else if (S.tab === 'results') h = resultsView();
    else if (S.tab === 'dash') h = dashView();
    else if (S.tab === 'access') h = accessView();
    else h = adminHome();
  } else h = employeeHome();
  app.innerHTML = header() + '<main class="wrap">' + h + '</main>';
}
function header() {
  const tabs = S.role === 'admin' && !['edit', 'intro', 'done', 'run'].includes(S.view) ? `<nav class="tabs">
    <button class="tab" data-act="tab" data-v="quiz" aria-current="${S.tab === 'quiz'}">Quiz</button>
    <button class="tab" data-act="tab" data-v="dash" aria-current="${S.tab === 'dash'}">Dashboard</button>
    <button class="tab" data-act="tab" data-v="results" aria-current="${S.tab === 'results'}">Risultati individuali</button>
    <button class="tab" data-act="tab" data-v="access" aria-current="${S.tab === 'access'}">Accessi</button></nav>` : '';
  const out = S.role && S.view !== 'run' ? `<button class="logout" data-act="logout"${tabs ? '' : ' style="margin-left:auto"'}>Esci</button>` : '';
  const sub = S.role === 'admin' ? 'Area responsabile' : S.role === 'employee' ? esc(S.email) : 'Verifiche a tempo';
  return `<header class="top"><div class="wrap"><div class="brand"><span class="logo" role="img" aria-label="GS LOFT"></span>
    <h1 class="sub">Quiz lavoratori<br>${sub}</h1></div>${tabs}${out}</div></header>`;
}

/* ----- accesso ----- */
function loginView() {
  const emp = S.loginRole === 'employee';
  return `<form class="card stack login" id="loginForm" novalidate>
    <div><h2>Accedi</h2><p class="muted small">${emp ? "Usa l'email aziendale e il codice di accesso che ti ha dato il responsabile." : 'Area riservata al responsabile.'}</p></div>
    <div class="seg" role="group" aria-label="Tipo di accesso">
      <button type="button" data-act="lrole" data-v="employee" aria-pressed="${emp}">Lavoratore</button>
      <button type="button" data-act="lrole" data-v="admin" aria-pressed="${!emp}">Responsabile</button></div>
    ${emp ? `<label class="f">Email<input type="text" id="lg-e" inputmode="email" autocomplete="email" placeholder="nome.cognome@gsloft.it"></label>
    <label class="f">Codice di accesso<input type="text" id="lg-c" autocomplete="one-time-code" class="mono" style="text-transform:uppercase;letter-spacing:.12em" placeholder="Es. K7PM3Q"></label>`
    : `<label class="f">Password<input type="password" id="lg-p" autocomplete="current-password"></label>`}
    ${S.loginErr ? `<div class="err">${esc(S.loginErr)}</div>` : ''}
    <button class="btn primary" type="submit" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Verifica…' : 'Entra'}</button></form>`;
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
    return { a, quiz, done, n, score, pct, pass: quiz ? pct >= quiz.passPct : false, name: a.email };
  }).sort((x, y) => (y.a.startedAt || 0) - (x.a.startedAt || 0));
}
function adminHome() {
  const rows = attemptRows();
  let h = `<div class="stack"><div class="row"><div><h2>I tuoi quiz</h2><p class="muted small">Solo i quiz <b>attivi</b> sono visibili ai lavoratori.</p></div><span class="spacer"></span>
    <button class="btn" data-act="template" data-v="xlsx" title="Il file da compilare con domande, risposte e sezioni">Scarica modello di import</button>
    <button class="btn" data-act="importfile" data-v="new">Importa da Excel/CSV</button>
    <button class="btn primary" data-act="new">+ Nuovo quiz</button></div>
`;
  if (!S.quizzes.length) return h + `<div class="empty"><h3>Nessun quiz ancora</h3><p>Crea il primo quiz: scrivi le domande o incollale in blocco, imposta durata e soglia di superamento, poi attivalo.</p><p style="margin-top:14px"><button class="btn primary" data-act="new">Crea il primo quiz</button></p></div></div>`;
  h += '<div class="qlist">';
  for (const q of S.quizzes) {
    const done = rows.filter(r => r.a.quizId === q.id && r.done).length;
    const ask = S.askDel === q.id;
    h += `<div class="card qitem"><div class="stack" style="gap:8px;min-width:0">
      <div class="row"><h3>${esc(q.title)}</h3>${q.active ? '<span class="chip ok">Attivo</span>' : '<span class="chip">Bozza</span>'}</div>
      ${q.desc ? `<p class="muted small">${esc(q.desc)}</p>` : ''}
      <div class="meta"><span>${q.questions.length} domande</span><span>${q.duration} min</span><span>Soglia ${q.passPct}%</span><span>${done} consegnati</span>${q.notifiedAt ? `<span>Avviso inviato a ${q.notifiedCount}</span>` : ''}</div>
      ${q.audience && q.audience.length ? `<p class="small"><span class="chip warn">Visibile solo a</span> ${esc(q.audience.join(', '))}</p>` : ''}</div>
      <div class="actions">${ask ? `<span class="small muted">Eliminare il quiz?</span><button class="btn sm danger solid" data-act="delok" data-id="${q.id}">Elimina</button><button class="btn sm" data-act="delno">Annulla</button>` :
      `<button class="btn sm" data-act="toggle" data-id="${q.id}">${q.active ? 'Disattiva' : 'Attiva'}</button>
       <button class="btn sm" data-act="edit" data-id="${q.id}">Modifica</button>
       <button class="btn sm" data-act="preview" data-id="${q.id}">Anteprima</button>
       <button class="btn sm" data-act="dashq" data-id="${q.id}">Dashboard</button>
       <button class="btn sm" data-act="seeres" data-id="${q.id}">Risultati</button>
       ${q.active && S.mailOk ? `<button class="btn sm" data-act="notify" data-id="${q.id}">${q.notifiedAt ? 'Invia di nuovo avviso' : 'Invia avviso'}</button>` : ''}
       <button class="btn sm ghost danger" data-act="delask" data-id="${q.id}">Elimina</button>`}</div></div>`;
  }
  return h + `</div><p class="small muted">Quando attivi un quiz per la prima volta, tutti i lavoratori autorizzati nella scheda <b>Accessi</b> ricevono un'email con il link, la loro email e il loro codice.</p></div>`;
}
function durHint(d) {
  const n = d.questions.filter(q => q.text.trim()).length || d.questions.length, m = +d.duration;
  if (!n || !(m > 0)) return '';
  const sec = Math.round(m * 60 / n);
  return `${n} domande · circa ${sec} secondi per domanda (${Math.floor(m / 60) ? Math.floor(m / 60) + ' h ' : ''}${m % 60} min in totale)`;
}
const blankQ = (section = '') => ({ text: '', options: ['', '', '', ''], correct: null, section });
function editView() {
  const d = S.draft;
  let h = `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="cancel">← Torna ai quiz</button></div>
  <h2>${d.id ? 'Modifica quiz' : 'Nuovo quiz'}</h2>
  ${d.id && S.attempts.some(a => a.quizId === d.id) ? '<div class="note">Questo quiz è già stato svolto: se cambi domande o risposte corrette, i punteggi già salvati non vengono ricalcolati.</div>' : ''}
  <div class="card stack">
    <label class="f">Titolo<input type="text" id="f-title" data-f="title" value="${esc(d.title)}" placeholder="Es. Procedure di accoglienza clienti"></label>
    <label class="f">Istruzioni per i lavoratori <span class="hint">facoltativo</span><textarea id="f-desc" data-f="desc" rows="2" placeholder="Es. Rispondi da solo, senza consultare materiali.">${esc(d.desc)}</textarea></label>
    <div class="grid3">
      <label class="f">Durata totale (minuti)<input type="number" id="f-dur" min="1" max="300" data-f="duration" value="${d.duration}">
        <span class="hint" id="f-dur-hint">${durHint(d)}</span>
        <span class="row" style="gap:6px">${[30, 45, 60].map(sec => `<button type="button" class="btn sm ghost" data-act="perq" data-v="${sec}">${sec} s/domanda</button>`).join('')}</span></label>
      <label class="f">Soglia di superamento (%)<input type="number" id="f-pass" min="0" max="100" data-f="passPct" value="${d.passPct}"></label>
      <div class="f" style="justify-content:flex-end;gap:8px">
        <label class="check"><input type="checkbox" id="f-sq" data-f="shuffleQ" ${d.shuffleQ ? 'checked' : ''}>Domande in ordine casuale</label>
        <label class="check"><input type="checkbox" id="f-so" data-f="shuffleO" ${d.shuffleO ? 'checked' : ''}>Risposte in ordine casuale</label>
      </div>
    </div>
    <div class="f">Visibile a
      <label class="check"><input type="radio" name="aud" id="f-aud-all" data-f="audMode" value="all" ${!d.audOn ? 'checked' : ''}>Tutti gli autorizzati negli Accessi</label>
      <label class="check"><input type="radio" name="aud" id="f-aud-some" data-f="audMode" value="some" ${d.audOn ? 'checked' : ''}>Solo questi indirizzi (es. per fare un test preventivo)</label>
      ${d.audOn ? `<textarea id="f-aud" data-f="audText" rows="2" placeholder="nome@gsloft.it, altro@gsloft.it">${esc(d.audText)}</textarea>
      <span class="hint">Gli indirizzi devono essere anche negli Accessi. Quando passi a "Tutti", gli altri lavoratori ricevono l'avviso.</span>` : ''}
    </div>
    <label class="check"><input type="checkbox" id="f-act" data-f="active" ${d.active ? 'checked' : ''}>Attivo (visibile ai lavoratori${S.mailOk ? '; chi può vederlo riceve l\'email di avviso, una sola volta' : ''})</label>
  </div>
  <div class="card stack"><div class="row"><h3>Domande</h3><span class="chip acc">${d.questions.length}</span>${(() => { const n = secNames(d).length; return n ? `<span class="chip">${n} sezioni</span>` : ''; })()}<span class="spacer"></span><span class="hint">Seleziona il pallino della risposta corretta</span></div>
  <datalist id="secs">${secNames(d).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  ${secNames(d).length && d.shuffleQ ? '<p class="hint">Con le sezioni l\'ordine casuale mescola le domande solo all\'interno di ogni sezione: le sezioni restano in sequenza.</p>' : ''}`;
  d.questions.forEach((q, qi) => {
    if (q.section && q.section !== (d.questions[qi - 1] || {}).section) h += `<div class="sechead">Sezione · ${esc(q.section)}</div>`;
    h += `<div class="qedit stack" style="gap:10px"><div class="row"><span class="num">Domanda ${qi + 1}</span>
      <input type="text" class="secin" id="q${qi}-s" data-f="qsec" data-q="${qi}" list="secs" value="${esc(q.section || '')}" placeholder="Sezione (facoltativa)" aria-label="Sezione della domanda ${qi + 1}">
      <span class="spacer"></span>
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
    <div class="row"><button class="btn" data-act="importfile" data-v="draft">Aggiungi domande da Excel/CSV</button>
      <button class="btn ghost sm" data-act="template" data-v="xlsx">Scarica modello Excel</button><button class="btn ghost sm" data-act="template" data-v="csv">Modello CSV</button></div>
    <details class="imp"><summary>Incolla più domande insieme</summary><div class="stack" style="margin-top:12px">
      <p class="small muted">Una domanda per blocco, righe vuote tra i blocchi. Le risposte iniziano con A. B. C. … e l'ultima riga indica quella corretta. Una riga <b>SEZIONE: Nome</b> assegna la sezione alle domande che seguono.</p>
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
    S.draft = { id, audOn: !!(q.audience && q.audience.length), audText: (q.audience || []).join(', '), title: q.title, desc: q.desc || '', duration: q.duration, passPct: q.passPct, shuffleQ: !!q.shuffleQ, shuffleO: !!q.shuffleO, active: !!q.active,
      questions: q.questions.map(x => ({ text: x.text, options: x.options.slice(), correct: x.correct, section: x.section || '' })) };
  } else S.draft = { id: null, audOn: false, audText: '', title: '', desc: '', duration: 15, passPct: 70, shuffleQ: true, shuffleO: true, active: false, questions: [blankQ()] };
  S.draftErr = null; S.view = 'edit'; render(); window.scrollTo(0, 0);
}
/* importazione da Excel / CSV: colonne Domanda, Risposta A…F, Corretta */
let xlsxReady = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  return xlsxReady || (xlsxReady = new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => { xlsxReady = null; ko(new Error('Lettore Excel non caricato. Riprova.')); }; document.head.appendChild(sc); }));
}
function pickImportFile() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv,.ods';
  inp.onchange = () => inp.files[0] && importFile(inp.files[0]); inp.click();
}
function rowsToQuestions(rows) {
  const norm = v => String(v ?? '').trim();
  rows = rows.map(r => r.map(norm)).filter(r => r.some(Boolean));
  if (!rows.length) return { questions: [], errors: ['Il file è vuoto.'] };
  const head = rows[0].map(h => h.toLowerCase());
  const hasHead = head.some(h => /domand|question|corrett|rispost|opzion|answer/.test(h));
  let qCol = 0, cCol = -1, sCol = -1, oCols = [];
  if (hasHead) {
    qCol = Math.max(0, head.findIndex(h => /domand|question/.test(h)));
    cCol = head.findIndex(h => /corrett|correct|soluz|giust/.test(h));
    sCol = head.findIndex(h => /sezion|section|categor|argoment|area/.test(h));
    oCols = head.map((h, i) => i).filter(i => i !== qCol && i !== cCol && i !== sCol && /rispost|opzion|answer|^[a-f]$/.test(head[i]));
    if (!oCols.length) oCols = head.map((h, i) => i).filter(i => i !== qCol && i !== cCol && i !== sCol && !/^n\.?$|^num|^#$/.test(head[i]));
    rows = rows.slice(1);
  } else {
    const w = Math.max(...rows.map(r => r.length)); cCol = w - 1; oCols = range(w).slice(1, -1);
  }
  const questions = [], errors = [];
  rows.forEach((r, k) => {
    const line = k + (hasHead ? 2 : 1);
    const text = r[qCol]; if (!text) return;
    const opts = oCols.map(i => r[i]).filter(Boolean).slice(0, 6);
    if (opts.length < 2) { errors.push(`Riga ${line}: servono almeno 2 risposte.`); return; }
    const c = cCol >= 0 ? r[cCol] : '';
    let correct = null;
    if (/^[a-f]$/i.test(c)) correct = c.toUpperCase().charCodeAt(0) - 65;
    else if (/^[1-6]$/.test(c)) correct = +c - 1;
    else if (c) correct = opts.findIndex(o => o.toLowerCase() === c.toLowerCase());
    if (!(correct >= 0 && correct < opts.length)) { errors.push(`Riga ${line}: risposta corretta mancante o non valida ("${c}").`); correct = null; }
    questions.push({ text, options: opts, correct, section: sCol >= 0 ? r[sCol] : '' });
  });
  return { questions, errors };
}
async function importFile(file) {
  try {
    let rows;
    if (/\.csv$/i.test(file.name)) {
      const txt = (await file.text()).replace(/^\ufeff/, '');
      const first = txt.split(/\r?\n/)[0] || '';
      const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
      rows = parseCsv(txt, sep);
    } else {
      await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
    }
    const { questions, errors } = rowsToQuestions(rows);
    if (!questions.length) { toast(errors[0] || 'Nessuna domanda trovata nel file.'); return; }
    if (S.importTarget === 'draft' && S.draft) {
      S.draft.questions = S.draft.questions.filter(q => q.text.trim() || q.options.some(o => o.trim())).concat(questions);
    } else {
      openEditor(null);
      S.draft.title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      S.draft.questions = questions;
    }
    S.draftErr = errors.length ? `Importate ${questions.length} domande. Da controllare: ` + errors.slice(0, 5).join(' ') + (errors.length > 5 ? ` (e altre ${errors.length - 5})` : '') : null;
    S.view = 'edit'; render();
    toast(`${questions.length} domande importate`);
  } catch (e) { toast(e.message || 'File non leggibile.'); }
}
function parseCsv(txt, sep) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function parseImport(txt) {
  const out = []; let section = '';
  for (const b of txt.replace(/\r/g, '').split(/\n\s*\n/)) {
    let lines = b.split('\n').map(s => s.trim()).filter(Boolean);
    while (lines.length && /^SEZIONE\s*[:\-]/i.test(lines[0])) { section = lines[0].replace(/^SEZIONE\s*[:\-]\s*/i, ''); lines = lines.slice(1); }
    if (!lines.length) continue;
    const q = { text: '', options: [], correct: null, section }; const qt = [];
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
    questions.push({ text: q.text.trim(), options: opts.map(o => o.t), correct: c, section: (q.section || '').trim() });
  }
  if (!S.draftErr && !d.title.trim()) S.draftErr = 'Dai un titolo al quiz.';
  if (!S.draftErr && !questions.length) S.draftErr = 'Aggiungi almeno una domanda.';
  if (!S.draftErr && d.audOn && !d.audText.trim()) S.draftErr = 'Indica almeno un indirizzo in "Visibile a", oppure scegli "Tutti gli autorizzati".';
  if (S.draftErr) { render(); return; }
  S.saving = true; render();
  try {
    const res = await api('admin/quizzes', { method: 'PUT', body: { quiz: { id: d.id, title: d.title, desc: d.desc, duration: Math.round(+d.duration), passPct: Math.round(+d.passPct),
      shuffleQ: d.shuffleQ, shuffleO: d.shuffleO, active: d.active, questions,
      audience: d.audOn ? d.audText.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean) : [] } } });
    S.saving = false; S.draft = null; S.view = 'home'; S.tab = 'quiz';
    if (res.notify) notifyToast(res.notify); else toast('Quiz salvato');
    await refresh();
  } catch (e) { S.saving = false; if (e.message !== '401') { S.draftErr = e.message; render(); } }
}

function notifyToast(n) {
  if (!n) return;
  if (!n.configured) { toast('Quiz attivato'); return; }
  toast(n.failed && n.failed.length ? `Avviso inviato a ${n.sent}, non riuscito per ${n.failed.length}` : `Avviso inviato a ${n.sent} ${n.sent === 1 ? 'lavoratore' : 'lavoratori'}`);
}

async function downloadTemplate(fmt) {
  const res = await fetch('/api/admin/template?format=' + fmt, { credentials: 'same-origin' });
  if (res.status === 401) { logoutLocal('Sessione scaduta: accedi di nuovo.'); return; }
  if (!res.ok) throw new Error('Modello non disponibile. Riprova.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = 'modello-quiz.' + fmt; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
  h += '<p class="small muted">Dati riservati: risultati e risposte dei singoli professionisti. Per la restituzione al team usa la <b>Dashboard</b>, che mostra solo dati aggregati.</p>';
  h += `<div class="tbl-wrap"><table><thead><tr><th>Email</th><th>Quiz</th><th>Inizio</th><th>Durata</th><th>Punteggio</th><th>Esito</th><th>Uscite</th><th></th></tr></thead><tbody>`;
  for (const r of rows) {
    const k = r.a.key, open = S.openDetail === k;
    const esito = !r.done ? '<span class="chip warn">In corso</span>' : r.pass ? '<span class="chip ok">Superato</span>' : '<span class="chip bad">Non superato</span>';
    h += `<tr><td>${esc(r.a.email)}</td><td>${esc(r.quiz ? r.quiz.title : 'Quiz eliminato')}</td><td class="num">${fmtD(r.a.startedAt)}</td>
      <td class="num">${r.done ? fmtDur(r.a.finishedAt - r.a.startedAt) : '—'}${r.a.auto ? ' <span class="chip warn">tempo scaduto</span>' : ''}</td>
      <td class="num">${r.done ? `${r.score}/${r.n} · ${r.pct}%` : '—'}</td><td>${esito}</td><td class="num">${r.a.leaves || 0}</td>
      <td><div class="row" style="flex-wrap:nowrap">${r.quiz ? `<button class="btn sm" data-act="detail" data-k="${esc(k)}">${open ? 'Chiudi' : 'Dettaglio'}</button>` : ''}
      ${S.askReset === k ? `<button class="btn sm danger solid" data-act="resetok" data-k="${esc(k)}">Conferma</button><button class="btn sm" data-act="resetno">No</button>` :
      `<button class="btn sm ghost" data-act="resetask" data-k="${esc(k)}" title="Cancella questo tentativo e permetti di rifarlo">Nuovo tentativo</button>`}</div></td></tr>`;
    if (open && r.quiz) {
      const ss = secScores(r.quiz, r.a.answers);
      h += `<tr><td colspan="8" class="detail">${ss.length ? `<h3 style="margin:4px 0 10px">Punteggio per sezione</h3>${secBars(ss)}<h3 style="margin:18px 0 6px">Risposte</h3>` : ''}<div class="ans">${r.quiz.questions.map((q, i) => {
        const g = (r.a.answers || {})[i]; const ok = g !== undefined && g === q.correct;
        const head = q.section && q.section !== (r.quiz.questions[i - 1] || {}).section ? `<p class="sechead" style="margin:10px 0 0">${esc(q.section)}</p>` : '';
        return `${head}<div><span class="k ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</span><span><b>${i + 1}. ${esc(q.text)}</b><br>
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
  const secs = [...new Set(rows.flatMap(r => r.quiz ? secNames(r.quiz) : []))];
  const lines = [['Email', 'Quiz', 'Inizio', 'Fine', 'Durata', 'Corrette', 'Totale', 'Percentuale', 'Esito', 'Uscite dalla pagina', 'Tempo scaduto',
    ...secs.flatMap(n => [n + ' - corrette', n + ' - totale', n + ' - %'])].map(q).join(';')];
  for (const r of rows) {
    const ss = r.quiz && r.done ? secScores(r.quiz, r.a.answers) : [];
    lines.push([r.a.email, r.quiz ? r.quiz.title : 'Quiz eliminato', fmtD(r.a.startedAt), fmtD(r.a.finishedAt), r.done ? fmtDur(r.a.finishedAt - r.a.startedAt) : '',
      r.done ? r.score : '', r.n, r.done ? r.pct + '%' : '', !r.done ? 'In corso' : r.pass ? 'Superato' : 'Non superato', r.a.leaves || 0, r.a.auto ? 'Sì' : 'No',
      ...secs.flatMap(n => { const x = ss.find(y => y.name === n); return x ? [x.score, x.total, pctOf(x.score, x.total) + '%'] : ['', '', '']; })].map(q).join(';'));
  }
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'risultati-quiz.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ----- responsabile: dashboard aggregata (anonima) ----- */
function aggregate(quiz) {
  const done = S.attempts.filter(a => a.quizId === quiz.id && a.status === 'consegnato');
  const n = quiz.questions.length, N = done.length;
  const pcts = done.map(a => pctOf(quiz.questions.reduce((s, q, i) => s + ((a.answers || {})[i] === q.correct ? 1 : 0), 0), n)).sort((x, y) => x - y);
  const med = N ? (N % 2 ? pcts[(N - 1) / 2] : Math.round((pcts[N / 2 - 1] + pcts[N / 2]) / 2)) : 0;
  const avg = N ? Math.round(pcts.reduce((s, x) => s + x, 0) / N) : 0;
  const time = N ? done.reduce((s, a) => s + (a.finishedAt - a.startedAt), 0) / N : 0;
  const bands = [{ name: 'Da 80% in su', c: pcts.filter(p => p >= 80).length, cls: 'ok' }, { name: 'Tra 60% e 79%', c: pcts.filter(p => p >= 60 && p < 80).length, cls: 'warn' }, { name: 'Sotto 60%', c: pcts.filter(p => p < 60).length, cls: 'bad' }];
  const sections = secNames(quiz).map(name => { const idx = quiz.questions.map((q, i) => q.section === name ? i : -1).filter(i => i >= 0);
    const sc = done.reduce((s, a) => s + idx.filter(i => (a.answers || {})[i] === quiz.questions[i].correct).length, 0);
    return { name, pct: pctOf(sc, idx.length * N), label: `media ${N ? (sc / N).toFixed(1).replace('.', ',') : 0}/${idx.length}` }; });
  const questions = quiz.questions.map((q, i) => {
    const counts = q.options.map(() => 0); let blank = 0;
    done.forEach(a => { const g = (a.answers || {})[i]; if (g === undefined) blank++; else counts[g]++; });
    const wrong = counts.map((c, k) => ({ k, c })).filter(x => x.k !== q.correct).sort((x, y) => y.c - x.c)[0];
    return { i, q, pct: pctOf(counts[q.correct], N), wrong: wrong && wrong.c ? { text: q.options[wrong.k], pct: pctOf(wrong.c, N) } : null, blank };
  });
  return { N, avg, med, time, bands, sections, questions, active: quiz.audience && quiz.audience.length ? quiz.audience.length : S.people.length };
}
function dashView() {
  const withData = S.quizzes.filter(q => S.attempts.some(a => a.quizId === q.id));
  const quiz = S.quizzes.find(q => q.id === S.dashQuiz) || withData[0] || S.quizzes[0];
  let h = `<div class="stack"><div class="row"><div><h2>Dashboard</h2><p class="muted small">Solo dati aggregati e anonimi: nessun nome né risultato individuale. È la vista da usare per la restituzione al team.</p></div><span class="spacer"></span>
    <button class="btn" data-act="reload">Aggiorna</button>
    ${quiz ? `<select id="dashf" data-f="dashQuiz" aria-label="Quiz" style="width:auto;max-width:100%">${S.quizzes.map(q => `<option value="${q.id}" ${q.id === quiz.id ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}</select>` : ''}
    ${quiz ? '<button class="btn" data-act="dashcsv">Esporta dati aggregati</button>' : ''}</div>`;
  if (!quiz) return h + '<div class="empty"><h3>Nessun quiz</h3><p>Crea un quiz per vedere qui i dati aggregati.</p></div></div>';
  const A = aggregate(quiz);
  if (!A.N) return h + `<div class="empty"><h3>Ancora nessun test consegnato</h3><p>Quando i professionisti consegnano "${esc(quiz.title)}", qui compaiono medie per area, distribuzione e domande più critiche.</p></div></div>`;
  h += `<div class="stats"><div class="stat"><b>${A.N}</b><span>Test consegnati${A.active ? ` su ${A.active}` : ''}</span></div><div class="stat"><b>${A.avg}%</b><span>Punteggio medio</span></div>
    <div class="stat"><b>${A.med}%</b><span>Mediana</span></div><div class="stat"><b>${Math.round(A.time / 60000)} min</b><span>Tempo medio</span></div></div>`;
  h += `<div class="card stack"><h3>Distribuzione dei risultati</h3><div class="bands">${A.bands.map(b => `<div class="band"><span class="secbar"><i class="${b.cls}" style="width:${pctOf(b.c, A.N)}%"></i></span><span>${b.name}</span><b class="mono">${b.c}</b></div>`).join('')}</div>
    <p class="small muted">Numero di professionisti per fascia di punteggio, secondo la griglia del test.</p></div>`;
  if (A.sections.length) h += `<div class="card stack"><div><h3>Media per area</h3><p class="small muted">Le aree più basse sono le priorità del piano formativo.</p></div>${secBars(A.sections, { legend: true })}</div>`;
  const secs = secNames(quiz); const sf = S.dashSec || '';
  const allQs = A.questions.filter(x => !sf || x.q.section === sf).sort((x, y) => x.pct - y.pct || x.i - y.i);
  const qs = S.dashAll ? allQs : allQs.slice(0, 15);
  h += `<div class="card stack"><div class="row"><div><h3>Domande, dalla più sbagliata</h3><p class="small muted">Percentuale di risposte corrette e risposta errata scelta più spesso: indica il concetto da chiarire in formazione.</p></div><span class="spacer"></span>
    ${secs.length ? `<select id="dashs" data-f="dashSec" aria-label="Area" style="width:auto;max-width:100%"><option value="">Tutte le aree</option>${secs.map(n => `<option ${n === sf ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>N.</th>${secs.length ? '<th>Area</th>' : ''}<th>Domanda</th><th>Corrette</th><th>Errore più frequente</th></tr></thead><tbody>
    ${qs.map(x => `<tr><td class="num">${x.i + 1}</td>${secs.length ? `<td>${esc(x.q.section)}</td>` : ''}<td class="wrap">${esc(x.q.text)}</td>
      <td class="num"><span class="chip ${x.pct >= 80 ? 'ok' : x.pct >= 60 ? 'warn' : 'bad'}">${x.pct}%</span></td>
      <td class="wrap">${x.wrong ? `${esc(x.wrong.text)} <span class="muted">(${x.wrong.pct}%)</span>` : '<span class="muted">—</span>'}${x.blank ? ` <span class="muted small">· ${x.blank} senza risposta</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${allQs.length > 15 ? `<div><button class="btn sm" data-act="dashall">${S.dashAll ? 'Mostra solo le 15 più critiche' : `Mostra tutte le ${allQs.length} domande`}</button></div>` : ''}</div></div>`;
  return h;
}
function exportAggCsv() {
  const quiz = S.quizzes.find(q => q.id === S.dashQuiz) || S.quizzes.find(q => S.attempts.some(a => a.quizId === q.id)) || S.quizzes[0];
  if (!quiz) return; const A = aggregate(quiz);
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const L2 = [['Quiz', quiz.title], ['Test consegnati', A.N], ['Punteggio medio', A.avg + '%'], ['Mediana', A.med + '%'], ['Tempo medio (min)', Math.round(A.time / 60000)], [],
    ['Fascia', 'Professionisti'], ...A.bands.map(b => [b.name, b.c]), [],
    ...(A.sections.length ? [['Area', 'Media corrette', '%'], ...A.sections.map(x => [x.name, x.label.replace('media ', ''), x.pct + '%']), []] : []),
    ['N.', 'Area', 'Domanda', '% corrette', 'Errore più frequente', '% errore più frequente', 'Senza risposta'],
    ...A.questions.map(x => [x.i + 1, x.q.section || '', x.q.text, x.pct + '%', x.wrong ? x.wrong.text : '', x.wrong ? x.wrong.pct + '%' : '', x.blank])];
  const url = URL.createObjectURL(new Blob(['\ufeff' + L2.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'dati-aggregati-' + quiz.title.replace(/[^\w]+/g, '-').toLowerCase() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ----- responsabile: accessi ----- */
function accessView() {
  const list = S.people.slice().sort((a, b) => a.email.localeCompare(b.email));
  let h = `<div class="stack"><div><h2>Accessi</h2><p class="muted small">Solo le persone in questo elenco possono entrare. Ognuna accede con la sua email e il codice personale generato qui${S.mailOk ? ', che riceve subito per email' : ''}.</p></div>
  <div class="card stack"><label class="f">Aggiungi email <span class="hint">anche più di una, separate da virgola o a capo</span>
    <textarea id="accin" rows="3" placeholder="mario.rossi@gsloft.it, giulia.bianchi@gsloft.it"></textarea></label>
    ${S.accErr ? `<div class="err">${esc(S.accErr)}</div>` : ''}
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="accadd" ${S.saving ? 'disabled' : ''}>Autorizza e genera codici</button></div></div>`;
  if (!list.length) return h + `<div class="empty"><h3>Nessuna email autorizzata</h3><p>Finché l'elenco è vuoto nessun lavoratore può entrare.</p></div></div>`;
  h += `<div class="tbl-wrap"><table><thead><tr><th>Email autorizzate · ${list.length}</th><th>Codice</th><th></th></tr></thead><tbody>`;
  for (const p of list) {
    const msg = `Link: ${location.origin}\nEmail: ${p.email}\nCodice di accesso: ${p.code}`;
    h += `<tr><td>${esc(p.email)}</td><td class="num"><b>${esc(p.code)}</b> <button class="btn sm ghost" data-act="copy" data-t="${esc(msg)}">Copia</button>
      <button class="btn sm ghost" data-act="regen" data-e="${esc(p.email)}" title="Genera un nuovo codice: quello vecchio smette di funzionare">Nuovo codice</button>
      ${S.mailOk ? `<button class="btn sm ghost" data-act="accmail" data-e="${esc(p.email)}">${p.mailedAt ? 'Reinvia email' : 'Invia email'}</button>` : ''}
      <div class="small muted" style="font-family:var(--f-body)">${p.mailedAt ? 'Email inviata il ' + fmtD(p.mailedAt) : S.mailOk ? 'Email non ancora inviata' : ''}</div></td>
      <td style="text-align:right">${S.askRm === p.email ? `<span class="small muted">Togliere l'accesso?</span> <button class="btn sm danger solid" data-act="accrmok" data-e="${esc(p.email)}">Rimuovi</button> <button class="btn sm" data-act="accrmno">Annulla</button>`
      : `<button class="btn sm ghost danger" data-act="accrm" data-e="${esc(p.email)}">Rimuovi</button>`}</td></tr>`;
  }
  return h + `</tbody></table></div><p class="small muted">"Copia" prepara il messaggio con link, email e codice da mandare al lavoratore.</p></div>`;
}
async function addAccess() {
  const emails = document.getElementById('accin').value.split(/[\s,;]+/).filter(Boolean);
  S.saving = true; S.accErr = null; render();
  try {
    const r = await api('admin/people', { method: 'POST', body: { emails } }); S.people = r.people;
    if (!r.added) toast('Email già autorizzate');
    else if (!r.mail.configured) toast(r.added === 1 ? 'Accesso creato' : r.added + ' accessi creati');
    else toast(mailMsg(r.mail, r.added === 1 ? 'Accesso creato e inviato' : `${r.added} accessi creati`));
    document.getElementById('accin') && (document.getElementById('accin').value = '');
  }
  catch (e) { if (e.message !== '401') S.accErr = e.message; }
  S.saving = false; render();
}

function mailMsg(m, prefix) {
  if (m.failed && m.failed.length) return `${prefix}: email inviata a ${m.sent}, non riuscita per ${m.failed.join(', ')}`;
  return `${prefix}: email inviata${m.sent > 1 ? ` a ${m.sent}` : ''}`;
}

/* ----- lavoratore ----- */
function employeeHome() {
  let h = `<div class="stack"><div class="row"><div><h2>I tuoi quiz</h2><p class="muted small">Ogni quiz si può svolgere una sola volta.</p></div><span class="spacer"></span><button class="btn" data-act="reload">Aggiorna</button></div>`;
  if (!S.quizzes.length) return h + `<div class="empty"><h3>Nessun quiz da svolgere</h3><p>Quando il responsabile attiva un quiz, lo trovi qui.</p></div></div>`;
  h += '<div class="qlist">';
  for (const q of S.quizzes) {
    const act = q.status === 'da_fare' ? `<button class="btn primary" data-act="intro" data-id="${q.id}">Inizia</button>`
      : q.status === 'consegnato' ? `<span class="chip ok">Consegnato</span>`
      : `<button class="btn primary" data-act="resume" data-id="${q.id}">Riprendi</button>`;
    h += `<div class="card qitem"><div class="stack" style="gap:6px;min-width:0"><h3>${esc(q.title)}</h3>
      ${q.desc ? `<p class="muted small">${esc(q.desc)}</p>` : ''}
      <div class="meta"><span>${q.count} domande</span><span>${q.duration} minuti</span>${q.finishedAt ? `<span>Consegnato il ${fmtD(q.finishedAt)}</span>` : ''}</div></div>
      <div class="actions">${act}</div></div>`;
  }
  return h + '</div></div>';
}
function introView() {
  const q = S.quizzes.find(x => x.id === S.sel); if (!q) return '';
  const n = q.count ?? q.questions.length;
  return `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="home">← Indietro</button>${S.preview ? '<span class="chip acc">Anteprima: nessun dato salvato</span>' : ''}</div>
  <div class="card stack"><h2>${esc(q.title)}</h2>${q.desc ? `<p>${esc(q.desc)}</p>` : ''}
    <ol class="rules">
      <li>Hai <b>${q.duration} minuti</b> per rispondere a <b>${n} domande</b>.</li>
      <li>Le domande compaiono una alla volta.</li>
      <li>Quando confermi una risposta <b>non puoi più cambiarla</b> né tornare alle domande precedenti.</li>
      <li>Allo scadere del tempo il quiz viene consegnato automaticamente, con le risposte date fino a quel momento.</li>
      <li>Resta su questa pagina: le uscite dalla pagina vengono registrate.</li>
    </ol>
    ${S.preview ? '' : `<p class="small muted">Il risultato verrà registrato a nome di <b>${esc(S.email)}</b>.</p>`}
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="start" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Avvio…' : 'Inizia il quiz'}</button></div>
  </div></div>`;
}
function runView() {
  const r = S.run, q = r.question, last = r.pos === r.total - 1;
  return `<div class="runbar"><div style="min-width:0"><b>${esc(r.title)}</b><div class="small muted mono">( ${pad2(r.pos + 1)} / ${pad2(r.total)} )${S.preview ? ' · anteprima' : ''}</div></div>
    <span class="spacer"></span><div class="timer" id="timer" role="timer" aria-label="Tempo rimanente">${fmtT(r.deadlineLocal - Date.now())}</div>
    <div class="progress"><i style="width:${r.pos / r.total * 100}%"></i></div></div>
  <div class="stack" style="margin-top:24px">${q.section ? `<p class="sechead" style="margin:0">Sezione · ${esc(q.section)}</p>` : ''}<p class="question">${esc(q.text)}</p>
    <div class="choices" role="radiogroup">${q.options.map((o, k) => `<button class="choice" role="radio" data-act="pick" data-o="${o.i}" aria-checked="${r.pick === o.i}"><span class="l">${L(k)}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
    <div class="row"><span class="small muted">La risposta confermata non si può modificare.</span><span class="spacer"></span>
    <button class="btn primary" data-act="confirm" ${r.pick == null || S.saving ? 'disabled' : ''}>${S.saving ? 'Invio…' : last ? 'Conferma e consegna' : 'Conferma e vai avanti →'}</button></div></div>`;
}
function doneView() {
  const r = S.lastResult || {};
  // Il lavoratore vede solo la conferma: nessun punteggio, nessuna risposta corretta/errata.
  let h = `<div class="card stack" style="text-align:center;align-items:center;padding:48px 20px;margin-top:8px">
    <span class="chip ok">Consegnato</span><h2>Test terminato</h2>
    <p class="muted" style="max-width:46ch">${r.auto ? 'Il tempo a disposizione è terminato e le tue risposte sono state registrate.' : 'Le tue risposte sono state registrate.'} Grazie per il tempo dedicato.</p>`;
  if (S.preview && r.n) h += `<div class="note" style="text-align:left;width:100%;max-width:560px"><b>Anteprima responsabile</b> (non visibile ai lavoratori, nessun dato salvato): ${r.score}/${r.n} · ${r.pct}%${secNames(Preview.q).length ? secBars(r.sections) : ''}</div>`;
  return h + `<button class="btn" data-act="home">Torna ai quiz</button></div>`;
}

/* ---------- svolgimento: server (lavoratore) o locale (anteprima) ---------- */
function applyState(st) {
  if (st.status === 'consegnato') {
    clearInterval(timerH);
    S.lastResult = st.preview ? { title: st.title, auto: st.auto, ...st.preview } : { title: st.title, auto: st.auto };
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
      order: (() => { const names = secNames(quiz); if (!names.length) return quiz.shuffleQ ? shuffle(range(n)) : range(n);
        return [...names, ''].flatMap(nm => { const g = range(n).filter(i => (quiz.questions[i].section || '') === nm); return quiz.shuffleQ ? shuffle(g) : g; }); })(),
      optOrder: quiz.questions.map(x => quiz.shuffleO ? shuffle(range(x.options.length)) : range(x.options.length)) };
    return this.state();
  },
  state() {
    const { q, a } = this, qi = a.order[a.pos], x = q.questions[qi];
    return { status: 'in_corso', quizId: q.id, title: q.title, pos: a.pos, total: q.questions.length, remainingMs: a.deadline - Date.now(),
      question: { text: x.text, section: x.section || '', options: a.optOrder[qi].map(i => ({ i, text: x.options[i] })) } };
  },
  answer(choice) { this.a.answers[this.a.order[this.a.pos]] = choice; this.a.pos++; return this.a.pos >= this.q.questions.length ? this.finish(false) : this.state(); },
  finish(auto) {
    const { q, a } = this, n = q.questions.length;
    const score = q.questions.reduce((s, x, i) => s + (a.answers[i] === x.correct ? 1 : 0), 0), pct = Math.round(score / n * 100);
    return { status: 'consegnato', title: q.title, auto, preview: { score, n, pct, pass: pct >= q.passPct, passPct: q.passPct, sections: secScores(q, a.answers) } };
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
      case 'tab': S.tab = b.dataset.v; S.view = 'home'; render(); break;
      case 'reload': await refresh(); toast('Aggiornato'); break;
      case 'new': openEditor(null); break;
      case 'edit': openEditor(b.dataset.id); break;
      case 'cancel': S.draft = null; S.view = 'home'; render(); break;
      case 'save': saveDraft(); break;
      case 'qadd': d.questions.push(blankQ((d.questions[d.questions.length - 1] || {}).section || '')); render(); break;
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
      case 'toggle': { const q = S.quizzes.find(x => x.id === b.dataset.id); b.disabled = true;
        const r = await api('admin/quizzes', { method: 'PATCH', body: { id: q.id, active: !q.active } });
        if (r.notify) notifyToast(r.notify); else toast(q.active ? 'Quiz disattivato' : 'Quiz attivato'); await refresh(); break; }
      case 'notify': { b.disabled = true; b.textContent = 'Invio…'; const r = await api('admin/notify', { method: 'POST', body: { id: b.dataset.id } }); notifyToast(r.notify); await refresh(); break; }
      case 'template': await downloadTemplate(b.dataset.v); break;
      case 'perq': { const n = d.questions.length; d.duration = Math.ceil(n * +b.dataset.v / 60); render(); toast(`${n} domande × ${b.dataset.v} s = ${d.duration} minuti`); break; }
      case 'dashq': S.dashQuiz = b.dataset.id; S.tab = 'dash'; S.view = 'home'; render(); break;
      case 'dashcsv': exportAggCsv(); break;
      case 'dashall': S.dashAll = !S.dashAll; render(); break;
      case 'importfile': S.importTarget = b.dataset.v; pickImportFile(); break;
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
      case 'regen': { const r = await api('admin/people', { method: 'PATCH', body: { email: b.dataset.e } }); S.people = r.people;
        toast(r.mail.configured ? mailMsg(r.mail, 'Nuovo codice generato') : 'Nuovo codice generato'); render(); break; }
      case 'accmail': { b.disabled = true; b.textContent = 'Invio…'; const r = await api('admin/people/send', { method: 'POST', body: { email: b.dataset.e } }); S.people = r.people;
        toast(mailMsg(r.mail, 'Accesso')); render(); break; }
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
  const t = e.target, f = t.dataset.f; if (!f) return;
  if (f === 'resFilter') { S.resFilter = t.value; S.openDetail = null; render(); return; }
  if (f === 'dashQuiz') { S.dashQuiz = t.value; S.dashSec = ''; render(); return; }
  if (f === 'dashSec') { S.dashSec = t.value; render(); return; }
  const d = S.draft; if (!d) return;
  const qi = +t.dataset.q, oi = +t.dataset.o;
  if (f === 'qtext') d.questions[qi].text = t.value;
  else if (f === 'qsec') d.questions[qi].section = t.value;
  else if (f === 'audMode') { d.audOn = t.value === 'some'; render(); return; }
  else if (f === 'audText') d.audText = t.value;
  else if (f === 'opt') d.questions[qi].options[oi] = t.value;
  else if (f === 'correct') d.questions[qi].correct = oi;
  else if (t.type === 'checkbox') d[f] = t.checked;
  else d[f] = t.value;
  if (f === 'duration') { const el = document.getElementById('f-dur-hint'); if (el) el.textContent = durHint(d); }
});
app.addEventListener('change', e => { const t = e.target; if (t.dataset.f === 'correct' && S.draft) S.draft.questions[+t.dataset.q].correct = +t.dataset.o; });
window.addEventListener('beforeunload', e => { if (S.view === 'run' && !S.preview) { e.preventDefault(); e.returnValue = ''; } });

boot();
})();
