# Gestionale Rapportini

Gestione interventi / rapportini con auth, clienti, offerte, commesse, ticket, materiali, costi d'intervento, veicoli, geo (PostGIS), bozze da GPS e stampa PDF. Web React; app Flutter per il tracking posizione (Android).

## Policy IA (questo progetto)

L'assistente IA è usato come **tutor / learning**, non come ghostwriter del gestionale.

| Consentito | Non consentito (di default) |
|------------|-----------------------------|
| Spiegare concetti, review del codice scritto dall'autore | Generare file/moduli/API interi al posto suo |
| Guidare il prossimo passo, snippit minimi se bloccato | Scaffold completo non richiesto |
| Operazioni ripetitive / meccaniche (rename massivi, aggiornare README, docker-compose, fix banali su richiesta) | "Scrivi tu tutto il backend/frontend" |
| Valutare scelte di dominio e segnalare rischi | Inventare requisiti e implementarli in silenzio |

L'autore scrive il codice; l'IA spiega, sfida le scelte deboli e sblocca. Eccezione: task ripetitivi o pezzi esplicitamente richiesti ("sistema questo", "aggiorna il README").

Regole Cursor: `.cursor/rules/senior-mentor.mdc`.

## Dove siamo (stato attuale)

1. **API + DB** — chiusa (schema `init_db` con upgrade idempotenti, auth JWT, CRUD).
2. **Web React** — chiusa (area tecnico e admin: anagrafiche, mappa, calendario, offerte, costi, bozze).
3. **Stampa PDF** — fatta (rapportino congiunto client-side).
4. **Flutter + GPS** — scrittura posizioni (app Android), lettura in admin utenti, job bozze automatiche. Residuali: stats/grafici globali, background iOS, km veicolo automatici dagli interventi.

| Fatto | Non ancora |
|-------|------------|
| Docker PostGIS, `init_db` (ADD COLUMN / CREATE TABLE IF NOT EXISTS), JWT, bootstrap admin | Stats / grafici di prodotto globali |
| Interventi: ore lavorate/viaggio, km (solo con veicolo), descrizione, note interne/esterne, trasferta, bulk multi-giorno | Km del veicolo aggiornati automaticamente dagli interventi |
| Veicoli: targa, km, `costo_km`; veicolo predefinito utente; prefill in nuovo intervento | Background tracking su iOS |
| Clienti con indirizzo opzionale; offerte e promozione a commessa | |
| Commesse: budget, geo, mappa Leaflet, calendario timeline | |
| Ticket (default `-` generale per nuova commessa); costo ricalcolato da trigger | |
| Materiali catalogo + utilizzati; costi d'intervento sulla commessa | |
| Bozze interventi da GPS (job ~20:00 Europe/Rome, conferma/scarta, notifica tecnico) | |
| API posizioni: scrittura autenticata; admin: storico, delete, commesse vicine | |
| Frontend Landing/Login, `/app` e `/admin`, rapportino PDF | |
| Flutter: login, invio GPS, servizio foreground Android | |
| In produzione FastAPI può servire `frontend/dist`; reverse proxy in `backend/nginx/` | |

## Cosa fa (obiettivo prodotto)

- Auth JWT con ruoli `tecnico` / `admin`
- Anagrafica: clienti, offerte (promozione a commessa), commesse, ticket
- Interventi su cliente (con o senza ticket); inserimento bulk per più giorni
- Veicoli (targa, km, costo al km); veicolo opzionale sull'intervento
- Materiali di magazzino e materiali utilizzati per commessa
- Costi d'intervento (spese manuali legate alla commessa)
- Tracking GPS (`users_positions`) da app mobile; bozze intervento da posizioni
- Filtri per data, cliente, utente (admin)
- Geo PostGIS: mappa commesse, ricerca indirizzo su picker
- Calendario commesse / ticket
- Stampa PDF del rapportino (note esterne in fondo)

## Stack

