// Survey del Portale GS LOFT: definizione delle domande e controllo delle risposte lato server.
// Per aggiungere una nuova survey basta aggiungere un oggetto all'elenco SURVEYS.
//
// Tipi di domanda: single (una risposta), multi (più risposte), select (menu a tendina),
// text (riga di testo), textarea (testo lungo).
// other: etichetta di una scelta "Altro" che apre un campo di testo (salvato in <id>__altro).
// exclusive: scelte che, se selezionate, deselezionano tutte le altre (es. "No", "Non so").
// showIf: la domanda compare solo se un'altra risposta (nella stessa scheda) è tra quelle indicate.
// Una sezione con repeat si compila una volta per ogni strumento (schede ripetibili).

const SI = ["Sì, spesso", "Sì, ogni tanto", "Li ho provati, ma ora non li uso", "Non sono sicuro o sicura"];

const AI_SURVEY = {
  id: "ai-gsloft-2026",
  title: "AI @ GS LOFT",
  subtitle: "Come utilizzi l'intelligenza artificiale nel tuo lavoro?",
  estimate: "Tempo di compilazione: circa 5-8 minuti.",
  intro: [
    "Vogliamo capire quali strumenti AI utilizzi nel tuo lavoro, come li utilizzi e con quali informazioni lavori.",
    "Considera tutti gli strumenti, anche quelli che usi occasionalmente, che hai solo provato o a cui accedi con un account personale.",
    "Non parliamo solo di ChatGPT, Claude o Gemini, ma anche di strumenti che trascrivono riunioni, creano contenuti, analizzano dati o integrano funzionalità AI.",
  ],
  warning:
    "Non inserire nel questionario nomi o dati dei clienti, informazioni sulla loro salute, documenti riservati, password, credenziali o codici di accesso. È sufficiente indicare la tipologia di informazioni utilizzate.",
  sections: [
    {
      id: "a",
      title: "A. Informazioni generali",
      questions: [
        { id: "q2", n: 2, short: "Area", label: "Qual è il tuo ruolo e di che cosa ti occupi?", help: "Scegli la tua area", type: "select", required: true,
          options: ["Team Marketing / Tech", "Team Amministrativo & Back Office", "Team Front-Office", "Team Tecnico", "Team Tecnico Damnfit", "Direzione"] },
        { id: "q2r", sub: true, short: "Ruolo", label: "Descrivi brevemente il tuo ruolo", type: "text", placeholder: "Es. personal trainer, segreteria, social media…" },
        { id: "q3", n: 3, short: "Uso dell'IA", label: "Usi, hai usato o stai provando strumenti di IA per il lavoro?", type: "single", required: true,
          options: [...SI.slice(0, 3), "No", "Non sono sicuro o sicura"] },
      ],
    },
    {
      id: "tools",
      title: "B. Gli strumenti che usi",
      showIf: { q: "q3", in: SI },
      hiddenIf: { q: "q3", in: ["No"] },
      hiddenNote: "Hai risposto “No”: passa direttamente alla sezione C.",
      note: "Compila una scheda per ogni strumento di IA che usi o hai usato per lavoro, anche se l'hai usato una sola volta. Alla fine di ogni scheda trovi il pulsante “+ Aggiungi un altro strumento”.",
      repeat: { item: "Strumento", add: "+ Aggiungi un altro strumento", ask: "Usi o hai usato anche altri strumenti di IA per lavoro? Aggiungi una scheda per ciascuno.", max: 20 },
      questions: [
        { id: "q4", n: 4, short: "Strumento", label: "Che programma o piattaforma AI usi?", type: "select", required: true, other: "Altro (scrivi il nome)", otherPlaceholder: "Nome dello strumento",
          options: ["ChatGPT", "Claude", "Gemini", "Copilot (Microsoft)", "Meta AI (WhatsApp, Instagram, Facebook)", "Perplexity", "Mistral Le Chat", "DeepSeek", "Grok",
            "Notion AI", "Canva (funzioni AI)", "CapCut (funzioni AI)", "Midjourney", "ElevenLabs", "Trascrizione riunioni (es. Otter, Fireflies, tl;dv)", "Funzioni AI di HubSpot"] },
        { id: "q5", n: 5, short: "Account", label: "Quale account o accesso usi?", type: "multi", other: "Altro", exclusive: ["Non so"],
          options: ["Account aziendale", "Account personale gratuito", "Account personale a pagamento", "Non so"] },
        { id: "q6", n: 6, short: "Account personale anche privato", label: "Se utilizzi un account personale, lo usi anche per finalità private oppure esclusivamente per attività di lavoro?", type: "single",
          options: ["Anche per finalità private", "Solo per attività di lavoro", "Non si applica", "Non so"] },
        { id: "q7", n: 7, short: "Come è iniziato", label: "Come hai iniziato a usarlo per lavoro?", type: "single",
          options: ["Me lo ha indicato o autorizzato l'azienda", "Me lo ha indicato o autorizzato il mio responsabile", "Ho iniziato a usarlo di mia iniziativa", "Non so"] },
        { id: "q8", n: 8, short: "Frequenza", label: "Quanto spesso lo usi?", type: "single",
          options: ["Ogni giorno", "Alcune volte a settimana", "Alcune volte al mese", "Raramente", "L'ho solo provato", "Non lo uso più"] },
        { id: "q9", n: 9, short: "Attività", label: "Per quali attività lo usi?", type: "multi", other: "Altro",
          options: ["Scrivere o correggere testi e mail", "Consultarlo per confronto, pensiero e brainstorming riguardo l'anamnesi di un cliente",
            "Confronto su analisi del sangue, patologie e/o interazioni farmaci-integratori", "Cercare informazioni", "Riassumere documenti",
            "Trascrivere o riassumere riunioni e chiamate", "Creare immagini, audio, video o materiali di marketing", "Analizzare dati o preparare report",
            "Scrivere codice o configurare programmi", "Scrivere o suggerire risposte ai clienti", "Preparare materiali o indicazioni per i clienti",
            "Aiutarmi nella selezione o gestione del personale", "Aiutarmi a valutare situazioni o prendere decisioni di lavoro", "Svolgere automaticamente alcune attività"] },
        { id: "q9e", sub: true, short: "Esempio d'uso", label: "Fai un esempio concreto di come lo usi, senza scrivere nomi o informazioni riservate.", type: "textarea", required: true,
          placeholder: "Es. gli chiedo di sistemare il testo delle mail ai fornitori" },
        { id: "q10", n: 10, short: "Informazioni inserite", label: "Che tipo di informazioni inserisci o carichi nello strumento? A quali informazioni può accedere?", type: "multi", required: true, other: "Altro",
          help: "Non allegare documenti e non riportare dati concreti nel questionario, né password, credenziali o altri segreti aziendali.", exclusive: ["Non so"],
          options: ["Solo domande generiche o informazioni pubbliche", "Documenti o informazioni interne di GS LOFT", "Nomi o recapiti di clienti e potenziali clienti",
            "Informazioni sulla salute, esami o percorsi dei clienti", "Informazioni su dipendenti, collaboratori o candidati", "Informazioni su vendite, costi, contratti o pagamenti",
            "Registrazioni audio o video", "Credenziali, password, API key, codici di accesso o altre informazioni di sicurezza",
            "Non inserisco informazioni: uso solo i risultati prodotti dallo strumento", "Non so"] },
        { id: "q11", n: 11, short: "Collegamenti", label: "Lo strumento è collegato ad altri programmi o archivi e può leggere le informazioni che contengono?", type: "multi",
          exclusive: ["Non è collegato ad altri sistemi", "Non so"],
          options: ["Mail", "Calendario", "Drive o documenti condivisi", "HubSpot o altri sistemi per gestire i contatti", "Gestionale o app GS LOFT",
            "Altri archivi con dati dei clienti", "Altri programmi o archivi", "Non è collegato ad altri sistemi", "Non so"] },
        { id: "q12", n: 12, short: "Chi riceve gli output", label: "Chi vede o riceve ciò che produce lo strumento?", type: "multi",
          options: ["Solo io", "Colleghi o collaboratori", "Responsabili", "Clienti o potenziali clienti", "Candidati", "Chiunque, se il contenuto viene pubblicato sul sito o sui social", "Altre persone"] },
        { id: "q13", n: 13, short: "Controllo umano", label: "Prima di usare o condividere ciò che produce l'IA, qualcuno lo controlla?", type: "single",
          options: ["Sempre", "Di solito", "Solo qualche volta", "No", "Non si applica al mio caso"] },
        { id: "q13b", short: "Chi controlla e cosa", label: "Chi lo controlla e che cosa verifica?", type: "text", showIf: { q: "q13", in: ["Sempre", "Di solito", "Solo qualche volta"] } },
        { id: "q14", n: 14, short: "Decisioni su persone", label: "Quello che produce l'IA ti aiuta a prendere decisioni che riguardano delle persone?", type: "multi", exclusive: ["No", "Non so"],
          options: ["No", "Sì, candidati o personale", "Sì, clienti, loro percorsi o servizi da proporre", "Sì, prezzi, pagamenti o condizioni commerciali", "Sì, in altri casi", "Non so"] },
        { id: "q14b", short: "Quali decisioni e chi decide", label: "Che tipo di decisione ti aiuta a prendere? Chi prende la decisione finale?", type: "textarea",
          showIf: { q: "q14", in: ["Sì, candidati o personale", "Sì, clienti, loro percorsi o servizi da proporre", "Sì, prezzi, pagamenti o condizioni commerciali", "Sì, in altri casi"] } },
        { id: "q15", n: 15, short: "Contatto con esterni", label: "Lo strumento parla o scrive direttamente a persone esterne a GS LOFT? Oppure crea contenuti che pubblichiamo all'esterno?", type: "multi",
          exclusive: ["No", "Non so"],
          options: ["No", "Sì, invia messaggi o risponde in chat", "Sì, interagisce tramite chiamate o voce", "Sì, crea testi che condividiamo o pubblichiamo",
            "Sì, crea immagini, audio o video che condividiamo o pubblichiamo", "Non so"] },
        { id: "q15b", short: "Dove avviene", label: "Dove avviene? Per esempio: chat con i clienti, mail, sito, social.", type: "text",
          showIf: { q: "q15", in: ["Sì, invia messaggi o risponde in chat", "Sì, interagisce tramite chiamate o voce", "Sì, crea testi che condividiamo o pubblichiamo", "Sì, crea immagini, audio o video che condividiamo o pubblichiamo"] } },
        { id: "q16", n: 16, short: "Cronologia", label: "Lo strumento conserva una cronologia delle conversazioni, dei file o dei contenuti che inserisci?", type: "single", options: ["Sì", "No", "Non so"] },
        { id: "q16b", short: "Impostazioni privacy modificate", label: "Se lo sai: hai mai modificato o disattivato le impostazioni relative alla cronologia, alla privacy o alla conservazione dei contenuti?", type: "text",
          showIf: { q: "q16", in: ["Sì", "No"] } },
      ],
    },
    {
      id: "c",
      title: "C. Per tutti",
      questions: [
        { id: "q17", n: 17, short: "Formazione utile", label: "Su quali aspetti ti sarebbero utili indicazioni o formazione?", type: "multi", other: "Altro", exclusive: ["Al momento non ne sento il bisogno"],
          options: ["Quali strumenti possiamo usare", "Quali informazioni possiamo inserire negli strumenti", "Come controllare se le risposte dell'IA sono corrette",
            "Come usare l'IA quando si lavora con informazioni dei clienti", "Come usarla nelle mie attività professionali", "Come creare e pubblicare contenuti con l'IA",
            "Come collegarla ad altri programmi o automatizzare attività", "Al momento non ne sento il bisogno"] },
        { id: "q18", n: 18, short: "Altro da raccontare", label: "C'è qualcos'altro che vorresti raccontarci su come usi o vorresti usare l'IA nel tuo lavoro?", help: "Facoltativa", type: "textarea" },
      ],
    },
  ],
  privacy: {
    title: "Informativa sul trattamento dei dati personali",
    paragraphs: [
      "I dati personali raccolti attraverso il presente questionario saranno trattati da LOFT Srl, in qualità di Titolare del trattamento, esclusivamente per finalità organizzative interne connesse alla ricognizione e mappatura degli strumenti e dei sistemi di intelligenza artificiale utilizzati in ambito lavorativo, alla definizione delle relative modalità di utilizzo e delle misure di governance, sicurezza e compliance applicabili, nonché alla programmazione di eventuali attività informative e formative.",
      "Il questionario non è finalizzato alla valutazione individuale della prestazione lavorativa. Le risposte saranno accessibili esclusivamente ai soggetti autorizzati e coinvolti nelle attività di analisi e organizzazione sopra descritte e saranno conservate per il tempo necessario al completamento della mappatura e ai successivi aggiornamenti della governance aziendale in materia di intelligenza artificiale.",
      "Il trattamento è effettuato nell'ambito dell'organizzazione e gestione delle attività aziendali e degli adempimenti normativi connessi all'utilizzo di sistemi di intelligenza artificiale. I dati non saranno diffusi.",
      "Avvertenza per la compilazione. Si invita a non inserire nelle risposte nomi o dati identificativi di clienti, informazioni relative alla loro salute, documenti, credenziali, password, API key, codici di accesso o altre informazioni riservate, essendo sufficiente indicare le categorie o tipologie di informazioni utilizzate.",
      "Gli interessati possono esercitare i diritti previsti dagli artt. 15 e ss. del Regolamento (UE) 2016/679 rivolgendosi a LOFT Srl ai consueti recapiti aziendali o al Responsabile della Protezione dei Dati (DPO). Per maggiori informazioni sul trattamento dei dati personali è possibile consultare l'informativa privacy aziendale.",
    ],
    ack: "Dichiaro di aver preso visione dell'informativa sul trattamento dei dati personali sopra riportata.",
    ackNote: "La presa visione non costituisce consenso al trattamento dei dati personali.",
  },
};

