import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { useAuth } from "../../auth/useAuth";
import { apiFetch } from "../../api";
import { byId, formatEuro } from "../../format";
import { DEFAULT_CENTER, createMap } from "../../map";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import { STATO_COMMESSA, speseCommessa } from "./commesse";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

// Il DB salva TIMESTAMP naive in UTC (NOW() del container); in UI lo mostriamo a Roma.
function formatOrario(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RAGGIO_COMMESSA_M = 2000;

function textEl(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
}

function dotClassCommessa(c) {
  return speseCommessa(c) > c.budget ? "map-dot map-dot--over" : "map-dot map-dot--ok";
}

function riepilogoCommessa(c) {
  return `${STATO_COMMESSA[c.stato] || c.stato} - ${formatEuro(speseCommessa(c))} su ${formatEuro(c.budget)}`;
}

/** Chaikin: raccorda gli angoli del tracciato (stile Maps). */
function smoothLatLngs(points, iterations = 3) {
  if (points.length < 3) return points;
  let pts = points;
  for (let n = 0; n < iterations; n++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      next.push([(p[0] * 3 + q[0]) / 4, (p[1] * 3 + q[1]) / 4]);
      next.push([(p[0] + q[0] * 3) / 4, (p[1] + q[1] * 3) / 4]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

function PosizioniMappa({ positions, commesseVicine }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);

  useEffect(() => {
    const map = createMap(containerRef.current);
    const latlngs = positions.map((p) => [Number(p.lat), Number(p.lon)]);
    const bounds = [];

    if (latlngs.length > 1) {
      const smooth = smoothLatLngs(latlngs);
      L.polyline(smooth, {
        className: "map-track-outline",
        interactive: false,
        weight: 7,
        color: "#fff",
        opacity: 0.85,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);
      L.polyline(smooth, {
        className: "map-track",
        interactive: false,
        weight: 4,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);
      bounds.push(...smooth);
    }

    if (latlngs.length >= 1) {
      L.circleMarker(latlngs[0], { radius: 6, className: "map-dot map-dot--start", interactive: false }).addTo(
        map,
      );
      bounds.push(latlngs[0]);
      if (latlngs.length > 1) {
        L.circleMarker(latlngs[latlngs.length - 1], {
          radius: 7,
          className: "map-dot map-dot--end",
          interactive: false,
        }).addTo(map);
        bounds.push(latlngs[latlngs.length - 1]);
      }
    }

    for (const c of commesseVicine || []) {
      const latlng = [Number(c.lat), Number(c.lon)];
      const open = () => navigate(`/admin/commesse/${c.id}`);
      L.circle(latlng, {
        radius: RAGGIO_COMMESSA_M,
        className: "map-commessa-raggio",
        interactive: false,
        weight: 1,
        opacity: 0.22,
        fillOpacity: 0.07,
      }).addTo(map);
      // Hover/label come in Mappa; pallino più piccolo per non competere col raggio
      L.circleMarker(latlng, { radius: 6, className: dotClassCommessa(c) })
        .bindTooltip(textEl(riepilogoCommessa(c)), { direction: "bottom", offset: [0, 12] })
        .on("click", open)
        .addTo(map);
      L.tooltip({
        permanent: true,
        direction: "top",
        offset: [0, -12],
        interactive: true,
        className: `map-label map-label--${c.stato}`,
      })
        .setLatLng(latlng)
        .setContent(textEl(c.nome))
        .on("click", open)
        .addTo(map);
      bounds.push(latlng);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    } else {
      map.setView(DEFAULT_CENTER, 9);
    }
    requestAnimationFrame(() => map.invalidateSize());

    return () => map.remove();
  }, [positions, commesseVicine, navigate]);

  return <div ref={containerRef} className="map map--overview" />;
}

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "tecnico",
  costo_orario: "0",
  veicolo_predefinito: "",
};
const ROLE_LABEL = { tecnico: "Tecnico", admin: "Admin" };

export default function AdminUtenti() {
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [veicoli, setVeicoli] = useState([]);
  const [commesseVicine, setCommesseVicine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [positionToDelete, setPositionToDelete] = useState(null);
  const [deletingPosition, setDeletingPosition] = useState(false);

  const [positionsUser, setPositionsUser] = useState(null);
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState(null);
  const [filterDataDa, setFilterDataDa] = useState("");
  const [filterDataA, setFilterDataA] = useState("");

  const isNew = editingId === "new";
  const isSelf = (id) => String(id) === String(user?.id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [usersList, veicoliList] = await Promise.all([
          apiFetch("/users"),
          apiFetch("/veicoli"),
        ]);
        if (cancelled) return;
        setUsers(usersList || []);
        setVeicoli(veicoliList || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare gli utenti");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const veicoliById = byId(veicoli);
  const datesActive = Boolean(filterDataDa || filterDataA);

  function positionsQuery() {
    const params = new URLSearchParams();
    if (filterDataDa) params.set("dal", filterDataDa);
    if (filterDataA) params.set("al", filterDataA);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  useEffect(() => {
    if (!positionsUser) return;
    let cancelled = false;
    const userId = positionsUser.id;

    async function load() {
      setPositionsLoading(true);
      setPositionsError(null);
      const qs = positionsQuery();
      try {
        const [list, vicine] = await Promise.all([
          apiFetch(`/users/${userId}/positions${qs}`),
          apiFetch(`/users/${userId}/commesse-vicine${qs}`),
        ]);
        if (!cancelled) {
          setPositions(list || []);
          setCommesseVicine(vicine || []);
        }
      } catch (err) {
        if (!cancelled) {
          setPositions([]);
          setCommesseVicine([]);
          setPositionsError(err.message || "Impossibile caricare le posizioni");
        }
      } finally {
        if (!cancelled) setPositionsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [positionsUser, filterDataDa, filterDataA]);

  function openPositions(utente) {
    if (positionsUser?.id === utente.id) {
      setPositionsUser(null);
      setPositions([]);
      setCommesseVicine([]);
      return;
    }
    setFilterDataDa("");
    setFilterDataA("");
    setPositions([]);
    setCommesseVicine([]);
    setPositionsError(null);
    setPositionsLoading(true);
    setPositionsUser(utente);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const username = form.username.trim();
    const costo = Number(form.costo_orario);
    if (!username) {
      setFormError("Inserisci uno username");
      return;
    }
    if (isNew && !form.password) {
      setFormError("Inserisci una password");
      return;
    }
    if (!Number.isFinite(costo) || costo < 0 || costo > 999.99) {
      setFormError("Il costo orario deve essere tra 0 e 999,99 €");
      return;
    }

    const body = {
      username,
      role: form.role,
      costo_orario: costo,
      veicolo_predefinito: form.veicolo_predefinito ? Number(form.veicolo_predefinito) : null,
    };
    if (isNew) {
      body.password = form.password;
    } else if (form.password) {
      body.password = form.password;
    }

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/users" : `/users/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      setUsers(await apiFetch("/users"));
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
      await apiFetch(`/users/${toDelete.id}`, { method: "DELETE" });
      setUsers((list) => list.filter((u) => u.id !== toDelete.id));
      if (editingId === toDelete.id) setEditingId(null);
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  async function confirmDeletePosition() {
    setDeletingPosition(true);
    setPositionsError(null);
    try {
      await apiFetch(`/users/positions/${positionToDelete.id}`, { method: "DELETE" });
      setPositions((list) => list.filter((p) => p.id !== positionToDelete.id));
    } catch (err) {
      setPositionsError(err.message || "Eliminazione posizione non riuscita");
      setDeletingPosition(false);
      setPositionToDelete(null);
      return;
    }
    try {
      const qs = positionsQuery();
      setCommesseVicine(
        (await apiFetch(`/users/${positionsUser.id}/commesse-vicine${qs}`)) || [],
      );
    } catch (err) {
      setPositionsError(err.message || "Impossibile aggiornare le commesse vicine");
    } finally {
      setDeletingPosition(false);
      setPositionToDelete(null);
    }
  }

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <h2>Utenti</h2>
          <button
            type="button"
            className="app-home__new"
            onClick={() => openForm("new", EMPTY_FORM)}
          >
            Nuovo utente
          </button>
        </div>

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{isNew ? "Nuovo utente" : "Modifica utente"}</h3>
            <div className="nuovo__field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                value={form.username}
                onChange={onChange}
                autoComplete="off"
                required
                disabled={saving}
              />
            </div>

            <div className="nuovo__field">
              <label htmlFor="password">
                Password
                {!isNew && (
                  <span className="nuovo__optional"> (lascia vuoto per non cambiarla)</span>
                )}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={onChange}
                autoComplete="new-password"
                required={isNew}
                disabled={saving}
              />
            </div>

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="role">Ruolo</label>
                <select
                  id="role"
                  name="role"
                  value={form.role}
                  onChange={onChange}
                  disabled={saving || isSelf(editingId)}
                >
                  <option value="tecnico">Tecnico</option>
                  <option value="admin">Admin</option>
                </select>
                {isSelf(editingId) && (
                  <p className="nuovo__hint">Non puoi cambiare il tuo ruolo.</p>
                )}
              </div>
              <div className="nuovo__field">
                <label htmlFor="costo_orario">Costo orario (€)</label>
                <input
                  id="costo_orario"
                  name="costo_orario"
                  type="number"
                  min="0"
                  max="999.99"
                  step="0.01"
                  inputMode="decimal"
                  value={form.costo_orario}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
            </div>

            <div className="nuovo__field">
              <label htmlFor="veicolo_predefinito">
                Veicolo predefinito <span className="nuovo__optional">(opzionale)</span>
              </label>
              <select
                id="veicolo_predefinito"
                name="veicolo_predefinito"
                value={form.veicolo_predefinito}
                onChange={onChange}
                disabled={saving}
              >
                <option value="">Nessun veicolo</option>
                {veicoli.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.targa}
                  </option>
                ))}
              </select>
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

        {positionsUser && (
          <section className="admin-positions" aria-label={`Posizioni di ${positionsUser.username}`}>
            <div className="app-home__section-head">
              <div>
                <h3>Posizioni di {positionsUser.username}</h3>
                <p className="app-home__hint">
                  Senza date: ultime 24 ore. Una data: quel giorno. Due date: l'intervallo, al massimo 31 giorni.
                  Percorso dal più vecchio al più recente; commesse aperte entro 2 km con raggio evidenziato.
                </p>
              </div>
              <button
                type="button"
                className="app-home__btn app-home__btn--ghost"
                onClick={() => {
                  setPositionsUser(null);
                  setPositions([]);
                  setCommesseVicine([]);
                }}
              >
                Chiudi
              </button>
            </div>

            <div className="app-home__filters app-home__filters--dates" aria-label="Filtro temporale">
              <div className="app-home__filter">
                <label htmlFor="pos-data-da">Data da</label>
                <input
                  id="pos-data-da"
                  type="date"
                  value={filterDataDa}
                  max={filterDataA || undefined}
                  onChange={(e) => setFilterDataDa(e.target.value)}
                />
              </div>
              <div className="app-home__filter">
                <label htmlFor="pos-data-a">Data a</label>
                <input
                  id="pos-data-a"
                  type="date"
                  value={filterDataA}
                  min={filterDataDa || undefined}
                  onChange={(e) => setFilterDataA(e.target.value)}
                />
              </div>
              {datesActive && (
                <button
                  type="button"
                  className="app-home__filters-reset"
                  onClick={() => {
                    setFilterDataDa("");
                    setFilterDataA("");
                  }}
                >
                  Azzera filtri
                </button>
              )}
            </div>

            {positionsError && <p className="app-home__error">{positionsError}</p>}
            {positionsLoading && <p className="app-home__status">Caricamento...</p>}
            {!positionsLoading && !positionsError && (
              <PosizioniMappa positions={positions} commesseVicine={commesseVicine} />
            )}
            {!positionsLoading && !positionsError && positions.length === 0 && (
              <p className="app-home__empty">Nessuna posizione in questo intervallo.</p>
            )}
            {!positionsLoading && !positionsError && positions.length > 0 && (
              <div className="app-home__list" aria-label="Elenco posizioni">
                {[...positions].reverse().map((p) => (
                  <div className="app-home__row" key={p.id}>
                    <div className="app-home__row-inner">
                      <div className="app-home__sticky">
                        <div className="app-home__cell admin__cell--main">
                          <span className="app-home__label">Orario</span>
                          <span className="app-home__value">{formatOrario(p.data_aggiornamento)}</span>
                        </div>
                        <div className="app-home__cell admin__cell--short">
                          <span className="app-home__label">Lat</span>
                          <span className="app-home__value">{Number(p.lat).toFixed(5)}</span>
                        </div>
                        <div className="app-home__cell admin__cell--short">
                          <span className="app-home__label">Lon</span>
                          <span className="app-home__value">{Number(p.lon).toFixed(5)}</span>
                        </div>
                        <div className="app-home__actions">
                          <button
                            type="button"
                            className="app-home__btn app-home__btn--danger"
                            onClick={() => setPositionToDelete(p)}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && users.length === 0 && (
          <p className="app-home__empty">Nessun utente registrato.</p>
        )}

        {users.length > 0 && (
          <div className="app-home__list">
            {users.map((u) => (
              <div
                className={
                  editingId === u.id || positionsUser?.id === u.id
                    ? "app-home__row app-home__row--selected"
                    : "app-home__row"
                }
                key={u.id}
              >
                <div className="app-home__row-inner">
                  <div className="app-home__sticky">
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Username</span>
                      <span className="app-home__value" title={u.username}>
                        {u.username}
                        {isSelf(u.id) ? " (tu)" : ""}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Ruolo</span>
                      <span className="app-home__value">{ROLE_LABEL[u.role] || u.role}</span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Veicolo</span>
                      <span
                        className={
                          u.veicolo_predefinito != null
                            ? "app-home__value"
                            : "app-home__value app-home__value--muted"
                        }
                      >
                        {u.veicolo_predefinito != null
                          ? veicoliById[u.veicolo_predefinito]?.targa || `#${u.veicolo_predefinito}`
                          : "-"}
                      </span>
                    </div>
                    <div className="app-home__actions">
                      <button
                        type="button"
                        className={
                          positionsUser?.id === u.id
                            ? "app-home__btn app-home__btn--edit"
                            : "app-home__btn app-home__btn--ghost"
                        }
                        aria-pressed={positionsUser?.id === u.id}
                        onClick={() => openPositions(u)}
                      >
                        Posizioni
                      </button>
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--edit"
                        onClick={() =>
                          openForm(u.id, {
                            username: u.username,
                            password: "",
                            role: u.role,
                            costo_orario: String(u.costo_orario),
                            veicolo_predefinito:
                              u.veicolo_predefinito != null ? String(u.veicolo_predefinito) : "",
                          })
                        }
                      >
                        Modifica
                      </button>
                      {!isSelf(u.id) && (
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--danger"
                          onClick={() => setToDelete(u)}
                        >
                          Elimina
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="app-home__extra">
                    <div className="app-home__cell">
                      <span className="app-home__label">Costo orario</span>
                      <span className="app-home__value">
                        {formatEuro(u.costo_orario)}/h
                      </span>
                    </div>
                    <div className="app-home__cell">
                      <span className="app-home__label">ID</span>
                      <span className="app-home__value app-home__value--muted">
                        #{u.id}
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
          title="Eliminare l'utente?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.username}</strong>. Non è possibile
          se ha interventi registrati.
        </ConfirmDelete>
      )}

      {positionToDelete && (
        <ConfirmDelete
          title="Eliminare la posizione?"
          busy={deletingPosition}
          onCancel={() => setPositionToDelete(null)}
          onConfirm={confirmDeletePosition}
        >
          Stai per eliminare il punto del{" "}
          <strong>{formatOrario(positionToDelete.data_aggiornamento)}</strong> (
          {Number(positionToDelete.lat).toFixed(5)}, {Number(positionToDelete.lon).toFixed(5)}).
        </ConfirmDelete>
      )}
    </div>
  );
}
