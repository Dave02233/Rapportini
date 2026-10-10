import { useEffect, useRef, useState } from "react";
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

function addDaysISO(iso, days) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  const base = y && m && d ? new Date(y, m - 1, d) : new Date();
  base.setDate(base.getDate() + days);
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${mm}-${dd}`;
}

function blankGiorno(data, key) {
  return {
    key,
    data,
    oreLavorate: "",
    oreViaggio: "0",
    km: "0",
    descrizione: "",
    noteInterne: "",
    noteEsterne: "",
    trasferta: false,
  };
}

function erroreGiorno(g) {
  const oreL = Number(g.oreLavorate);
  const oreV = Number(g.oreViaggio);
  const kmN = Number(g.km);
  if (!g.data) return "Inserisci la data";
  if (!Number.isInteger(oreL * 2) || oreL <= 0) {
    return "Le ore lavorate devono essere maggiori di zero, a multipli di 0,5 (es. 1,5)";
  }
  if (!Number.isInteger(oreV * 2) || oreV < 0) {
    return "Le ore di viaggio non possono essere negative e vanno a multipli di 0,5";
  }
  if (!Number.isInteger(kmN) || kmN < 0) return "I km non possono essere negativi";
  if (!g.descrizione.trim()) return "Inserisci una descrizione";
  return null;
}

function payloadGiorno(g) {
  return {
    ore_lavorate: Number(g.oreLavorate),
    ore_viaggio: Number(g.oreViaggio),
    km: Number(g.km),
    data: g.data,
    descrizione: g.descrizione.trim(),
    note_interne: g.noteInterne.trim() || null,
    note_esterne: g.noteEsterne.trim() || null,
    trasferta: g.trasferta,
  };
}

function CampiGiorno({ giorno, indice, totale, busy, senzaVeicolo, onChange, onRemove }) {
  const id = (nome) => `giorno-${giorno.key}-${nome}`;
  const oreTot =
    giorno.oreLavorate === "" && giorno.oreViaggio === ""
      ? ""
      : (Number(giorno.oreLavorate) || 0) + (Number(giorno.oreViaggio) || 0);

  return (
    <div className="nuovo__giorno">
      {totale > 1 && (
        <div className="nuovo__giorno-head">
          <span>Giorno {indice + 1}</span>
          {onRemove && (
            <button type="button" className="nuovo__rimuovi" onClick={onRemove} disabled={busy}>
              Rimuovi
            </button>
          )}
        </div>
      )}

      <div className="nuovo__field">
        <label htmlFor={id("data")}>Data</label>
        <input
          id={id("data")}
          type="date"
          value={giorno.data}
          onChange={(e) => onChange("data", e.target.value)}
          required
          disabled={busy}
        />
      </div>

      <div className="nuovo__row">
        <div className="nuovo__field">
          <label htmlFor={id("ore_lavorate")}>Ore lavorate</label>
          <input
            id={id("ore_lavorate")}
            type="number"
            min="0.5"
            step="0.5"
            inputMode="decimal"
            value={giorno.oreLavorate}
            onChange={(e) => onChange("oreLavorate", e.target.value)}
            required
            disabled={busy}
          />
        </div>
        <div className="nuovo__field">
          <label htmlFor={id("ore_viaggio")}>Ore viaggio</label>
          <input
            id={id("ore_viaggio")}
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={giorno.oreViaggio}
            onChange={(e) => onChange("oreViaggio", e.target.value)}
            required
            disabled={busy}
          />
        </div>
      </div>

      <label className="nuovo__check">
        <input
          type="checkbox"
          checked={giorno.trasferta}
          onChange={(e) => onChange("trasferta", e.target.checked)}
          disabled={busy}
        />
        Trasferta
      </label>

      <div className="nuovo__row">
        <div className="nuovo__field">
          <label htmlFor={id("km")}>Km</label>
          <input
            id={id("km")}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={giorno.km}
            onChange={(e) => onChange("km", e.target.value)}
            required
            disabled={busy || senzaVeicolo}
          />
          {senzaVeicolo && <p className="nuovo__hint">Seleziona un veicolo per inserire i km.</p>}
        </div>
        <div className="nuovo__field">
          <label htmlFor={id("ore_totali")}>Ore totali</label>
          <input
            id={id("ore_totali")}
            type="number"
            value={oreTot}
            readOnly
            disabled
            title="Somma di ore lavorate e ore viaggio"
          />
          <p className="nuovo__hint">Calcolato: lavorate + viaggio</p>
        </div>
      </div>

      <div className="nuovo__field">
        <label htmlFor={id("descrizione")}>Descrizione</label>
        <textarea
          id={id("descrizione")}
          rows={3}
          value={giorno.descrizione}
          onChange={(e) => onChange("descrizione", e.target.value)}
          required
          disabled={busy}
        />
      </div>

      <div className="nuovo__field">
        <label htmlFor={id("note_interne")}>
          Note interne <span className="nuovo__optional">(opzionale)</span>
        </label>
        <textarea
          id={id("note_interne")}
          rows={2}
          value={giorno.noteInterne}
          onChange={(e) => onChange("noteInterne", e.target.value)}
          disabled={busy}
        />
        <p className="nuovo__hint">Visibili in app, non finiscono sul PDF.</p>
      </div>

      <div className="nuovo__field">
        <label htmlFor={id("note_esterne")}>
          Note esterne <span className="nuovo__optional">(opzionale)</span>
        </label>
        <textarea
          id={id("note_esterne")}
          rows={2}
          value={giorno.noteEsterne}
          onChange={(e) => onChange("noteEsterne", e.target.value)}
          disabled={busy}
        />
        <p className="nuovo__hint">Compaiono in fondo al rapportino PDF.</p>
      </div>
    </div>
  );
}

export default function NuovoIntervento() {
  const { interventoId, bozzaId } = useParams();
  const isBozza = Boolean(bozzaId);
  const isEdit = Boolean(interventoId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const base = isAdmin ? "/admin" : "/app";

  const [users, setUsers] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [commesse, setCommesse] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [veicoli, setVeicoli] = useState([]);

  const [userId, setUserId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [commessaId, setCommessaId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [veicoloId, setVeicoloId] = useState("");
  const nextKey = useRef(2);
  const [giorni, setGiorni] = useState(() => [blankGiorno(todayISO(), 1)]);

  const [loadingPage, setLoadingPage] = useState(isEdit || isBozza);
  const [bozzaMeta, setBozzaMeta] = useState(null);
  const [bozzaChiusa, setBozzaChiusa] = useState(false);
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
        const [clientiList, usersList, veicoliList, me] = await Promise.all([
          apiFetch("/clienti"),
          isAdmin ? apiFetch("/users") : [],
          apiFetch("/veicoli"),
          !isAdmin && !isEdit ? apiFetch("/users/me") : null,
        ]);
        if (cancelled) return;
        setClienti(clientiList || []);
        setUsers(usersList || []);
        setVeicoli(veicoliList || []);

        if (isBozza) {
          setLoadingPage(true);
          const bozza = await apiFetch(`/bozze/${bozzaId}`);
          if (cancelled) return;
          if (bozza.stato !== "da_revisionare") {
            setBozzaChiusa(true);
            setError("Questa bozza non è più da revisionare");
          }
          setBozzaMeta({
            minuti: bozza.minuti_stimati,
            campioni: bozza.n_campioni,
          });
          setGiorni([
            {
              key: 1,
              data: toDateInput(bozza.data),
              oreLavorate: String(bozza.ore_lavorate ?? ""),
              oreViaggio: "0",
              km: "0",
              descrizione: "",
              noteInterne: "",
              noteEsterne: "",
              trasferta: false,
            },
          ]);
          setUserId(String(bozza.user_id));
          setClienteId(String(bozza.cliente_id));
          setCommessaId(String(bozza.commessa_id));
          if (!isAdmin && me?.veicolo_predefinito != null) {
            setVeicoloId(String(me.veicolo_predefinito));
          }
          const [commesseList, ticketsList] = await Promise.all([
            apiFetch(`/clienti/${bozza.cliente_id}/commesse`),
            apiFetch(`/commesse/${bozza.commessa_id}/ticket`),
          ]);
          if (cancelled) return;
          setCommesse(commesseList || []);
          setTickets(ticketsList || []);
          setTicketId(bozza.ticket_id != null ? String(bozza.ticket_id) : "");
          return;
        }

        if (!isEdit) {
          if (me?.veicolo_predefinito != null) {
            setVeicoloId(String(me.veicolo_predefinito));
          }
          setLoadingClienti(false);
          return;
        }

        setLoadingPage(true);
        const intervento = await apiFetch(`/interventi/${interventoId}`);
        if (cancelled) return;

        setGiorni([
          {
            key: 1,
            data: toDateInput(intervento.data),
            oreLavorate: String(intervento.ore_lavorate ?? ""),
            oreViaggio: String(intervento.ore_viaggio ?? 0),
            km: String(intervento.km ?? 0),
            descrizione: intervento.descrizione || "",
            noteInterne: intervento.note_interne || "",
            noteEsterne: intervento.note_esterne || "",
            trasferta: Boolean(intervento.trasferta),
          },
        ]);
        setUserId(String(intervento.user_id));
        setClienteId(String(intervento.cliente_id));
        setVeicoloId(intervento.veicolo_id != null ? String(intervento.veicolo_id) : "");

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
  }, [isEdit, isBozza, interventoId, bozzaId, isAdmin]);

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
      const generale = (list || []).find((t) => t.nome === "-");
      setTicketId(generale ? String(generale.id) : "");
    } catch (err) {
      setError(err.message || "Impossibile caricare i ticket");
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }

  function cambiaVeicolo(value) {
    setVeicoloId(value);
    // I km valgono solo con un veicolo: senza veicolo tornano a zero
    if (!value) setGiorni((list) => list.map((g) => ({ ...g, km: "0" })));
  }

  function onChangeUser(value) {
    setUserId(value);
    // In modifica il veicolo già salvato non va sovrascritto
    if (isEdit) return;
    const selected = users.find((u) => String(u.id) === value);
    cambiaVeicolo(
      selected?.veicolo_predefinito != null ? String(selected.veicolo_predefinito) : ""
    );
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
    if (commessaId && !ticketId) {
      setError("Se selezioni una commessa devi indicare anche il suo ticket");
      return;
    }
    if (!veicoloId && giorni.some((g) => Number(g.km) > 0)) {
      setError("Seleziona un veicolo per inserire i km");
      return;
    }
    for (let i = 0; i < giorni.length; i += 1) {
      const msg = erroreGiorno(giorni[i]);
      if (msg) {
        setError(giorni.length > 1 ? `Giorno ${i + 1}: ${msg}` : msg);
        return;
      }
    }

    const condivisi = {
      user_id: isAdmin ? Number(userId) : null,
      cliente_id: Number(clienteId),
      ticket_id: ticketId ? Number(ticketId) : null,
      veicolo_id: veicoloId ? Number(veicoloId) : null,
    };

    setSubmitting(true);
    try {
      if (isBozza) {
        await apiFetch(`/bozze/${bozzaId}/conferma`, {
          method: "POST",
          body: JSON.stringify({ ...condivisi, ...payloadGiorno(giorni[0]) }),
        });
      } else if (isEdit) {
        await apiFetch(`/interventi/${interventoId}`, {
          method: "PUT",
          body: JSON.stringify({ ...condivisi, ...payloadGiorno(giorni[0]) }),
        });
      } else {
        await apiFetch("/interventi/bulk", {
          method: "POST",
          body: JSON.stringify({
            ...condivisi,
            giorni: giorni.map(payloadGiorno),
          }),
        });
      }
      navigate(isBozza ? `${base}/bozze` : base, { replace: true });
    } catch (err) {
      setError(err.message || (isEdit ? "Aggiornamento non riuscito" : "Salvataggio non riuscito"));
    } finally {
      setSubmitting(false);
    }
  }

  async function scartaBozza() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/bozze/${bozzaId}/scarta`, { method: "POST" });
      navigate(`${base}/bozze`, { replace: true });
    } catch (err) {
      setError(err.message || "Scarto non riuscito");
      setSubmitting(false);
    }
  }

  function setCampoGiorno(key, campo, valore) {
    setGiorni((list) => list.map((g) => (g.key === key ? { ...g, [campo]: valore } : g)));
  }

  function aggiungiGiorno() {
    setGiorni((list) => {
      const ultima = list[list.length - 1]?.data;
      const key = nextKey.current;
      nextKey.current += 1;
      return [...list, blankGiorno(addDaysISO(ultima, 1), key)];
    });
  }

  function rimuoviGiorno(key) {
    setGiorni((list) => (list.length < 2 ? list : list.filter((g) => g.key !== key)));
  }

  const busy = submitting || loadingClienti || loadingPage;

  return (
    <div className="nuovo">
      <AppHeader />

      <main className="nuovo__main">
        <p className="nuovo__back">
          <Link to={isBozza ? `${base}/bozze` : base}>
            {isBozza ? "Torna alle bozze" : "Torna agli interventi"}
          </Link>
        </p>
        <h2>{isBozza ? "Revisione bozza" : isEdit ? "Aggiorna intervento" : "Nuovo intervento"}</h2>
        <p className="nuovo__lead">
          {isBozza
            ? `Ore lavorate stimate dal GPS${
                bozzaMeta ? ` (${bozzaMeta.minuti} min, ${bozzaMeta.campioni} campioni)` : ""
              }. Viaggio, km e descrizione li compili tu. Se cambi la commessa, le ore restano quelle indicate.`
            : `${isAdmin ? "Tecnico e cliente obbligatori." : "Cliente obbligatorio."} La commessa è opzionale; se la scegli, serve anche il suo ticket. Il veicolo è opzionale.`}
          {!isEdit && !isBozza &&
            " Con 'Aggiungi giorno' le giornate successive riusano cliente, commessa, ticket e veicolo."}
        </p>

        {loadingPage && <p className="nuovo__hint">Caricamento intervento...</p>}

        <form className="nuovo__form" onSubmit={handleSubmit}>
          {isAdmin && (
            <div className="nuovo__field">
              <label htmlFor="user">Tecnico</label>
              <select
                id="user"
                value={userId}
                onChange={(e) => onChangeUser(e.target.value)}
                required
                disabled={busy}
              >
                <option value="">
                  {loadingClienti ? "Caricamento..." : "Seleziona tecnico"}
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
                {loadingClienti ? "Caricamento..." : "Seleziona cliente"}
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
                    ? "Caricamento..."
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
              Ticket{" "}
              {commessaId ? (
                <span className="nuovo__optional">(- = generale)</span>
              ) : (
                <span className="nuovo__optional">(opzionale)</span>
              )}
            </label>
            <select
              id="ticket"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              required={Boolean(commessaId)}
              disabled={!commessaId || loadingTickets || busy}
            >
              <option value="">
                {!commessaId
                  ? "Prima seleziona una commessa"
                  : loadingTickets
                    ? "Caricamento..."
                    : "Nessun ticket"}
              </option>
              {tickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="nuovo__field">
            <label htmlFor="veicolo">
              Veicolo <span className="nuovo__optional">(opzionale)</span>
            </label>
            <select
              id="veicolo"
              value={veicoloId}
              onChange={(e) => cambiaVeicolo(e.target.value)}
              disabled={busy}
            >
              <option value="">
                {loadingClienti ? "Caricamento..." : "Nessun veicolo"}
              </option>
              {veicoli.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.targa}
                </option>
              ))}
            </select>
          </div>

          {giorni.map((giorno, indice) => (
            <CampiGiorno
              key={giorno.key}
              giorno={giorno}
              indice={indice}
              totale={giorni.length}
              busy={busy}
              senzaVeicolo={!veicoloId}
              onChange={(campo, valore) => setCampoGiorno(giorno.key, campo, valore)}
              onRemove={
                !isEdit && !isBozza && giorni.length > 1 && indice > 0
                  ? () => rimuoviGiorno(giorno.key)
                  : null
              }
            />
          ))}

          {!isEdit && !isBozza && (
            <button
              type="button"
              className="nuovo__add"
              onClick={aggiungiGiorno}
              disabled={busy}
            >
              Aggiungi giorno
            </button>
          )}

          {error && <p className="nuovo__error">{error}</p>}

          <div className="nuovo__actions">
            <button className="nuovo__submit" type="submit" disabled={busy || bozzaChiusa}>
              {submitting
                ? "Salvataggio..."
                : isBozza
                  ? "Conferma intervento"
                  : isEdit
                    ? "Aggiorna"
                    : giorni.length > 1
                      ? `Salva ${giorni.length} interventi`
                      : "Salva intervento"}
            </button>
            {isBozza && !bozzaChiusa && (
              <button
                type="button"
                className="nuovo__cancel"
                onClick={scartaBozza}
                disabled={busy}
              >
                Scarta bozza
              </button>
            )}
            <Link className="nuovo__cancel" to={base}>
              Annulla
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
