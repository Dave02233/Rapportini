from dotenv import load_dotenv
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo
import json
import os
import psycopg
from psycopg.rows import dict_row
from psycopg.errors import UniqueViolation, ForeignKeyViolation
import hash

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL is None:
    raise ValueError("DATABASE_URL is not set")

def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)

def init_db():

    init_sql = """

    CREATE EXTENSION IF NOT EXISTS postgis;

    CREATE TABLE IF NOT EXISTS veicoli (
    id SERIAL PRIMARY KEY,
    targa TEXT UNIQUE NOT NULL,
    km INTEGER CHECK (km >= 0),
    costo_km NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (costo_km >= 0)
    );

    CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('tecnico', 'admin')),
    costo_orario NUMERIC(5, 2) NOT NULL,
    veicolo_predefinito INTEGER REFERENCES veicoli(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS users_positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    posizione GEOMETRY(POINT, 4326) NOT NULL,
    data_aggiornamento TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clienti (
    id SERIAL PRIMARY KEY,
    ragione_sociale TEXT UNIQUE NOT NULL,
    partita_iva TEXT UNIQUE NOT NULL,
    citta TEXT,
    via TEXT,
    cap TEXT
    );

    CREATE TABLE IF NOT EXISTS commesse (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clienti(id),
    data_inizio DATE,
    data_fine DATE,
    nome TEXT NOT NULL UNIQUE,
    descrizione TEXT,
    stato TEXT NOT NULL CHECK (stato IN ('in_corso', 'completata', 'annullata')),
    budget NUMERIC(10, 2) NOT NULL,
    posizione GEOMETRY(POINT, 4326) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offerte (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clienti(id),
    nome TEXT NOT NULL UNIQUE,
    prezzo_iniziale NUMERIC(10, 2) NOT NULL,
    sconto NUMERIC(6, 2) NOT NULL DEFAULT 0,
    prezzo_finale NUMERIC(10, 2) NOT NULL,
    data_invio DATE NOT NULL,
    data_risposta DATE,
    esito TEXT NOT NULL DEFAULT 'in_attesa' CHECK (esito IN ('accettata', 'rifiutata', 'in_attesa')),
    note TEXT,
    commessa_id INTEGER UNIQUE REFERENCES commesse(id) ON DELETE SET NULL,
    CONSTRAINT offerte_prezzi_ok CHECK (prezzo_iniziale >= 0 AND prezzo_finale >= 0),
    CONSTRAINT offerte_risposta_ok CHECK (data_risposta IS NULL OR data_risposta >= data_invio)
    );

    CREATE TABLE IF NOT EXISTS ticket (
    id SERIAL PRIMARY KEY,
    commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
    data_inizio DATE,
    data_fine DATE,
    nome TEXT NOT NULL,
    descrizione TEXT,
    costo_totale NUMERIC(10, 2) NOT NULL,
    stato TEXT NOT NULL CHECK (stato IN ('in_corso', 'completato', 'annullato'))
    );

    CREATE TABLE IF NOT EXISTS interventi (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    cliente_id INTEGER NOT NULL REFERENCES clienti(id),
    ticket_id INTEGER REFERENCES ticket(id) ON DELETE SET NULL,
    veicolo_id INTEGER REFERENCES veicoli(id),
    ore_lavorate NUMERIC(5, 1) NOT NULL,
    ore_viaggio NUMERIC(5, 1) NOT NULL,
    km INTEGER NOT NULL,
    ore_totali NUMERIC(5, 1) NOT NULL,
    data DATE NOT NULL,
    descrizione TEXT NOT NULL,
    note_interne TEXT,
    note_esterne TEXT,
    trasferta BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS materiali (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    descrizione TEXT,
    costo_unitario NUMERIC(10, 2) NOT NULL,
    unita TEXT NOT NULL,
    fornitore TEXT
    );

    CREATE TABLE IF NOT EXISTS materiali_utilizzati (
    id SERIAL PRIMARY KEY,
    materiale_id INTEGER REFERENCES materiali(id),
    commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    quantita INTEGER NOT NULL,
    costo_totale NUMERIC(10, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS costi_intervento (
    id SERIAL PRIMARY KEY,
    commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    data DATE NOT NULL,
    costo NUMERIC(10, 2) NOT NULL CHECK (costo >= 0)
    );

    -- Upgrade idempotente: CREATE TABLE IF NOT EXISTS non aggiunge colonne a tabelle già presenti.
    ALTER TABLE interventi ADD COLUMN IF NOT EXISTS note_esterne TEXT;
    ALTER TABLE interventi ADD COLUMN IF NOT EXISTS note_interne TEXT;
    ALTER TABLE interventi ADD COLUMN IF NOT EXISTS trasferta BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE veicoli ADD COLUMN IF NOT EXISTS costo_km NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (costo_km >= 0);

    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS nome TEXT;
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS prezzo_iniziale NUMERIC(10, 2);
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS sconto NUMERIC(6, 2) DEFAULT 0;
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS prezzo_finale NUMERIC(10, 2);
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS data_invio DATE;
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS data_risposta DATE;
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS esito TEXT DEFAULT 'in_attesa';
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE offerte ADD COLUMN IF NOT EXISTS commessa_id INTEGER;

    UPDATE offerte SET nome = 'Offerta ' || id::text WHERE nome IS NULL OR btrim(nome) = '';
    UPDATE offerte SET prezzo_iniziale = 0 WHERE prezzo_iniziale IS NULL;
    UPDATE offerte SET sconto = 0 WHERE sconto IS NULL;
    UPDATE offerte SET prezzo_finale = COALESCE(prezzo_finale, prezzo_iniziale, 0) WHERE prezzo_finale IS NULL;
    UPDATE offerte SET data_invio = CURRENT_DATE WHERE data_invio IS NULL;
    UPDATE offerte SET esito = 'in_attesa' WHERE esito IS NULL OR esito NOT IN ('accettata', 'rifiutata', 'in_attesa');

    ALTER TABLE offerte ALTER COLUMN nome SET NOT NULL;
    ALTER TABLE offerte ALTER COLUMN prezzo_iniziale SET NOT NULL;
    ALTER TABLE offerte ALTER COLUMN sconto SET NOT NULL;
    ALTER TABLE offerte ALTER COLUMN prezzo_finale SET NOT NULL;
    ALTER TABLE offerte ALTER COLUMN data_invio SET NOT NULL;
    ALTER TABLE offerte ALTER COLUMN esito SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS offerte_nome_uidx ON offerte (nome);

    -- Ticket generale "-" sulle commesse create prima di questa regola
    INSERT INTO ticket (commessa_id, data_inizio, data_fine, nome, descrizione, costo_totale, stato)
    SELECT c.id, NULL, NULL, '-', NULL, 0, 'in_corso'
    FROM commesse c
    WHERE NOT EXISTS (
        SELECT 1 FROM ticket t WHERE t.commessa_id = c.id AND t.nome = '-'
    );

    CREATE TABLE IF NOT EXISTS bozze_interventi (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    cliente_id INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
    commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES ticket(id) ON DELETE SET NULL,
    ore_lavorate NUMERIC(5, 1) NOT NULL,
    minuti_stimati INTEGER NOT NULL,
    n_campioni INTEGER NOT NULL,
    stato TEXT NOT NULL DEFAULT 'da_revisionare' CHECK (stato IN ('da_revisionare', 'confermata', 'scartata')),
    intervento_id INTEGER UNIQUE REFERENCES interventi(id) ON DELETE SET NULL,
    UNIQUE (user_id, data)
    );

    CREATE TABLE IF NOT EXISTS bozze_generazioni (
    data DATE PRIMARY KEY,
    eseguita_il TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- ticket.costo_totale = somma (ore_totali * costo_orario + km * costo_km) con i prezzi attuali
    CREATE OR REPLACE FUNCTION ricalcola_costo_ticket(t_id INTEGER) RETURNS VOID AS $$
        UPDATE ticket SET costo_totale = (
            SELECT COALESCE(SUM(i.ore_totali * u.costo_orario + i.km * COALESCE(v.costo_km, 0)), 0)
            FROM interventi i
            JOIN users u ON u.id = i.user_id
            LEFT JOIN veicoli v ON v.id = i.veicolo_id
            WHERE i.ticket_id = t_id
        )
        WHERE id = t_id;
    $$ LANGUAGE sql;

    CREATE OR REPLACE FUNCTION trg_interventi_costo_ticket() RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            PERFORM ricalcola_costo_ticket(OLD.ticket_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            PERFORM ricalcola_costo_ticket(NEW.ticket_id);
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS interventi_costo_ticket ON interventi;
    CREATE TRIGGER interventi_costo_ticket
    AFTER INSERT OR UPDATE OR DELETE ON interventi
    FOR EACH ROW EXECUTE FUNCTION trg_interventi_costo_ticket();

    CREATE OR REPLACE FUNCTION trg_users_costo_ticket() RETURNS TRIGGER AS $$
    BEGIN
        PERFORM ricalcola_costo_ticket(ticket_id)
        FROM (SELECT DISTINCT ticket_id FROM interventi WHERE user_id = NEW.id) AS t;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS users_costo_ticket ON users;
    CREATE TRIGGER users_costo_ticket
    AFTER UPDATE OF costo_orario ON users
    FOR EACH ROW WHEN (OLD.costo_orario IS DISTINCT FROM NEW.costo_orario)
    EXECUTE FUNCTION trg_users_costo_ticket();

    CREATE OR REPLACE FUNCTION trg_veicoli_costo_ticket() RETURNS TRIGGER AS $$
    BEGIN
        PERFORM ricalcola_costo_ticket(ticket_id)
        FROM (SELECT DISTINCT ticket_id FROM interventi WHERE veicolo_id = NEW.id) AS t;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS veicoli_costo_ticket ON veicoli;
    CREATE TRIGGER veicoli_costo_ticket
    AFTER UPDATE OF costo_km ON veicoli
    FOR EACH ROW WHEN (OLD.costo_km IS DISTINCT FROM NEW.costo_km)
    EXECUTE FUNCTION trg_veicoli_costo_ticket();

    """

    default_user_sql = """
    INSERT INTO users (username, password_hash, role, costo_orario, veicolo_predefinito) VALUES (%s, %s, 'admin', 50.00, NULL);
    """

    try:
        with get_connection() as conn:
            conn.execute(init_sql)
            if conn.execute("SELECT 1 FROM users WHERE role = 'admin'").fetchone() is None:
                username = os.getenv("ADMIN_USERNAME", "admin")
                password = os.getenv("ADMIN_PASSWORD", "admin")
                conn.execute(default_user_sql, (username, hash.hash_password(password)))
            conn.commit()
    except psycopg.Error as e:
        raise RuntimeError(f"init_db failed: {e}") from e


