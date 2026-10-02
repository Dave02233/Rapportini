from dotenv import load_dotenv
import os
import psycopg
from psycopg.errors import UniqueViolation
import hash

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL == None:
    raise ValueError("DATABASE_URL is not set")

def get_connection():
    return psycopg.connect(DATABASE_URL)

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
    user_id INTEGER NOT NULL REFERENCES users(id),
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
    commessa_id INTEGER NOT NULL REFERENCES commesse(id),
    nome TEXT NOT NULL, 
    descrizione TEXT,
    costo_totale NUMERIC(10, 2) NOT NULL,
    stato TEXT NOT NULL CHECK (stato IN ('in_corso', 'completato', 'annullato'))
    );

    CREATE TABLE IF NOT EXISTS interventi (
    id SERIAL PRIMARY KEY, 
    cliente_id INTEGER NOT NULL REFERENCES clienti(id),
    ticket_id INTEGER REFERENCES ticket(id),
    ore_lavorate INTEGER NOT NULL, 
    ore_totali INTEGER NOT NULL, 
    data DATE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materiali (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL, 
    descrizione TEXT,
    costo_unitario NUMERIC(5, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materiali_utilizzati (
    id SERIAL PRIMARY KEY,
    materiale_id INTEGER NOT NULL REFERENCES materiali(id),
    commessa_id INTEGER NOT NULL REFERENCES commesse(id),
    nome TEXT NOT NULL, 
    descrizione TEXT,
    costo_unitario NUMERIC(5, 2) NOT NULL,
    quantita INTEGER NOT NULL
    );
    """

    try:
        with get_connection() as conn:
            conn.execute(init_sql)
            conn.commit()
    except psycopg.Error as e:
        raise RuntimeError(f"init_db failed: {e}") from e

def create_user(username: str, password: str, role: str):

    create_sql = """
    INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)
    RETURNING id, username, role;
    """

    password_hash = hash.hash_password(password)
    try:
        with get_connection() as conn:
            row = conn.execute(create_sql, (username, password_hash, role)).fetchone()
            conn.commit()
            return {
                "id": row[0],
                "username": row[1],
                "role": row[2]
            }

    except UniqueViolation:
        raise ValueError("Username already exists") from None
    except psycopg.Error as e:
        raise RuntimeError(f"create_user failed: {e}") from e

def authenticate_user(username: str, password: str):

    authenticate_sql = """
    SELECT id, username, password_hash, role FROM users WHERE username = %s;
    """

    try:
        with get_connection() as conn:
            row = conn.execute(authenticate_sql, (username,)).fetchone()
            if row is None:
                raise ValueError("Invalid username or password")
            if not hash.verify_password(password, row[2]):
                raise ValueError("Invalid username or password")
            return {
                "id": row[0],
                "username": row[1],
                "role": row[3]
            }
    except psycopg.Error as e:
        raise RuntimeError(f"authenticate_user failed: {e}") from e