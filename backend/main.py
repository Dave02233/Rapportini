from fastapi import FastAPI, HTTPException, Depends

import BaseModels
import database
import auth

app = FastAPI()

database.init_db()

@app.get("/health")
def health():
    return {"ok": True}

# --- Users ---
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

@app.get("/users")
def get_users(current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        users = database.get_users()
        return users
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/users/{user_id}")
def get_user(user_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        user = database.get_user_by_id(user_id)
        return user
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/users/{user_id}")
def update_user(user_id: int, user: BaseModels.UserUpdate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if user.role not in ("tecnico", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    try:
        updated = database.update_user(user_id, user.username, user.role, user.costo_orario)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/users/{user_id}")
def delete_user(user_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        deleted = database.delete_user(user_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.post("/users/positions")
def insert_user_position(position: BaseModels.PositionCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        created = database.insert_user_position(int(current_user["sub"]), position.lat, position.lon)
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

# --- Clienti ---
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
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/clienti/{cliente_id}")
def update_cliente(cliente_id: int, cliente: BaseModels.ClientCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        updated = database.update_cliente(cliente_id, cliente.ragione_sociale, cliente.partita_iva)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/clienti/{cliente_id}")
def delete_cliente(cliente_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        deleted = database.delete_cliente(cliente_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

# --- Commesse ---
@app.post("/commesse")
def create_commessa(commessa: BaseModels.CommessaCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if commessa.stato not in ("in_corso", "completata", "annullata"):
        raise HTTPException(status_code=400, detail="Invalid stato")
    try:
        created = database.create_commessa(commessa.cliente_id, commessa.data_inizio, commessa.data_fine, commessa.nome, commessa.descrizione, commessa.stato, commessa.budget, commessa.lat, commessa.lon)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/commesse")
def get_commesse(current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        commesse = database.get_commesse()
        return commesse
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/commesse/{commessa_id}")
def get_commessa(commessa_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        commessa = database.get_commessa_by_id(commessa_id)
        return commessa
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/clienti/{cliente_id}/commesse")
def get_commesse_by_cliente(cliente_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        commesse = database.get_commesse_by_cliente_id(cliente_id)
        return commesse
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/commesse/{commessa_id}")
def update_commessa(commessa_id: int, commessa: BaseModels.CommessaCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if commessa.stato not in ("in_corso", "completata", "annullata"):
        raise HTTPException(status_code=400, detail="Invalid stato")
    try:
        updated = database.update_commessa(commessa_id, commessa.cliente_id, commessa.data_inizio, commessa.data_fine, commessa.nome, commessa.descrizione, commessa.stato, commessa.budget, commessa.lat, commessa.lon)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/commesse/{commessa_id}")
def delete_commessa(commessa_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        deleted = database.delete_commessa(commessa_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

# --- Ticket ---
@app.post("/ticket")
def create_ticket(ticket: BaseModels.TicketCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if ticket.stato not in ("in_corso", "completato", "annullato"):
        raise HTTPException(status_code=400, detail="Invalid stato")
    try:
        created = database.create_ticket(ticket.commessa_id, ticket.nome, ticket.descrizione, ticket.costo_totale, ticket.stato)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/ticket")
def get_tickets(current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        tickets = database.get_tickets()
        return tickets
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/ticket/{ticket_id}")
def get_ticket(ticket_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        ticket = database.get_ticket_by_id(ticket_id)
        return ticket
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/commesse/{commessa_id}/ticket")
def get_tickets_by_commessa(commessa_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        tickets = database.get_tickets_by_commessa_id(commessa_id)
        return tickets
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/ticket/{ticket_id}")
def update_ticket(ticket_id: int, ticket: BaseModels.TicketCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    if ticket.stato not in ("in_corso", "completato", "annullato"):
        raise HTTPException(status_code=400, detail="Invalid stato")
    try:
        updated = database.update_ticket(ticket_id, ticket.commessa_id, ticket.nome, ticket.descrizione, ticket.costo_totale, ticket.stato)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/ticket/{ticket_id}")
def delete_ticket(ticket_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        deleted = database.delete_ticket(ticket_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

# --- Interventi ---
@app.post("/interventi")
def create_intervento(intervento: BaseModels.InterventoCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    user_id = int(current_user["sub"])
    if current_user["role"] == "admin" and intervento.user_id is not None:
        user_id = intervento.user_id
    try:
        created = database.create_intervento(user_id, intervento.cliente_id, intervento.ticket_id, intervento.ore_lavorate, intervento.ore_totali, intervento.data)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/interventi")
def get_interventi(current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        if current_user["role"] == "admin":
            interventi = database.get_interventi()
        else:
            interventi = database.get_interventi_by_user_id(int(current_user["sub"]))
        return interventi
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/interventi/{intervento_id}")
def get_intervento(intervento_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        intervento = database.get_intervento_by_id(intervento_id)
        if current_user["role"] == "tecnico" and intervento["user_id"] != int(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Forbidden")
        return intervento
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/users/{user_id}/interventi")
def get_interventi_by_user(user_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        interventi = database.get_interventi_by_user_id(user_id)
        return interventi
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/clienti/{cliente_id}/interventi")
def get_interventi_by_cliente(cliente_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        interventi = database.get_interventi_by_cliente_id(cliente_id)
        return interventi
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/interventi/{intervento_id}")
def update_intervento(intervento_id: int, intervento: BaseModels.InterventoCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        existing = database.get_intervento_by_id(intervento_id)
        if current_user["role"] == "tecnico" and existing["user_id"] != int(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Forbidden")
        user_id = existing["user_id"]
        if current_user["role"] == "admin" and intervento.user_id is not None:
            user_id = intervento.user_id
        updated = database.update_intervento(intervento_id, user_id, intervento.cliente_id, intervento.ticket_id, intervento.ore_lavorate, intervento.ore_totali, intervento.data)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/interventi/{intervento_id}")
def delete_intervento(intervento_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] not in ("admin", "tecnico"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        if current_user["role"] == "tecnico":
            existing = database.get_intervento_by_id(intervento_id)
            if existing["user_id"] != int(current_user["sub"]):
                raise HTTPException(status_code=403, detail="Forbidden")
        deleted = database.delete_intervento(intervento_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

# --- Materiali ---
@app.post("/materiali")
def create_materiale(materiale: BaseModels.MaterialeCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        created = database.create_materiale(materiale.nome, materiale.descrizione, materiale.costo_unitario, materiale.unita, materiale.fornitore)
        return created
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/materiali")
def get_materiali(current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        materiali = database.get_materiali()
        return materiali
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/materiali/{materiale_id}")
def get_materiale(materiale_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        materiale = database.get_materiale_by_id(materiale_id)
        return materiale
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/materiali/{materiale_id}")
def update_materiale(materiale_id: int, materiale: BaseModels.MaterialeCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        updated = database.update_materiale(materiale_id, materiale.nome, materiale.descrizione, materiale.costo_unitario, materiale.unita, materiale.fornitore)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/materiali/{materiale_id}")
def delete_materiale(materiale_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        deleted = database.delete_materiale(materiale_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

# --- Materiali utilizzati ---
@app.post("/materiali-utilizzati")
def create_materiale_utilizzato(materiale: BaseModels.MaterialeUtilizzatoCreate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        created = database.create_materiale_utilizzato(materiale.commessa_id, materiale.materiale_id, materiale.nome, materiale.quantita, materiale.costo_totale)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.get("/commesse/{commessa_id}/materiali-utilizzati")
def get_materiali_utilizzati(commessa_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        materiali = database.get_materiali_utilizzati(commessa_id)
        return materiali
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.put("/materiali-utilizzati/{materiale_utilizzato_id}")
def update_materiale_utilizzato(materiale_utilizzato_id: int, materiale: BaseModels.MaterialeUtilizzatoUpdate, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        updated = database.update_materiale_utilizzato(materiale_utilizzato_id, materiale.materiale_id, materiale.nome, materiale.quantita, materiale.costo_totale)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.delete("/materiali-utilizzati/{materiale_utilizzato_id}")
def delete_materiale_utilizzato(materiale_utilizzato_id: int, current_user=Depends(auth.get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        deleted = database.delete_materiale_utilizzato(materiale_utilizzato_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
