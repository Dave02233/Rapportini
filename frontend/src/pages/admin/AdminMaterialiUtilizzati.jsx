import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api";
import { formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = { materiale_id: "", nome: "", quantita: "1", costo_totale: "" };

function calcCosto(materiale, quantita) {
  const q = Number(quantita);
  if (!materiale || quantita === "" || !Number.isFinite(q)) return "";
  return String(Math.round(materiale.costo_unitario * q * 100) / 100);
}

export default function AdminMaterialiUtilizzati() {
  const [searchParams] = useSearchParams();
  const initialCommessaId = searchParams.get("commessa") || "";

  const [commesse, setCommesse] = useState([]);
  const [materiali, setMateriali] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [commessaId, setCommessaId] = useState(initialCommessaId);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isNew = editingId === "new";
  const materialiById = Object.fromEntries(materiali.map((m) => [m.id, m]));
  const commessa = commesse.find((c) => String(c.id) === commessaId);
  const totale = items.reduce((s, i) => s + (i.costo_totale || 0), 0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [commesseList, materialiList, itemsList] = await Promise.all([
          apiFetch("/commesse"),
          apiFetch("/materiali"),
          initialCommessaId
            ? apiFetch(`/commesse/${initialCommessaId}/materiali-utilizzati`)
            : [],
        ]);
        if (cancelled) return;
        setCommesse(commesseList || []);
        setMateriali(materialiList || []);
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
      setItems((await apiFetch(`/commesse/${id}/materiali-utilizzati`)) || []);
    } catch (err) {
      setError(err.message || "Impossibile caricare i materiali utilizzati");
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

  function onChangeMateriale(value) {
    const m = materialiById[value];
    setForm((f) => ({
      ...f,
      materiale_id: value,
      nome: m ? m.nome : f.nome,
      costo_totale: m ? calcCosto(m, f.quantita) : f.costo_totale,
    }));
  }

  function onChangeQuantita(value) {
    setForm((f) => {
      const m = materialiById[f.materiale_id];
      return {
        ...f,
        quantita: value,
        costo_totale: m ? calcCosto(m, value) : f.costo_totale,
      };
    });
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
    const quantita = Number(form.quantita);
    const costo = Number(form.costo_totale);
    if (!nome) {
      setFormError("Inserisci il nome del materiale");
      return;
    }
    if (!Number.isInteger(quantita) || quantita <= 0) {
      setFormError("La quantità deve essere un numero intero maggiore di zero");
      return;
    }
    if (form.costo_totale === "" || !Number.isFinite(costo) || costo < 0) {
      setFormError("Il costo totale non può essere negativo");
      return;
    }

    const body = {
      materiale_id: form.materiale_id ? Number(form.materiale_id) : null,
      nome,
      quantita,
      costo_totale: costo,
    };
    if (isNew) body.commessa_id = Number(commessaId);

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(
        isNew ? "/materiali-utilizzati" : `/materiali-utilizzati/${editingId}`,
        { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) }
      );
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
      await apiFetch(`/materiali-utilizzati/${toDelete.id}`, { method: "DELETE" });
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
            <h2>Materiali utilizzati</h2>
            <p className="app-home__hint">Materiali impiegati su una commessa</p>
          </div>
          <button
            type="button"
            className="app-home__new"
            disabled={!commessaId}
            onClick={() => openForm("new", EMPTY_FORM)}
          >
            Aggiungi materiale
          </button>
        </div>

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && commesse.length === 0 && (
          <p className="app-home__empty">
            Crea prima una commessa per registrare i materiali utilizzati.
          </p>
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
              {isNew ? "Aggiungi materiale" : "Modifica materiale"} - {commessa?.nome}
            </h3>

            <div className="nuovo__field">
              <label htmlFor="materiale_id">
                Da catalogo <span className="nuovo__optional">(opzionale)</span>
              </label>
              <select
                id="materiale_id"
                value={form.materiale_id}
                onChange={(e) => onChangeMateriale(e.target.value)}
                disabled={saving}
              >
                <option value="">Fuori catalogo</option>
                {materiali.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} ({formatEuro(m.costo_unitario)}/{m.unita})
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

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="quantita">
                  Quantità
                  {materialiById[form.materiale_id]
                    ? ` (${materialiById[form.materiale_id].unita})`
                    : ""}
                </label>
                <input
                  id="quantita"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.quantita}
                  onChange={(e) => onChangeQuantita(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="costo_totale">Costo totale (€)</label>
                <input
                  id="costo_totale"
                  name="costo_totale"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.costo_totale}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
                {form.materiale_id && (
                  <p className="nuovo__hint">Calcolato: costo unitario × quantità</p>
                )}
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
          <p className="app-home__empty">Nessun materiale registrato su questa commessa.</p>
        )}

        {items.length > 0 && (
          <>
            <div className="app-home__list">
              {items.map((i) => {
                const m = i.materiale_id != null ? materialiById[i.materiale_id] : null;
                return (
                  <div
                    className={
                      editingId === i.id
                        ? "app-home__row app-home__row--selected"
                        : "app-home__row"
                    }
                    key={i.id}
                  >
                    <div className="app-home__row-inner">
                      <div className="app-home__sticky">
                        <div className="app-home__cell admin__cell--main">
                          <span className="app-home__label">Materiale</span>
                          <span className="app-home__value" title={i.nome}>
                            {i.nome}
                          </span>
                        </div>
                        <div className="app-home__cell admin__cell--short">
                          <span className="app-home__label">Quantità</span>
                          <span className="app-home__value">
                            {i.quantita}
                            {m ? ` ${m.unita}` : ""}
                          </span>
                        </div>
                        <div className="app-home__cell admin__cell--short">
                          <span className="app-home__label">Costo</span>
                          <span className="app-home__value">
                            {formatEuro(i.costo_totale)}
                          </span>
                        </div>
                        <div className="app-home__actions">
                          <button
                            type="button"
                            className="app-home__btn app-home__btn--edit"
                            onClick={() =>
                              openForm(i.id, {
                                materiale_id:
                                  i.materiale_id != null ? String(i.materiale_id) : "",
                                nome: i.nome,
                                quantita: String(i.quantita),
                                costo_totale: String(i.costo_totale),
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

                      <div className="app-home__extra">
                        <div className="app-home__cell">
                          <span className="app-home__label">Origine</span>
                          <span
                            className={
                              m ? "app-home__value" : "app-home__value app-home__value--muted"
                            }
                          >
                            {m ? "Catalogo" : "Fuori catalogo"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="admin__total">
              Totale materiali: {formatEuro(totale)}
              {commessa ? ` - budget commessa ${formatEuro(commessa.budget)}` : ""}
            </p>
          </>
        )}
      </main>

      {toDelete && (
        <ConfirmDelete
          title="Eliminare il materiale utilizzato?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per rimuovere <strong>{toDelete.nome}</strong> dalla commessa{" "}
          <strong>{commessa?.nome}</strong>. L&apos;operazione non si può annullare.
        </ConfirmDelete>
      )}
    </div>
  );
}
