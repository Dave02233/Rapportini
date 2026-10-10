import { useState } from "react";
import { apiFetch } from "../../api";
import MapPicker from "../../components/MapPicker";
import { STATO_COMMESSA } from "./commesse";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = {
  cliente_id: "",
  nome: "",
  descrizione: "",
  stato: "in_corso",
  budget: "",
  data_inizio: "",
  data_fine: "",
  lat: "",
  lon: "",
};

function toForm(c) {
  if (!c) return EMPTY_FORM;
  return {
    cliente_id: String(c.cliente_id),
    nome: c.nome,
    descrizione: c.descrizione || "",
    stato: c.stato,
    budget: String(c.budget),
    data_inizio: c.data_inizio || "",
    data_fine: c.data_fine || "",
    lat: String(c.lat),
    lon: String(c.lon),
  };
}

// commessa = null -> creazione; onSaved riceve la commessa restituita dall'API
export default function CommessaForm({ commessa, clienti, onSaved, onCancel }) {
  const isNew = !commessa;
  const [form, setForm] = useState(() => toForm(commessa));
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function onPick(lat, lon) {
    setForm((f) => ({ ...f, lat: String(lat), lon: String(lon) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    const budget = Number(form.budget);
    const lat = Number(form.lat);
    const lon = Number(form.lon);

    if (!form.cliente_id || !nome) {
      setFormError("Cliente e nome sono obbligatori");
      return;
    }
    if (form.budget === "" || !Number.isFinite(budget) || budget < 0) {
      setFormError("Il budget non può essere negativo");
      return;
    }
    if (form.data_inizio && form.data_fine && form.data_fine < form.data_inizio) {
      setFormError("La data di fine non può precedere la data di inizio");
      return;
    }
    if (form.lat === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      setFormError("Latitudine non valida (da -90 a 90): clicca sulla mappa o inseriscila");
      return;
    }
    if (form.lon === "" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setFormError("Longitudine non valida (da -180 a 180): clicca sulla mappa o inseriscila");
      return;
    }

    const body = {
      cliente_id: Number(form.cliente_id),
      nome,
      descrizione: form.descrizione.trim() || null,
      stato: form.stato,
      budget,
      data_inizio: form.data_inizio || null,
      data_fine: form.data_fine || null,
      lat,
      lon,
    };

    setSaving(true);
    setFormError(null);
    try {
      const saved = await apiFetch(isNew ? "/commesse" : `/commesse/${commessa.id}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      onSaved(saved);
    } catch (err) {
      setFormError(err.message || "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-panel" onSubmit={handleSubmit}>
      <h3>{isNew ? "Nuova commessa" : "Modifica commessa"}</h3>

      <div className="nuovo__field">
        <label htmlFor="cliente_id">Cliente</label>
        <select
          id="cliente_id"
          name="cliente_id"
          value={form.cliente_id}
          onChange={onChange}
          required
          disabled={saving}
        >
          <option value="">Seleziona cliente</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ragione_sociale}
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

      <div className="nuovo__row">
        <div className="nuovo__field">
          <label htmlFor="stato">Stato</label>
          <select
            id="stato"
            name="stato"
            value={form.stato}
            onChange={onChange}
            disabled={saving}
          >
            {Object.entries(STATO_COMMESSA).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="nuovo__field">
          <label htmlFor="budget">Budget (€)</label>
          <input
            id="budget"
            name="budget"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.budget}
            onChange={onChange}
            required
            disabled={saving}
          />
        </div>
      </div>

      <div className="nuovo__row">
        <div className="nuovo__field">
          <label htmlFor="data_inizio">
            Inizio <span className="nuovo__optional">(opz.)</span>
          </label>
          <input
            id="data_inizio"
            name="data_inizio"
            type="date"
            value={form.data_inizio}
            max={form.data_fine || undefined}
            onChange={onChange}
            disabled={saving}
          />
        </div>
        <div className="nuovo__field">
          <label htmlFor="data_fine">
            Fine <span className="nuovo__optional">(opz.)</span>
          </label>
          <input
            id="data_fine"
            name="data_fine"
            type="date"
            value={form.data_fine}
            min={form.data_inizio || undefined}
            onChange={onChange}
            disabled={saving}
          />
        </div>
      </div>

      <div className="nuovo__field">
        <span className="admin__field-label">Posizione</span>
        <MapPicker lat={form.lat} lon={form.lon} onPick={onPick} />
        <p className="nuovo__hint">
          Cerca un indirizzo, clicca sulla mappa, oppure inserisci le coordinate
          in gradi decimali.
        </p>
      </div>

      <div className="nuovo__row">
        <div className="nuovo__field">
          <label htmlFor="lat">Latitudine</label>
          <input
            id="lat"
            name="lat"
            type="number"
            min="-90"
            max="90"
            step="any"
            inputMode="decimal"
            value={form.lat}
            onChange={onChange}
            required
            disabled={saving}
          />
        </div>
        <div className="nuovo__field">
          <label htmlFor="lon">Longitudine</label>
          <input
            id="lon"
            name="lon"
            type="number"
            min="-180"
            max="180"
            step="any"
            inputMode="decimal"
            value={form.lon}
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
          onClick={onCancel}
        >
          Annulla
        </button>
      </div>
    </form>
  );
}
