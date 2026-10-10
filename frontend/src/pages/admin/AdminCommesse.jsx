import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import { formatData, formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import CommessaForm from "./CommessaForm";
import { STATO_COMMESSA, speseCommessa } from "./commesse";
import "../AppHome.css";
import "./Admin.css";

export default function AdminCommesse() {
  const navigate = useNavigate();
  const [commesse, setCommesse] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const clientiById = Object.fromEntries(clienti.map((c) => [c.id, c]));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [commesseList, clientiList] = await Promise.all([
          apiFetch("/commesse/riepilogo"),
          apiFetch("/clienti"),
        ]);
        if (cancelled) return;
        setCommesse(commesseList || []);
        setClienti(clientiList || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare le commesse");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function openNew() {
    setCreating(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/commesse/${toDelete.id}`, { method: "DELETE" });
      setCommesse((list) => list.filter((c) => c.id !== toDelete.id));
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <div>
            <h2>Commesse</h2>
            <p className="app-home__hint">Scorri la riga in orizzontale per tutti i dati</p>
          </div>
          <button type="button" className="app-home__new" onClick={openNew}>
            Nuova commessa
          </button>
        </div>

        {creating && (
          <CommessaForm
            commessa={null}
            clienti={clienti}
            onSaved={(saved) => navigate(`/admin/commesse/${saved.id}`)}
            onCancel={() => setCreating(false)}
          />
        )}

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && commesse.length === 0 && (
          <p className="app-home__empty">Nessuna commessa registrata.</p>
        )}

        {commesse.length > 0 && (
          <div className="app-home__list">
            {commesse.map((c) => {
              const cliente = clientiById[c.cliente_id];
              const residuo = c.budget - speseCommessa(c);
              return (
                <div className="app-home__row" key={c.id}>
                  <div className="app-home__row-inner">
                    <div className="app-home__sticky">
                      <div className="app-home__cell admin__cell--main">
                        <span className="app-home__label">Commessa</span>
                        <span className="app-home__value" title={c.nome}>
                          {c.nome}
                        </span>
                      </div>
                      <div className="app-home__cell admin__cell--main">
                        <span className="app-home__label">Cliente</span>
                        <span className="app-home__value" title={cliente?.ragione_sociale}>
                          {cliente?.ragione_sociale || "Cliente sconosciuto"}
                        </span>
                      </div>
                      <div className="app-home__cell admin__cell--short">
                        <span className="app-home__label">Stato</span>
                        <span
                          className={
                            c.stato === "in_corso"
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                        >
                          {STATO_COMMESSA[c.stato] || c.stato}
                        </span>
                      </div>
                      <div className="app-home__actions">
                        <Link
                          className="app-home__btn app-home__btn--edit"
                          to={`/admin/commesse/${c.id}`}
                        >
                          Apri
                        </Link>
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--danger"
                          onClick={() => setToDelete(c)}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>

                    <div className="app-home__extra">
                      <div className="app-home__cell">
                        <span className="app-home__label">Budget</span>
                        <span className="app-home__value">{formatEuro(c.budget)}</span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Spese</span>
                        <span className="app-home__value">{formatEuro(speseCommessa(c))}</span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Residuo</span>
                        <span
                          className={
                            residuo < 0
                              ? "app-home__value admin__value--danger"
                              : "app-home__value"
                          }
                        >
                          {formatEuro(residuo)}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Inizio</span>
                        <span className="app-home__value">{formatData(c.data_inizio)}</span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Fine</span>
                        <span className="app-home__value">{formatData(c.data_fine)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {toDelete && (
        <ConfirmDelete
          title="Eliminare la commessa?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.nome}</strong>. Verranno eliminati
          anche i suoi ticket, i materiali utilizzati e i costi d&apos;intervento; gli interventi collegati
          resteranno senza ticket. L&apos;operazione non si può annullare.
        </ConfirmDelete>
      )}
    </div>
  );
}