| Layer | Tecnologia |
|-------|------------|
| API | FastAPI + Uvicorn; SQL diretto (psycopg, niente ORM) |
| DB | PostgreSQL 17 + PostGIS (`postgis/postgis:17-3.5-alpine`) |
| Web | React + Vite; JS/CSS plain; fetch; react-router; JWT in `localStorage`; Leaflet |
| Mobile | Flutter / Dart (non React Native); tracking Android in foreground service |
| PDF | Client: HTML/CSS A4 + `window.print()` / «Salva come PDF»; nessuna lib PDF |
| TLS | Reverse proxy (`backend/nginx/`) — non nel codice business |

## Dominio

```
User
  ├── veicolo_predefinito  (FK → veicoli, opzionale; ON DELETE SET NULL)
  ├── users_positions      (storico GPS)
  └── bozze_interventi     (proposte da GPS; unica per user+data)

Veicolo  (targa UNIQUE, km opzionale, costo_km)
  └── usato in Intervento.veicolo_id (opzionale; delete bloccato se in uso)

Cliente
  ├── Offerta  (promuovibile a Commessa)
  ├── Commessa  (posizione geo, budget)
  │     ├── Ticket                 (pezzi di lavoro; default nome "-")
  │     ├── materiali_utilizzati
  │     └── costi_intervento
  └── Intervento (User + Cliente; ticket_id e veicolo_id opzionali)
```

Regole economiche (prezzi **attuali**, retroattivi al cambio tariffa/`costo_km`):

- `ticket.costo_totale` = Σ `(ore_totali × users.costo_orario + km × COALESCE(veicoli.costo_km, 0))`
- Spese commessa = Σ ticket + materiali_utilizzati + costi_intervento
- Residuo = budget − spese
- Interventi senza ticket non pesano su nessuna commessa
- Se `km > 0` serve un `veicolo_id`

### User / Auth

| Campo | Note |
|-------|------|
| `username` | UNIQUE |
| `password_hash` | bcrypt |
| `role` | `tecnico` \| `admin` |
| `costo_orario` | `NUMERIC(5, 2)` |
| `veicolo_predefinito` | FK → veicoli, opzionale |

Auth: JWT Bearer (`sub`, `role`, `exp`). `GET /users/me` per il profilo autenticato.

| Ruolo | Capacità |
|-------|----------|
| `tecnico` | interventi propri, bozze proprie, lettura anagrafiche/veicoli, scrittura posizioni |
| `admin` | tutto: utenti, anagrafiche, bozze di tutti, generazione bozze, posizioni |

### Veicolo

| Campo | Note |
|-------|------|
| `targa` | TEXT UNIQUE NOT NULL (maiuscolo, senza spazi) |
| `km` | INTEGER opzionale (≥ 0); update manuale |
| `costo_km` | `NUMERIC(10, 2)` NOT NULL DEFAULT 0; entra nel costo ticket |

### users_positions

| Campo | Note |
|-------|------|
| `user_id` | FK → users |
| `posizione` | `GEOMETRY(POINT, 4326)` |
| `data_aggiornamento` | TIMESTAMP |

### Cliente

| Campo | Note |
|-------|------|
| `ragione_sociale` / `partita_iva` | UNIQUE NOT NULL |
| `citta` / `via` / `cap` | opzionali; sul PDF |

### Offerta

| Campo | Note |
|-------|------|
| `cliente_id` | FK → clienti |
| `nome` | UNIQUE |
| `prezzo_iniziale` / `sconto` / `prezzo_finale` | |
| `data_invio` / `data_risposta` | |
| `esito` | `accettata` \| `rifiutata` \| `in_attesa` |
| `note` | opzionale |

`POST /offerte/{id}/commessa` crea la commessa (e il ticket `-`) da un'offerta accettata.

### Commessa

| Campo | Note |
|-------|------|
| `cliente_id` | FK → clienti |
| `nome` / `descrizione` | nome UNIQUE |
| `data_inizio` / `data_fine` | DATE opzionali |
| `stato` | `in_corso` \| `completata` \| `annullata` |
| `budget` | `NUMERIC(10, 2)` |
| `posizione` | `GEOMETRY(POINT, 4326)` NOT NULL |

Alla creazione (e in promozione da offerta) viene creato il ticket generale `-`.

### Ticket

