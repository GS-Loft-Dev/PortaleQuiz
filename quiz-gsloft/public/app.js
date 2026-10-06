// Quiz Dipendenti GS LOFT — interfaccia (vanilla JS). Tutta la logica sensibile è nel server (/api).
(function () {
const app = document.getElementById('app');
const S = {
  ready: false, role: null, email: null,
  quizzes: [], people: [], attempts: [],
  view: 'home', tab: 'quiz', draft: null, draftErr: null, sel: null, run: null, preview: false, lastResult: null,
  resFilter: 'all', openDetail: null, askDel: null, askReset: null, askRm: null,
  saving: false, loginRole: 'employee', loginErr: null, accErr: null,
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
    const [q, p, r] = await Promise.all([api('admin/quizzes'), api('admin/people'), api('admin/results')]);
    S.quizzes = q.quizzes; S.people = p.people; S.attempts = r.attempts;
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
    else if (S.tab === 'access') h = accessView();
    else h = adminHome();
  } else h = employeeHome();
  app.innerHTML = header() + '<main class="wrap">' + h + '</main>';
}
function header() {
  const tabs = S.role === 'admin' && !['edit', 'intro', 'done', 'run'].includes(S.view) ? `<nav class="tabs">
    <button class="tab" data-act="tab" data-v="quiz" aria-current="${S.tab === 'quiz'}">Quiz</button>
    <button class="tab" data-act="tab" data-v="results" aria-current="${S.tab === 'results'}">Risultati</button>
    <button class="tab" data-act="tab" data-v="access" aria-current="${S.tab === 'access'}">Accessi</button></nav>` : '';
  const out = S.role && S.view !== 'run' ? `<button class="logout" data-act="logout"${tabs ? '' : ' style="margin-left:auto"'}>Esci</button>` : '';
  const sub = S.role === 'admin' ? 'Area responsabile' : S.role === 'employee' ? esc(S.email) : 'Verifiche a tempo';
  return `<header class="top"><div class="wrap"><div class="brand"><span class="logo" role="img" aria-label="GS LOFT"></span>
    <h1 class="sub">Quiz dipendenti<br>${sub}</h1></div>${tabs}${out}</div></header>`;
}

/* ----- accesso ----- */
function loginView() {
  const emp = S.loginRole === 'employee';
  return `<form class="card stack login" id="loginForm" novalidate>
    <div><h2>Accedi</h2><p class="muted small">${emp ? "Usa l'email aziendale e il codice di accesso che ti ha dato il responsabile." : 'Area riservata al responsabile.'}</p></div>
    <div class="seg" role="group" aria-label="Tipo di accesso">
      <button type="button" data-act="lrole" data-v="employee" aria-pressed="${emp}">Dipendente</button>
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
    return { a, quiz, done, n, score, pct, pass: quiz ? pct >= quiz.passPct : false, name: a.name || 'Senza nome' };
  }).sort((x, y) => (y.a.startedAt || 0) - (x.a.startedAt || 0));
}
function adminHome() {
  const rows = attemptRows();
  let h = `<div class="stack"><div class="row"><div><h2>I tuoi quiz</h2><p class="muted small">Solo i quiz <b>attivi</b> sono visibili ai dipendenti.</p></div><span class="spacer"></span>
    <button class="btn primary" data-act="new">+ Nuovo quiz</button></div>`;
  if (!S.quizzes.length) return h + `<div class="empty"><h3>Nessun quiz ancora</h3><p>Crea il primo quiz: scrivi le domande o incollale in blocco, imposta durata e soglia di superamento, poi attivalo.</p><p style="margin-top:14px"><button class="btn primary" data-act="new">Crea il primo quiz</button></p></div></div>`;
  h += '<div class="qlist">';
  for (const q of S.quizzes) {
    const done = rows.filter(r => r.a.quizId === q.id && r.done).length;
    const ask = S.askDel === q.id;
    h += `<div class="card qitem"><div class="stack" style="gap:8px;min-width:0">
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
  return h + `</div><p class="small muted">Per far svolgere un quiz: attivalo, autorizza le email nella scheda <b>Accessi</b> e manda a ogni dipendente il link del sito con la sua email e il suo codice.</p></div>`;
}
const blankQ = () => ({ text: '', options: ['', '', '', ''], correct: null });
function editView() {
  const d = S.draft;
  let h = `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="cancel">← Torna ai quiz</button></div>
  <h2>${d.id ? 'Modifica quiz' : 'Nuovo quiz'}</h2>
  ${d.id && S.attempts.some(a => a.quizId === d.id) ? '<div class="note">Questo quiz è già stato svolto: se cambi domande o risposte corrette, i punteggi già salvati non vengono ricalcolati.</div>' : ''}
  <div class="card stack">
    <label class="f">Titolo<input type="text" id="f-title" data-f="title" value="${esc(d.title)}" placeholder="Es. Procedure di accoglienza clienti"></label>
    <label class="f">Istruzioni per i dipendenti <span class="hint">facoltativo</span><textarea id="f-desc" data-f="desc" rows="2" placeholder="Es. Rispondi da solo, senza consultare materiali.">${esc(d.desc)}</textarea></label>
    <div class="grid3">
      <label class="f">Durata (minuti)<input type="number" id="f-dur" min="1" max="300" data-f="duration" value="${d.duration}"></label>
      <label class="f">Soglia di superamento (%)<input type="number" id="f-pass" min="0" max="100" data-f="passPct" value="${d.passPct}"></label>
      <div class="f" style="justify-content:flex-end;gap:8px">
        <label class="check"><input type="checkbox" id="f-sq" data-f="shuffleQ" ${d.shuffleQ ? 'checked' : ''}>Domande in ordine casuale</label>
        <label class="check"><input type="checkbox" id="f-so" data-f="shuffleO" ${d.shuffleO ? 'checked' : ''}>Risposte in ordine casuale</label>
      </div>
    </div>
    <label class="check"><input type="checkbox" id="f-act" data-f="active" ${d.active ? 'checked' : ''}>Attivo (visibile ai dipendenti)</label>
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
  if (!rows.length) return h + `<div class="empty"><h3>Nessun risultato ancora</h3><p>Quando un dipendente consegna un quiz, qui trovi punteggio, tempo impiegato ed esito.</p></div></div>`;
  h += `<div class="tbl-wrap"><table><thead><tr><th>Dipendente</th><th>Quiz</th><th>Inizio</th><th>Durata</th><th>Punteggio</th><th>Esito</th><th>Uscite</th><th></th></tr></thead><tbody>`;
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
  return h + `</tbody></table></div><p class="small muted">"Uscite" conta quante volte il dipendente ha lasciato la pagina durante il quiz (cambio scheda o app).</p></div>`;
}
function exportCsv() {
  let rows = attemptRows(); if (S.resFilter !== 'all') rows = rows.filter(r => r.a.quizId === S.resFilter);
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['Dipendente', 'Email', 'Quiz', 'Inizio', 'Fine', 'Durata', 'Corrette', 'Totale', 'Percentuale', 'Esito', 'Uscite dalla pagina', 'Tempo scaduto'].map(q).join(';')];
  for (const r of rows) lines.push([r.name, r.a.email, r.quiz ? r.quiz.title : 'Quiz eliminato', fmtD(r.a.startedAt), fmtD(r.a.finishedAt), r.done ? fmtDur(r.a.finishedAt - r.a.startedAt) : '',
    r.done ? r.score : '', r.n, r.done ? r.pct + '%' : '', !r.done ? 'In corso' : r.pass ? 'Superato' : 'Non superato', r.a.leaves || 0, r.a.auto ? 'Sì' : 'No'].map(q).join(';'));
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'risultati-quiz.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ----- responsabile: accessi ----- */
function accessView() {
  const list = S.people.slice().sort((a, b) => a.email.localeCompare(b.email));
  let h = `<div class="stack"><div><h2>Accessi</h2><p class="muted small">Solo le persone in questo elenco possono entrare. Ognuna accede con la sua email e il codice personale generato qui.</p></div>
  <div class="card stack"><label class="f">Aggiungi email <span class="hint">anche più di una, separate da virgola o a capo</span>
    <textarea id="accin" rows="3" placeholder="mario.rossi@gsloft.it, giulia.bianchi@gsloft.it"></textarea></label>
    ${S.accErr ? `<div class="err">${esc(S.accErr)}</div>` : ''}
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="accadd" ${S.saving ? 'disabled' : ''}>Autorizza e genera codici</button></div></div>`;
  if (!list.length) return h + `<div class="empty"><h3>Nessuna email autorizzata</h3><p>Finché l'elenco è vuoto nessun dipendente può entrare.</p></div></div>`;
  h += `<div class="tbl-wrap"><table><thead><tr><th>Email autorizzate · ${list.length}</th><th>Codice</th><th></th></tr></thead><tbody>`;
  for (const p of list) {
    const msg = `Link: ${location.origin}\nEmail: ${p.email}\nCodice di accesso: ${p.code}`;
    h += `<tr><td>${esc(p.email)}</td><td class="num"><b>${esc(p.code)}</b> <button class="btn sm ghost" data-act="copy" data-t="${esc(msg)}">Copia</button>
      <button class="btn sm ghost" data-act="regen" data-e="${esc(p.email)}" title="Genera un nuovo codice: quello vecchio smette di funzionare">Nuovo codice</button></td>
      <td style="text-align:right">${S.askRm === p.email ? `<span class="small muted">Togliere l'accesso?</span> <button class="btn sm danger solid" data-act="accrmok" data-e="${esc(p.email)}">Rimuovi</button> <button class="btn sm" data-act="accrmno">Annulla</button>`
      : `<button class="btn sm ghost danger" data-act="accrm" data-e="${esc(p.email)}">Rimuovi</button>`}</td></tr>`;
  }
  return h + `</tbody></table></div><p class="small muted">"Copia" prepara il messaggio con link, email e codice da mandare al dipendente.</p></div>`;
}
async function addAccess() {
  const emails = document.getElementById('accin').value.split(/[\s,;]+/).filter(Boolean);
  S.saving = true; S.accErr = null; render();
  try { const r = await api('admin/people', { method: 'POST', body: { emails } }); S.people = r.people; toast(r.added ? (r.added === 1 ? 'Email autorizzata' : r.added + ' email autorizzate') : 'Email già autorizzate'); }
  catch (e) { if (e.message !== '401') S.accErr = e.message; }
  S.saving = false; render();
}

/* ----- dipendente ----- */
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
  const prevName = S.quizzes.find(x => x.name)?.name || '';
  return `<div class="stack"><div class="row"><button class="btn ghost sm" data-act="home">← Indietro</button>${S.preview ? '<span class="chip acc">Anteprima: nessun dato salvato</span>' : ''}</div>
  <div class="card stack"><h2>${esc(q.title)}</h2>${q.desc ? `<p>${esc(q.desc)}</p>` : ''}
    <ol class="rules">
      <li>Hai <b>${q.duration} minuti</b> per rispondere a <b>${n} domande</b>.</li>
      <li>Le domande compaiono una alla volta.</li>
      <li>Quando confermi una risposta <b>non puoi più cambiarla</b> né tornare alle domande precedenti.</li>
      <li>Allo scadere del tempo il quiz viene consegnato automaticamente, con le risposte date fino a quel momento.</li>
      <li>Resta su questa pagina: le uscite dalla pagina vengono registrate.</li>
    </ol>
    <label class="f">Nome e cognome<input type="text" id="nm" value="${esc(S.preview ? 'Anteprima' : prevName)}" placeholder="Es. Maria Rossi" autocomplete="name"></label>
    <div id="nmerr" class="err" hidden>Scrivi nome e cognome per iniziare.</div>
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="start" ${S.saving ? 'disabled' : ''}>${S.saving ? 'Avvio…' : 'Inizia il quiz'}</button></div>
  </div></div>`;
}
function runView() {
  const r = S.run, q = r.question, last = r.pos === r.total - 1;
  return `<div class="runbar"><div style="min-width:0"><b>${esc(r.title)}</b><div class="small muted mono">( ${pad2(r.pos + 1)} / ${pad2(r.total)} )${S.preview ? ' · anteprima' : ''}</div></div>
    <span class="spacer"></span><div class="timer" id="timer" role="timer" aria-label="Tempo rimanente">${fmtT(r.deadlineLocal - Date.now())}</div>
    <div class="progress"><i style="width:${r.pos / r.total * 100}%"></i></div></div>
  <div class="stack" style="margin-top:24px"><p class="question">${esc(q.text)}</p>
    <div class="choices" role="radiogroup">${q.options.map((o, k) => `<button class="choice" role="radio" data-act="pick" data-o="${o.i}" aria-checked="${r.pick === o.i}"><span class="l">${L(k)}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
    <div class="row"><span class="small muted">La risposta confermata non si può modificare.</span><span class="spacer"></span>
    <button class="btn primary" data-act="confirm" ${r.pick == null || S.saving ? 'disabled' : ''}>${S.saving ? 'Invio…' : last ? 'Conferma e consegna' : 'Conferma e vai avanti →'}</button></div></div>`;
}
function doneView() {
  const r = S.lastResult || {};
  let h = `<div class="card stack" style="text-align:center;align-items:center;padding:36px 20px;margin-top:8px"><span class="chip ok">Quiz consegnato</span>
    <h2>${esc(r.title || '')}</h2>${r.auto ? '<p class="muted">Il tempo è scaduto: il quiz è stato consegnato con le risposte date fino a quel momento.</p>' : ''}`;
  if (S.preview && r.n) h += `<div class="big">${r.score}/${r.n}</div><p class="muted">Anteprima: ${r.pct}% · ${r.pass ? 'superato' : 'non superato'} (soglia ${r.passPct}%). Nessun dato è stato salvato.</p>`;
  else h += `<p class="muted">Grazie. Il responsabile vedrà il risultato.</p>`;
  return h + `<button class="btn" data-act="home">Torna ai quiz</button></div>`;
}

/* ---------- svolgimento: server (dipendente) o locale (anteprima) ---------- */
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
  const name = (document.getElementById('nm')?.value || '').trim();
  if (!name) { document.getElementById('nmerr').hidden = false; return; }
  if (S.preview) { applyState(Preview.start(S.quizzes.find(x => x.id === S.sel))); return; }
  S.saving = true; render();
  try { const st = await api('start', { method: 'POST', body: { quizId: S.sel, name } }); S.saving = false; applyState(st); }
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
      case 'tab': S.tab = b.dataset.v; S.view = 'home'; render(); break;
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
      case 'resetok': S.askReset = null; await api('admin/attempt?key=' + encodeURIComponent(b.dataset.k), { method: 'DELETE' }); toast('Tentativo cancellato: il dipendente può rifare il quiz'); await refresh(); break;
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
  const t = e.target, f = t.dataset.f; if (!f) return;
  if (f === 'resFilter') { S.resFilter = t.value; S.openDetail = null; render(); return; }
  const d = S.draft; if (!d) return;
  const qi = +t.dataset.q, oi = +t.dataset.o;
  if (f === 'qtext') d.questions[qi].text = t.value;
  else if (f === 'opt') d.questions[qi].options[oi] = t.value;
  else if (f === 'correct') d.questions[qi].correct = oi;
  else if (t.type === 'checkbox') d[f] = t.checked;
  else d[f] = t.value;
});
app.addEventListener('change', e => { const t = e.target; if (t.dataset.f === 'correct' && S.draft) S.draft.questions[+t.dataset.q].correct = +t.dataset.o; });
window.addEventListener('beforeunload', e => { if (S.view === 'run' && !S.preview) { e.preventDefault(); e.returnValue = ''; } });

boot();
})();
