from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    costo_orario: float

class ClientCreate(BaseModel):
    ragione_sociale: str
    partita_iva: str

class Login(BaseModel):
    username: str
    password: str