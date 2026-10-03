import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = { nome: "", descrizione: "", costo_unitario: "", unita: "", fornitore: "" };

export default function AdminMateriali() {
  const [materiali, setMateriali] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isNew = editingId === "new";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await apiFetch("/materiali");
        if (!cancelled) setMateriali(list || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare i materiali");
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
    const unita = form.unita.trim();
    const costo = Number(form.costo_unitario);
    if (!nome || !unita) {
      setFormError("Nome e unità sono obbligatori");
      return;
    }
    if (form.costo_unitario === "" || !Number.isFinite(costo) || costo < 0) {
      setFormError("Il costo unitario non può essere negativo");
      return;
    }

    const body = {
      nome,
      descrizione: form.descrizione.trim() || null,
      costo_unitario: costo,
      unita,
      fornitore: form.fornitore.trim() || null,
    };

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/materiali" : `/materiali/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      setMateriali(await apiFetch("/materiali"));
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
      await apiFetch(`/materiali/${toDelete.id}`, { method: "DELETE" });
      setMateriali((list) => list.filter((m) => m.id !== toDelete.id));
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
            <h2>Materiali</h2>
            <p className="app-home__hint">Catalogo con costi unitari</p>
          </div>
          <button
            type="button"
            className="app-home__new"
            onClick={() => openForm("new", EMPTY_FORM)}
          >
            Nuovo materiale
          </button>
        </div>

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{isNew ? "Nuovo materiale" : "Modifica materiale"}</h3>

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

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="costo_unitario">Costo unitario (€)</label>
                <input
                  id="costo_unitario"
                  name="costo_unitario"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.costo_unitario}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="unita">Unità</label>
                <input
                  id="unita"
                  name="unita"
                  placeholder="es. pz, m, kg"
                  value={form.unita}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
            </div>

            <div className="nuovo__field">
              <label htmlFor="fornitore">
                Fornitore <span className="nuovo__optional">(opzionale)</span>
              </label>
              <input
                id="fornitore"
                name="fornitore"
                value={form.fornitore}
                onChange={onChange}
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

        {!loading && materiali.length === 0 && (
          <p className="app-home__empty">Nessun materiale in catalogo.</p>
        )}

        {materiali.length > 0 && (
          <div className="app-home__list">
            {materiali.map((m) => (
              <div
                className={
                  editingId === m.id
                    ? "app-home__row app-home__row--selected"
                    : "app-home__row"
                }
                key={m.id}
              >
                <div className="app-home__row-inner">
                  <div className="app-home__sticky">
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Materiale</span>
                      <span className="app-home__value" title={m.nome}>
                        {m.nome}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Costo</span>
                      <span className="app-home__value">
                        {formatEuro(m.costo_unitario)}/{m.unita}
                      </span>
                    </div>
                    <div className="app-home__actions">
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--edit"
                        onClick={() =>
                          openForm(m.id, {
                            nome: m.nome,
                            descrizione: m.descrizione || "",
                            costo_unitario: String(m.costo_unitario),
                            unita: m.unita,
                            fornitore: m.fornitore || "",
                          })
                        }
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--danger"
                        onClick={() => setToDelete(m)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>

                  <div className="app-home__extra">
                    <div className="app-home__cell">
                      <span className="app-home__label">Fornitore</span>
                      <span
                        className={
                          m.fornitore
                            ? "app-home__value"
                            : "app-home__value app-home__value--muted"
                        }
                      >
                        {m.fornitore || "—"}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--text">
                      <span className="app-home__label">Descrizione</span>
                      <span
                        className={
                          m.descrizione
                            ? "app-home__value"
                            : "app-home__value app-home__value--muted"
                        }
                        title={m.descrizione || undefined}
                      >
                        {m.descrizione || "—"}
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
          title="Eliminare il materiale?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.nome}</strong> dal catalogo. Non è
          possibile se è già stato usato in una commessa.
        </ConfirmDelete>
      )}
    </div>
  );
}
