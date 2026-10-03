from datetime import date
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    costo_orario: float

class UserUpdate(BaseModel):
    username: str
    role: str
    costo_orario: float

class PositionCreate(BaseModel):
    lat: float
    lon: float

class Login(BaseModel):
    username: str
    password: str

class ClientCreate(BaseModel):
    ragione_sociale: str
    partita_iva: str

class CommessaCreate(BaseModel):
    cliente_id: int
    data_inizio: date | None = None
    data_fine: date | None = None
    nome: str
    descrizione: str | None = None
    stato: str
    budget: float
    lat: float
    lon: float

class TicketCreate(BaseModel):
    commessa_id: int
    nome: str
    descrizione: str | None = None
    stato: str

class InterventoCreate(BaseModel):
    user_id: int | None = None
    cliente_id: int
    ticket_id: int | None = None
    ore_lavorate: int
    ore_viaggio: int = 0
    km: int = 0
    ore_totali: int
    data: date
    note: str | None = None

class MaterialeCreate(BaseModel):
    nome: str
    descrizione: str | None = None
    costo_unitario: float
    unita: str
    fornitore: str | None = None

class MaterialeUtilizzatoCreate(BaseModel):
    commessa_id: int
    materiale_id: int | None = None
    nome: str
    quantita: int
    costo_totale: float

class MaterialeUtilizzatoUpdate(BaseModel):
    materiale_id: int | None = None
    nome: str
    quantita: int
    costo_totale: float