# --- Users ---
def create_user(username: str, password: str, role: str, costo_orario: float, veicolo_predefinito: int | None):

    create_sql = """
    INSERT INTO users (username, password_hash, role, costo_orario, veicolo_predefinito) VALUES (%s, %s, %s, %s, %s)
    RETURNING id, username, role, costo_orario, veicolo_predefinito;
    """

    password_hash = hash.hash_password(password)
    try:
        with get_connection() as conn:
            row = conn.execute(create_sql, (username, password_hash, role, costo_orario, veicolo_predefinito)).fetchone()
            conn.commit()
            return row

    except UniqueViolation:
        raise ValueError("Username già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Veicolo non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_user failed: {e}") from e

def get_users():
    get_users_sql = """
    SELECT id, username, role, costo_orario, veicolo_predefinito FROM users ORDER BY username ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_users_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_users failed: {e}") from e

def get_user_by_id(user_id: int):
    get_user_by_id_sql = """
    SELECT id, username, role, costo_orario, veicolo_predefinito FROM users WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_user_by_id_sql, (user_id,)).fetchone()
            if row is None:
                raise LookupError("Utente non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_user_by_id failed: {e}") from e

def update_user(
    user_id: int,
    username: str,
    role: str,
    costo_orario: float,
    veicolo_predefinito: int | None,
    password: str | None = None,
):
    # password None / vuota = lascia hash invariato (solo admin chiama questa API)
    if password:
        update_user_sql = """
        UPDATE users SET username = %s, role = %s, costo_orario = %s, veicolo_predefinito = %s, password_hash = %s
        WHERE id = %s
        RETURNING id, username, role, costo_orario, veicolo_predefinito;
        """
        params = (username, role, costo_orario, veicolo_predefinito, hash.hash_password(password), user_id)
    else:
        update_user_sql = """
        UPDATE users SET username = %s, role = %s, costo_orario = %s, veicolo_predefinito = %s WHERE id = %s
        RETURNING id, username, role, costo_orario, veicolo_predefinito;
        """
        params = (username, role, costo_orario, veicolo_predefinito, user_id)
    try:
        with get_connection() as conn:
            row = conn.execute(update_user_sql, params).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Utente non trovato")
            return row
    except UniqueViolation:
        raise ValueError("Username già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Veicolo non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_user failed: {e}") from e

def delete_user(user_id: int):
    delete_user_sql = """
    DELETE FROM users WHERE id = %s RETURNING id, username, role, costo_orario, veicolo_predefinito;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_user_sql, (user_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Utente non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Utente non eliminabile: è in uso") from None
    except psycopg.Error as e:
        raise RuntimeError(f"delete_user failed: {e}") from e

def insert_user_position(user_id: int, lat: float, lon: float):
    insert_user_position_sql = """
    INSERT INTO users_positions (user_id, posizione, data_aggiornamento) VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), NOW())
    RETURNING id, user_id, ST_Y(posizione) AS lat, ST_X(posizione) AS lon, data_aggiornamento;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(insert_user_position_sql, (user_id, lon, lat)).fetchone()
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Utente non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"insert_user_position failed: {e}") from e

def _finestra_posizioni(dal: date | None, al: date | None):
    # Stessa finestra di get_user_positions: ultime 24 ore, oppure [dal, al+1) max 31 giorni.
    if dal is None and al is None:
        return "AND data_aggiornamento >= NOW() - INTERVAL '24 hours'", ()
    if dal is None:
        dal = al
    if al is None:
        al = dal
    if al < dal:
        raise ValueError("La data di fine non può precedere la data di inizio")
    if (al - dal).days > 30:
        raise ValueError("Intervallo massimo 31 giorni")
    start = datetime.combine(dal, datetime.min.time())
    end = datetime.combine(al + timedelta(days=1), datetime.min.time())
    return "AND data_aggiornamento >= %s AND data_aggiornamento < %s", (start, end)

