import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../api";
import { byId, formatData, formatOre } from "../format";
import AppHeader from "../components/AppHeader";
import ConfirmDelete from "../components/ConfirmDelete";
import "./AppHome.css";

export default function AppHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const base = isAdmin ? "/admin" : "/app";

  const [interventi, setInterventi] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [commesse, setCommesse] = useState([]);
  const [users, setUsers] = useState([]);
  const [veicoli, setVeicoli] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [filterClienteId, setFilterClienteId] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterDataDa, setFilterDataDa] = useState("");
  const [filterDataA, setFilterDataA] = useState("");
  const [sortBy, setSortBy] = useState("data"); // data | cliente
  const [sortDir, setSortDir] = useState("desc"); // asc | desc

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [interventiRes, clientiRes, ticketsRes, commesseRes, usersRes, veicoliRes] = await Promise.all([
          apiFetch("/interventi"),
          apiFetch("/clienti"),
          apiFetch("/ticket"),
          apiFetch("/commesse"),
          isAdmin ? apiFetch("/users") : [],
          apiFetch("/veicoli"),
        ]);
        if (cancelled) return;
        setInterventi(interventiRes || []);
        setClienti(clientiRes || []);
        setTickets(ticketsRes || []);
        setCommesse(commesseRes || []);
        setUsers(usersRes || []);
        setVeicoli(veicoliRes || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Impossibile caricare gli interventi");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const clientiById = byId(clienti);
  const ticketsById = byId(tickets);
  const commesseById = byId(commesse);
  const usersById = byId(users);
  const veicoliById = byId(veicoli);

  const clientiInLista = clienti.filter((c) =>
    interventi.some((i) => i.cliente_id === c.id)
  );

  const filteredInterventi = interventi
    .filter((i) => {
      if (filterClienteId && String(i.cliente_id) !== filterClienteId) return false;
      if (filterUserId && String(i.user_id) !== filterUserId) return false;
      if (filterDataDa && i.data < filterDataDa) return false;
      if (filterDataA && i.data > filterDataA) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp;
      if (sortBy === "cliente") {
        const na = (clientiById[a.cliente_id]?.ragione_sociale || "").toLocaleLowerCase("it");
        const nb = (clientiById[b.cliente_id]?.ragione_sociale || "").toLocaleLowerCase("it");
        cmp = na.localeCompare(nb, "it");
      } else {
        cmp = a.data.localeCompare(b.data);
      }
      if (cmp === 0) cmp = a.id - b.id;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const filtersActive = Boolean(
    filterClienteId || filterUserId || filterDataDa || filterDataA
  );

  const allVisibleSelected =
    filteredInterventi.length > 0 &&
    filteredInterventi.every((i) => selectedIds.has(i.id));

  function resetFilters() {
    setFilterClienteId("");
    setFilterUserId("");
    setFilterDataDa("");
    setFilterDataA("");
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredInterventi.forEach((i) => next.delete(i.id));
      } else {
        filteredInterventi.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }

  function openRapportinoCongiunto() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    sessionStorage.setItem("rapportino_congiunto_ids", JSON.stringify(ids));
    navigate(`${base}/rapportino-congiunto`);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/interventi/${toDelete.id}`, { method: "DELETE" });
      setInterventi((list) => list.filter((i) => i.id !== toDelete.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(toDelete.id);
        return next;
      });
      setToDelete(null);
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const deleteCliente = toDelete
    ? clientiById[toDelete.cliente_id]?.ragione_sociale
    : null;

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <div>
            <h2>{isAdmin ? "Interventi" : "I miei interventi"}</h2>
            <p className="app-home__hint">Scorri la riga in orizzontale per tutti i dati</p>
          </div>
          <div className="app-home__section-actions">
            <button
              type="button"
              className="app-home__new app-home__new--secondary"
              disabled={selectedIds.size === 0}
              onClick={openRapportinoCongiunto}
            >
              Rapportino ({selectedIds.size})
            </button>
            <Link className="app-home__new" to={`${base}/interventi/nuovo`}>
              Nuovo intervento
            </Link>
          </div>
        </div>

        {loading && <p className="app-home__status">Caricamento...</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && !error && interventi.length === 0 && (
          <p className="app-home__empty">Nessun intervento registrato.</p>
        )}

        {!loading && interventi.length > 0 && (
          <div
            className={
              isAdmin
                ? "app-home__filters app-home__filters--admin"
                : "app-home__filters"
            }
            aria-label="Filtri e ordinamento"
          >
            <div className="app-home__filter">
              <label htmlFor="filter-cliente">Cliente</label>
              <select
                id="filter-cliente"
                value={filterClienteId}
                onChange={(e) => setFilterClienteId(e.target.value)}
              >
                <option value="">Tutti i clienti</option>
                {clientiInLista.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ragione_sociale}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div className="app-home__filter">
                <label htmlFor="filter-user">Tecnico</label>
                <select
                  id="filter-user"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                >
                  <option value="">Tutti</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                      {u.role === "admin" ? " (admin)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="app-home__filter">
              <label htmlFor="filter-data-da">Data da</label>
              <input
                id="filter-data-da"
                type="date"
                value={filterDataDa}
                max={filterDataA || undefined}
                onChange={(e) => setFilterDataDa(e.target.value)}
              />
            </div>
            <div className="app-home__filter">
              <label htmlFor="filter-data-a">Data a</label>
              <input
                id="filter-data-a"
                type="date"
                value={filterDataA}
                min={filterDataDa || undefined}
                onChange={(e) => setFilterDataA(e.target.value)}
              />
            </div>
            <div className="app-home__filter">
              <label htmlFor="sort-by">Ordina per</label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="data">Data</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            <div className="app-home__filter">
              <label htmlFor="sort-dir">Direzione</label>
              <select
                id="sort-dir"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value)}
              >
                <option value="desc">Decrescente (DESC)</option>
                <option value="asc">Crescente (ASC)</option>
              </select>
            </div>
            {filtersActive && (
              <button
                type="button"
                className="app-home__filters-reset"
                onClick={resetFilters}
              >
                Azzera filtri
              </button>
            )}
          </div>
        )}

        {!loading && interventi.length > 0 && filteredInterventi.length === 0 && (
          <p className="app-home__empty">
            Nessun intervento con questi filtri.
          </p>
        )}

        {!loading && filteredInterventi.length > 0 && (
          <div className="app-home__list">
            <label className="app-home__select-all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
              />
              <span>Seleziona tutti i visibili</span>
            </label>
            {filteredInterventi.map((intervento) => {
              const cliente = clientiById[intervento.cliente_id];
              const ticket =
                intervento.ticket_id != null
                  ? ticketsById[intervento.ticket_id]
                  : null;
              const commessa = ticket ? commesseById[ticket.commessa_id] : null;
              const veicolo =
                intervento.veicolo_id != null
                  ? veicoliById[intervento.veicolo_id]
                  : null;
              const checked = selectedIds.has(intervento.id);

              return (
                <div
                  className={
                    checked
                      ? "app-home__row app-home__row--selected"
                      : "app-home__row"
                  }
                  key={intervento.id}
                >
                  <div className="app-home__row-inner">
                    <div className="app-home__sticky">
                      <label className="app-home__check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(intervento.id)}
                          aria-label={`Seleziona intervento ${intervento.id}`}
                        />
                      </label>
                      <div className="app-home__cell app-home__cell--date">
                        <span className="app-home__label">Data</span>
                        <span className="app-home__value">
                          {formatData(intervento.data)}
                        </span>
                      </div>
                      <div className="app-home__cell app-home__cell--cliente">
                        <span className="app-home__label">Cliente</span>
                        <span className="app-home__value" title={cliente?.ragione_sociale}>
                          {cliente?.ragione_sociale || "Cliente sconosciuto"}
                        </span>
                      </div>
                      <div className="app-home__cell app-home__cell--ore">
                        <span className="app-home__label">Ore</span>
                        <span className="app-home__value">{formatOre(intervento.ore_lavorate)}</span>
                      </div>
                      <div className="app-home__actions">
                        <Link
                          className="app-home__btn app-home__btn--edit"
                          to={`${base}/interventi/${intervento.id}`}
                        >
                          Modifica
                        </Link>
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--danger"
                          onClick={() => setToDelete(intervento)}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>

                    <div className="app-home__extra">
                      {isAdmin && (
                        <div className="app-home__cell">
                          <span className="app-home__label">Tecnico</span>
                          <span className="app-home__value">
                            {usersById[intervento.user_id]?.username ||
                              `#${intervento.user_id}`}
                          </span>
                        </div>
                      )}
                      <div className="app-home__cell">
                        <span className="app-home__label">Commessa</span>
                        <span
                          className={
                            commessa
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                        >
                          {commessa?.nome || "Senza commessa"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Ticket</span>
                        <span
                          className={
                            ticket
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                        >
                          {ticket?.nome || "Senza ticket"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Viaggio</span>
                        <span className="app-home__value">{formatOre(intervento.ore_viaggio)} h</span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Veicolo</span>
                        <span
                          className={
                            veicolo
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                        >
                          {veicolo?.targa || "Senza veicolo"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Km</span>
                        <span className="app-home__value">{intervento.km ?? 0}</span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Trasferta</span>
                        <span
                          className={
                            intervento.trasferta
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                        >
                          {intervento.trasferta ? "Sì" : "No"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Ore totali</span>
                        <span className="app-home__value">{formatOre(intervento.ore_totali)}</span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Descrizione</span>
                        <span
                          className="app-home__value"
                          title={intervento.descrizione || undefined}
                        >
                          {intervento.descrizione || "-"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Note interne</span>
                        <span
                          className={
                            intervento.note_interne
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                          title={intervento.note_interne || undefined}
                        >
                          {intervento.note_interne || "-"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">Note esterne</span>
                        <span
                          className={
                            intervento.note_esterne
                              ? "app-home__value"
                              : "app-home__value app-home__value--muted"
                          }
                          title={intervento.note_esterne || undefined}
                        >
                          {intervento.note_esterne || "-"}
                        </span>
                      </div>
                      <div className="app-home__cell">
                        <span className="app-home__label">ID</span>
                        <span className="app-home__value app-home__value--muted">
                          #{intervento.id}
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
          title="Eliminare l'intervento?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare l&apos;intervento del{" "}
          <strong>{formatData(toDelete.data)}</strong>
          {deleteCliente ? (
            <>
              {" "}
              per <strong>{deleteCliente}</strong>
            </>
          ) : null}
          . L&apos;operazione non si può annullare.
        </ConfirmDelete>
      )}
    </div>
  );
}
