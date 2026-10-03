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

Fase 1 **API + DB** — chiusa.  
Fase 2 **Web React** — area **tecnico** e **admin** operative (CRUD, mappa, dettaglio economico commessa). Guida: [`frontend/frontend_guide.md`](frontend/frontend_guide.md).

| Fatto | Non ancora |
|-------|------------|
| Docker PostGIS, schema `init_db`, CRUD `database.py`, auth JWT, bootstrap admin | Password change su update user |
| Interventi con `ore_viaggio`, `km`, `note`; `ore_totali` = lavorate + viaggio (UI) | `UniqueViolation` su `nome` commessa/ticket → 409 (oggi 500) |
| Frontend: Landing / Login (brand TEC Energie), AuthContext, `apiFetch`, errori in italiano | Generazione PDF rapportino congiunto |
| Area tecnico `/app`: lista, filtri, CRUD intervento, cascade cliente → commessa → ticket | Stats / grafici |
| Rapportino congiunto: selezione → revisione → conferma (PDF stub → torna a `/app`) | Serve SPA da FastAPI in prod; HTTPS al deploy |
| Area admin `/admin`: interventi di tutti + filtro utente; CRUD utenti/clienti/commesse/ticket/materiali | Flutter + GPS |
| Mappa commesse (Leaflet), dettaglio budget − spese, picker lat/lon su form | Lettura `users_positions` (fase GPS) |
| `ticket.costo_totale` ricalcolato da trigger DB (ore × `costo_orario` attuale) | |
| Bench `test/index.html` (`/bench`); CORS `http://localhost:5173` | |

**Prossimo passo tipico:** **PDF** del rapportino congiunto (hook già in UI), oppure polish backend (409 su unique). Vedi Fase E in [`frontend/frontend_guide.md`](frontend/frontend_guide.md).

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
| Web | React + Vite (SPA); JS + CSS plain; `fetch`; react-router; auth via Context + JWT in `localStorage`; mappa = Leaflet diretto (no react-leaflet) |
| Grafici (più avanti) | Una lib (es. Recharts), quando ci sono le viste stats |
| Mobile (fase 4) | Flutter / Dart — **non** React Native |
| PDF | Generazione lato server (stessa API) |
| TLS | Reverse proxy / hosting in produzione — non nel codice business |

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
- Costo ore su ticket: trigger DB (`ore_totali × costo_orario` attuale); materiali a parte su commessa. Spese commessa = Σ ticket + Σ materiali_utilizzati. Interventi senza ticket non pesano su nessuna commessa.

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
| `costo_totale` | `NUMERIC(10, 2)` — somma `ore_totali × users.costo_orario` degli interventi del ticket (trigger su `interventi` e su `users.costo_orario`; tariffa **attuale**, non storica). Non si scrive dal frontend. |
| `stato` | `in_corso` \| `completato` \| `annullato` |

### Intervento

| Campo | Note |
|-------|------|
| `user_id` | FK → users, obbligatorio |
| `cliente_id` | FK → clienti, obbligatorio |
| `ticket_id` | FK → ticket, **opzionale** (`ON DELETE SET NULL`) |
| `ore_lavorate` | INTEGER, > 0 |
| `ore_viaggio` | INTEGER, ≥ 0 |
| `km` | INTEGER, ≥ 0 |
| `ore_totali` | INTEGER (= lavorate + viaggio, calcolato in UI) |
| `data` | DATE |
| `note` | TEXT, opzionale |

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

1. **API + DB** — schema, auth, CRUD HTTP, bootstrap admin, bench smoke ← *chiusa*
2. **Web React** — tecnico + admin (CRUD, mappa, riepilogo commesse) ← *quasi chiusa*; restano polish minori — [`frontend/frontend_guide.md`](frontend/frontend_guide.md)
3. **Stampa PDF** ← *prossimo* (hook già in rapportino congiunto)
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
├── test/
│   └── index.html           # bench API throwaway (`/` e `/bench`)
├── frontend/                # React + Vite (fase 2)
│   ├── frontend_guide.md    # checklist / architettura UI
│   ├── public/logoTECEnergie.png
│   └── src/pages/           # Landing, Login, AppHome, admin/…
├── mobile/                  # Flutter (fase 4)
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
- Admin di default in locale: `admin` / `admin` (solo seed se non esiste già un admin; cambiare fuori dal play locale).
- Bench: con API avviata, apri `http://127.0.0.1:8000/bench` (stesso origin → CORS non serve).
- Dev frontend: Vite su `:5173` parla all’API su `:8000` → CORS whitelist; in prod si potrà servire la SPA dallo stesso host (HTTPS sul reverse proxy).