def get_user_positions(user_id: int, dal: date | None = None, al: date | None = None):
    finestra_sql, finestra_params = _finestra_posizioni(dal, al)
    get_user_positions_sql = f"""
    SELECT id, user_id, ST_Y(posizione) AS lat, ST_X(posizione) AS lon, data_aggiornamento
    FROM users_positions
    WHERE user_id = %s
    {finestra_sql}
    ORDER BY data_aggiornamento ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_user_positions_sql, (user_id, *finestra_params)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_user_positions failed: {e}") from e

# Metri: su geometry 4326 ST_DWithin userebbe i gradi.
RAGGIO_COMMESSA_M = 2000

def get_commesse_vicine(user_id: int, dal: date | None = None, al: date | None = None):
    # Commesse in corso la cui posizione è entro 2 km dal tracciato (linea ordinata, non dal singolo punto).
    finestra_sql, finestra_params = _finestra_posizioni(dal, al)
    get_commesse_vicine_sql = f"""
    WITH percorso AS (
        SELECT CASE
            WHEN COUNT(*) = 0 THEN NULL
            WHEN COUNT(*) = 1 THEN (array_agg(posizione))[1]
            ELSE ST_MakeLine(posizione ORDER BY data_aggiornamento)
        END AS geom
        FROM users_positions
        WHERE user_id = %s
        {finestra_sql}
    )
    SELECT c.id, c.cliente_id, c.data_inizio, c.data_fine, c.nome, c.descrizione, c.stato, c.budget,
        ST_Y(c.posizione) AS lat, ST_X(c.posizione) AS lon,
        COALESCE((SELECT SUM(t.costo_totale) FROM ticket t WHERE t.commessa_id = c.id), 0) AS costo_ticket,
        COALESCE((SELECT SUM(m.costo_totale) FROM materiali_utilizzati m WHERE m.commessa_id = c.id), 0) AS costo_materiali,
        COALESCE((SELECT SUM(ci.costo) FROM costi_intervento ci WHERE ci.commessa_id = c.id), 0) AS costo_interventi
    FROM commesse c
    CROSS JOIN percorso p
    WHERE c.stato = 'in_corso'
      AND p.geom IS NOT NULL
      AND ST_DWithin(c.posizione::geography, p.geom::geography, %s)
    ORDER BY c.nome ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(
                get_commesse_vicine_sql,
                (user_id, *finestra_params, RAGGIO_COMMESSA_M),
            ).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_commesse_vicine failed: {e}") from e

def delete_user_position(position_id: int):
    delete_user_position_sql = """
    DELETE FROM users_positions WHERE id = %s
    RETURNING id, user_id, ST_Y(posizione) AS lat, ST_X(posizione) AS lon, data_aggiornamento;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_user_position_sql, (position_id,)).fetchone()
            if row is None:
                raise LookupError("Posizione non trovata")
            conn.commit()
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_user_position failed: {e}") from e

def authenticate_user(username: str, password: str):

    authenticate_sql = """
    SELECT id, username, password_hash, role FROM users WHERE username = %s;
    """

    try:
        with get_connection() as conn:
            row = conn.execute(authenticate_sql, (username,)).fetchone()
            if row is None:
                raise ValueError("Username o password non corretti")
            if not hash.verify_password(password, row["password_hash"]):
                raise ValueError("Username o password non corretti")
            return {
                "id": row["id"],
                "username": row["username"],
                "role": row["role"]
            }
    except psycopg.Error as e:
        raise RuntimeError(f"authenticate_user failed: {e}") from e

# --- Clienti ---
_CLIENTE_COLS = "id, ragione_sociale, partita_iva, citta, via, cap"

def create_cliente(
    ragione_sociale: str,
    p_iva: str,
    citta: str | None = None,
    via: str | None = None,
    cap: str | None = None,
):
    create_cliente_sql = f"""
    INSERT INTO clienti (ragione_sociale, partita_iva, citta, via, cap) VALUES (%s, %s, %s, %s, %s)
    RETURNING {_CLIENTE_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_cliente_sql, (ragione_sociale, p_iva, citta, via, cap)).fetchone()
            conn.commit()
            return row
    except UniqueViolation:
        raise ValueError("Ragione sociale o partita IVA già esistenti") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_cliente failed: {e}") from e

def get_clienti():
    get_clienti_sql = f"""
    SELECT {_CLIENTE_COLS} FROM clienti ORDER BY ragione_sociale ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_clienti_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_clienti failed: {e}") from e

def get_cliente_by_id(cliente_id: int):
    get_cliente_by_id_sql = f"""
    SELECT {_CLIENTE_COLS} FROM clienti WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_cliente_by_id_sql, (cliente_id,)).fetchone()
            if row is None:
                raise LookupError("Cliente non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_cliente_by_id failed: {e}") from e

def update_cliente(
    cliente_id: int,
    ragione_sociale: str,
    partita_iva: str,
    citta: str | None = None,
    via: str | None = None,
    cap: str | None = None,
):
    update_cliente_sql = f"""
    UPDATE clienti SET ragione_sociale = %s, partita_iva = %s, citta = %s, via = %s, cap = %s WHERE id = %s
    RETURNING {_CLIENTE_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(
                update_cliente_sql,
                (ragione_sociale, partita_iva, citta, via, cap, cliente_id),
            ).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Cliente non trovato")
            return row
    except UniqueViolation:
        raise ValueError("Ragione sociale o partita IVA già esistenti") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_cliente failed: {e}") from e

def delete_cliente(cliente_id: int):
    delete_cliente_sql = f"""
    DELETE FROM clienti WHERE id = %s RETURNING {_CLIENTE_COLS};    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_cliente_sql, (cliente_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Cliente non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Cliente non eliminabile: è in uso") from None
    except psycopg.Error as e:
        raise RuntimeError(f"delete_cliente failed: {e}") from e

# --- Commesse ---
def create_commessa(cliente_id: int, data_inizio: date | None, data_fine: date | None, nome: str, descrizione: str | None, stato: str, budget: float, lat: float, lon: float):
    # ST_MakePoint vuole (lon, lat), non (lat, lon)
    create_commessa_sql = """
    INSERT INTO commesse (cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, posizione)
    VALUES (%s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
    RETURNING id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_commessa_sql, (cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, lon, lat)).fetchone()
            _crea_ticket_generale(conn, row["id"])
            conn.commit()
            return row
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Cliente non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_commessa failed: {e}") from e

def get_commesse():
    get_commesse_sql = """
    SELECT id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon
    FROM commesse ORDER BY nome ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_commesse_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_commesse failed: {e}") from e

def get_commesse_riepilogo():
    # Subquery separate: un JOIN su ticket e materiali insieme moltiplicherebbe le righe
    get_commesse_riepilogo_sql = """
    SELECT c.id, c.cliente_id, c.data_inizio, c.data_fine, c.nome, c.descrizione, c.stato, c.budget,
        ST_Y(c.posizione) AS lat, ST_X(c.posizione) AS lon,
        COALESCE((SELECT SUM(t.costo_totale) FROM ticket t WHERE t.commessa_id = c.id), 0) AS costo_ticket,
        COALESCE((SELECT SUM(m.costo_totale) FROM materiali_utilizzati m WHERE m.commessa_id = c.id), 0) AS costo_materiali,
        COALESCE((SELECT SUM(ci.costo) FROM costi_intervento ci WHERE ci.commessa_id = c.id), 0) AS costo_interventi
    FROM commesse c ORDER BY c.nome ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_commesse_riepilogo_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_commesse_riepilogo failed: {e}") from e

def get_commessa_by_id(commessa_id: int):
    get_commessa_by_id_sql = """
    SELECT id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon
    FROM commesse WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_commessa_by_id_sql, (commessa_id,)).fetchone()
            if row is None:
                raise LookupError("Commessa non trovata")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_commessa_by_id failed: {e}") from e