export const SURVEYS = [renumber(AI_SURVEY)];
export const getSurveyDef = (id) => SURVEYS.find((s) => s.id === id) || null;

/* ---------------- survey modificata dal responsabile ---------------- */
// Domande che il resto del portale usa per riepiloghi e logica: non si possono eliminare né cambiare di tipo.
export const LOCKED = {
  q3: "Decide se mostrare la sezione B: le sue risposte non si possono cambiare.",
  q4: "È il nome dello strumento in ogni scheda e nel riepilogo.",
};
const TYPES = ["single", "multi", "select", "text", "textarea"];
const CHOICE = ["single", "multi", "select"];

// Numera le domande principali in ordine (le sotto-domande non hanno numero).
export function renumber(def) {
  let n = 1;
  for (const sec of def.sections) for (const q of sec.questions) {
    if (q.sub || q.showIf) delete q.n; else q.n = n++;
  }
  return def;
}

// Controlla una survey modificata partendo dall'originale: la struttura (sezioni, domande bloccate) resta quella.
export function validateDef(input, base) {
  const str = (v, max, req) => (typeof v === "string" ? v.trim().slice(0, max) : "") || (req ? null : "");
  const err = (m) => ({ error: m });
  if (!input || typeof input !== "object") return err("Dati della survey mancanti.");
  const out = { ...base };
  out.title = str(input.title, 120, true); if (!out.title) return err("Il titolo è obbligatorio.");
  out.subtitle = str(input.subtitle, 300);
  out.estimate = str(input.estimate, 200);
  out.warning = str(input.warning, 1500);
  out.intro = (Array.isArray(input.intro) ? input.intro : []).map((p) => str(p, 1500)).filter(Boolean).slice(0, 10);
  const pr = input.privacy || {};
  out.privacy = { title: str(pr.title, 200) || base.privacy.title,
    paragraphs: (Array.isArray(pr.paragraphs) ? pr.paragraphs : []).map((p) => str(p, 4000)).filter(Boolean).slice(0, 15),
    ack: str(pr.ack, 500) || base.privacy.ack, ackNote: str(pr.ackNote, 500) };
  if (!Array.isArray(input.sections) || input.sections.length !== base.sections.length) return err("Le sezioni della survey non possono essere aggiunte o tolte.");
  const ids = new Set();
  out.sections = [];
  for (const [si, bs] of base.sections.entries()) {
    const s = input.sections[si] || {};
    const sec = { ...bs, title: str(s.title, 200) || bs.title };
    if (bs.note != null) sec.note = str(s.note, 1500);
    if (!Array.isArray(s.questions) || !s.questions.length) return err(`La sezione “${sec.title}” deve avere almeno una domanda.`);
    if (s.questions.length > 60) return err(`Troppe domande nella sezione “${sec.title}”.`);
    sec.questions = [];
    const seen = {}; // domande precedenti della stessa scheda, per le condizioni
    for (const [qi, x] of s.questions.entries()) {
      const where = `Sezione “${sec.title}”, domanda ${qi + 1}`;
      if (!x || typeof x.id !== "string" || !/^[a-z0-9_]{1,24}$/.test(x.id) || ids.has(x.id)) return err(`${where}: identificativo non valido.`);
      ids.add(x.id);
      const orig = bs.questions.find((q) => q.id === x.id) || base.sections.flatMap((b) => b.questions).find((q) => q.id === x.id);
      const q = { id: x.id };
      if (LOCKED[x.id]) { Object.assign(q, orig); if (bs.questions.indexOf(orig) < 0) return err(`${where}: questa domanda non può cambiare sezione.`); }
      q.label = str(x.label, 600, true); if (!q.label) return err(`${where}: scrivi il testo della domanda.`);
      q.short = str(x.short, 60) || q.label.slice(0, 50);
      q.help = str(x.help, 600); if (!q.help) delete q.help;
      q.placeholder = str(x.placeholder, 200); if (!q.placeholder) delete q.placeholder;
      q.required = LOCKED[x.id] ? true : !!x.required;
      if (x.sub) q.sub = true; else delete q.sub;
      if (!LOCKED[x.id]) {
        q.type = TYPES.includes(x.type) ? x.type : "single";
        if (CHOICE.includes(q.type)) {
          q.options = [...new Set((Array.isArray(x.options) ? x.options : []).map((o) => str(o, 300)).filter(Boolean))].slice(0, 40);
          if (q.options.length < (x.other ? 1 : 2)) return err(`${where}: servono almeno 2 risposte tra cui scegliere.`);
          q.other = str(x.other, 100); if (!q.other) delete q.other;
          if (q.other) q.otherPlaceholder = str(x.otherPlaceholder, 100) || "Specifica";
          if (q.type === "multi") { q.exclusive = (Array.isArray(x.exclusive) ? x.exclusive : []).filter((o) => q.options.includes(o)); if (!q.exclusive.length) delete q.exclusive; }
        }
      } else if (x.id === "q4") { // si possono cambiare le voci del menu, non il tipo
        q.options = [...new Set((Array.isArray(x.options) ? x.options : []).map((o) => str(o, 300)).filter(Boolean))].slice(0, 60);
        if (!q.options.length) return err(`${where}: serve almeno uno strumento nell'elenco.`);
        q.other = str(x.other, 100) || orig.other;
      }
      if (x.showIf && typeof x.showIf.q === "string") { // la condizione deve puntare a una domanda precedente della stessa scheda
        const parent = seen[x.showIf.q];
        const opts = parent ? (parent.options || []).concat(parent.other ? [parent.other] : []) : [];
        const inn = (Array.isArray(x.showIf.in) ? x.showIf.in : []).filter((o) => opts.includes(o));
        if (!parent || !inn.length) return err(`${where} (“${q.label.slice(0, 40)}…”): compare solo dopo certe risposte di un'altra domanda, ma quelle risposte non esistono più. Rimettile o elimina questa domanda.`);
        q.showIf = { q: x.showIf.q, in: inn };
      } else delete q.showIf;
      seen[q.id] = q;
      sec.questions.push(q);
    }
    out.sections.push(sec);
  }
  for (const id of Object.keys(LOCKED)) if (!ids.has(id)) return err("Una domanda necessaria al portale è stata eliminata.");
  return { def: renumber(out) };
}

