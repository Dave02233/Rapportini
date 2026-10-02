# Gestionale Rapportini

Gestione interventi / rapportini con auth, clienti, commesse, ticket, materiali, geo (PostGIS) e stampa PDF. Web React; in seguito Flutter + GPS.

## Policy IA (questo progetto)

L’assistente IA è usato come **tutor / learning**, non come ghostwriter del gestionale.

| Consentito | Non consentito (di default) |
|------------|-----------------------------|
| Spiegare concetti, review del codice scritto dall’autore | Generare file/moduli/API interi al posto suo |
| Guidare il prossimo passo, snippit minimi se bloccato | Scaffold completo non richiesto |
| Operazioni ripetitive / meccaniche (rename massivi, aggiornare README, docker-compose, fix banali su richiesta) | “Scrivi tu tutto il backend/frontend” |
| Valutare scelte di dominio e segnalare rischi | Inventare requisiti e implementarli in silenzio |

L’autore scrive il codice; l’IA spiega, sfida le scelte deboli e sblocca. Eccezione: task ripetitivi o pezzi esplicitamente richiesti (“sistema questo”, “aggiorna il README”).

Regole Cursor: `.cursor/rules/senior-mentor.mdc`.

## Dove siamo (stato attuale)

Fase 1 **API + DB** — in corso.

| Fatto | Non ancora |
|-------|------------|
| Docker PostGIS (`postgis/postgis:17-3.5-alpine`) | Endpoint HTTP completi (users/clienti update-delete; tutto il resto) |
| Schema `init_db` + layer `database.py` (CRUD users, clienti, commesse, ticket, interventi, materiali, materiali_utilizzati) | Bootstrap primo admin (uovo/gallina su `POST /users`) |
| Auth: bcrypt, login JWT, `HTTPBearer`, `POST /users` (admin) | Validazione `stato` / ruoli in API; filtri data |
| `GET /health`, `POST /login`, `POST/GET /clienti`, `GET /clienti/{id}` | Web React, PDF, Flutter |
| psycopg `dict_row`, geo lat/lon ↔ PostGIS | Password change su update user; bozza/PDF intervento |

**Prossimo passo:** esporre in `main.py` (+ modelli in `BaseModels.py`) gli endpoint che già esistono in `database.py`, sezione per sezione: **users** (GET/PUT/DELETE) → chiudere **clienti** (PUT/DELETE) → **commesse** → ticket → interventi → materiali.

## Cosa fa (obiettivo prodotto)

- Auth utente / password con ruoli (JWT)
- Anagrafica: **clienti → commesse → ticket**; **interventi** su cliente (con o senza ticket)
- Materiali di magazzino e materiali utilizzati per commessa
- Tracking posizioni utente (per GPS in fase mobile)
- Filtri per data e cliente
- Geo in PostgreSQL (PostGIS)
- Stampa PDF (fase successiva)

## Stack

| Layer | Tecnologia |
|-------|------------|
| API | FastAPI + Uvicorn |
| DB | PostgreSQL 17 + PostGIS (`postgis/postgis:17-3.5-alpine`); SQL diretto (psycopg, niente ORM) |
| Web | React (SPA leggera) |
| Mobile (fase 4) | Flutter / Dart — **non** React Native |
| PDF | Generazione lato server (stessa API) |

## Dominio (decisioni)

```
User
  └── users_positions  (storico GPS)

Cliente
  ├── Commessa  (FK → Cliente; posizione geo)
  │     ├── Ticket              (FK → Commessa; pezzi di lavoro)
  │     └── materiali_utilizzati (FK → Commessa; materiale_id opzionale)
  └── Intervento (FK → Cliente + User; ticket_id opzionale)
        └── (ore, data — campi da affinare)

Materiale  (catalogo)
  └── usato in materiali_utilizzati
```

