from dotenv import load_dotenv
from datetime import date
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

    CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('tecnico', 'admin')),
    costo_orario NUMERIC(5, 2) NOT NULL
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
    partita_iva TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commesse (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clienti(id),
    data_inizio DATE,
    data_fine DATE,
    nome TEXT NOT NULL,
    descrizione TEXT,
    stato TEXT NOT NULL CHECK (stato IN ('in_corso', 'completata', 'annullata')),
    budget NUMERIC(10, 2) NOT NULL,
    posizione GEOMETRY(POINT, 4326) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket (
    id SERIAL PRIMARY KEY,
    commessa_id INTEGER NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
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
    ore_lavorate INTEGER NOT NULL,
    ore_totali INTEGER NOT NULL,
    data DATE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materiali (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
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
    """

    try:
        with get_connection() as conn:
            conn.execute(init_sql)
            conn.commit()
    except psycopg.Error as e:
        raise RuntimeError(f"init_db failed: {e}") from e

# --- Users ---
def create_user(username: str, password: str, role: str, costo_orario: float):

    create_sql = """
    INSERT INTO users (username, password_hash, role, costo_orario) VALUES (%s, %s, %s, %s)
    RETURNING id, username, role, costo_orario;
    """

    password_hash = hash.hash_password(password)
    try:
        with get_connection() as conn:
            row = conn.execute(create_sql, (username, password_hash, role, costo_orario)).fetchone()
            conn.commit()
            return row

    except UniqueViolation:
        raise ValueError("Username already exists") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_user failed: {e}") from e

def get_users():
    get_users_sql = """
    SELECT id, username, role, costo_orario FROM users ORDER BY username ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_users_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_users failed: {e}") from e

def get_user_by_id(user_id: int):
    get_user_by_id_sql = """
    SELECT id, username, role, costo_orario FROM users WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_user_by_id_sql, (user_id,)).fetchone()
            if row is None:
                raise ValueError("User not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_user_by_id failed: {e}") from e

def update_user(user_id: int, username: str, role: str, costo_orario: float):
    update_user_sql = """
    UPDATE users SET username = %s, role = %s, costo_orario = %s WHERE id = %s RETURNING id, username, role, costo_orario;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_user_sql, (username, role, costo_orario, user_id)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("User not found")
            return row
    except UniqueViolation:
        raise ValueError("Username already exists") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_user failed: {e}") from e

def delete_user(user_id: int):
    delete_user_sql = """
    DELETE FROM users WHERE id = %s RETURNING id, username, role, costo_orario;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_user_sql, (user_id,)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("User not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("User in use") from None
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
        raise ValueError("User not found") from None
    except psycopg.Error as e:
        raise RuntimeError(f"insert_user_position failed: {e}") from e

def authenticate_user(username: str, password: str):

    authenticate_sql = """
    SELECT id, username, password_hash, role FROM users WHERE username = %s;
    """

    try:
        with get_connection() as conn:
            row = conn.execute(authenticate_sql, (username,)).fetchone()
            if row is None:
                raise ValueError("Invalid username or password")
            if not hash.verify_password(password, row["password_hash"]):
                raise ValueError("Invalid username or password")
            return {
                "id": row["id"],
                "username": row["username"],
                "role": row["role"]
            }
    except psycopg.Error as e:
        raise RuntimeError(f"authenticate_user failed: {e}") from e

# --- Clienti ---
def create_cliente(ragione_sociale: str, p_iva: str):
    create_cliente_sql = """
    INSERT INTO clienti (ragione_sociale, partita_iva) VALUES (%s, %s)
    RETURNING id, ragione_sociale, partita_iva;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_cliente_sql, (ragione_sociale, p_iva)).fetchone()
            conn.commit()
            return row
    except UniqueViolation:
        raise ValueError("Ragione sociale or partita IVA already exists") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_cliente failed: {e}") from e

def get_clienti():
    get_clienti_sql = """
    SELECT id, ragione_sociale, partita_iva FROM clienti ORDER BY ragione_sociale ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_clienti_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_clienti failed: {e}") from e

def get_cliente_by_id(cliente_id: int):
    get_cliente_by_id_sql = """
    SELECT id, ragione_sociale, partita_iva FROM clienti WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_cliente_by_id_sql, (cliente_id,)).fetchone()
            if row is None:
                raise ValueError("Cliente not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_cliente_by_id failed: {e}") from e

def update_cliente(cliente_id: int, ragione_sociale: str, partita_iva: str):
    update_cliente_sql = """
    UPDATE clienti SET ragione_sociale = %s, partita_iva = %s WHERE id = %s
    RETURNING id, ragione_sociale, partita_iva;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_cliente_sql, (ragione_sociale, partita_iva, cliente_id)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("Cliente not found")
            return row
    except UniqueViolation:
        raise ValueError("Ragione sociale or partita IVA already exists") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_cliente failed: {e}") from e

def delete_cliente(cliente_id: int):
    delete_cliente_sql = """
    DELETE FROM clienti WHERE id = %s RETURNING id, ragione_sociale, partita_iva;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_cliente_sql, (cliente_id,)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("Cliente not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("Cliente in use") from None
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
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Cliente not found") from None
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

def get_commessa_by_id(commessa_id: int):
    get_commessa_by_id_sql = """
    SELECT id, cliente_id, data_inizio, data_fine, nome, descrizione, stato, budget, ST_Y(posizione) AS lat, ST_X(posizione) AS lon
    FROM commesse WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_commessa_by_id_sql, (commessa_id,)).fetchone()
            if row is None:
                raise ValueError("Commessa not found")
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
                raise ValueError("Commessa not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("Cliente not found") from None
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
                raise ValueError("Commessa not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_commessa failed: {e}") from e

# --- Ticket ---
def create_ticket(commessa_id: int, nome: str, descrizione: str | None, costo_totale: float, stato: str):
    create_ticket_sql = """
    INSERT INTO ticket (commessa_id, nome, descrizione, costo_totale, stato) VALUES (%s, %s, %s, %s, %s)
    RETURNING id, commessa_id, nome, descrizione, costo_totale, stato;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_ticket_sql, (commessa_id, nome, descrizione, costo_totale, stato)).fetchone()
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("Commessa not found") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_ticket failed: {e}") from e

def get_tickets():
    get_tickets_sql = """
    SELECT id, commessa_id, nome, descrizione, costo_totale, stato FROM ticket ORDER BY id ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_tickets_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_tickets failed: {e}") from e

def get_ticket_by_id(ticket_id: int):
    get_ticket_by_id_sql = """
    SELECT id, commessa_id, nome, descrizione, costo_totale, stato FROM ticket WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_ticket_by_id_sql, (ticket_id,)).fetchone()
            if row is None:
                raise ValueError("Ticket not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_ticket_by_id failed: {e}") from e