/* ---------------- controllo delle risposte ---------------- */
const asList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
export const matches = (cond, scope) => {
  const vals = asList(scope && scope[cond.q]);
  return vals.some((x) => cond.in.includes(x));
};
const MAXLEN = { text: 300, textarea: 3000, other: 200 };

function cleanQuestion(q, src, out, names, errors, where) {
  const v = src[q.id];
  const free = q.optionsFrom === "names" && !names.length; // nessun elenco nomi: si scrive a mano
  const opts = q.optionsFrom === "names" ? names : q.options || [];
  const allowed = q.other && !opts.includes(q.other) ? [...opts, q.other] : opts;
  if (q.type === "text" || q.type === "textarea" || free) {
    const s = typeof v === "string" ? v.trim().slice(0, MAXLEN[q.type === "textarea" ? "textarea" : "text"]) : "";
    if (s) out[q.id] = s;
  } else if (q.type === "multi") {
    const arr = [...new Set(asList(v).filter((x) => typeof x === "string" && allowed.includes(x)))];
    if (arr.length) out[q.id] = arr;
  } else if (typeof v === "string" && allowed.includes(v)) out[q.id] = v;

  const picked = asList(out[q.id]);
  if (!free && q.other && picked.includes(q.other)) {
    const t = typeof src[q.id + "__altro"] === "string" ? src[q.id + "__altro"].trim().slice(0, MAXLEN.other) : "";
    if (t) out[q.id + "__altro"] = t;
    else errors.push(`${where}domanda ${q.n || q.short}: specifica “${q.other}”.`);
  }
  if (q.required && !picked.length) errors.push(`${where}${q.n ? "domanda " + q.n : "“" + q.short + "”"} obbligatoria.`);
}

