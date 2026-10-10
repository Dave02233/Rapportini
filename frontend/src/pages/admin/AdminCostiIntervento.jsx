import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { formatData, formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const emptyForm = () => ({ nome: "", data: todayISO(), costo: "" });

export default function AdminCostiIntervento() {
  const [searchParams] = useSearchParams();
  const initialCommessaId = searchParams.get("commessa") || "";

  const [commesse, setCommesse] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [commessaId, setCommessaId] = useState(initialCommessaId);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isNew = editingId === "new";
  const commessa = commesse.find((c) => String(c.id) === commessaId);
  const totale = items.reduce((s, i) => s + (i.costo || 0), 0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [commesseList, itemsList] = await Promise.all([
          apiFetch("/commesse"),
          initialCommessaId ? apiFetch(`/commesse/${initialCommessaId}/costi-intervento`) : [],
        ]);
        if (cancelled) return;
        setCommesse(commesseList || []);
        setItems(itemsList || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare i dati");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [initialCommessaId]);

  async function loadItems(id) {
    setLoadingItems(true);
    setError(null);
    try {
      setItems((await apiFetch(`/commesse/${id}/costi-intervento`)) || []);
    } catch (err) {
      setError(err.message || "Impossibile caricare i costi d'intervento");
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  function onChangeCommessa(value) {
    setCommessaId(value);
    setItems([]);
    setEditingId(null);
    if (value) loadItems(value);
  }

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
    const costo = Number(form.costo);
    if (!nome) {
      setFormError("Inserisci il nome del costo");
      return;
    }
    if (!form.data) {
      setFormError("Inserisci la data");
      return;
    }
    if (form.costo === "" || !Number.isFinite(costo) || costo < 0) {
      setFormError("Il costo non può essere negativo");
      return;
    }

    const body = { nome, data: form.data, costo };
    if (isNew) body.commessa_id = Number(commessaId);

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/costi-intervento" : `/costi-intervento/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      await loadItems(commessaId);
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
      await apiFetch(`/costi-intervento/${toDelete.id}`, { method: "DELETE" });
      setItems((list) => list.filter((i) => i.id !== toDelete.id));
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
            <h2>Costi d&apos;intervento</h2>
            <p className="app-home__hint">Spese extra di una commessa, sommate alle spese totali</p>
          </div>
          <button
            type="button"
            className="app-home__new"
            disabled={!commessaId}
            onClick={() => openForm("new", emptyForm())}
          >
            Aggiungi costo
          </button>
        </div>

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && commesse.length === 0 && (
          <p className="app-home__empty">Crea prima una commessa per registrare i costi.</p>
        )}

        {commesse.length > 0 && (
          <div className="app-home__filters admin__filters">
            <div className="app-home__filter">
              <label htmlFor="commessa">Commessa</label>
              <select
                id="commessa"
                value={commessaId}
                onChange={(e) => onChangeCommessa(e.target.value)}
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
          </div>
        )}

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>
              {isNew ? "Aggiungi costo" : "Modifica costo"} - {commessa?.nome}
            </h3>

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
                <label htmlFor="data">Data</label>
                <input
                  id="data"
                  name="data"
                  type="date"
                  value={form.data}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="costo">Costo (€)</label>
                <input
                  id="costo"
                  name="costo"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.costo}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
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

        {loadingItems && <p className="app-home__status">Caricamento...</p>}

        {commessaId && !loading && !loadingItems && items.length === 0 && (
          <p className="app-home__empty">Nessun costo registrato su questa commessa.</p>
        )}

        {items.length > 0 && (
          <>
            <div className="app-home__list">
              {items.map((i) => (
                <div
                  className={
                    editingId === i.id ? "app-home__row app-home__row--selected" : "app-home__row"
                  }
                  key={i.id}
                >
                  <div className="app-home__row-inner">
                    <div className="app-home__sticky">
                      <div className="app-home__cell admin__cell--main">
                        <span className="app-home__label">Nome</span>
                        <span className="app-home__value" title={i.nome}>
                          {i.nome}
                        </span>
                      </div>
                      <div className="app-home__cell admin__cell--short">
                        <span className="app-home__label">Data</span>
                        <span className="app-home__value">{formatData(i.data)}</span>
                      </div>
                      <div className="app-home__cell admin__cell--short">
                        <span className="app-home__label">Costo</span>
                        <span className="app-home__value">{formatEuro(i.costo)}</span>
                      </div>
                      <div className="app-home__actions">
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--edit"
                          onClick={() =>
                            openForm(i.id, {
                              nome: i.nome,
                              data: String(i.data).slice(0, 10),
                              costo: String(i.costo),
                            })
                          }
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--danger"
                          onClick={() => setToDelete(i)}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="admin__total">
              Totale costi d&apos;intervento: {formatEuro(totale)}
              {commessa ? ` - budget commessa ${formatEuro(commessa.budget)}` : ""}
            </p>
          </>
        )}
      </main>

      {toDelete && (
        <ConfirmDelete
          title="Eliminare il costo d'intervento?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per rimuovere <strong>{toDelete.nome}</strong> del{" "}
          <strong>{formatData(toDelete.data)}</strong> dalla commessa{" "}
          <strong>{commessa?.nome}</strong>. L&apos;operazione non si può annullare.
        </ConfirmDelete>
      )}
    </div>
  );
}