def get_tickets_by_commessa_id(commessa_id: int):
    get_tickets_by_commessa_id_sql = """
    SELECT id, commessa_id, nome, descrizione, costo_totale, stato FROM ticket WHERE commessa_id = %s ORDER BY id ASC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_tickets_by_commessa_id_sql, (commessa_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_tickets_by_commessa_id failed: {e}") from e

def update_ticket(ticket_id: int, commessa_id: int, nome: str, descrizione: str | None, costo_totale: float, stato: str):
    update_ticket_sql = """
    UPDATE ticket SET commessa_id = %s, nome = %s, descrizione = %s, costo_totale = %s, stato = %s WHERE id = %s
    RETURNING id, commessa_id, nome, descrizione, costo_totale, stato;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_ticket_sql, (commessa_id, nome, descrizione, costo_totale, stato, ticket_id)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("Ticket not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("Commessa not found") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_ticket failed: {e}") from e

def delete_ticket(ticket_id: int):
    delete_ticket_sql = """
    DELETE FROM ticket WHERE id = %s RETURNING id, commessa_id, nome, descrizione, costo_totale, stato;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_ticket_sql, (ticket_id,)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("Ticket not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_ticket failed: {e}") from e

# --- Interventi ---
def create_intervento(user_id: int, cliente_id: int, ticket_id: int | None, ore_lavorate: int, ore_totali: int, data: date):
    create_intervento_sql = """
    INSERT INTO interventi (user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data) VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(create_intervento_sql, (user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data)).fetchone()
            conn.commit()
            return row
    except ForeignKeyViolation:
        raise ValueError("User, cliente or ticket not found") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_intervento failed: {e}") from e

def get_interventi():
    get_interventi_sql = """
    SELECT id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data FROM interventi ORDER BY data DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_interventi_sql).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_interventi failed: {e}") from e

def get_intervento_by_id(intervento_id: int):
    get_intervento_by_id_sql = """
    SELECT id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data FROM interventi WHERE id = %s;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(get_intervento_by_id_sql, (intervento_id,)).fetchone()
            if row is None:
                raise ValueError("Intervento not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"get_intervento_by_id failed: {e}") from e

def get_interventi_by_user_id(user_id: int):
    get_interventi_by_user_id_sql = """
    SELECT id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data FROM interventi WHERE user_id = %s ORDER BY data DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_interventi_by_user_id_sql, (user_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_interventi_by_user_id failed: {e}") from e

def get_interventi_by_cliente_id(cliente_id: int):
    get_interventi_by_cliente_id_sql = """
    SELECT id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data FROM interventi WHERE cliente_id = %s ORDER BY data DESC;
    """
    try:
        with get_connection() as conn:
            return conn.execute(get_interventi_by_cliente_id_sql, (cliente_id,)).fetchall()
    except psycopg.Error as e:
        raise RuntimeError(f"get_interventi_by_cliente_id failed: {e}") from e

def update_intervento(intervento_id: int, user_id: int, cliente_id: int, ticket_id: int | None, ore_lavorate: int, ore_totali: int, data: date):
    update_intervento_sql = """
    UPDATE interventi SET user_id = %s, cliente_id = %s, ticket_id = %s, ore_lavorate = %s, ore_totali = %s, data = %s WHERE id = %s
    RETURNING id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(update_intervento_sql, (user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data, intervento_id)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("Intervento not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("User, cliente or ticket not found") from None
    except psycopg.Error as e:
        raise RuntimeError(f"update_intervento failed: {e}") from e

def delete_intervento(intervento_id: int):
    delete_intervento_sql = """
    DELETE FROM interventi WHERE id = %s RETURNING id, user_id, cliente_id, ticket_id, ore_lavorate, ore_totali, data;
    """
    try:
        with get_connection() as conn:
            row = conn.execute(delete_intervento_sql, (intervento_id,)).fetchone()
            conn.commit()
            if row is None:
                raise ValueError("Intervento not found")
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
                raise ValueError("Materiale not found")
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
                raise ValueError("Materiale not found")
            return row
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
                raise ValueError("Materiale not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("Materiale in use") from None
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
        raise ValueError("Commessa or materiale not found") from None
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
                raise ValueError("Materiale utilizzato not found")
            return row
    except ForeignKeyViolation:
        raise ValueError("Materiale not found") from None
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
                raise ValueError("Materiale utilizzato not found")
            return row
    except psycopg.Error as e:
        raise RuntimeError(f"delete_materiale_utilizzato failed: {e}") from e
