import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = { targa: "", km: "", costo_km: "0" };

export default function AdminVeicoli() {
  const [veicoli, setVeicoli] = useState([]);
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
        const list = await apiFetch("/veicoli");
        if (!cancelled) setVeicoli(list || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare i veicoli");
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
    const targa = form.targa.trim();
    const km = form.km === "" ? null : Number(form.km);
    const costoKm = Number(form.costo_km);
    if (!targa) {
      setFormError("Inserisci una targa");
      return;
    }
    if (km !== null && (!Number.isInteger(km) || km < 0)) {
      setFormError("I km devono essere un numero intero non negativo");
      return;
    }
    if (form.costo_km === "" || !Number.isFinite(costoKm) || costoKm < 0) {
      setFormError("Il costo al km non può essere negativo");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/veicoli" : `/veicoli/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify({ targa, km, costo_km: costoKm }),
      });
      setVeicoli(await apiFetch("/veicoli"));
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
      await apiFetch(`/veicoli/${toDelete.id}`, { method: "DELETE" });
      setVeicoli((list) => list.filter((v) => v.id !== toDelete.id));
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
            <h2>Veicoli</h2>
            <p className="app-home__hint">Ordinati per km, dal più alto</p>
          </div>
          <button
            type="button"
            className="app-home__new"
            onClick={() => openForm("new", EMPTY_FORM)}
          >
            Nuovo veicolo
          </button>
        </div>

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{isNew ? "Nuovo veicolo" : "Modifica veicolo"}</h3>

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="targa">Targa</label>
                <input
                  id="targa"
                  name="targa"
                  placeholder="es. AB123CD"
                  value={form.targa}
                  onChange={onChange}
                  autoComplete="off"
                  required
                  disabled={saving}
                />
                <p className="nuovo__hint">Salvata in maiuscolo, senza spazi.</p>
              </div>
              <div className="nuovo__field">
                <label htmlFor="km">
                  Km <span className="nuovo__optional">(opzionale)</span>
                </label>
                <input
                  id="km"
                  name="km"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.km}
                  onChange={onChange}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="nuovo__field">
              <label htmlFor="costo_km">Costo al km (€)</label>
              <input
                id="costo_km"
                name="costo_km"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.costo_km}
                onChange={onChange}
                required
                disabled={saving}
              />
              <p className="nuovo__hint">
                Entra nel costo dei ticket: km dell&apos;intervento × costo al km. Se lo cambi,
                i ticket si ricalcolano.
              </p>
            </div>

            {formError && <p className="nuovo__error">{formError}</p>}

            <div className="nuovo__actions">
              <button className="nuovo__submit" type="submit" disabled={saving}>
                {saving ? "Salvataggio..." : isNew ? "Salva" : "Aggiorna"}
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

        {!loading && veicoli.length === 0 && (
          <p className="app-home__empty">Nessun veicolo registrato.</p>
        )}

        {veicoli.length > 0 && (
          <div className="app-home__list">
            {veicoli.map((v) => (
              <div
                className={
                  editingId === v.id
                    ? "app-home__row app-home__row--selected"
                    : "app-home__row"
                }
                key={v.id}
              >
                <div className="app-home__row-inner">
                  <div className="app-home__sticky">
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Targa</span>
                      <span className="app-home__value" title={v.targa}>
                        {v.targa}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Km</span>
                      <span
                        className={
                          v.km != null
                            ? "app-home__value"
                            : "app-home__value app-home__value--muted"
                        }
                      >
                        {v.km != null ? v.km.toLocaleString("it-IT") : "-"}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">€/km</span>
                      <span className="app-home__value">{formatEuro(v.costo_km)}</span>
                    </div>
                    <div className="app-home__actions">
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--edit"
                        onClick={() =>
                          openForm(v.id, {
                            targa: v.targa,
                            km: v.km != null ? String(v.km) : "",
                            costo_km: String(v.costo_km ?? 0),
                          })
                        }
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--danger"
                        onClick={() => setToDelete(v)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>

                  <div className="app-home__extra">
                    <div className="app-home__cell">
                      <span className="app-home__label">ID</span>
                      <span className="app-home__value app-home__value--muted">
                        #{v.id}
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
          title="Eliminare il veicolo?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.targa}</strong>. Gli utenti che lo
          hanno come predefinito resteranno senza veicolo. Non è possibile se è
          usato in un intervento.
        </ConfirmDelete>
      )}
    </div>
  );
}
