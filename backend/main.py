from fastapi import FastAPI, HTTPException, Depends

import BaseModels
import database
import auth

app = FastAPI()

database.init_db()

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/users")
def create_user(user: BaseModels.UserCreate, current_user=Depends(auth.get_current_user)):

    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if user.role not in ("tecnico", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")

    try:
        created = database.create_user(user.username, user.password, user.role, user.costo_orario)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.post("/login")
def login(login: BaseModels.Login):
    try:
        authenticated = database.authenticate_user(login.username, login.password)
        token = auth.create_token(authenticated["id"], authenticated["role"])
        return {"access_token": token, "token_type": "Bearer"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.post("/clienti")
def create_cliente(cliente: BaseModels.ClientCreate, current_user=Depends(auth.get_current_user)):

    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        created = database.create_cliente(cliente.ragione_sociale, cliente.partita_iva)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/clienti")
def get_clienti(current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        clienti = database.get_clienti()
        return clienti
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/clienti/{cliente_id}")
def get_cliente(cliente_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        cliente = database.get_cliente_by_id(cliente_id)
        return cliente
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