| Campo | Note |
|-------|------|
| `commessa_id` | FK obbligatorio |
| `nome` / `descrizione` | |
| `data_inizio` / `data_fine` | opzionali (calendario) |
| `costo_totale` | calcolato da trigger (ore e km); non scritto dal frontend |
| `stato` | `in_corso` \| `completato` \| `annullato` |

### Intervento

| Campo | Note |
|-------|------|
| `user_id` / `cliente_id` | obbligatori |
| `ticket_id` | opzionale; obbligatorio in UI se c'è una commessa |
| `veicolo_id` | opzionale; obbligatorio se km > 0 |
| `ore_lavorate` / `ore_viaggio` | multipli di 0,5 |
| `km` | INTEGER ≥ 0 |
| `ore_totali` | lavorate + viaggio (backend) |
| `data` / `descrizione` | |
| `note_interne` | solo in app |
| `note_esterne` | in fondo al PDF |
| `trasferta` | BOOLEAN DEFAULT FALSE |

`POST /interventi/bulk`: più giornate in una transazione (cliente/ticket/veicolo condivisi).

### Materiali e materiali_utilizzati

Catalogo (`nome`, `costo_unitario`, `unita`, `fornitore`) e consumi per commessa (`materiale_id` opzionale, `quantita`, `costo_totale` salvato all'inserimento).

### costi_intervento

Spese manuali su commessa: `nome`, `data`, `costo` obbligatori; nomi duplicati ammessi; `ON DELETE CASCADE` con la commessa.

### Bozze interventi (GPS)

Tabelle `bozze_interventi` e `bozze_generazioni`. Job nel lifespan FastAPI verso le 20:00 Europe/Rome (anche `POST /bozze/genera` admin).

Logica: posizioni 00:00–20:00, raggio ~2 km sulle commesse `in_corso`, almeno 60 minuti e 2 campioni; una bozza aperta per utente/giorno. Il tecnico conferma (crea intervento) o scarta; notifica se c'è una bozza oggi.

## Geo / PostGIS

Immagine: `postgis/postgis:17-3.5-alpine`. Init: `CREATE EXTENSION IF NOT EXISTS postgis;`.

Cambio immagine / reset dati: `docker compose down -v`.

Non toccare `spatial_ref_sys`.

## Ordine di lavoro

1. **API + DB** — chiusa
2. **Web React** — chiusa (con offerte / costi / bozze UI)
3. **Stampa PDF** — fatta
4. **Flutter + GPS** — scrittura e bozze fatte; raffinare mobile e viste GPS

## Struttura repo

```
/
├── backend/
│   ├── main.py              # route + job bozze + SPA static
│   ├── database.py          # init_db, SQL, trigger costi
│   ├── BaseModels.py
│   ├── auth.py / hash.py
│   ├── docker-compose.yml
│   ├── nginx/               # reverse proxy TLS (deploy)
│   └── requirements.txt
├── frontend/                # React + Vite
│   ├── public/
│   └── src/pages/           # tecnico, rapportino, admin/*
├── mobile/                  # Flutter tracking GPS
│   └── lib/                 # main, api, tracking
└── README.md
```

## Setup

Da `backend/`:

```bash
docker compose up -d
```

| Variabile | Default |
|-----------|---------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | `rapportini` |
| `POSTGRES_PORT` | `5432` |

`.env`: `DATABASE_URL`, `JWT_SECRET_KEY`.

```bash
uvicorn main:app --reload
```

Frontend (dev):

```bash
cd frontend
npm install
npm run dev
```

`VITE_API_URL` punta all'API (es. `http://localhost:8000`). CORS attuale: `allow_origins=["*"]`.

Mobile: `mobile/lib/api.dart` contiene il `baseUrl` (in produzione punta all'host deploy). Su Android il tracking usa un foreground service.

## Note

- Un'unica API per web e Flutter.
- Semplicità: SQL esplicito, dipendenze minime; `init_db` aggiorna DB esistenti senza wipe volumi.
- Admin di default in locale: `admin` / `admin` (solo seed se non esiste già un admin; cambiare fuori dal play locale).
- In prod l'API può montare `frontend/dist` e servirla sullo stesso host.
- Stampa rapportino: in Chrome togliere «Intestazioni e piè di pagina» nel dialogo di stampa, altrimenti URL e data finiscono nei margini del PDF.
