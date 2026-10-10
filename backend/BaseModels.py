from datetime import date
from typing import Literal
from pydantic import BaseModel, Field, field_validator

Ruolo = Literal["tecnico", "admin"]
StatoCommessa = Literal["in_corso", "completata", "annullata"]
StatoTicket = Literal["in_corso", "completato", "annullato"]

class UserCreate(BaseModel):
    username: str
    password: str
    role: Ruolo
    costo_orario: float
    veicolo_predefinito: int | None = None

class UserUpdate(BaseModel):
    username: str
    role: Ruolo
    costo_orario: float
    veicolo_predefinito: int | None = None
    # Solo admin (rotta protetta); None / omesso = non cambiare la password
    password: str | None = None

class PositionCreate(BaseModel):
    lat: float
    lon: float

class Login(BaseModel):
    username: str
    password: str

class ClientCreate(BaseModel):
    ragione_sociale: str
    partita_iva: str
    citta: str | None = None
    via: str | None = None
    cap: str | None = None

class CommessaCreate(BaseModel):
    cliente_id: int
    data_inizio: date | None = None
    data_fine: date | None = None
    nome: str
    descrizione: str | None = None
    stato: StatoCommessa
    budget: float
    lat: float
    lon: float

class TicketCreate(BaseModel):
    commessa_id: int
    data_inizio: date | None = None
    data_fine: date | None = None
    nome: str
    descrizione: str | None = None
    stato: StatoTicket

class InterventoCreate(BaseModel):
    user_id: int | None = None
    cliente_id: int
    ticket_id: int | None = None
    veicolo_id: int | None = None
    ore_lavorate: float = Field(gt=0, multiple_of=0.5)
    ore_viaggio: float = Field(default=0, ge=0, multiple_of=0.5)
    km: int = Field(default=0, ge=0)
    data: date
    descrizione: str
    note_interne: str | None = None
    note_esterne: str | None = None
    trasferta: bool = False

    @field_validator("descrizione")
    @classmethod
    def descrizione_obbligatoria(cls, value: str) -> str:
        testo = value.strip()
        if not testo:
            raise ValueError("Descrizione obbligatoria")
        return testo

    @field_validator("note_interne", "note_esterne")
    @classmethod
    def note_trim(cls, value: str | None) -> str | None:
        if value is None:
            return None
        testo = value.strip()
        return testo or None

class InterventoGiorno(BaseModel):
    ore_lavorate: float = Field(gt=0, multiple_of=0.5)
    ore_viaggio: float = Field(default=0, ge=0, multiple_of=0.5)
    km: int = Field(default=0, ge=0)
    data: date
    descrizione: str
    note_interne: str | None = None
    note_esterne: str | None = None
    trasferta: bool = False

    @field_validator("descrizione")
    @classmethod
    def descrizione_obbligatoria(cls, value: str) -> str:
        testo = value.strip()
        if not testo:
            raise ValueError("Descrizione obbligatoria")
        return testo

    @field_validator("note_interne", "note_esterne")
    @classmethod
    def note_trim(cls, value: str | None) -> str | None:
        if value is None:
            return None
        testo = value.strip()
        return testo or None

class InterventoBulkCreate(BaseModel):
    user_id: int | None = None
    cliente_id: int
    ticket_id: int | None = None
    veicolo_id: int | None = None
    giorni: list[InterventoGiorno] = Field(min_length=1)

class BozzaGenera(BaseModel):
    data: date

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

class CostoInterventoUpdate(BaseModel):
    nome: str
    data: date
    costo: float = Field(ge=0)

    @field_validator("nome")
    @classmethod
    def nome_obbligatorio(cls, value: str) -> str:
        testo = value.strip()
        if not testo:
            raise ValueError("Nome obbligatorio")
        return testo

class CostoInterventoCreate(CostoInterventoUpdate):
    commessa_id: int

EsitoOfferta = Literal["accettata", "rifiutata", "in_attesa"]

class OffertaCreate(BaseModel):
    cliente_id: int
    nome: str
    prezzo_iniziale: float
    sconto: float
    prezzo_finale: float
    data_invio: date
    data_risposta: date | None = None
    esito: EsitoOfferta
    note: str | None = None

class OffertaCommessa(BaseModel):
    lat: float
    lon: float

class VeicoloCreate(BaseModel):
    targa: str
    km: int | None = Field(default=None, ge=0)
    costo_km: float = Field(default=0, ge=0)

    # "ab 123 cd" e "AB123CD" devono collidere sul UNIQUE
    @field_validator("targa")
    @classmethod
    def normalizza_targa(cls, value: str) -> str:
        targa = "".join(value.split()).upper()
        if not targa:
            raise ValueError("Targa obbligatoria")
        return targa