def get_commesse_by_cliente_id(cliente_id: int):
    get_commesse_by_cliente_id_sql = """
    SELECT id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon
    FROM commesse WHERE cliente_id = %s ORDER BY nome ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_commesse_by_cliente_id_sql, (cliente_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_commesse_by_cliente_id failed: {e}") from e

def update_commessa(commessa_id: int, cliente_id: int, data_inizio: date | None, data_fine: date | None, nome: str, descrizione: str | None, stato: str, budget: float, lat: float, lon: float):
    update_commessa_sql = """
    UPDATE commesse SET cliente_id = %s, data_inizio = %s, data_fine = %s, nome = %s, descrizione = %s, stato = %s, budget = %s,
    posizione = ST_SetSRID(ST_MakePoint(%s, %s), 4326)
    WHERE id = %s
    RETURNING id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_commessa_sql, (cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, lon, lat, commessa_id)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Commessa non trovata")
            return row
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Cliente non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_commessa failed: {e}") from e

def delete_commessa(commessa_id: int):
    delete_commessa_sql = """
    DELETE FROM commesse WHERE id = %s
    RETURNING id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_commessa_sql, (commessa_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Commessa non trovata")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_commessa failed: {e}") from e

# --- Ticket ---
_TICKET_COLS = "id, commessa_id, data_inizio, data_fine, nome, descrizione, costo_totale, stato"

def _crea_ticket_generale(conn, commessa_id: int):
    # Il rapportino tiene solo il ticket: "-" tiene la commessa anche senza un ticket specifico.
    conn.execute(
        """
        INSERT INTO ticket (commessa_id, data_inizio, data_fine, nome, descrizione, costo_totale, stato)
        VALUES (%s, NULL, NULL, '-', NULL, 0, 'in_corso')
        """,
        (commessa_id,),
    )

def create_ticket(commessa_id: int, data_inizio: date | None, data_fine: date | None, nome: str, descrizione: str | None, stato: str):
    # costo_totale parte da 0: lo aggiorna il trigger sugli interventi
    create_ticket_sql = f"""
    INSERT INTO ticket (commessa_id, data_inizio, data_fine, nome, descrizione, costo_totale, stato) VALUES (%s, %s, %s, %s, %s, 0, %s)
    RETURNING {_TICKET_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_ticket_sql, (commessa_id, data_inizio, data_fine, nome, descrizione, stato)).fetchone()
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Commessa non trovata") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_ticket failed: {e}") from e

def get_tickets():
    get_tickets_sql = f"""
    SELECT {_TICKET_COLS} FROM ticket ORDER BY id ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_tickets_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_tickets failed: {e}") from e

def get_ticket_by_id(ticket_id: int):
    get_ticket_by_id_sql = f"""
    SELECT {_TICKET_COLS} FROM ticket WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_ticket_by_id_sql, (ticket_id,)).fetchone()
            if row is None:
                raise LookupError("Ticket non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_ticket_by_id failed: {e}") from e

def get_tickets_by_commessa_id(commessa_id: int):
    get_tickets_by_commessa_id_sql = f"""
    SELECT {_TICKET_COLS} FROM ticket WHERE commessa_id = %s ORDER BY id ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_tickets_by_commessa_id_sql, (commessa_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_tickets_by_commessa_id failed: {e}") from e

def update_ticket(ticket_id: int, commessa_id: int, data_inizio: date | None, data_fine: date | None, nome: str, descrizione: str | None, stato: str):
    update_ticket_sql = f"""
    UPDATE ticket SET commessa_id = %s, data_inizio = %s, data_fine = %s, nome = %s, descrizione = %s, stato = %s WHERE id = %s
    RETURNING {_TICKET_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_ticket_sql, (commessa_id, data_inizio, data_fine, nome, descrizione, stato, ticket_id)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Ticket non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Commessa non trovata") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_ticket failed: {e}") from e

def delete_ticket(ticket_id: int):
    delete_ticket_sql = f"""
    DELETE FROM ticket WHERE id = %s RETURNING {_TICKET_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_ticket_sql, (ticket_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Ticket non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_ticket failed: {e}") from e

# --- Interventi ---
def _ticket_del_cliente(conn, ticket_id: int | None, cliente_id: int) -> bool:
    if ticket_id is None:
        return True
    ticket_del_cliente_sql = """
    SELECT 1 FROM ticket t JOIN commesse c ON c.id = t.commessa_id
    WHERE t.id = %s AND c.cliente_id = %s;
    """
    return conn.execute(ticket_del_cliente_sql, (ticket_id, cliente_id)).fetchone() is not None

def _controlla_intervento(conn, cliente_id: int, ticket_id: int | None, veicolo_id: int | None, km: int):
    # Senza veicolo i km non hanno un costo a cui agganciarsi.
    if km > 0 and veicolo_id is None:
        raise ValueError("Seleziona un veicolo per i km")
    if not _ticket_del_cliente(conn, ticket_id, cliente_id):
        raise ValueError("Il ticket non appartiene a una commessa del cliente")

def create_intervento(
    user_id: int,
    cliente_id: int,
    ticket_id: int | None,
    veicolo_id: int | None,
    ore_lavorate: float,
    ore_viaggio: float,
    km: int,
    ore_totali: float,
    data: date,
    descrizione: str,
    note_interne: str | None,
    note_esterne: str | None,
    trasferta: bool,
):
    try:
        with get_connection() as conn:
            row = _insert_intervento(
                conn,
                user_id,
                cliente_id,
                ticket_id,
                veicolo_id,
                ore_lavorate,
                ore_viaggio,
                km,
                ore_totali,
                data,
                descrizione,
                note_interne,
                note_esterne,
                trasferta,
            )
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Utente, cliente, ticket o veicolo non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_intervento failed: {e}") from e

def create_interventi(righe: list[tuple]):
    # Una transazione: se una giornata fallisce non resta niente di salvato.
    if not righe:
        raise ValueError("Nessuna giornata da salvare")
    try:
        with get_connection() as conn:
            rows = [_insert_intervento(conn, *riga) for riga in righe]
            conn.commit()
            return rows
    except ForeignKeyViolation:
        raise ValueError("Utente, cliente, ticket o veicolo non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_interventi failed: {e}") from e

_INTERVENTO_COLS = "id, user_id, cliente_id, ticket_id, veicolo_id, ore_lavorate, ore_viaggio, km, ore_totali, data, descrizione, note_interne, note_esterne, trasferta"

_INSERT_INTERVENTO_SQL = f"""
INSERT INTO interventi (user_id, cliente_id, ticket_id, veicolo_id, ore_lavorate, ore_viaggio, km, ore_totali, data, descrizione, note_interne, note_esterne, trasferta)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
RETURNING {_INTERVENTO_COLS};
"""

def _insert_intervento(conn, user_id, cliente_id, ticket_id, veicolo_id, ore_lavorate, ore_viaggio, km, ore_totali, data, descrizione, note_interne, note_esterne, trasferta):
    _controlla_intervento(conn, cliente_id, ticket_id, veicolo_id, km)
    return conn.execute(
        _INSERT_INTERVENTO_SQL,
        (user_id, cliente_id, ticket_id, veicolo_id, ore_lavorate, ore_viaggio, km, ore_totali, data, descrizione, note_interne, note_esterne, trasferta),
    ).fetchone()

def get_interventi():
    get_interventi_sql = f"""
    SELECT {_INTERVENTO_COLS} FROM interventi ORDER BY data DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_interventi_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_interventi failed: {e}") from e

