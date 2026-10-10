import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { formatData, formatEuro, formatPeriodo } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import CommessaForm from "./CommessaForm";
import { STATO_COMMESSA, STATO_TICKET } from "./commesse";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "../RapportinoCongiunto.css";
import "./Admin.css";

const sum = (list) => list.reduce((s, x) => s + (x.costo_totale || 0), 0);

export default function AdminCommessaDettaglio() {
  const { commessaId } = useParams();
  const navigate = useNavigate();

  const [commessa, setCommessa] = useState(null);
  const [clienti, setClienti] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [materiali, setMateriali] = useState([]);
  const [costi, setCosti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [commessaRes, clientiRes, ticketsRes, materialiRes, costiRes] = await Promise.all([
          apiFetch(`/commesse/${commessaId}`),
          apiFetch("/clienti"),
          apiFetch(`/commesse/${commessaId}/ticket`),
          apiFetch(`/commesse/${commessaId}/materiali-utilizzati`),
          apiFetch(`/commesse/${commessaId}/costi-intervento`),
        ]);
        if (cancelled) return;
        setCommessa(commessaRes);
        setClienti(clientiRes || []);
        setTickets(ticketsRes || []);
        setMateriali(materialiRes || []);
        setCosti(costiRes || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare la commessa");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [commessaId]);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/commesse/${commessaId}`, { method: "DELETE" });
      navigate("/admin/commesse", { replace: true });
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
      setDeleting(false);
      setAskDelete(false);
    }
  }

  const costoTicket = sum(tickets);
  const costoMateriali = sum(materiali);
  const costoInterventi = costi.reduce((s, c) => s + (c.costo || 0), 0);
  const spese = costoTicket + costoMateriali + costoInterventi;
  const budget = commessa?.budget || 0;
  const residuo = budget - spese;
  const percentuale = budget > 0 ? (spese / budget) * 100 : null;
  const cliente = clienti.find((c) => c.id === commessa?.cliente_id);

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <p className="cong__back">
          <Link to="/admin/commesse">Tutte le commesse</Link>
        </p>

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {commessa && (
          <>
            <div className="app-home__section-head">
              <div>
                <h2>{commessa.nome}</h2>
                <p className="app-home__hint">
                  {[
                    cliente?.ragione_sociale,
                    STATO_COMMESSA[commessa.stato] || commessa.stato,
                    formatPeriodo(commessa),
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </p>
              </div>
              <div className="app-home__section-actions">
                <button
                  type="button"
                  className="app-home__new admin__btn-danger"
                  onClick={() => setAskDelete(true)}
                >
                  Elimina
                </button>
                <button
                  type="button"
                  className="app-home__new"
                  disabled={editing}
                  onClick={() => setEditing(true)}
                >
                  Modifica
                </button>
              </div>
            </div>

            {editing && (
              <CommessaForm
                commessa={commessa}
                clienti={clienti}
                onSaved={(saved) => {
                  setCommessa(saved);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            )}

            {commessa.descrizione && <p className="admin__desc">{commessa.descrizione}</p>}

            <section className="admin-stats" aria-label="Riepilogo economico">
              <div className="admin-stats__item">
                <span className="app-home__label">Budget</span>
                <strong>{formatEuro(budget)}</strong>
              </div>
              <div className="admin-stats__item">
                <span className="app-home__label">Spese</span>
                <strong>{formatEuro(spese)}</strong>
                <span className="admin-stats__sub">
                  Ticket {formatEuro(costoTicket)} - Materiali {formatEuro(costoMateriali)}  - 
                  Costi d&apos;intervento {formatEuro(costoInterventi)}
                </span>
              </div>
              <div className="admin-stats__item">
                <span className="app-home__label">Residuo</span>
                <strong className={residuo < 0 ? "admin__value--danger" : undefined}>
                  {formatEuro(residuo)}
                </strong>
              </div>
              {percentuale !== null && (
                <>
                  <div className="admin-stats__bar">
                    <div
                      className={
                        residuo < 0
                          ? "admin-stats__fill admin-stats__fill--over"
                          : "admin-stats__fill"
                      }
                      style={{ width: `${Math.min(percentuale, 100)}%` }}
                    />
                  </div>
                  <p className="admin-stats__perc">
                    {spese > 0 && percentuale < 1 ? "< 1" : Math.round(percentuale)}% del
                    budget utilizzato
                  </p>
                </>
              )}
            </section>

            <section className="admin-section">
              <div className="admin-section__head">
                <h3>Ticket</h3>
                <Link to={`/admin/ticket?commessa=${commessa.id}`}>Gestisci ticket</Link>
              </div>
              {tickets.length === 0 ? (
                <p className="app-home__empty">Nessun ticket su questa commessa.</p>
              ) : (
                <div className="cong__table-wrap">
                  <table className="cong__table admin__table">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Periodo</th>
                        <th>Stato</th>
                        <th className="admin__num">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((t) => (
                        <tr key={t.id}>
                          <td>{t.nome}</td>
                          <td>{formatPeriodo(t) || "-"}</td>
                          <td>{STATO_TICKET[t.stato] || t.stato}</td>
                          <td className="admin__num">{formatEuro(t.costo_totale)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Totale ticket</td>
                        <td className="admin__num">{formatEuro(costoTicket)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="nuovo__hint">
                Costo ticket = ore totali degli interventi collegati × costo orario del tecnico +
                km × costo al km del veicolo.
              </p>
            </section>

            <section className="admin-section">
              <div className="admin-section__head">
                <h3>Materiali utilizzati</h3>
                <Link to={`/admin/materiali-utilizzati?commessa=${commessa.id}`}>
                  Gestisci materiali
                </Link>
              </div>
              {materiali.length === 0 ? (
                <p className="app-home__empty">Nessun materiale su questa commessa.</p>
              ) : (
                <div className="cong__table-wrap">
                  <table className="cong__table admin__table">
                    <thead>
                      <tr>
                        <th>Materiale</th>
                        <th className="admin__num">Quantità</th>
                        <th className="admin__num">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materiali.map((m) => (
                        <tr key={m.id}>
                          <td>{m.nome}</td>
                          <td className="admin__num">{m.quantita}</td>
                          <td className="admin__num">{formatEuro(m.costo_totale)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Totale materiali</td>
                        <td className="admin__num">{formatEuro(costoMateriali)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            <section className="admin-section">
              <div className="admin-section__head">
                <h3>Costi d&apos;intervento</h3>
                <Link to={`/admin/costi-intervento?commessa=${commessa.id}`}>
                  Gestisci costi
                </Link>
              </div>
              {costi.length === 0 ? (
                <p className="app-home__empty">Nessun costo d&apos;intervento su questa commessa.</p>
              ) : (
                <div className="cong__table-wrap">
                  <table className="cong__table admin__table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Data</th>
                        <th className="admin__num">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costi.map((c) => (
                        <tr key={c.id}>
                          <td>{c.nome}</td>
                          <td>{formatData(c.data)}</td>
                          <td className="admin__num">{formatEuro(c.costo)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Totale costi d&apos;intervento</td>
                        <td className="admin__num">{formatEuro(costoInterventi)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {askDelete && (
        <ConfirmDelete
          title="Eliminare la commessa?"
          busy={deleting}
          onCancel={() => setAskDelete(false)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{commessa.nome}</strong>. Verranno eliminati
          anche i suoi ticket, i materiali utilizzati e i costi d&apos;intervento; gli interventi collegati
          resteranno senza ticket. L&apos;operazione non si può annullare.
        </ConfirmDelete>
      )}
    </div>
  );
}
