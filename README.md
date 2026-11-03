# Portale Quiz & Survey · GS LOFT

Quiz a tempo per i lavoratori (una domanda alla volta, senza tornare indietro) e survey interne. I risultati li vede solo il responsabile.

Sito statico in `public/`, una Netlify Function per le API (`/api/*`), dati salvati in Netlify Blobs. Nessun servizio esterno.

## Pubblicazione su Netlify

1. Carica la cartella su un repository GitHub privato.
2. Su Netlify: **Add new site → Import an existing project** e scegli il repository.
3. In **Site configuration → Environment variables** aggiungi:
   - `ADMIN_PASSWORD`: password dell'area responsabile (almeno 12 caratteri)
   - `SESSION_SECRET`: stringa casuale lunga (dal Terminale: `openssl rand -hex 32`)
4. Fai **Deploy**, apri il sito, scegli **Responsabile** e accedi.

Il trascinamento della cartella su Netlify non funziona: serve GitHub oppure la Netlify CLI (`netlify deploy --prod`).

## Come si usa

1. **Accessi**: incolla le email dei lavoratori. Per ognuno viene creato un codice; "Copia" prepara il messaggio con link, email e codice.
2. **Quiz → Nuovo quiz**: titolo, durata, soglia e domande (anche incollate in blocco), poi **Attiva**.
3. **Survey**: modifica le domande se serve, prova con **Anteprima**, poi **Attiva**.
4. Il lavoratore entra con email e codice e trova quiz e survey attivi.
5. **Risultati** e **Risposte**: dettaglio, export CSV e, per i quiz, "Nuovo tentativo".

Nessuno scrive il proprio nome: tutto viene registrato con l'email di accesso (mario.rossi@gsloft.it → Mario Rossi).

Formato per incollare le domande dei quiz:

```
Entro quanti giorni si può sospendere un abbonamento?
A. 7 giorni
B. 14 giorni
C. 30 giorni
RISPOSTA: B
```

## Sicurezza

- Responsabile con password, lavoratori con email e codice personale. Sessione valida 12 ore.
- Il lavoratore riceve una domanda alla volta: le successive e le risposte corrette non arrivano mai al suo browser.
- Timer e correzione sono calcolati sul server: allo scadere il quiz si chiude anche se la pagina è chiusa.
- Togliendo un'email dagli Accessi, la persona perde subito l'accesso.

## Survey AI @ GS LOFT

Mappatura degli strumenti di IA usati in azienda (AI Act).

- La sezione sugli strumenti si ripete per ognuno ("+ Aggiungi un altro strumento"); chi non usa l'IA la salta.
- Le domande di approfondimento compaiono solo quando servono.
- La bozza resta salvata nel browser fino all'invio; dopo l'invio le risposte si possono aggiornare finché la survey è attiva.
- In **Risposte**: riepilogo degli strumenti, chi non ha ancora risposto, export CSV (una riga per strumento).
- Le domande sull'uso dell'IA e sullo strumento non si possono eliminare; "Ripristina originale" torna alla versione iniziale.

La versione iniziale delle domande è in `netlify/lib/surveys.mjs`. Per una nuova survey basta aggiungere un oggetto all'elenco `SURVEYS`.

## Sviluppo in locale

```
npm install
npm i -g netlify-cli
netlify link
netlify dev        # http://localhost:8888
```

Crea un file `.env` con `ADMIN_PASSWORD` e `SESSION_SECRET` (è già escluso da GitHub).

## File principali

```
netlify/functions/api.mjs   API: accesso, quiz, survey, risultati
netlify/lib/surveys.mjs     domande della survey e controllo delle risposte
public/app.js               interfaccia
public/style.css            grafica GS LOFT
```

Font: Hanken Grotesk e IBM Plex Mono (Google Fonts). Il Forma DJR aziendale non è incluso: la licenza desktop non copre l'uso web.