def get_intervento_by_id(intervento_id: int):
    get_intervento_by_id_sql = f"""
    SELECT {_INTERVENTO_COLS} FROM interventi WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_intervento_by_id_sql, (intervento_id,)).fetchone()
            if row is None:
                raise LookupError("Intervento non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_intervento_by_id failed: {e}") from e

def get_interventi_by_user_id(user_id: int):
    get_interventi_by_user_id_sql = f"""
    SELECT {_INTERVENTO_COLS} FROM interventi WHERE user_id = %s ORDER BY data DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_interventi_by_user_id_sql, (user_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_interventi_by_user_id failed: {e}") from e

def get_interventi_by_cliente_id(cliente_id: int):
    get_interventi_by_cliente_id_sql = f"""
    SELECT {_INTERVENTO_COLS} FROM interventi WHERE cliente_id = %s ORDER BY data DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_interventi_by_cliente_id_sql, (cliente_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_interventi_by_cliente_id failed: {e}") from e

def update_intervento(
    intervento_id: int,
    user_id: int,
    cliente_id: int,
    ticket_id: int | None,
    veicolo_id: int | None,
    ore_lavorate: float,
    ore_viaggio: float,
    km: int,
    ore_totali: float,
    data: date,
    descrizione: str,
    note_interne: str | None,
    note_esterne: str | None,
    trasferta: bool,
):
    update_intervento_sql = f"""
    UPDATE interventi SET user_id = %s, cliente_id = %s, ticket_id = %s, veicolo_id = %s,
        ore_lavorate = %s, ore_viaggio = %s, km = %s, ore_totali = %s, data = %s,
        descrizione = %s, note_interne = %s, note_esterne = %s, trasferta = %s
    WHERE id = %s
    RETURNING {_INTERVENTO_COLS};
    """
    try:
        with get_connection() as conn:
            _controlla_intervento(conn, cliente_id, ticket_id, veicolo_id, km)
            row = conn.execute(
                update_intervento_sql,
                (user_id, cliente_id, ticket_id, veicolo_id, ore_lavorate, ore_viaggio, km, ore_totali, data, descrizione, note_interne, note_esterne, trasferta, intervento_id),
            ).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Intervento non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Utente, cliente, ticket o veicolo non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_intervento failed: {e}") from e

def delete_intervento(intervento_id: int):
    delete_intervento_sql = f"""
    DELETE FROM interventi WHERE id = %s RETURNING {_INTERVENTO_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_intervento_sql, (intervento_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Intervento non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_intervento failed: {e}") from e

# --- Materiali ---
def create_materiale(nome: str, descrizione: str | None, costo_unitario: float, unita: str, fornitore: str | None):
    create_materiale_sql = """
    INSERT INTO materiali (nome, descrizione, costo_unitario, unita, fornitore) VALUES (%s, %s, %s, %s, %s)
    RETURNING id, nome, descrizione, costo_unitario, unita, fornitore;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_materiale_sql, (nome, descrizione, costo_unitario, unita, fornitore)).fetchone()
            conn.commit()
            return row
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_materiale failed: {e}") from e

def get_materiali():
    get_materiali_sql = """
    SELECT id, nome, descrizione, costo_unitario, unita, fornitore FROM materiali ORDER BY nome ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_materiali_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_materiali failed: {e}") from e

def get_materiale_by_id(materiale_id: int):
    get_materiale_by_id_sql = """
    SELECT id, nome, descrizione, costo_unitario, unita, fornitore FROM materiali WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_materiale_by_id_sql, (materiale_id,)).fetchone()
            if row is None:
                raise LookupError("Materiale non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_materiale_by_id failed: {e}") from e

def update_materiale(materiale_id: int, nome: str, descrizione: str | None, costo_unitario: float, unita: str, fornitore: str | None):
    update_materiale_sql = """
    UPDATE materiali SET nome = %s, descrizione = %s, costo_unitario = %s, unita = %s, fornitore = %s WHERE id = %s
    RETURNING id, nome, descrizione, costo_unitario, unita, fornitore;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_materiale_sql, (nome, descrizione, costo_unitario, unita, fornitore, materiale_id)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Materiale non trovato")
            return row
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_materiale failed: {e}") from e

def delete_materiale(materiale_id: int):
    delete_materiale_sql = """
    DELETE FROM materiali WHERE id = %s RETURNING id, nome, descrizione, costo_unitario, unita, fornitore;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_materiale_sql, (materiale_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Materiale non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Materiale non eliminabile: è già usato in una commessa") from None
    except psycopg.Error as e:
        raise RuntimeError(f"delete_materiale failed: {e}") from e

# --- Materiali utilizzati ---
def create_materiale_utilizzato(commessa_id: int, materiale_id: int | None, nome: str, quantita: int, costo_totale: float):
    create_materiale_utilizzato_sql = """
    INSERT INTO materiali_utilizzati (commessa_id, materiale_id, nome, quantita, costo_totale) VALUES (%s, %s, %s, %s, %s)
    RETURNING id, commessa_id, materiale_id, nome, quantita, costo_totale;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_materiale_utilizzato_sql, (commessa_id, materiale_id, nome, quantita, costo_totale)).fetchone()
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Commessa o materiale non trovati") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_materiale_utilizzato failed: {e}") from e

def get_materiali_utilizzati(commessa_id: int):
    get_materiali_utilizzati_sql = """
    SELECT id, commessa_id, materiale_id, nome, quantita, costo_totale FROM materiali_utilizzati
    WHERE commessa_id = %s ORDER BY id ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_materiali_utilizzati_sql, (commessa_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_materiali_utilizzati failed: {e}") from e

def update_materiale_utilizzato(materiale_utilizzato_id: int, materiale_id: int | None, nome: str, quantita: int, costo_totale: float):
    update_materiale_utilizzato_sql = """
    UPDATE materiali_utilizzati SET materiale_id = %s, nome = %s, quantita = %s, costo_totale = %s WHERE id = %s
    RETURNING id, commessa_id, materiale_id, nome, quantita, costo_totale;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_materiale_utilizzato_sql, (materiale_id, nome, quantita, costo_totale, materiale_utilizzato_id)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Materiale utilizzato non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Materiale non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_materiale_utilizzato failed: {e}") from e

def delete_materiale_utilizzato(materiale_utilizzato_id: int):
    delete_materiale_utilizzato_sql = """
    DELETE FROM materiali_utilizzati WHERE id = %s RETURNING id, commessa_id, materiale_id, nome, quantita, costo_totale;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_materiale_utilizzato_sql, (materiale_utilizzato_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Materiale utilizzato non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_materiale_utilizzato failed: {e}") from e

# --- Costi d'intervento ---
_COSTO_INTERVENTO_COLS = "id, commessa_id, nome, data, costo"

def create_costo_intervento(commessa_id: int, nome: str, data: date, costo: float):
    create_costo_intervento_sql = f"""
    INSERT INTO costi_intervento (commessa_id, nome, data, costo) VALUES (%s, %s, %s, %s)
    RETURNING {_COSTO_INTERVENTO_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_costo_intervento_sql, (commessa_id, nome, data, costo)).fetchone()
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Commessa non trovata") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_costo_intervento failed: {e}") from e

