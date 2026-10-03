import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import { STATO_TICKET } from "./commesse";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = { commessa_id: "", nome: "", descrizione: "", stato: "in_corso" };

export default function AdminTicket() {
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [commesse, setCommesse] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCommessaId, setFilterCommessaId] = useState(
    () => searchParams.get("commessa") || ""
  );

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isNew = editingId === "new";
  const commesseById = Object.fromEntries(commesse.map((c) => [c.id, c]));
  const visibleTickets = filterCommessaId
    ? tickets.filter((t) => String(t.commessa_id) === filterCommessaId)
    : tickets;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [ticketList, commesseList] = await Promise.all([
          apiFetch("/ticket"),
          apiFetch("/commesse"),
        ]);
        if (cancelled) return;
        setTickets(ticketList || []);
        setCommesse(commesseList || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare i ticket");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function openForm(id, values) {
    setForm(values);
    setFormError(null);
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!form.commessa_id || !nome) {
      setFormError("Commessa e nome sono obbligatori");
      return;
    }

    const body = {
      commessa_id: Number(form.commessa_id),
      nome,
      descrizione: form.descrizione.trim() || null,
      stato: form.stato,
    };

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/ticket" : `/ticket/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      setTickets(await apiFetch("/ticket"));
      setEditingId(null);
    } catch (err) {
      setFormError(err.message || "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/ticket/${toDelete.id}`, { method: "DELETE" });
      setTickets((list) => list.filter((t) => t.id !== toDelete.id));
      if (editingId === toDelete.id) setEditingId(null);
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
            <h2>Ticket</h2>
            <p className="app-home__hint">Ogni ticket appartiene a una commessa</p>
          </div>
          <button
            type="button"
            className="app-home__new"
            disabled={commesse.length === 0}
            onClick={() =>
              openForm("new", { ...EMPTY_FORM, commessa_id: filterCommessaId })
            }
          >
            Nuovo ticket
          </button>
        </div>

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{isNew ? "Nuovo ticket" : "Modifica ticket"}</h3>

            <div className="nuovo__field">
              <label htmlFor="commessa_id">Commessa</label>
              <select
                id="commessa_id"
                name="commessa_id"
                value={form.commessa_id}
                onChange={onChange}
                required
                disabled={saving}
              >
                <option value="">Seleziona commessa</option>
                {commesse.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="nuovo__field">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                name="nome"
                value={form.nome}
                onChange={onChange}
                required
                disabled={saving}
              />
            </div>

            <div className="nuovo__field">
              <label htmlFor="descrizione">
                Descrizione <span className="nuovo__optional">(opzionale)</span>
              </label>
              <textarea
                id="descrizione"
                name="descrizione"
                rows={3}
                value={form.descrizione}
                onChange={onChange}
                disabled={saving}
              />
            </div>

            <div className="nuovo__field">
              <label htmlFor="stato">Stato</label>
              <select
                id="stato"
                name="stato"
                value={form.stato}
                onChange={onChange}
                disabled={saving}
              >
                {Object.entries(STATO_TICKET).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <p className="nuovo__hint">
              Il costo si calcola da solo: ore totali degli interventi collegati ×
              costo orario del tecnico.
            </p>

            {formError && <p className="nuovo__error">{formError}</p>}

            <div className="nuovo__actions">
              <button className="nuovo__submit" type="submit" disabled={saving}>
                {saving ? "Salvataggio…" : isNew ? "Salva" : "Aggiorna"}
              </button>
              <button
                className="nuovo__cancel"
                type="button"
                disabled={saving}
                onClick={() => setEditingId(null)}
              >
                Annulla
              </button>
            </div>
          </form>
        )}

        {loading && <p className="app-home__status">Caricamento…</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && commesse.length === 0 && (
          <p className="app-home__empty">
            Crea prima una commessa: i ticket vanno associati a una commessa.
          </p>
        )}

        {tickets.length > 0 && (
          <div className="app-home__filters admin__filters">
            <div className="app-home__filter">
              <label htmlFor="filter-commessa">Commessa</label>
              <select
                id="filter-commessa"
                value={filterCommessaId}
                onChange={(e) => setFilterCommessaId(e.target.value)}
              >
                <option value="">Tutte le commesse</option>
                {commesse.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!loading && commesse.length > 0 && visibleTickets.length === 0 && (
          <p className="app-home__empty">
            {filterCommessaId
              ? "Nessun ticket per questa commessa."
              : "Nessun ticket registrato."}
          </p>
        )}

        {visibleTickets.length > 0 && (
          <div className="app-home__list">
            {visibleTickets.map((t) => (
              <div
                className={
                  editingId === t.id
                    ? "app-home__row app-home__row--selected"
                    : "app-home__row"
                }
                key={t.id}
              >
                <div className="app-home__row-inner">
                  <div className="app-home__sticky">
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Ticket</span>
                      <span className="app-home__value" title={t.nome}>
                        {t.nome}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Commessa</span>
                      <span className="app-home__value">
                        {commesseById[t.commessa_id]?.nome || `#${t.commessa_id}`}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Stato</span>
                      <span
                        className={
                          t.stato === "in_corso"
                            ? "app-home__value"
                            : "app-home__value app-home__value--muted"
                        }
                      >
                        {STATO_TICKET[t.stato] || t.stato}
                      </span>
                    </div>
                    <div className="app-home__actions">
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--edit"
                        onClick={() =>
                          openForm(t.id, {
                            commessa_id: String(t.commessa_id),
                            nome: t.nome,
                            descrizione: t.descrizione || "",
                            stato: t.stato,
                          })
                        }
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--danger"
                        onClick={() => setToDelete(t)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>

                  <div className="app-home__extra">
                    <div className="app-home__cell">
                      <span className="app-home__label">Costo interventi</span>
                      <span className="app-home__value">{formatEuro(t.costo_totale)}</span>
                    </div>
                    <div className="app-home__cell admin__cell--text">
                      <span className="app-home__label">Descrizione</span>
                      <span
                        className={
                          t.descrizione
                            ? "app-home__value"
                            : "app-home__value app-home__value--muted"
                        }
                        title={t.descrizione || undefined}
                      >
                        {t.descrizione || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {toDelete && (
        <ConfirmDelete
          title="Eliminare il ticket?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.nome}</strong>. Gli interventi
          collegati resteranno senza ticket. L&apos;operazione non si può annullare.
        </ConfirmDelete>
      )}
    </div>
  );
}
