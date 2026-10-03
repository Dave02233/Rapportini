import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../api";
import AppHeader from "../components/AppHeader";
import "./AppHome.css";
import "./RapportinoCongiunto.css";

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return "";
}

function formatData(value) {
  if (!value) return "—";
  if (typeof value === "string") {
    const part = value.slice(0, 10);
    const [y, m, d] = part.split("-").map(Number);
    if (!y || !m || !d) return value;
    return new Date(y, m - 1, d).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return "—";
}

function byId(list) {
  return Object.fromEntries((list || []).map((item) => [item.id, item]));
}

function readIds(locationState) {
  if (locationState?.ids?.length) return locationState.ids.map(Number);
  try {
    const raw = sessionStorage.getItem("rapportino_congiunto_ids");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

export default function RapportinoCongiunto() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const base = user?.role === "admin" ? "/admin" : "/app";

  const [ids] = useState(() => readIds(location.state));
  const [interventi, setInterventi] = useState([]);
  const [clientiById, setClientiById] = useState({});
  const [ticketsById, setTicketsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (ids.length === 0) {
        setLoading(false);
        setError("Nessun intervento selezionato.");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [allInterventi, clienti, tickets] = await Promise.all([
          apiFetch("/interventi"),
          apiFetch("/clienti"),
          apiFetch("/ticket"),
        ]);
        if (cancelled) return;

        const idSet = new Set(ids);
        const selected = (allInterventi || [])
          .filter((i) => idSet.has(i.id))
          .sort((a, b) => {
            const cmp = dateKey(a.data).localeCompare(dateKey(b.data));
            return cmp !== 0 ? cmp : a.id - b.id;
          });

        setInterventi(selected);
        setClientiById(byId(clienti));
        setTicketsById(byId(tickets));

        if (selected.length === 0) {
          setError("Gli interventi selezionati non sono più disponibili.");
        } else if (selected.length < ids.length) {
          setError(
            `Attenzione: ${ids.length - selected.length} intervento/i non trovato/i e escluso/i dalla revisione.`
          );
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Caricamento non riuscito");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const warnings = [];
  const blocking = [];

  if (!loading && ids.length === 0) {
    blocking.push("Non hai selezionato alcun intervento.");
  }
  if (!loading && ids.length > 0 && interventi.length === 0) {
    blocking.push("Nessun intervento valido da includere nel rapportino.");
  }

  const clienteIds = new Set(interventi.map((i) => i.cliente_id));
  if (clienteIds.size > 1) {
    warnings.push(
      "Sono presenti clienti diversi: verifica che il rapportino congiunto sia corretto."
    );
  }

  for (const i of interventi) {
    if (!i.ore_lavorate || i.ore_lavorate <= 0) {
      blocking.push(`Intervento #${i.id}: ore lavorate non valide.`);
    }
    if ((i.ore_totali ?? 0) !== (i.ore_lavorate ?? 0) + (i.ore_viaggio ?? 0)) {
      warnings.push(
        `Intervento #${i.id}: ore totali diverse da lavorate + viaggio.`
      );
    }
    if (!clientiById[i.cliente_id]) {
      warnings.push(`Intervento #${i.id}: cliente non trovato in anagrafica.`);
    }
  }

  const canConfirm = !loading && blocking.length === 0 && interventi.length > 0;

  const totLavorate = interventi.reduce((s, i) => s + (i.ore_lavorate || 0), 0);
  const totViaggio = interventi.reduce((s, i) => s + (i.ore_viaggio || 0), 0);
  const totOre = interventi.reduce((s, i) => s + (i.ore_totali || 0), 0);
  const totKm = interventi.reduce((s, i) => s + (i.km || 0), 0);

  function handleConfirmPrint() {
    if (!canConfirm || !confirmed) return;
    // PDF in una fase successiva: per ora torna alla lista
    sessionStorage.removeItem("rapportino_congiunto_ids");
    navigate(base, { replace: true });
  }

  return (
    <div className="cong">
      <AppHeader />

      <main className="cong__main">
        <p className="cong__back">
          <Link to={base}>← Torna agli interventi</Link>
        </p>
        <h2>Revisione rapportino congiunto</h2>
        <p className="cong__lead">
          Controlla i dati prima di confermare la stampa PDF. Per ora la
          conferma ti riporta alla lista (PDF in seguito).
        </p>

        {loading && <p className="cong__status">Caricamento…</p>}

        {blocking.map((msg) => (
          <p className="cong__error" key={msg}>
            {msg}
          </p>
        ))}
        {error && !blocking.includes(error) && (
          <p className="cong__warn">{error}</p>
        )}
        {warnings.map((msg) => (
          <p className="cong__warn" key={msg}>
            {msg}
          </p>
        ))}

        {!loading && interventi.length > 0 && (
          <>
            <div className="cong__table-wrap">
              <table className="cong__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Ticket</th>
                    <th>Ore</th>
                    <th>Viaggio</th>
                    <th>Km</th>
                    <th>Tot.</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {interventi.map((i) => (
                    <tr key={i.id}>
                      <td>{formatData(i.data)}</td>
                      <td>
                        {clientiById[i.cliente_id]?.ragione_sociale || "—"}
                      </td>
                      <td>
                        {i.ticket_id != null
                          ? ticketsById[i.ticket_id]?.nome || `#${i.ticket_id}`
                          : "—"}
                      </td>
                      <td>{i.ore_lavorate}</td>
                      <td>{i.ore_viaggio ?? 0}</td>
                      <td>{i.km ?? 0}</td>
                      <td>{i.ore_totali}</td>
                      <td className="cong__note">{i.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Totali ({interventi.length} interventi)</td>
                    <td>{totLavorate}</td>
                    <td>{totViaggio}</td>
                    <td>{totKm}</td>
                    <td>{totOre}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <label className="cong__confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!canConfirm}
              />
              <span>
                Confermo di aver revisionato i dati e che non ci sono errori.
                Autorizzo la generazione del PDF del rapportino congiunto.
              </span>
            </label>

            <div className="cong__actions">
              <button
                type="button"
                className="cong__submit"
                disabled={!canConfirm || !confirmed}
                onClick={handleConfirmPrint}
              >
                Conferma e stampa PDF
              </button>
              <Link className="cong__cancel" to={base}>
                Annulla
              </Link>
            </div>
          </>
        )}

        {!loading && interventi.length === 0 && (
          <p className="cong__actions">
            <Link className="cong__cancel" to={base}>
              Torna alla lista
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