def get_costi_intervento(commessa_id: int):
    get_costi_intervento_sql = f"""
    SELECT {_COSTO_INTERVENTO_COLS} FROM costi_intervento
    WHERE commessa_id = %s ORDER BY data DESC, id DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_costi_intervento_sql, (commessa_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_costi_intervento failed: {e}") from e

def update_costo_intervento(costo_intervento_id: int, nome: str, data: date, costo: float):
    update_costo_intervento_sql = f"""
    UPDATE costi_intervento SET nome = %s, data = %s, costo = %s WHERE id = %s
    RETURNING {_COSTO_INTERVENTO_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_costo_intervento_sql, (nome, data, costo, costo_intervento_id)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Costo d'intervento non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"update_costo_intervento failed: {e}") from e

def delete_costo_intervento(costo_intervento_id: int):
    delete_costo_intervento_sql = f"""
    DELETE FROM costi_intervento WHERE id = %s RETURNING {_COSTO_INTERVENTO_COLS};
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_costo_intervento_sql, (costo_intervento_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Costo d'intervento non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_costo_intervento failed: {e}") from e

# --- Veicoli ---
def create_veicolo(targa: str, km: int | None, costo_km: float):
    create_veicolo_sql = """
    INSERT INTO veicoli (targa, km, costo_km) VALUES (%s, %s, %s)
    RETURNING id, targa, km, costo_km;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_veicolo_sql, (targa, km, costo_km)).fetchone()
            conn.commit()
            return row
    except UniqueViolation:
        raise ValueError("Targa già in uso") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_veicolo failed: {e}") from e

def get_veicoli():
    get_veicoli_sql = """
    SELECT id, targa, km, costo_km FROM veicoli ORDER BY km DESC NULLS LAST, targa ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_veicoli_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_veicoli failed: {e}") from e

def get_veicolo_by_id(veicolo_id: int):
    get_veicolo_by_id_sql = """
    SELECT id, targa, km, costo_km FROM veicoli WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_veicolo_by_id_sql, (veicolo_id,)).fetchone()
            if row is None:
                raise LookupError("Veicolo non trovato")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_veicolo_by_id failed: {e}") from e

def update_veicolo(veicolo_id: int, targa: str, km: int | None, costo_km: float):
    update_veicolo_sql = """
    UPDATE veicoli SET targa = %s, km = %s, costo_km = %s WHERE id = %s
    RETURNING id, targa, km, costo_km;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_veicolo_sql, (targa, km, costo_km, veicolo_id)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Veicolo non trovato")
            return row
    except UniqueViolation:
        raise ValueError("Targa già in uso") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_veicolo failed: {e}") from e

def delete_veicolo(veicolo_id: int):
    # users.veicolo_predefinito va a NULL da solo (ON DELETE SET NULL); interventi.veicolo_id blocca
    delete_veicolo_sql = """
    DELETE FROM veicoli WHERE id = %s RETURNING id, targa, km, costo_km;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_veicolo_sql, (veicolo_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Veicolo non trovato")
            return row
    except ForeignKeyViolation:
        raise ValueError("Veicolo non eliminabile: è usato in un intervento") from None
    except psycopg.Error as e:
        raise RuntimeError(f"delete_veicolo failed: {e}") from e

# --- Offerte ---
_OFFERTA_COLS = """
o.id, o.cliente_id, c.ragione_sociale AS cliente, o.nome,
o.prezzo_iniziale, o.sconto, o.prezzo_finale,
o.data_invio, o.data_risposta, o.esito, o.note, o.commessa_id
"""
_CENT = Decimal("0.01")

def _euro(value: float) -> Decimal:
    return Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)

def _controlla_offerta(
    nome: str,
    prezzo_iniziale: float,
    sconto: float,
    prezzo_finale: float,
    data_invio: date,
    data_risposta: date | None,
    note: str | None,
):
    nome = nome.strip()
    if not nome:
        raise ValueError("Nome obbligatorio")
    iniziale = _euro(prezzo_iniziale)
    sconto_pct = _euro(sconto)
    finale = _euro(prezzo_finale)
    if iniziale < 0 or finale < 0:
        raise ValueError("Il prezzo non può essere negativo")
    if iniziale == 0:
        if finale != 0:
            raise ValueError("Con prezzo iniziale 0 il prezzo finale è 0")
    else:
        atteso = (iniziale * (1 - sconto_pct / Decimal(100))).quantize(_CENT, rounding=ROUND_HALF_UP)
        if abs(atteso - finale) > Decimal("0.02"):
            raise ValueError("Prezzo finale e sconto non coincidono")
    if data_risposta is not None and data_risposta < data_invio:
        raise ValueError("La data di risposta non può precedere la data di invio")
    if note is None:
        note_ok = None
    else:
        note_ok = note.strip() or None
    return nome, iniziale, sconto_pct, finale, note_ok

def create_offerta(
    cliente_id: int,
    nome: str,
    prezzo_iniziale: float,
    sconto: float,
    prezzo_finale: float,
    data_invio: date,
    data_risposta: date | None,
    esito: str,
    note: str | None,
):
    nome, iniziale, sconto_pct, finale, note = _controlla_offerta(
        nome, prezzo_iniziale, sconto, prezzo_finale, data_invio, data_risposta, note
    )
    create_offerta_sql = f"""
    INSERT INTO offerte (
        cliente_id, nome, prezzo_iniziale, sconto, prezzo_finale,
        data_invio, data_risposta, esito, note
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(
                create_offerta_sql,
                (cliente_id, nome, iniziale, sconto_pct, finale, data_invio, data_risposta, esito, note),
            ).fetchone()
            created = conn.execute(
                f"SELECT {_OFFERTA_COLS} FROM offerte o JOIN clienti c ON c.id = o.cliente_id WHERE o.id = %s",
                (row["id"],),
            ).fetchone()
            conn.commit()
            return created
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Cliente non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_offerta failed: {e}") from e

def get_offerte():
    get_offerte_sql = f"""
    SELECT {_OFFERTA_COLS}
    FROM offerte o JOIN clienti c ON c.id = o.cliente_id
    ORDER BY o.data_invio DESC, o.id DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_offerte_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_offerte failed: {e}") from e

