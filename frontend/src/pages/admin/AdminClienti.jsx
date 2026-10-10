import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = {
  ragione_sociale: "",
  partita_iva: "",
  via: "",
  cap: "",
  citta: "",
};

export default function AdminClienti() {
  const [clienti, setClienti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await apiFetch("/clienti");
        if (!cancelled) setClienti(list || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare i clienti");
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
    const body = {
      ragione_sociale: form.ragione_sociale.trim(),
      partita_iva: form.partita_iva.trim(),
      via: form.via.trim() || null,
      cap: form.cap.trim() || null,
      citta: form.citta.trim() || null,
    };
    if (!body.ragione_sociale || !body.partita_iva) {
      setFormError("Compila ragione sociale e partita IVA");
      return;
    }

    const isNew = editingId === "new";
    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/clienti" : `/clienti/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      setClienti(await apiFetch("/clienti"));
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
      await apiFetch(`/clienti/${toDelete.id}`, { method: "DELETE" });
      setClienti((list) => list.filter((c) => c.id !== toDelete.id));
      if (editingId === toDelete.id) setEditingId(null);
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  function indirizzoLabel(c) {
    const parts = [];
    if (c.via) parts.push(c.via);
    const capCitta = [c.cap, c.citta].filter(Boolean).join(" ");
    if (capCitta) parts.push(capCitta);
    return parts.length ? parts.join(", ") : null;
  }

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <h2>Clienti</h2>
          <button
            type="button"
            className="app-home__new"
            onClick={() => openForm("new", EMPTY_FORM)}
          >
            Nuovo cliente
          </button>
        </div>

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{editingId === "new" ? "Nuovo cliente" : "Modifica cliente"}</h3>
            <div className="nuovo__field">
              <label htmlFor="ragione_sociale">Ragione sociale</label>
              <input
                id="ragione_sociale"
                name="ragione_sociale"
                value={form.ragione_sociale}
                onChange={onChange}
                required
                disabled={saving}
              />
            </div>
            <div className="nuovo__field">
              <label htmlFor="partita_iva">Partita IVA</label>
              <input
                id="partita_iva"
                name="partita_iva"
                value={form.partita_iva}
                onChange={onChange}
                inputMode="numeric"
                required
                disabled={saving}
              />
            </div>

            <div className="nuovo__field">
              <label htmlFor="via">
                Via <span className="nuovo__optional">(opzionale)</span>
              </label>
              <input
                id="via"
                name="via"
                value={form.via}
                onChange={onChange}
                disabled={saving}
              />
            </div>

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="cap">
                  CAP <span className="nuovo__optional">(opzionale)</span>
                </label>
                <input
                  id="cap"
                  name="cap"
                  value={form.cap}
                  onChange={onChange}
                  inputMode="numeric"
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="citta">
                  Città <span className="nuovo__optional">(opzionale)</span>
                </label>
                <input
                  id="citta"
                  name="citta"
                  value={form.citta}
                  onChange={onChange}
                  disabled={saving}
                />
              </div>
            </div>

            {formError && <p className="nuovo__error">{formError}</p>}

            <div className="nuovo__actions">
              <button className="nuovo__submit" type="submit" disabled={saving}>
                {saving ? "Salvataggio..." : editingId === "new" ? "Salva" : "Aggiorna"}
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

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && clienti.length === 0 && (
          <p className="app-home__empty">Nessun cliente registrato.</p>
        )}

        {clienti.length > 0 && (
          <div className="app-home__list">
            {clienti.map((c) => {
              const indirizzo = indirizzoLabel(c);
              return (
                <div
                  className={
                    editingId === c.id
                      ? "app-home__row app-home__row--selected"
                      : "app-home__row"
                  }
                  key={c.id}
                >
                  <div className="app-home__row-inner">
                    <div className="app-home__sticky">
                      <div className="app-home__cell admin__cell--main">
                        <span className="app-home__label">Ragione sociale</span>
                        <span className="app-home__value" title={c.ragione_sociale}>
                          {c.ragione_sociale}
                        </span>
                      </div>
                      <div className="app-home__cell admin__cell--short">
                        <span className="app-home__label">Partita IVA</span>
                        <span className="app-home__value">{c.partita_iva}</span>
                      </div>
                      <div className="app-home__actions">
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--edit"
                          onClick={() =>
                            openForm(c.id, {
                              ragione_sociale: c.ragione_sociale,
                              partita_iva: c.partita_iva,
                              via: c.via || "",
                              cap: c.cap || "",
                              citta: c.citta || "",
                            })
                          }
                        >
                          Modifica
                        </button>
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
                      <div className="app-home__cell admin__cell--text">
                        <span className="app-home__label">Indirizzo</span>
                        <span
                          className={
                            indirizzo
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                          title={indirizzo || undefined}
                        >
                          {indirizzo || "-"}
                        </span>
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
          title="Eliminare il cliente?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.ragione_sociale}</strong>. Non è
          possibile se ha commesse, offerte o interventi collegati.
        </ConfirmDelete>
      )}
    </div>
  );
}
