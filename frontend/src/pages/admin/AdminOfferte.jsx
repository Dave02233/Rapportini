import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { formatData, formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import MapPicker from "../../components/MapPicker";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const ESITO = {
  accettata: "Accettata",
  rifiutata: "Rifiutata",
  in_attesa: "In attesa",
};

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function emptyForm() {
  return {
    cliente_id: "",
    nome: "",
    prezzo_iniziale: "",
    sconto: "0",
    prezzo_finale: "",
    data_invio: todayISO(),
    data_risposta: "",
    esito: "in_attesa",
    note: "",
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatSconto(value) {
  return `${Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
}

function riepilogo(offerte) {
  const out = {
    totale: 0,
    accettata: 0,
    rifiutata: 0,
    in_attesa: 0,
    nAccettata: 0,
    nRifiutata: 0,
    nAttesa: 0,
  };
  for (const o of offerte) {
    const prezzo = Number(o.prezzo_finale) || 0;
    out.totale += prezzo;
    if (o.esito === "accettata") {
      out.accettata += prezzo;
      out.nAccettata += 1;
    } else if (o.esito === "rifiutata") {
      out.rifiutata += prezzo;
      out.nRifiutata += 1;
    } else {
      out.in_attesa += prezzo;
      out.nAttesa += 1;
    }
  }
  const risposte = out.nAccettata + out.nRifiutata;
  out.successo = risposte === 0 ? null : out.nAccettata / risposte;
  return out;
}

function pieBackground(r) {
  const total = r.accettata + r.rifiutata + r.in_attesa;
  if (total <= 0) return "var(--color-surface)";
  const slices = [
    ["var(--color-success)", r.accettata],
    ["var(--offerte-rifiutata)", r.rifiutata],
    ["var(--color-ink)", r.in_attesa],
  ];
  let at = 0;
  const stops = slices.map(([color, value]) => {
    const start = at;
    at += (value / total) * 100;
    return `${color} ${start}% ${at}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function Torta({ r }) {
  const label = `Importi per esito: accettate ${formatEuro(r.accettata)}, rifiutate ${formatEuro(r.rifiutata)}, in attesa ${formatEuro(r.in_attesa)}`;
  return (
    <div className="offerte-pie">
      <div
        className="offerte-pie__disc"
        style={{ background: pieBackground(r) }}
        role="img"
        aria-label={label}
      />
      <div>
        <span className="app-home__label">Importi per esito</span>
        <ul className="offerte-pie__legend">
          <li>
            <i className="offerte-swatch offerte-swatch--accettata" aria-hidden="true" />
            Accettata - {formatEuro(r.accettata)}
          </li>
          <li>
            <i className="offerte-swatch offerte-swatch--rifiutata" aria-hidden="true" />
            Rifiutata - {formatEuro(r.rifiutata)}
          </li>
          <li>
            <i className="offerte-swatch offerte-swatch--in_attesa" aria-hidden="true" />
            In attesa - {formatEuro(r.in_attesa)}
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function AdminOfferte() {
  const [offerte, setOfferte] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [toCommessa, setToCommessa] = useState(null);
  const [commessaForm, setCommessaForm] = useState({ lat: "", lon: "" });
  const [commessaError, setCommessaError] = useState(null);
  const [promoting, setPromoting] = useState(false);

  const isNew = editingId === "new";
  const esitoBloccato =
    !isNew && offerte.some((o) => o.id === editingId && o.commessa_id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [offerteList, clientiList] = await Promise.all([
          apiFetch("/offerte"),
          apiFetch("/clienti"),
        ]);
        if (cancelled) return;
        setOfferte(offerteList || []);
        setClienti(clientiList || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare le offerte");
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
    setForm((f) => {
      const next = { ...f, [name]: value };
      if (name === "prezzo_iniziale" || name === "sconto") {
        const iniziale = next.prezzo_iniziale === "" ? null : Number(next.prezzo_iniziale);
        const sconto = next.sconto === "" ? 0 : Number(next.sconto);
        if (iniziale !== null && Number.isFinite(iniziale) && Number.isFinite(sconto)) {
          const finale = round2(iniziale * (1 - sconto / 100));
          if (finale < 0) {
            next.prezzo_finale = "0";
            next.sconto = "100";
          } else {
            next.prezzo_finale = String(finale);
          }
        }
      }
      if (name === "prezzo_finale") {
        const iniziale = Number(next.prezzo_iniziale);
        const finale = next.prezzo_finale === "" ? null : Number(next.prezzo_finale);
        if (finale !== null && Number.isFinite(iniziale) && iniziale !== 0 && Number.isFinite(finale)) {
          next.sconto = String(round2((1 - finale / iniziale) * 100));
        }
      }
      return next;
    });
  }

  function openForm(id, values) {
    setForm(values);
    setFormError(null);
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCommessa(o) {
    setCommessaError(null);
    setCommessaForm({ lat: "", lon: "" });
    setToCommessa(o);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    const iniziale = Number(form.prezzo_iniziale);
    const sconto = form.sconto === "" ? 0 : Number(form.sconto);
    const finale = Number(form.prezzo_finale);
    if (!form.cliente_id) {
      setFormError("Seleziona un cliente");
      return;
    }
    if (!nome) {
      setFormError("Inserisci il nome dell'offerta");
      return;
    }
    if (form.prezzo_iniziale === "" || !Number.isFinite(iniziale) || iniziale < 0) {
      setFormError("Il prezzo iniziale non può essere negativo");
      return;
    }
    if (!Number.isFinite(sconto)) {
      setFormError("Sconto non valido");
      return;
    }
    if (form.prezzo_finale === "" || !Number.isFinite(finale) || finale < 0) {
      setFormError("Il prezzo finale non può essere negativo");
      return;
    }
    if (form.data_risposta && form.data_risposta < form.data_invio) {
      setFormError("La data di risposta non può precedere la data di invio");
      return;
    }

    const body = {
      cliente_id: Number(form.cliente_id),
      nome,
      prezzo_iniziale: iniziale,
      sconto,
      prezzo_finale: finale,
      data_invio: form.data_invio,
      data_risposta: form.data_risposta || null,
      esito: esitoBloccato ? "accettata" : form.esito,
      note: form.note.trim() || null,
    };

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/offerte" : `/offerte/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      setOfferte(await apiFetch("/offerte"));
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
      await apiFetch(`/offerte/${toDelete.id}`, { method: "DELETE" });
      setOfferte((list) => list.filter((o) => o.id !== toDelete.id));
      if (editingId === toDelete.id) setEditingId(null);
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  async function confirmCommessa() {
    const lat = Number(commessaForm.lat);
    const lon = Number(commessaForm.lon);
    if (commessaForm.lat === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCommessaError("Latitudine non valida: clicca sulla mappa o inseriscila");
      return;
    }
    if (commessaForm.lon === "" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCommessaError("Longitudine non valida: clicca sulla mappa o inseriscila");
      return;
    }

    setPromoting(true);
    setCommessaError(null);
    try {
      await apiFetch(`/offerte/${toCommessa.id}/commessa`, {
        method: "POST",
        body: JSON.stringify({ lat, lon }),
      });
      setOfferte(await apiFetch("/offerte"));
      setToCommessa(null);
    } catch (err) {
      setCommessaError(err.message || "Creazione della commessa non riuscita");
    } finally {
      setPromoting(false);
    }
  }

  const r = riepilogo(offerte);
  const successo = r.successo == null ? "-" : `${Math.round(r.successo * 100)}%`;

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <div>
            <h2>Offerte</h2>
            <p className="app-home__hint">
              Il nome, sotto il cliente, diventa il nome della commessa. Totali e grafico usano il prezzo finale.
            </p>
          </div>
          <button
            type="button"
            className="app-home__new"
            disabled={clienti.length === 0}
            onClick={() => openForm("new", emptyForm())}
          >
            Nuova offerta
          </button>
        </div>

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && !error && clienti.length === 0 && (
          <p className="app-home__empty">Crea prima un cliente: ogni offerta è collegata a un cliente.</p>
        )}

        {!loading && !error && (
          <div className="offerte-riepilogo">
            <section className="admin-stats" aria-label="Totali offerte">
              <div className="admin-stats__item">
                <span className="app-home__label">Totale</span>
                <strong>{formatEuro(r.totale)}</strong>
                <span className="admin-stats__sub">{offerte.length} in registro</span>
              </div>
              <div className="admin-stats__item">
                <span className="app-home__label">Accettate</span>
                <strong>{formatEuro(r.accettata)}</strong>
                <span className="admin-stats__sub">{r.nAccettata} a buon fine</span>
              </div>
              <div className="admin-stats__item">
                <span className="app-home__label">Rifiutate</span>
                <strong>{formatEuro(r.rifiutata)}</strong>
                <span className="admin-stats__sub">{r.nRifiutata} rifiutate</span>
              </div>
              <div className="admin-stats__item">
                <span className="app-home__label">In attesa</span>
                <strong>{formatEuro(r.in_attesa)}</strong>
                <span className="admin-stats__sub">{r.nAttesa} senza risposta</span>
              </div>
              <div className="admin-stats__item">
                <span className="app-home__label">% successo</span>
                <strong>{successo}</strong>
                <span className="admin-stats__sub">accettate su accettate + rifiutate</span>
              </div>
            </section>
            <Torta r={r} />
          </div>
        )}

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{isNew ? "Nuova offerta" : "Modifica offerta"}</h3>

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

            <div className="offerte-prezzi">
              <div className="nuovo__field">
                <label htmlFor="prezzo_iniziale">Prezzo iniziale (€)</label>
                <input
                  id="prezzo_iniziale"
                  name="prezzo_iniziale"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.prezzo_iniziale}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="sconto">Sconto applicato finale (%)</label>
                <input
                  id="sconto"
                  name="sconto"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.sconto}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="prezzo_finale">Prezzo finale (€)</label>
                <input
                  id="prezzo_finale"
                  name="prezzo_finale"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.prezzo_finale}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
            </div>

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="data_invio">Data di invio</label>
                <input
                  id="data_invio"
                  name="data_invio"
                  type="date"
                  value={form.data_invio}
                  max={form.data_risposta || undefined}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="data_risposta">
                  Data di risposta <span className="nuovo__optional">(opz.)</span>
                </label>
                <input
                  id="data_risposta"
                  name="data_risposta"
                  type="date"
                  value={form.data_risposta}
                  min={form.data_invio || undefined}
                  onChange={onChange}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="nuovo__field">
              <label htmlFor="esito">Esito</label>
              <select
                id="esito"
                name="esito"
                value={form.esito}
                onChange={onChange}
                disabled={saving || esitoBloccato}
              >
                {Object.entries(ESITO).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {esitoBloccato && (
                <p className="nuovo__hint">È già una commessa: l&apos;esito resta Accettata.</p>
              )}
            </div>

            <div className="nuovo__field">
              <label htmlFor="note">
                Note <span className="nuovo__optional">(opzionale)</span>
              </label>
              <textarea
                id="note"
                name="note"
                rows={3}
                value={form.note}
                onChange={onChange}
                disabled={saving}
              />
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

        {!loading && !error && offerte.length === 0 && clienti.length > 0 && (
          <p className="app-home__empty">Nessuna offerta registrata.</p>
        )}

        {offerte.length > 0 && (
          <div className="app-home__list" aria-label="Elenco offerte">
            {offerte.map((o) => (
              <div
                className={
                  editingId === o.id ? "app-home__row app-home__row--selected" : "app-home__row"
                }
                key={o.id}
              >
                <div className="app-home__row-inner">
                  <div className="app-home__sticky">
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Cliente</span>
                      <span className="app-home__value" title={o.cliente}>
                        {o.cliente}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Nome</span>
                      <span className="app-home__value" title={o.nome}>
                        {o.nome}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Prezzo finale</span>
                      <span className="app-home__value">{formatEuro(o.prezzo_finale)}</span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Esito</span>
                      <span className={`app-home__value offerte-esito offerte-esito--${o.esito}`}>
                        {ESITO[o.esito] || o.esito}
                      </span>
                    </div>
                    <div className="app-home__actions">
                      {o.commessa_id ? (
                        <Link
                          className="app-home__btn app-home__btn--ghost"
                          to={`/admin/commesse/${o.commessa_id}`}
                        >
                          Apri commessa
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--edit"
                          onClick={() => openCommessa(o)}
                        >
                          Crea commessa
                        </button>
                      )}
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--ghost"
                        onClick={() =>
                          openForm(o.id, {
                            cliente_id: String(o.cliente_id),
                            nome: o.nome || "",
                            prezzo_iniziale: String(o.prezzo_iniziale),
                            sconto: String(o.sconto ?? 0),
                            prezzo_finale: String(o.prezzo_finale),
                            data_invio: String(o.data_invio).slice(0, 10),
                            data_risposta: o.data_risposta ? String(o.data_risposta).slice(0, 10) : "",
                            esito: o.esito,
                            note: o.note || "",
                          })
                        }
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--danger"
                        onClick={() => setToDelete(o)}
                      >
                        Elimina
                      </button>
                    </div>
                  </div>

                  <div className="app-home__extra">
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Iniziale</span>
                      <span className="app-home__value">{formatEuro(o.prezzo_iniziale)}</span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Sconto</span>
                      <span className="app-home__value">{formatSconto(o.sconto)}</span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Invio</span>
                      <span className="app-home__value">{formatData(o.data_invio)}</span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Risposta</span>
                      <span className="app-home__value">{formatData(o.data_risposta)}</span>
                    </div>
                    <div className="app-home__cell admin__cell--text">
                      <span className="app-home__label">Note</span>
                      <span
                        className={
                          o.note ? "app-home__value" : "app-home__value app-home__value--muted"
                        }
                        title={o.note || undefined}
                      >
                        {o.note || "-"}
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
          title="Eliminare l'offerta?"
          busy={deleting}
          onCancel={() => !deleting && setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.nome}</strong> di <strong>{toDelete.cliente}</strong>{" "}
          ({formatEuro(toDelete.prezzo_finale)}).
          {toDelete.commessa_id ? " La commessa già creata resta." : ""}
        </ConfirmDelete>
      )}

      {toCommessa && (
        <div
          className="app-home__modal-backdrop"
          role="presentation"
          onClick={() => !promoting && setToCommessa(null)}
        >
          <div
            className="app-home__modal app-home__modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offerta-commessa-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="offerta-commessa-title">Creare la commessa?</h3>
            <p>
              <strong>{toCommessa.nome}</strong> di <strong>{toCommessa.cliente}</strong> diventa una
              commessa in corso, budget {formatEuro(toCommessa.prezzo_finale)}. L&apos;esito passa ad
              Accettata.
            </p>

            <div className="nuovo__field">
              <span className="admin__field-label">Posizione</span>
              <MapPicker
                lat={commessaForm.lat}
                lon={commessaForm.lon}
                onPick={(lat, lon) =>
                  setCommessaForm((f) => ({ ...f, lat: String(lat), lon: String(lon) }))
                }
              />
            </div>

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="commessa-lat">Latitudine</label>
                <input
                  id="commessa-lat"
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={commessaForm.lat}
                  onChange={(e) => setCommessaForm((f) => ({ ...f, lat: e.target.value }))}
                  disabled={promoting}
                />
              </div>
              <div className="nuovo__field">
                <label htmlFor="commessa-lon">Longitudine</label>
                <input
                  id="commessa-lon"
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={commessaForm.lon}
                  onChange={(e) => setCommessaForm((f) => ({ ...f, lon: e.target.value }))}
                  disabled={promoting}
                />
              </div>
            </div>

            {commessaError && <p className="nuovo__error">{commessaError}</p>}

            <div className="app-home__modal-actions">
              <button
                type="button"
                className="app-home__btn app-home__btn--ghost"
                disabled={promoting}
                onClick={() => setToCommessa(null)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="app-home__btn app-home__btn--edit"
                disabled={promoting}
                onClick={confirmCommessa}
              >
                {promoting ? "Creazione..." : "Crea commessa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
