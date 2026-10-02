from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel

import database
import auth

class UserCreate(BaseModel):
    username: str
    password: str
    role: str

class Login(BaseModel):
    username: str
    password: str

app = FastAPI()

database.init_db()

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/users")
def create_user(user: UserCreate, current_user=Depends(auth.get_current_user)):

    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if user.role not in ("tecnico", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")

    try:
        created = database.create_user(user.username, user.password, user.role)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.post("/login")
def login(login: Login):
    try:
        authenticated = database.authenticate_user(login.username, login.password)
        token = auth.create_token(authenticated["id"], authenticated["role"])
        return {"access_token": token, "token_type": "Bearer"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
