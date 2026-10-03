import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../api";
import AppHeader from "../components/AppHeader";
import "./AppHome.css";
import "./NuovoIntervento.css";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateInput(value) {
  if (!value) return todayISO();
  if (typeof value === "string") return value.slice(0, 10);
  return todayISO();
}

export default function NuovoIntervento() {
  const { interventoId } = useParams();
  const isEdit = Boolean(interventoId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const base = isAdmin ? "/admin" : "/app";

  const [users, setUsers] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [commesse, setCommesse] = useState([]);
  const [tickets, setTickets] = useState([]);

  const [userId, setUserId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [commessaId, setCommessaId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [oreLavorate, setOreLavorate] = useState("");
  const [oreViaggio, setOreViaggio] = useState("0");
  const [km, setKm] = useState("0");
  const [note, setNote] = useState("");
  const [data, setData] = useState(todayISO());

  const [loadingPage, setLoadingPage] = useState(isEdit);
  const [loadingClienti, setLoadingClienti] = useState(true);
  const [loadingCommesse, setLoadingCommesse] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoadingClienti(true);
      setError(null);
      try {
        const [clientiList, usersList] = await Promise.all([
          apiFetch("/clienti"),
          isAdmin ? apiFetch("/users") : [],
        ]);
        if (cancelled) return;
        setClienti(clientiList || []);
        setUsers(usersList || []);

        if (!isEdit) {
          setLoadingClienti(false);
          return;
        }

        setLoadingPage(true);
        const intervento = await apiFetch(`/interventi/${interventoId}`);
        if (cancelled) return;

        setOreLavorate(String(intervento.ore_lavorate ?? ""));
        setOreViaggio(String(intervento.ore_viaggio ?? 0));
        setKm(String(intervento.km ?? 0));
        setNote(intervento.note || "");
        setData(toDateInput(intervento.data));
        setUserId(String(intervento.user_id));
        setClienteId(String(intervento.cliente_id));

        const commesseList = await apiFetch(
          `/clienti/${intervento.cliente_id}/commesse`
        );
        if (cancelled) return;
        setCommesse(commesseList || []);

        if (intervento.ticket_id != null) {
          const ticket = await apiFetch(`/ticket/${intervento.ticket_id}`);
          if (cancelled) return;
          setCommessaId(String(ticket.commessa_id));
          const ticketsList = await apiFetch(
            `/commesse/${ticket.commessa_id}/ticket`
          );
          if (cancelled) return;
          setTickets(ticketsList || []);
          setTicketId(String(intervento.ticket_id));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Impossibile caricare i dati");
        }
      } finally {
        if (!cancelled) {
          setLoadingClienti(false);
          setLoadingPage(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [isEdit, interventoId, isAdmin]);

  async function loadCommesseForCliente(id) {
    setLoadingCommesse(true);
    setError(null);
    try {
      const list = await apiFetch(`/clienti/${id}/commesse`);
      setCommesse(list || []);
    } catch (err) {
      setError(err.message || "Impossibile caricare le commesse");
      setCommesse([]);
    } finally {
      setLoadingCommesse(false);
    }
  }

  async function loadTicketsForCommessa(id) {
    setLoadingTickets(true);
    setError(null);
    try {
      const list = await apiFetch(`/commesse/${id}/ticket`);
      setTickets(list || []);
    } catch (err) {
      setError(err.message || "Impossibile caricare i ticket");
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }

  function onChangeCliente(value) {
    setClienteId(value);
    setCommessaId("");
    setTicketId("");
    setTickets([]);
    setCommesse([]);
    if (value) loadCommesseForCliente(value);
  }

  function onChangeCommessa(value) {
    setCommessaId(value);
    setTicketId("");
    setTickets([]);
    if (value) loadTicketsForCommessa(value);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isAdmin && !userId) {
      setError("Seleziona un tecnico");
      return;
    }
    if (!clienteId) {
      setError("Seleziona un cliente");
      return;
    }

    const oreL = Number(oreLavorate);
    const oreV = Number(oreViaggio);
    const kmN = Number(km);
    if (!Number.isFinite(oreL) || oreL <= 0) {
      setError("Le ore lavorate devono essere maggiori di zero");
      return;
    }
    if (!Number.isFinite(oreV) || oreV < 0) {
      setError("Le ore di viaggio non possono essere negative");
      return;
    }
    if (!Number.isFinite(kmN) || kmN < 0) {
      setError("I km non possono essere negativi");
      return;
    }
    const oreT = oreL + oreV;

    const body = {
      user_id: isAdmin ? Number(userId) : null,
      cliente_id: Number(clienteId),
      ticket_id: ticketId ? Number(ticketId) : null,
      ore_lavorate: oreL,
      ore_viaggio: oreV,
      km: kmN,
      ore_totali: oreT,
      data,
      note: note.trim() ? note.trim() : null,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await apiFetch(`/interventi/${interventoId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/interventi", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      navigate(base, { replace: true });
    } catch (err) {
      setError(err.message || (isEdit ? "Aggiornamento non riuscito" : "Salvataggio non riuscito"));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || loadingClienti || loadingPage;

  return (
    <div className="nuovo">
      <AppHeader />

      <main className="nuovo__main">
        <p className="nuovo__back">
          <Link to={base}>← Torna agli interventi</Link>
        </p>
        <h2>{isEdit ? "Aggiorna intervento" : "Nuovo intervento"}</h2>
        <p className="nuovo__lead">
          {isAdmin ? "Tecnico e cliente obbligatori." : "Cliente obbligatorio."}{" "}
          Commessa e ticket sono opzionali.
        </p>

        {loadingPage && <p className="nuovo__hint">Caricamento intervento…</p>}

        <form className="nuovo__form" onSubmit={handleSubmit}>
          {isAdmin && (
            <div className="nuovo__field">
              <label htmlFor="user">Tecnico</label>
              <select
                id="user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                disabled={busy}
              >
                <option value="">
                  {loadingClienti ? "Caricamento…" : "Seleziona tecnico"}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                    {u.role === "admin" ? " (admin)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="nuovo__field">
            <label htmlFor="cliente">Cliente</label>
            <select
              id="cliente"
              value={clienteId}
              onChange={(e) => onChangeCliente(e.target.value)}
              required
              disabled={busy}
            >
              <option value="">
                {loadingClienti ? "Caricamento…" : "Seleziona cliente"}
              </option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ragione_sociale}
                </option>
              ))}
            </select>
          </div>

          <div className="nuovo__field">
            <label htmlFor="commessa">
              Commessa <span className="nuovo__optional">(opzionale)</span>
            </label>
            <select
              id="commessa"
              value={commessaId}
              onChange={(e) => onChangeCommessa(e.target.value)}
              disabled={!clienteId || loadingCommesse || busy}
            >
              <option value="">
                {!clienteId
                  ? "Prima seleziona un cliente"
                  : loadingCommesse
                    ? "Caricamento…"
                    : "Nessuna commessa"}
              </option>
              {commesse.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {clienteId && !loadingCommesse && commesse.length === 0 && (
              <p className="nuovo__hint">Nessuna commessa per questo cliente.</p>
            )}
          </div>

          <div className="nuovo__field">
            <label htmlFor="ticket">
              Ticket <span className="nuovo__optional">(opzionale)</span>
            </label>
            <select
              id="ticket"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              disabled={!commessaId || loadingTickets || busy}
            >
              <option value="">
                {!commessaId
                  ? "Prima seleziona una commessa"
                  : loadingTickets
                    ? "Caricamento…"
                    : "Nessun ticket"}
              </option>
              {tickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="nuovo__row">
            <div className="nuovo__field">
              <label htmlFor="ore_lavorate">Ore lavorate</label>
              <input
                id="ore_lavorate"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={oreLavorate}
                onChange={(e) => setOreLavorate(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <div className="nuovo__field">
              <label htmlFor="ore_viaggio">Ore viaggio</label>
              <input
                id="ore_viaggio"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={oreViaggio}
                onChange={(e) => setOreViaggio(e.target.value)}
                required
                disabled={busy}
              />
            </div>
          </div>

          <div className="nuovo__row">
            <div className="nuovo__field">
              <label htmlFor="km">Km</label>
              <input
                id="km"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <div className="nuovo__field">
              <label htmlFor="ore_totali">Ore totali</label>
              <input
                id="ore_totali"
                type="number"
                value={
                  oreLavorate === "" && oreViaggio === ""
                    ? ""
                    : (Number(oreLavorate) || 0) + (Number(oreViaggio) || 0)
                }
                readOnly
                disabled
                title="Somma di ore lavorate e ore viaggio"
              />
              <p className="nuovo__hint">Calcolato: lavorate + viaggio</p>
            </div>
          </div>

          <div className="nuovo__field">
            <label htmlFor="data">Data</label>
            <input
              id="data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <div className="nuovo__field">
            <label htmlFor="note">
              Note <span className="nuovo__optional">(opzionale)</span>
            </label>
            <textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && <p className="nuovo__error">{error}</p>}

          <div className="nuovo__actions">
            <button className="nuovo__submit" type="submit" disabled={busy}>
              {submitting
                ? isEdit
                  ? "Aggiornamento…"
                  : "Salvataggio…"
                : isEdit
                  ? "Aggiorna"
                  : "Salva intervento"}
            </button>
            <Link className="nuovo__cancel" to={base}>
              Annulla
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
