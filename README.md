# Quiz Dipendenti · GS LOFT

Piattaforma per creare quiz a tempo per i dipendenti (una domanda alla volta, senza ritorno indietro, con risultati per il responsabile) e per raccogliere survey interne.

- **Frontend**: HTML/CSS/JS statico (`public/`)
- **Backend**: una Netlify Function (`netlify/functions/api.mjs`) su `/api/*`
- **Database**: Netlify Blobs (incluso in Netlify, nessun servizio esterno)

## Sicurezza

- Login responsabile con password, login dipendenti con **email + codice personale**.
- Sessione in cookie `HttpOnly`, firmato, valido 12 ore.
- Il dipendente riceve **una domanda alla volta**: le domande successive e le risposte corrette non arrivano mai al browser.
- Timer e correzione sono calcolati **sul server**: allo scadere il quiz viene chiuso anche se il dipendente chiude la pagina.
- Non si può tornare indietro: il server accetta solo la risposta alla domanda corrente.
- Rimuovendo un'email dagli Accessi, la persona viene esclusa subito, anche se aveva già fatto login.

## Pubblicazione su Netlify

1. Carica questa cartella su un repository GitHub (privato).
2. Su Netlify: **Add new site → Import an existing project** → scegli il repository.
   Le impostazioni di build vengono lette da `netlify.toml` (non serve un comando di build).
3. In **Site configuration → Environment variables** aggiungi:
   - `ADMIN_PASSWORD`: la password dell'area responsabile (lunga, almeno 12 caratteri)
   - `SESSION_SECRET`: una stringa casuale lunga, per firmare le sessioni.
     Puoi generarla dal Terminale con `openssl rand -hex 32`
4. Fai **Deploy** (o "Trigger deploy" dopo aver impostato le variabili).
5. Apri il sito, scegli **Responsabile** e accedi con la password.

> Pubblicazione con trascinamento (drag & drop) della cartella: **non** funziona, perché le funzioni hanno bisogno della build di Netlify. Usa GitHub oppure la Netlify CLI (`npm i -g netlify-cli`, poi `netlify deploy --prod` da questa cartella).

## Uso

1. **Quiz → Nuovo quiz**: titolo, durata, soglia, domande (o incollale in blocco), poi attiva il quiz.
2. **Accessi**: incolla le email dei dipendenti → vengono generati i codici. "Copia" prepara il messaggio con link, email e codice.
3. Il dipendente apre il sito, sceglie **Dipendente**, entra con email e codice e svolge il quiz.
4. **Risultati**: punteggio, tempo, esito, uscite dalla pagina, dettaglio delle risposte, export CSV, "Nuovo tentativo".

## Survey

Nessuno scrive il proprio nome: quiz e survey vengono registrati con l'email usata per entrare, e il nome nei risultati è ricavato da lì (mario.rossi@gsloft.it → Mario Rossi).

Scheda **Survey** dell'area responsabile. Contiene la survey interna **AI @ GS LOFT** (mappatura degli strumenti di IA per l'AI Act).

1. **Modifica domande**: testi, risposte possibili, tipo di risposta, obbligatorietà, scelta “Altro”, ordine, nuove domande, introduzione e informativa. Le domande sull'uso dell'IA e sullo strumento non si possono eliminare perché servono al portale. “Ripristina originale” torna alla versione iniziale.
2. **Anteprima**: prova la survey come la vede un dipendente, senza salvare nulla.
3. **Attiva**: la survey compare a tutte le email autorizzate in **Accessi**, insieme ai quiz.
4. **Risposte**: riepilogo degli strumenti indicati (persone, account personali, dati di clienti e sanitari), dettaglio di ogni risposta, chi non ha ancora risposto, export CSV con una riga per strumento.

Come funziona per chi compila:
- la sezione B si ripete per ogni strumento con "+ Aggiungi un altro strumento"; chi risponde "No" alla domanda 3 passa direttamente alla sezione C;
- le domande di approfondimento compaiono solo quando servono (es. "Chi lo controlla?" se il controllo umano c'è);
- la bozza resta salvata nel browser finché non si invia; dopo l'invio le risposte si possono aggiornare finché la survey è attiva;
- le domande obbligatorie e la presa visione dell'informativa sono controllate anche dal server.

La versione iniziale delle domande è in `netlify/lib/surveys.mjs`; quella modificata dal portale è salvata in Netlify Blobs. Per una survey nuova basta aggiungere un oggetto all'elenco `SURVEYS`.

Formato per incollare le domande dei quiz:

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
package.json                  dipendenza @netlify/blobs
netlify/functions/api.mjs     API: login, quiz, svolgimento, risultati, accessi, survey
netlify/lib/surveys.mjs       domande della survey AI e controllo delle risposte
public/index.html             pagina
public/app.js                 interfaccia
public/style.css              stile GS LOFT
public/logo.png               logo (maschera, colorato via CSS)
```

Font: Hanken Grotesk e IBM Plex Mono da Google Fonts. Il Forma DJR aziendale non è incluso perché la licenza desktop non copre l'uso web.