def update_offerta(
    offerta_id: int,
    cliente_id: int,
    nome: str,
    prezzo_iniziale: float,
    sconto: float,
    prezzo_finale: float,
    data_invio: date,
    data_risposta: date | None,
    esito: str,
    note: str | None,
):
    nome, iniziale, sconto_pct, finale, note = _controlla_offerta(
        nome, prezzo_iniziale, sconto, prezzo_finale, data_invio, data_risposta, note
    )
    # Se è già una commessa l'esito resta accettata.
    update_offerta_sql = f"""
    UPDATE offerte SET cliente_id = %s, nome = %s, prezzo_iniziale = %s, sconto = %s, prezzo_finale = %s,
        data_invio = %s, data_risposta = %s,
        esito = CASE WHEN commessa_id IS NOT NULL THEN 'accettata' ELSE %s END,
        note = %s
    WHERE id = %s
    RETURNING id;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(
                update_offerta_sql,
                (cliente_id, nome, iniziale, sconto_pct, finale, data_invio, data_risposta, esito, note, offerta_id),
            ).fetchone()
            if row is None:
                raise LookupError("Offerta non trovata")
            updated = conn.execute(
                f"SELECT {_OFFERTA_COLS} FROM offerte o JOIN clienti c ON c.id = o.cliente_id WHERE o.id = %s",
                (offerta_id,),
            ).fetchone()
            conn.commit()
            return updated
    except LookupError:
        raise
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Cliente non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_offerta failed: {e}") from e

def delete_offerta(offerta_id: int):
    delete_offerta_sql = """
    DELETE FROM offerte WHERE id = %s RETURNING id;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_offerta_sql, (offerta_id,)).fetchone()
            conn.commit()
            if row is None:
                raise LookupError("Offerta non trovata")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_offerta failed: {e}") from e

def promuovi_offerta(offerta_id: int, lat: float, lon: float):
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise ValueError("Coordinate non valide")
    insert_commessa_sql = """
    INSERT INTO commesse (cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, posizione)
    VALUES (%s, %s, NULL, %s, %s, 'in_corso', %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
    RETURNING id;
    """
    try:
        with get_connection() as conn:
            offerta = conn.execute(
                """
                SELECT id, cliente_id, nome, prezzo_finale, note, data_invio, data_risposta, commessa_id
                FROM offerte WHERE id = %s FOR UPDATE
                """,
                (offerta_id,),
            ).fetchone()
            if offerta is None:
                raise LookupError("Offerta non trovata")
            if offerta["commessa_id"] is not None:
                raise ValueError("Questa offerta è già una commessa")
            # Se manca la risposta, non usare una data precedente all'invio (il CHECK del DB).
            data_inizio = offerta["data_risposta"] or max(offerta["data_invio"], date.today())
            commessa = conn.execute(
                insert_commessa_sql,
                (offerta["cliente_id"], data_inizio, offerta["nome"], offerta["note"], offerta["prezzo_finale"], lon, lat),
            ).fetchone()
            _crea_ticket_generale(conn, commessa["id"])
            conn.execute(
                """
                UPDATE offerte
                SET esito = 'accettata',
                    commessa_id = %s,
                    data_risposta = COALESCE(data_risposta, %s)
                WHERE id = %s
                """,
                (commessa["id"], data_inizio, offerta_id),
            )
            updated = conn.execute(
                f"SELECT {_OFFERTA_COLS} FROM offerte o JOIN clienti c ON c.id = o.cliente_id WHERE o.id = %s",
                (offerta_id,),
            ).fetchone()
            conn.commit()
            return updated
    except LookupError:
        raise
    except UniqueViolation:
        raise ValueError("Nome già in uso") from None
    except ForeignKeyViolation:
        raise ValueError("Cliente non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"promuovi_offerta failed: {e}") from e

# --- Bozze interventi (GPS) ---
# Finestra del job: mezzanotte-20:00 Europe/Rome. Il campionamento è al massimo ogni ora:
# un intervallo più lungo di 75 minuti non è un tratto continuo di lavoro.
_ROME = ZoneInfo("Europe/Rome")
_ORA_BOZZE = time(20, 0)
_MINUTI_MINIMI = 60
_CAMPIONI_MINIMI = 2
_INTERVALLO_MAX = timedelta(minutes=75)
_LOCK_BOZZE = 8421001

def _ore_da_minuti(minuti: int) -> float:
    # Arrotonda al mezzo ora più vicino, .5 in su (80 min -> 1,5).
    mezzi = (Decimal(minuti) / Decimal(30)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return float(mezzi / Decimal(2))

def _proposte_bozze(punti: list[dict]) -> list[dict]:
    # punti: {user_id, id, t, vicini: {commessa_id: cliente_id}} già ordinati per utente e tempo.
    gruppi: dict[int, list] = {}
    for punto in punti:
        gruppi.setdefault(punto["user_id"], []).append(punto)

    proposte = []
    for user_id, serie in gruppi.items():
        secondi: dict[int, int] = {}
        campioni: dict[int, set] = {}
        clienti: dict[int, int] = {}
        for i, punto in enumerate(serie):
            for commessa_id, cliente_id in punto["vicini"].items():
                campioni.setdefault(commessa_id, set()).add(punto["id"])
                clienti[commessa_id] = cliente_id
            if i == 0:
                continue
            precedente = serie[i - 1]
            delta = punto["t"] - precedente["t"]
            if delta <= timedelta(0) or delta > _INTERVALLO_MAX:
                continue
            comuni = set(precedente["vicini"]) & set(punto["vicini"])
            for commessa_id in comuni:
                secondi[commessa_id] = secondi.get(commessa_id, 0) + int(delta.total_seconds())
        if not secondi:
            continue
        commessa_id = max(secondi, key=lambda cid: (secondi[cid], -cid))
        minuti = secondi[commessa_id] // 60
        if minuti < _MINUTI_MINIMI or len(campioni.get(commessa_id, ())) < _CAMPIONI_MINIMI:
            continue
        proposte.append({
            "user_id": user_id,
            "cliente_id": clienti[commessa_id],
            "commessa_id": commessa_id,
            "ore_lavorate": _ore_da_minuti(minuti),
            "minuti_stimati": minuti,
            "n_campioni": len(campioni[commessa_id]),
        })
    return proposte

def _punti_giornata(conn, giorno: date) -> list[dict]:
    inizio = datetime.combine(giorno, time(0, 0), tzinfo=_ROME)
    fine = datetime.combine(giorno, _ORA_BOZZE, tzinfo=_ROME)
    # Il timestamp in tabella è "orologio del DB": lo si rilegge nello stesso fuso e si confronta con Roma.
    righe = conn.execute(
        """
        SELECT p.user_id, p.id, p.data_aggiornamento,
            COALESCE(
                json_agg(json_build_object('commessa_id', c.id, 'cliente_id', c.cliente_id))
                FILTER (WHERE c.id IS NOT NULL),
                '[]'::json
            ) AS vicini
        FROM users_positions p
        LEFT JOIN commesse c
            ON c.stato = 'in_corso'
           AND ST_DWithin(c.posizione::geography, p.posizione::geography, %s)
        WHERE (p.data_aggiornamento AT TIME ZONE current_setting('TimeZone')) >= %s
          AND (p.data_aggiornamento AT TIME ZONE current_setting('TimeZone')) <= %s
        GROUP BY p.user_id, p.id, p.data_aggiornamento
        ORDER BY p.user_id, p.data_aggiornamento, p.id
        """,
        (RAGGIO_COMMESSA_M, inizio, fine),
    ).fetchall()
    punti = []
    for riga in righe:
        vicini = riga["vicini"]
        if isinstance(vicini, str):
            vicini = json.loads(vicini)
        punti.append({
            "user_id": riga["user_id"],
            "id": riga["id"],
            "t": riga["data_aggiornamento"],
            "vicini": {int(v["commessa_id"]): int(v["cliente_id"]) for v in vicini},
        })
    return punti

def _inserisci_bozze(conn, giorno: date) -> int:
    proposte = _proposte_bozze(_punti_giornata(conn, giorno))
    if not proposte:
        return 0
    commesse = list({p["commessa_id"] for p in proposte})
    ticket = conn.execute(
        """
        SELECT DISTINCT ON (commessa_id) commessa_id, id
        FROM ticket
        WHERE nome = '-' AND commessa_id = ANY(%s)
        ORDER BY commessa_id, id
        """,
        (commesse,),
    ).fetchall()
    ticket_per_commessa = {riga["commessa_id"]: riga["id"] for riga in ticket}
    inserite = 0
    for proposta in proposte:
        riga = conn.execute(
            """
            INSERT INTO bozze_interventi (
                user_id, data, cliente_id, commessa_id, ticket_id,
                ore_lavorate, minuti_stimati, n_campioni, stato
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'da_revisionare')
            ON CONFLICT (user_id, data) DO UPDATE SET
                cliente_id = EXCLUDED.cliente_id,
                commessa_id = EXCLUDED.commessa_id,
                ticket_id = EXCLUDED.ticket_id,
                ore_lavorate = EXCLUDED.ore_lavorate,
                minuti_stimati = EXCLUDED.minuti_stimati,
                n_campioni = EXCLUDED.n_campioni
            WHERE bozze_interventi.stato = 'da_revisionare'
            RETURNING id
            """,
            (
                proposta["user_id"],
                giorno,
                proposta["cliente_id"],
                proposta["commessa_id"],
                ticket_per_commessa.get(proposta["commessa_id"]),
                proposta["ore_lavorate"],
                proposta["minuti_stimati"],
                proposta["n_campioni"],
            ),
        ).fetchone()
        if riga is not None:
            inserite += 1
    return inserite

def genera_bozze(giorno: date) -> int:
    try:
        with get_connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_BOZZE,))
            n = _inserisci_bozze(conn, giorno)
            conn.commit()
            return n
    except psycopg.Error as e:
        raise RuntimeError(f"genera_bozze failed: {e}") from e