- **Commessa**: lavoro strutturato (es. impianto), con budget e posizione.
- **Ticket**: sempre sotto commessa (es. elettrico / software / meccanico).
- **Intervento**: attività sul cliente; con `ticket_id` = legato a un ticket di commessa; senza = consuntivo diretto.
- Costo ore ≈ `ore × user.costo_orario`; materiali a parte su commessa.

### User / Auth

| Campo | Note |
|-------|------|
| `username` | UNIQUE |
| `password_hash` | bcrypt |
| `role` | `tecnico` \| `admin` |
| `costo_orario` | `NUMERIC(5, 2)` |

Auth: JWT Bearer (`sub`, `role`, `exp`).

| Ruolo | Capacità |
|-------|----------|
| `tecnico` | interventi propri; lettura anagrafiche |
| `admin` | utenti, anagrafiche, tutto |

### users_positions

| Campo | Note |
|-------|------|
| `user_id` | FK → users |
| `posizione` | `GEOMETRY(POINT, 4326)` |
| `data_aggiornamento` | TIMESTAMP |

### Cliente

| Campo | Note |
|-------|------|
| `ragione_sociale` | UNIQUE NOT NULL |
| `partita_iva` | UNIQUE NOT NULL |

### Commessa

| Campo | Note |
|-------|------|
| `cliente_id` | FK → clienti |
| `nome` / `descrizione` | |
| `data_inizio` / `data_fine` | DATE, opzionali |
| `stato` | `in_corso` \| `completata` \| `annullata` |
| `budget` | `NUMERIC(10, 2)` |
| `posizione` | `GEOMETRY(POINT, 4326)` NOT NULL |

### Ticket

| Campo | Note |
|-------|------|
| `commessa_id` | FK → commesse, obbligatorio |
| `nome` / `descrizione` | |
| `costo_totale` | `NUMERIC(10, 2)` |
| `stato` | `in_corso` \| `completato` \| `annullato` |

### Intervento

| Campo | Note |
|-------|------|
| `user_id` | FK → users, obbligatorio |
| `cliente_id` | FK → clienti, obbligatorio |
| `ticket_id` | FK → ticket, **opzionale** (`ON DELETE SET NULL`) |
| `ore_lavorate` / `ore_totali` | INTEGER (da chiarire semantica) |
| `data` | DATE |

### Materiali (catalogo)

| Campo | Note |
|-------|------|
| `nome` / `descrizione` | |
| `costo_unitario` | `NUMERIC(10, 2)` |
| `unita` | es. `pz`, `m` |
| `fornitore` | opzionale |

### materiali_utilizzati (su commessa)

| Campo | Note |
|-------|------|
| `materiale_id` | FK → materiali, **opzionale** (NULL = costo one-shot) |
| `commessa_id` | FK → commesse (`ON DELETE CASCADE`) |
| `nome` | obbligatorio (da catalogo o libero) |
| `quantita` | INTEGER |
| `costo_totale` | `NUMERIC(10, 2)` |

## Geo / PostGIS

Immagine: `postgis/postgis:17-3.5-alpine`. Init: `CREATE EXTENSION IF NOT EXISTS postgis;`.

Cambio immagine / reset: `docker compose down -v` (perde i dati locali).

Tabella di sistema `spatial_ref_sys`: non toccarla (SRID, es. 4326).

## Ordine di lavoro

1. **API + DB** — schema, auth, CRUD anagrafiche / interventi ← *qui*
2. **Web React**
3. **Stampa PDF**
4. **Flutter + GPS** (scrive su `users_positions`)

## Struttura repo

```
/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── BaseModels.py
│   ├── auth.py
│   ├── hash.py
│   ├── docker-compose.yml   # PostGIS 17
│   └── requirements.txt
├── frontend/         # React (fase 2)
├── mobile/           # Flutter (fase 4)
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

## Note

- Un’unica API per web e Flutter.
- Semplicità: SQL esplicito, dipendenze minime.
- `CREATE TABLE IF NOT EXISTS` non altera tabelle già create: se cambi colonne, serve `ALTER` o reset volume.
