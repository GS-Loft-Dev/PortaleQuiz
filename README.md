# Quiz Lavoratori · GS LOFT

Piattaforma per creare quiz a tempo per i lavoratori: una domanda alla volta, senza ritorno indietro, con risultati per il responsabile.

- **Frontend**: HTML/CSS/JS statico (`public/`)
- **Backend**: una Netlify Function (`netlify/functions/api.mjs`) su `/api/*`
- **Database**: Netlify Blobs (incluso in Netlify, nessun servizio esterno)

## Sicurezza

- Login responsabile con password, login lavoratori con **email + codice personale**.
- Sessione in cookie `HttpOnly`, firmato, valido 12 ore.
- Il lavoratore riceve **una domanda alla volta**: le domande successive e le risposte corrette non arrivano mai al browser.
- Timer e correzione sono calcolati **sul server**: allo scadere il quiz viene chiuso anche se il lavoratore chiude la pagina.
- Non si può tornare indietro: il server accetta solo la risposta alla domanda corrente.
- Rimuovendo un'email dagli Accessi, la persona viene esclusa subito, anche se aveva già fatto login.
- Il lavoratore viene identificato dalla sua email (niente nome da compilare). A fine quiz vede solo **"Test terminato"**: nessun punteggio e nessuna risposta corretta/errata (il server non glieli invia).

## Pubblicazione su Netlify

1. Carica questa cartella su un repository GitHub (privato).
2. Su Netlify: **Add new site → Import an existing project** → scegli il repository.
   Le impostazioni di build vengono lette da `netlify.toml` (non serve un comando di build).
3. In **Site configuration → Environment variables** aggiungi:
   - `ADMIN_PASSWORD`: la password dell'area responsabile (lunga, almeno 12 caratteri)
   - `SESSION_SECRET`: una stringa casuale lunga, per firmare le sessioni.
     Puoi generarla dal Terminale con `openssl rand -hex 32`
   - Per le email di avviso (facoltativo ma consigliato), vedi la sezione **Email di avviso** qui sotto.
4. Fai **Deploy** (o "Trigger deploy" dopo aver impostato le variabili).
5. Apri il sito, scegli **Responsabile** e accedi con la password.

> Pubblicazione con trascinamento (drag & drop) della cartella: **non** funziona, perché le funzioni hanno bisogno della build di Netlify. Usa GitHub oppure la Netlify CLI (`npm i -g netlify-cli`, poi `netlify deploy --prod` da questa cartella).

## Email di avviso

Le email partono in due momenti:

- **Accesso creato**: quando aggiungi un'email negli Accessi, il lavoratore riceve subito link, email e codice personale. Riceve una nuova email anche quando generi un **Nuovo codice**, e puoi reinviarla con **Reinvia email**.
- **Nuovo quiz**: quando un quiz viene **attivato per la prima volta**, tutti i lavoratori negli Accessi ricevono un'email con titolo del quiz, link al sito, la loro email e il loro codice. Dalla lista quiz c'è anche il pulsante **Invia di nuovo avviso**.

Serve un servizio di invio. Scegline uno e imposta le variabili su Netlify:

**Opzione A: Resend** (consigliata, piano gratuito fino a 3.000 email/mese)
1. Crea un account su resend.com e verifica il dominio aziendale (es. gsloft.it) aggiungendo i record DNS indicati.
2. Crea una API key.
3. Variabili: `RESEND_API_KEY` = la chiave, `MAIL_FROM` = `Quiz GS LOFT <quiz@gsloft.it>`

**Opzione B: SMTP della casella aziendale** (Google Workspace, Aruba, Microsoft 365…)
- `SMTP_HOST` (es. `smtp.gmail.com`, `smtps.aruba.it`, `smtp.office365.com`)
- `SMTP_PORT` (465 oppure 587)
- `SMTP_USER`, `SMTP_PASS` (per Gmail/Workspace serve una "password per le app")
- `MAIL_FROM` = `Quiz GS LOFT <indirizzo della casella>`

Il link nelle email è l'indirizzo del sito Netlify. Se usi un dominio tuo, imposta anche `SITE_URL` (es. `https://quiz.gsloft.it`).
Se l'invio non è configurato il sito funziona lo stesso: l'area responsabile lo segnala e i codici vanno mandati a mano (pulsante "Copia" negli Accessi).

## Importare un quiz da Excel o CSV