def esegui_job_bozze() -> int | None:
    # None = non è ancora l'ora, oppure la giornata è già stata generata.
    now = datetime.now(_ROME)
    if now.time() < _ORA_BOZZE:
        return None
    giorno = now.date()
    try:
        with get_connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_BOZZE,))
            gia = conn.execute(
                "SELECT 1 FROM bozze_generazioni WHERE data = %s",
                (giorno,),
            ).fetchone()
            if gia is not None:
                return None
            n = _inserisci_bozze(conn, giorno)
            conn.execute(
                "INSERT INTO bozze_generazioni (data) VALUES (%s) ON CONFLICT DO NOTHING",
                (giorno,),
            )
            conn.commit()
            return n
    except psycopg.Error as e:
        raise RuntimeError(f"esegui_job_bozze failed: {e}") from e

def secondi_fino_alle_20() -> float:
    now = datetime.now(_ROME)
    target = now.replace(hour=20, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return max((target - now).total_seconds(), 30)

_BOZZA_COLS = """
b.id, b.user_id, u.username, b.data, b.cliente_id, cl.ragione_sociale AS cliente,
b.commessa_id, co.nome AS commessa, b.ticket_id, t.nome AS ticket,
b.ore_lavorate, b.minuti_stimati, b.n_campioni, b.stato, b.intervento_id
"""

def get_bozze(user_id: int | None, giorno: date | None, ordine: str, solo_aperte: bool):
    ordine_sql = "ASC" if ordine == "asc" else "DESC"
    filtri = []
    params: list = []
    if user_id is not None:
        filtri.append("b.user_id = %s")
        params.append(user_id)
    if giorno is not None:
        filtri.append("b.data = %s")
        params.append(giorno)
    if solo_aperte:
        filtri.append("b.stato = 'da_revisionare'")
    where = f"WHERE {' AND '.join(filtri)}" if filtri else ""
    sql = f"""
    SELECT {_BOZZA_COLS}
    FROM bozze_interventi b
    JOIN users u ON u.id = b.user_id
    JOIN clienti cl ON cl.id = b.cliente_id
    JOIN commesse co ON co.id = b.commessa_id
    LEFT JOIN ticket t ON t.id = b.ticket_id
    {where}
    ORDER BY b.data {ordine_sql}, b.id {ordine_sql}
    """
    try:
        with get_connection() as conn:
            return conn.execute(sql, params).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_bozze failed: {e}") from e

def get_bozza(bozza_id: int):
    sql = f"""
    SELECT {_BOZZA_COLS}
    FROM bozze_interventi b
    JOIN users u ON u.id = b.user_id
    JOIN clienti cl ON cl.id = b.cliente_id
    JOIN commesse co ON co.id = b.commessa_id
    LEFT JOIN ticket t ON t.id = b.ticket_id
    WHERE b.id = %s
    """
    try:
        with get_connection() as conn:
            row = conn.execute(sql, (bozza_id,)).fetchone()
            if row is None:
                raise LookupError("Bozza non trovata")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_bozza failed: {e}") from e

def bozza_oggi(user_id: int, giorno: date) -> bool:
    try:
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT 1 FROM bozze_interventi
                WHERE user_id = %s AND data = %s AND stato = 'da_revisionare'
                """,
                (user_id, giorno),
            ).fetchone()
            return row is not None
    except psycopg.Error as e:
        raise RuntimeError(f"bozza_oggi failed: {e}") from e

def scarta_bozza(bozza_id: int):
    try:
        with get_connection() as conn:
            row = conn.execute(
                """
                UPDATE bozze_interventi SET stato = 'scartata'
                WHERE id = %s AND stato = 'da_revisionare'
                RETURNING id
                """,
                (bozza_id,),
            ).fetchone()
            conn.commit()
            if row is None:
                esistente = conn.execute(
                    "SELECT stato FROM bozze_interventi WHERE id = %s",
                    (bozza_id,),
                ).fetchone()
                if esistente is None:
                    raise LookupError("Bozza non trovata")
                raise ValueError("Bozza già chiusa")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"scarta_bozza failed: {e}") from e

def conferma_bozza(
    bozza_id: int,
    user_id: int,
    cliente_id: int,
    ticket_id: int | None,
    veicolo_id: int | None,
    ore_lavorate: float,
    ore_viaggio: float,
    km: int,
    ore_totali: float,
    data: date,
    descrizione: str,
    note_interne: str | None,
    note_esterne: str | None,
    trasferta: bool,
):
    try:
        with get_connection() as conn:
            bozza = conn.execute(
                "SELECT id, stato FROM bozze_interventi WHERE id = %s FOR UPDATE",
                (bozza_id,),
            ).fetchone()
            if bozza is None:
                raise LookupError("Bozza non trovata")
            if bozza["stato"] != "da_revisionare":
                raise ValueError("Bozza già chiusa")
            intervento = _insert_intervento(
                conn,
                user_id,
                cliente_id,
                ticket_id,
                veicolo_id,
                ore_lavorate,
                ore_viaggio,
                km,
                ore_totali,
                data,
                descrizione,
                note_interne,
                note_esterne,
                trasferta,
            )
            conn.execute(
                """
                UPDATE bozze_interventi
                SET stato = 'confermata', intervento_id = %s
                WHERE id = %s
                """,
                (intervento["id"], bozza_id),
            )
            conn.commit()
            return intervento
    except ForeignKeyViolation:
        raise ValueError("Utente, cliente, ticket o veicolo non trovato") from None
    except psycopg.Error as e:
        raise RuntimeError(f"conferma_bozza failed: {e}") from e
