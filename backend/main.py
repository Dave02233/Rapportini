from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import date, datetime
from zoneinfo import ZoneInfo
import asyncio
import logging

import BaseModels
import database
import auth

log = logging.getLogger("uvicorn.error")

async def _loop_bozze():
    log.info("Bozze interventi: generazione ogni giorno alle 20:00 Europe/Rome")
    while True:
        try:
            n = await asyncio.to_thread(database.esegui_job_bozze)
            if n is not None:
                log.info("Bozze interventi generate: %s", n)
        except Exception:
            log.exception("Generazione bozze non riuscita")
            await asyncio.sleep(900)
            continue
        await asyncio.sleep(database.secondi_fino_alle_20())

@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(_loop_bozze())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()

DIST = (Path(__file__).parent.parent / "frontend" / "dist").resolve()

# I dettagli dell'errore DB finiscono nel log del server, non nella risposta al client
@app.exception_handler(RuntimeError)
async def errore_interno(request, exc):
    log.error(exc)
    return JSONResponse(status_code=500, content={"detail": "Errore interno del server"})

@app.get("/health")
def health():
    return {"ok": True}

# --- Users ---
@app.post("/users")
def create_user(user: BaseModels.UserCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_user(user.username, user.password, user.role, user.costo_orario, user.veicolo_predefinito)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/users")
def get_users(current_user=Depends(auth.require_admin)):
    users = database.get_users()
    return users

# Deve stare prima di /users/{user_id}: altrimenti "me" viene letto come id (422)
@app.get("/users/me")
def get_me(current_user=Depends(auth.get_current_user)):
    try:
        return database.get_user_by_id(int(current_user["sub"]))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.get("/users/{user_id}")
def get_user(user_id: int, current_user=Depends(auth.require_admin)):
    try:
        user = database.get_user_by_id(user_id)
        return user
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.put("/users/{user_id}")
def update_user(user_id: int, user: BaseModels.UserUpdate, current_user=Depends(auth.require_admin)):
    if user_id == int(current_user["sub"]) and user.role != "admin":
        raise HTTPException(status_code=409, detail="Non puoi cambiare il tuo ruolo")
    try:
        updated = database.update_user(
            user_id,
            user.username,
            user.role,
            user.costo_orario,
            user.veicolo_predefinito,
            user.password,
        )
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/users/{user_id}")
def delete_user(user_id: int, current_user=Depends(auth.require_admin)):
    if user_id == int(current_user["sub"]):
        raise HTTPException(status_code=409, detail="Non puoi eliminare il tuo utente")
    try:
        deleted = database.delete_user(user_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.post("/users/positions")
def insert_user_position(position: BaseModels.PositionCreate, current_user=Depends(auth.get_current_user)):
    try:
        created = database.insert_user_position(int(current_user["sub"]), position.lat, position.lon)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/users/{user_id}/positions")
def get_user_positions(user_id: int, dal: date | None = None, al: date | None = None, current_user=Depends(auth.require_admin)):
    try:
        return database.get_user_positions(user_id, dal, al)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/users/{user_id}/commesse-vicine")
def get_commesse_vicine(user_id: int, dal: date | None = None, al: date | None = None, current_user=Depends(auth.require_admin)):
    try:
        return database.get_commesse_vicine(user_id, dal, al)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/users/positions/{position_id}")
def delete_user_position(position_id: int, current_user=Depends(auth.require_admin)):
    try:
        return database.delete_user_position(position_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.post("/login")
def login(login: BaseModels.Login):
    try:
        authenticated = database.authenticate_user(login.username, login.password)
        token = auth.create_token(authenticated["id"], authenticated["role"])
        return {"access_token": token, "token_type": "Bearer"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

# --- Clienti ---
@app.post("/clienti")
def create_cliente(cliente: BaseModels.ClientCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_cliente(
            cliente.ragione_sociale,
            cliente.partita_iva,
            cliente.citta,
            cliente.via,
            cliente.cap,
        )
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/clienti")
def get_clienti(current_user=Depends(auth.get_current_user)):
    clienti = database.get_clienti()
    return clienti

@app.get("/clienti/{cliente_id}")
def get_cliente(cliente_id: int, current_user=Depends(auth.get_current_user)):
    try:
        cliente = database.get_cliente_by_id(cliente_id)
        return cliente
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.put("/clienti/{cliente_id}")
def update_cliente(cliente_id: int, cliente: BaseModels.ClientCreate, current_user=Depends(auth.require_admin)):
    try:
        updated = database.update_cliente(
            cliente_id,
            cliente.ragione_sociale,
            cliente.partita_iva,
            cliente.citta,
            cliente.via,
            cliente.cap,
        )
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/clienti/{cliente_id}")
def delete_cliente(cliente_id: int, current_user=Depends(auth.require_admin)):
    try:
        deleted = database.delete_cliente(cliente_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

# --- Offerte ---
@app.get("/offerte")
def get_offerte(current_user=Depends(auth.require_admin)):
    return database.get_offerte()

@app.post("/offerte")
def create_offerta(offerta: BaseModels.OffertaCreate, current_user=Depends(auth.require_admin)):
    try:
        return database.create_offerta(
            offerta.cliente_id,
            offerta.nome,
            offerta.prezzo_iniziale,
            offerta.sconto,
            offerta.prezzo_finale,
            offerta.data_invio,
            offerta.data_risposta,
            offerta.esito,
            offerta.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.put("/offerte/{offerta_id}")
def update_offerta(offerta_id: int, offerta: BaseModels.OffertaCreate, current_user=Depends(auth.require_admin)):
    try:
        return database.update_offerta(
            offerta_id,
            offerta.cliente_id,
            offerta.nome,
            offerta.prezzo_iniziale,
            offerta.sconto,
            offerta.prezzo_finale,
            offerta.data_invio,
            offerta.data_risposta,
            offerta.esito,
            offerta.note,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/offerte/{offerta_id}")
def delete_offerta(offerta_id: int, current_user=Depends(auth.require_admin)):
    try:
        return database.delete_offerta(offerta_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.post("/offerte/{offerta_id}/commessa")
def promuovi_offerta(offerta_id: int, body: BaseModels.OffertaCommessa, current_user=Depends(auth.require_admin)):
    try:
        return database.promuovi_offerta(offerta_id, body.lat, body.lon)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

# --- Commesse ---
@app.post("/commesse")
def create_commessa(commessa: BaseModels.CommessaCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_commessa(commessa.cliente_id, commessa.data_inizio, commessa.data_fine, commessa.nome, commessa.descrizione, commessa.stato, commessa.budget, commessa.lat, commessa.lon)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/commesse")
def get_commesse(current_user=Depends(auth.get_current_user)):
    commesse = database.get_commesse()
    return commesse

# Deve stare prima di /commesse/{commessa_id}: altrimenti "riepilogo" viene letto come id (422)
@app.get("/commesse/riepilogo")
def get_commesse_riepilogo(current_user=Depends(auth.require_admin)):
    return database.get_commesse_riepilogo()

@app.get("/commesse/{commessa_id}")
def get_commessa(commessa_id: int, current_user=Depends(auth.get_current_user)):
    try:
        commessa = database.get_commessa_by_id(commessa_id)
        return commessa
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.get("/clienti/{cliente_id}/commesse")
def get_commesse_by_cliente(cliente_id: int, current_user=Depends(auth.get_current_user)):
    commesse = database.get_commesse_by_cliente_id(cliente_id)
    return commesse

@app.put("/commesse/{commessa_id}")
def update_commessa(commessa_id: int, commessa: BaseModels.CommessaCreate, current_user=Depends(auth.require_admin)):
    try:
        updated = database.update_commessa(commessa_id, commessa.cliente_id, commessa.data_inizio, commessa.data_fine, commessa.nome, commessa.descrizione, commessa.stato, commessa.budget, commessa.lat, commessa.lon)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/commesse/{commessa_id}")
def delete_commessa(commessa_id: int, current_user=Depends(auth.require_admin)):
    try:
        deleted = database.delete_commessa(commessa_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

# --- Ticket ---
@app.post("/ticket")
def create_ticket(ticket: BaseModels.TicketCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_ticket(ticket.commessa_id, ticket.data_inizio, ticket.data_fine, ticket.nome, ticket.descrizione, ticket.stato)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/ticket")
def get_tickets(current_user=Depends(auth.get_current_user)):
    tickets = database.get_tickets()
    return tickets

@app.get("/ticket/{ticket_id}")
def get_ticket(ticket_id: int, current_user=Depends(auth.get_current_user)):
    try:
        ticket = database.get_ticket_by_id(ticket_id)
        return ticket
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.get("/commesse/{commessa_id}/ticket")
def get_tickets_by_commessa(commessa_id: int, current_user=Depends(auth.get_current_user)):
    tickets = database.get_tickets_by_commessa_id(commessa_id)
    return tickets

@app.put("/ticket/{ticket_id}")
def update_ticket(ticket_id: int, ticket: BaseModels.TicketCreate, current_user=Depends(auth.require_admin)):
    try:
        updated = database.update_ticket(ticket_id, ticket.commessa_id, ticket.data_inizio, ticket.data_fine, ticket.nome, ticket.descrizione, ticket.stato)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/ticket/{ticket_id}")
def delete_ticket(ticket_id: int, current_user=Depends(auth.require_admin)):
    try:
        deleted = database.delete_ticket(ticket_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

# --- Interventi ---
@app.post("/interventi")
def create_intervento(intervento: BaseModels.InterventoCreate, current_user=Depends(auth.get_current_user)):
    user_id = int(current_user["sub"])
    if current_user["role"] == "admin" and intervento.user_id is not None:
        user_id = intervento.user_id
    try:
        created = database.create_intervento(
            user_id,
            intervento.cliente_id,
            intervento.ticket_id,
            intervento.veicolo_id,
            intervento.ore_lavorate,
            intervento.ore_viaggio,
            intervento.km,
            intervento.ore_lavorate + intervento.ore_viaggio,
            intervento.data,
            intervento.descrizione,
            intervento.note_interne,
            intervento.note_esterne,
            intervento.trasferta,
        )
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.post("/interventi/bulk")
def create_interventi_bulk(body: BaseModels.InterventoBulkCreate, current_user=Depends(auth.get_current_user)):
    user_id = int(current_user["sub"])
    if current_user["role"] == "admin" and body.user_id is not None:
        user_id = body.user_id
    righe = [
        (
            user_id,
            body.cliente_id,
            body.ticket_id,
            body.veicolo_id,
            giorno.ore_lavorate,
            giorno.ore_viaggio,
            giorno.km,
            giorno.ore_lavorate + giorno.ore_viaggio,
            giorno.data,
            giorno.descrizione,
            giorno.note_interne,
            giorno.note_esterne,
            giorno.trasferta,
        )
        for giorno in body.giorni
    ]
    try:
        return database.create_interventi(righe)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/interventi")
def get_interventi(current_user=Depends(auth.get_current_user)):
    if current_user["role"] == "admin":
        interventi = database.get_interventi()
    else:
        interventi = database.get_interventi_by_user_id(int(current_user["sub"]))
    return interventi

@app.get("/interventi/{intervento_id}")
def get_intervento(intervento_id: int, current_user=Depends(auth.get_current_user)):
    try:
        intervento = database.get_intervento_by_id(intervento_id)
        if current_user["role"] == "tecnico" and intervento["user_id"] != int(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Operazione non consentita")
        return intervento
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.get("/users/{user_id}/interventi")
def get_interventi_by_user(user_id: int, current_user=Depends(auth.require_admin)):
    interventi = database.get_interventi_by_user_id(user_id)
    return interventi

@app.get("/clienti/{cliente_id}/interventi")
def get_interventi_by_cliente(cliente_id: int, current_user=Depends(auth.require_admin)):
    interventi = database.get_interventi_by_cliente_id(cliente_id)
    return interventi

@app.put("/interventi/{intervento_id}")
def update_intervento(intervento_id: int, intervento: BaseModels.InterventoCreate, current_user=Depends(auth.get_current_user)):
    try:
        existing = database.get_intervento_by_id(intervento_id)
        if current_user["role"] == "tecnico" and existing["user_id"] != int(current_user["sub"]):
            raise HTTPException(status_code=403, detail="Operazione non consentita")
        user_id = existing["user_id"]
        if current_user["role"] == "admin" and intervento.user_id is not None:
            user_id = intervento.user_id
        updated = database.update_intervento(
            intervento_id,
            user_id,
            intervento.cliente_id,
            intervento.ticket_id,
            intervento.veicolo_id,
            intervento.ore_lavorate,
            intervento.ore_viaggio,
            intervento.km,
            intervento.ore_lavorate + intervento.ore_viaggio,
            intervento.data,
            intervento.descrizione,
            intervento.note_interne,
            intervento.note_esterne,
            intervento.trasferta,
        )
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/interventi/{intervento_id}")
def delete_intervento(intervento_id: int, current_user=Depends(auth.get_current_user)):
    try:
        if current_user["role"] == "tecnico":
            existing = database.get_intervento_by_id(intervento_id)
            if existing["user_id"] != int(current_user["sub"]):
                raise HTTPException(status_code=403, detail="Operazione non consentita")
        deleted = database.delete_intervento(intervento_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

# --- Bozze interventi ---
def _bozza_visibile(bozza, current_user):
    if current_user["role"] == "tecnico" and bozza["user_id"] != int(current_user["sub"]):
        raise HTTPException(status_code=403, detail="Operazione non consentita")

@app.get("/bozze/notifica")
def notifica_bozza(current_user=Depends(auth.get_current_user)):
    oggi = datetime.now(ZoneInfo("Europe/Rome")).date()
    return {"presente": database.bozza_oggi(int(current_user["sub"]), oggi)}

@app.post("/bozze/genera")
def genera_bozze(body: BaseModels.BozzaGenera, current_user=Depends(auth.require_admin)):
    return {"inserite": database.genera_bozze(body.data)}

@app.get("/bozze")
def get_bozze(
    user_id: int | None = None,
    data: date | None = None,
    ordine: str = "desc",
    current_user=Depends(auth.get_current_user),
):
    solo_aperte = False
    if current_user["role"] == "tecnico":
        user_id = int(current_user["sub"])
        solo_aperte = True
    ordine_ok = "asc" if ordine == "asc" else "desc"
    return database.get_bozze(user_id, data, ordine_ok, solo_aperte)

@app.get("/bozze/{bozza_id}")
def get_bozza(bozza_id: int, current_user=Depends(auth.get_current_user)):
    try:
        bozza = database.get_bozza(bozza_id)
        _bozza_visibile(bozza, current_user)
        return bozza
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.post("/bozze/{bozza_id}/scarta")
def scarta_bozza(bozza_id: int, current_user=Depends(auth.get_current_user)):
    try:
        bozza = database.get_bozza(bozza_id)
        _bozza_visibile(bozza, current_user)
        return database.scarta_bozza(bozza_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.post("/bozze/{bozza_id}/conferma")
def conferma_bozza(bozza_id: int, intervento: BaseModels.InterventoCreate, current_user=Depends(auth.get_current_user)):
    try:
        bozza = database.get_bozza(bozza_id)
        _bozza_visibile(bozza, current_user)
        user_id = bozza["user_id"]
        if current_user["role"] == "admin" and intervento.user_id is not None:
            user_id = intervento.user_id
        return database.conferma_bozza(
            bozza_id,
            user_id,
            intervento.cliente_id,
            intervento.ticket_id,
            intervento.veicolo_id,
            intervento.ore_lavorate,
            intervento.ore_viaggio,
            intervento.km,
            intervento.ore_lavorate + intervento.ore_viaggio,
            intervento.data,
            intervento.descrizione,
            intervento.note_interne,
            intervento.note_esterne,
            intervento.trasferta,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

# --- Materiali ---
@app.post("/materiali")
def create_materiale(materiale: BaseModels.MaterialeCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_materiale(materiale.nome, materiale.descrizione, materiale.costo_unitario, materiale.unita, materiale.fornitore)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/materiali")
def get_materiali(current_user=Depends(auth.require_admin)):
    materiali = database.get_materiali()
    return materiali

@app.get("/materiali/{materiale_id}")
def get_materiale(materiale_id: int, current_user=Depends(auth.require_admin)):
    try:
        materiale = database.get_materiale_by_id(materiale_id)
        return materiale
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.put("/materiali/{materiale_id}")
def update_materiale(materiale_id: int, materiale: BaseModels.MaterialeCreate, current_user=Depends(auth.require_admin)):
    try:
        updated = database.update_materiale(materiale_id, materiale.nome, materiale.descrizione, materiale.costo_unitario, materiale.unita, materiale.fornitore)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/materiali/{materiale_id}")
def delete_materiale(materiale_id: int, current_user=Depends(auth.require_admin)):
    try:
        deleted = database.delete_materiale(materiale_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

# --- Materiali utilizzati ---
@app.post("/materiali-utilizzati")
def create_materiale_utilizzato(materiale: BaseModels.MaterialeUtilizzatoCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_materiale_utilizzato(materiale.commessa_id, materiale.materiale_id, materiale.nome, materiale.quantita, materiale.costo_totale)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/commesse/{commessa_id}/materiali-utilizzati")
def get_materiali_utilizzati(commessa_id: int, current_user=Depends(auth.require_admin)):
    materiali = database.get_materiali_utilizzati(commessa_id)
    return materiali

@app.put("/materiali-utilizzati/{materiale_utilizzato_id}")
def update_materiale_utilizzato(materiale_utilizzato_id: int, materiale: BaseModels.MaterialeUtilizzatoUpdate, current_user=Depends(auth.require_admin)):
    try:
        updated = database.update_materiale_utilizzato(materiale_utilizzato_id, materiale.materiale_id, materiale.nome, materiale.quantita, materiale.costo_totale)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/materiali-utilizzati/{materiale_utilizzato_id}")
def delete_materiale_utilizzato(materiale_utilizzato_id: int, current_user=Depends(auth.require_admin)):
    try:
        deleted = database.delete_materiale_utilizzato(materiale_utilizzato_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

# --- Costi d'intervento ---
@app.post("/costi-intervento")
def create_costo_intervento(costo: BaseModels.CostoInterventoCreate, current_user=Depends(auth.require_admin)):
    try:
        return database.create_costo_intervento(costo.commessa_id, costo.nome, costo.data, costo.costo)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/commesse/{commessa_id}/costi-intervento")
def get_costi_intervento(commessa_id: int, current_user=Depends(auth.require_admin)):
    return database.get_costi_intervento(commessa_id)

@app.put("/costi-intervento/{costo_intervento_id}")
def update_costo_intervento(costo_intervento_id: int, costo: BaseModels.CostoInterventoUpdate, current_user=Depends(auth.require_admin)):
    try:
        return database.update_costo_intervento(costo_intervento_id, costo.nome, costo.data, costo.costo)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.delete("/costi-intervento/{costo_intervento_id}")
def delete_costo_intervento(costo_intervento_id: int, current_user=Depends(auth.require_admin)):
    try:
        return database.delete_costo_intervento(costo_intervento_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

# --- Veicoli ---
@app.post("/veicoli")
def create_veicolo(veicolo: BaseModels.VeicoloCreate, current_user=Depends(auth.require_admin)):
    try:
        created = database.create_veicolo(veicolo.targa, veicolo.km, veicolo.costo_km)
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.get("/veicoli")
def get_veicoli(current_user=Depends(auth.get_current_user)):
    veicoli = database.get_veicoli()
    return veicoli

@app.get("/veicoli/{veicolo_id}")
def get_veicolo(veicolo_id: int, current_user=Depends(auth.get_current_user)):
    try:
        veicolo = database.get_veicolo_by_id(veicolo_id)
        return veicolo
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@app.put("/veicoli/{veicolo_id}")
def update_veicolo(veicolo_id: int, veicolo: BaseModels.VeicoloCreate, current_user=Depends(auth.require_admin)):
    try:
        updated = database.update_veicolo(veicolo_id, veicolo.targa, veicolo.km, veicolo.costo_km)
        return updated
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

@app.delete("/veicoli/{veicolo_id}")
def delete_veicolo(veicolo_id: int, current_user=Depends(auth.require_admin)):
    try:
        deleted = database.delete_veicolo(veicolo_id)
        return deleted
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    candidate = (DIST / full_path).resolve()
    if candidate.is_relative_to(DIST) and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(DIST / "index.html")