function cleanScope(questions, src, names, errors, where) {
  const out = {};
  for (const q of questions) {
    if (q.showIf && !matches(q.showIf, out)) continue;
    cleanQuestion(q, src || {}, out, names, errors, where);
  }
  return out;
}

// Restituisce le risposte ripulite (solo domande visibili e valori ammessi) e l'elenco degli errori.
export function cleanAnswers(def, raw, names = []) {
  const errors = [];
  raw = raw && typeof raw === "object" ? raw : {};
  const main = {};
  const groups = {};
  for (const sec of def.sections) {
    if (sec.repeat) continue;
    Object.assign(main, cleanScope(sec.questions, raw.main, names, errors, ""));
  }
  for (const sec of def.sections) {
    if (!sec.repeat) continue;
    if (sec.showIf && !matches(sec.showIf, main)) { groups[sec.id] = []; continue; }
    const items = Array.isArray(raw.groups?.[sec.id]) ? raw.groups[sec.id].slice(0, sec.repeat.max || 20) : [];
    if (!items.length) errors.push(`Compila almeno una scheda “${sec.repeat.item}”.`);
    groups[sec.id] = items.map((it, i) => cleanScope(sec.questions, it, names, errors, `${sec.repeat.item} ${i + 1}, `));
  }
  if (raw.ack !== true) errors.push("Conferma la presa visione dell'informativa privacy.");
  return { answers: { main, groups, ack: true }, errors };
}

// Nome mostrato al responsabile, ricavato dall'email di accesso: mario.rossi@gsloft.it → "Mario Rossi".
export function nameFromEmail(email) {
  return String(email || "").split("@")[0].split(/[._\-+]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