Nella lista quiz clicca **Importa da Excel/CSV** (oppure, dentro un quiz, **Aggiungi domande da Excel/CSV**).
Usa il modello: pulsante **Scarica modello di import** nella lista quiz (o "Scarica modello Excel / Modello CSV" nell'editor). Il download è riservato all'area responsabile: il file non è pubblico sul sito.

| Sezione | Domanda | Risposta A | Risposta B | Risposta C | Risposta D | Corretta |
|---|---|---|---|---|---|---|
| Procedure | Entro quanti giorni…? | 7 giorni | 14 giorni | 30 giorni | | B |

- Da 2 a 6 risposte per domanda (colonne vuote ignorate).
- "Corretta" può essere la lettera (B), il numero (2) o il testo esatto della risposta.
- Viene letto il primo foglio del file. Il titolo del quiz viene preso dal nome del file e si può cambiare.
- Dopo l'import si apre l'editor: controlli, imposti durata e soglia, salvi.

## Sezioni e punteggio per sezione

Ogni domanda può appartenere a una sezione (es. Nutrizione, Sonno…):

- **Excel/CSV**: aggiungi una colonna `Sezione`.
- **Editor**: campo "Sezione" accanto a ogni domanda (suggerisce le sezioni già usate).
- **Testo incollato**: una riga `SEZIONE: Nome` assegna la sezione alle domande che seguono.

Con le sezioni:
- le domande vengono proposte sezione per sezione; l'ordine casuale mescola solo dentro ogni sezione;
- la **Dashboard** mostra la media per area di tutti i consegnati (verde da 80%, arancio 60-79%, rosso sotto 60%); in **Risultati individuali** il **Dettaglio** di ognuno riporta il punteggio per area e le risposte raggruppate;
- l'**export CSV** aggiunge per ogni sezione le colonne corrette, totale e %.

## Analisi dei risultati (solo responsabile)

- **Dashboard** (dati aggregati e anonimi, adatta alla restituzione al team): test consegnati, punteggio medio e mediana, tempo medio, distribuzione per fascia (≥80%, 60-79%, <60%), media per area e le domande più sbagliate con l'errore più frequente. "Esporta dati aggregati" scarica tutto in CSV, senza nomi.
- **Risultati individuali** (riservati): punteggio, tempo, uscite dalla pagina e dettaglio delle risposte di ogni professionista, export CSV con le colonne per area.

## Durata e test preventivo

- La durata è un tempo totale. Nell'editor i pulsanti "30 / 45 / 60 s/domanda" la calcolano dal numero di domande (es. 115 × 45 s = 87 minuti).
- **Visibile a**: "Solo questi indirizzi" rende il quiz visibile (e invia l'avviso) solo alle email indicate, per esempio il responsabile che lo svolge in anticipo. Passando a "Tutti gli autorizzati", gli altri lavoratori lo vedono e ricevono l'avviso; chi l'ha già ricevuto non lo riceve di nuovo.

## Uso

1. **Quiz → Nuovo quiz**: titolo, durata, soglia, domande (o incollale in blocco), poi attiva il quiz.
2. **Accessi**: incolla le email dei lavoratori → vengono generati i codici e ognuno riceve la sua email di accesso. "Copia" prepara lo stesso messaggio da mandare a mano.
3. Attiva il quiz: parte l'email di avviso. Il lavoratore apre il sito, sceglie **Lavoratore**, entra con email e codice e svolge il quiz.
4. **Risultati**: punteggio, tempo, esito, uscite dalla pagina, dettaglio delle risposte, export CSV, "Nuovo tentativo".

Formato per incollare le domande:

```
Entro quanti giorni si può sospendere un abbonamento?
A. 7 giorni
B. 14 giorni
C. 30 giorni
RISPOSTA: B
```

## Sviluppo in locale

```
npm install
npm i -g netlify-cli
netlify link        # collega la cartella al sito Netlify
netlify dev         # avvia su http://localhost:8888
```

Per l'uso in locale crea un file `.env` con `ADMIN_PASSWORD=...` e `SESSION_SECRET=...` (non va caricato su GitHub, è già in `.gitignore`).

## Struttura

```
netlify.toml                  configurazione Netlify
package.json                  dipendenze @netlify/blobs, nodemailer
netlify/functions/api.mjs     API: login, quiz, svolgimento, risultati, accessi
public/index.html             pagina
public/app.js                 interfaccia
public/style.css              stile GS LOFT
public/logo.png               logo (maschera, colorato via CSS)
netlify/functions/templates.mjs modelli Excel/CSV per l'import (serviti solo ai responsabili)
public/vendor/xlsx.full.min.js  SheetJS 0.18.5 per leggere i file Excel (caricato solo all'import)
```

Font: Hanken Grotesk e IBM Plex Mono da Google Fonts. Il Forma DJR aziendale non è incluso perché la licenza desktop non copre l'uso web.
