import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../api";
import { formatData, formatOre } from "../format";
import AppHeader from "../components/AppHeader";
import ConfirmDelete from "../components/ConfirmDelete";
import "./AppHome.css";

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const STATO = {
  da_revisionare: "Da revisionare",
  confermata: "Confermata",
  scartata: "Scartata",
};

export default function BozzeInterventi() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const base = isAdmin ? "/admin" : "/app";

  const [bozze, setBozze] = useState([]);
  const [utenti, setUtenti] = useState([]);
  const [userId, setUserId] = useState("");
  const [giorno, setGiorno] = useState("");
  const [ordine, setOrdine] = useState("desc");
  const [generaData, setGeneraData] = useState(todayISO);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [esito, setEsito] = useState(null);
  const [toScarta, setToScarta] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/users")
      .then((list) => setUtenti(list || []))
      .catch(() => setUtenti([]));
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (isAdmin && userId) params.set("user_id", userId);
      if (giorno) params.set("data", giorno);
      params.set("ordine", ordine);
      try {
        const list = await apiFetch(`/bozze?${params}`);
        if (!cancelled) setBozze(list || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare le bozze");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userId, giorno, ordine, reload]);

  async function genera() {
    setBusy(true);
    setError(null);
    setEsito(null);
    try {
      const res = await apiFetch("/bozze/genera", {
        method: "POST",
        body: JSON.stringify({ data: generaData }),
      });
      const n = res?.inserite ?? 0;
      setEsito(n === 0 ? "Nessuna bozza nuova per questa data." : `Bozze create o aggiornate: ${n}.`);
      setGiorno(generaData);
      setOrdine("desc");
      setReload((k) => k + 1);
    } catch (err) {
      setError(err.message || "Generazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function confermaScarta() {
    if (!toScarta) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/bozze/${toScarta.id}/scarta`, { method: "POST" });
      setBozze((list) =>
        isAdmin
          ? list.map((b) => (b.id === toScarta.id ? { ...b, stato: "scartata" } : b))
          : list.filter((b) => b.id !== toScarta.id)
      );
      setToScarta(null);
    } catch (err) {
      setError(err.message || "Scarto non riuscito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-home">
      <AppHeader />
      <main className="app-home__main">
        <div className="app-home__section-head">
          <div>
            <h2>Bozze interventi</h2>
            <p className="app-home__hint">
              {isAdmin
                ? "Cliente e commessa dal GPS. Ore lavorate proposte, il resto si compila in revisione."
                : "Controlla la bozza di oggi, completa viaggio, km e descrizione, poi conferma."}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="bozze__filtri">
            <label>
              Utente
              <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Tutti</option>
                {utenti.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)} />
            </label>
            <button type="button" className="app-home__new app-home__new--secondary" onClick={() => setOrdine((o) => (o === "asc" ? "desc" : "asc"))}>
              Data {ordine === "asc" ? "↑" : "↓"}
            </button>
            <label>
              Genera
              <input type="date" value={generaData} onChange={(e) => setGeneraData(e.target.value)} />
            </label>
            <button type="button" className="app-home__new" onClick={genera} disabled={busy || !generaData}>
              {busy ? "..." : "Genera bozze"}
            </button>
          </div>
        )}

        {esito && <p className="app-home__hint">{esito}</p>}
        {error && <p className="app-home__error">{error}</p>}
        {loading && <p className="app-home__hint">Caricamento...</p>}

        {!loading && bozze.length === 0 && <p className="app-home__hint">Nessuna bozza.</p>}

        {!loading && bozze.length > 0 && (
          <div className="bozze__wrap">
            <table className="bozze__table">
              <thead>
                <tr>
                  <th>Data</th>
                  {isAdmin && <th>Tecnico</th>}
                  <th>Cliente</th>
                  <th>Commessa</th>
                  <th>Ticket</th>
                  <th>Ore</th>
                  <th>Campioni</th>
                  {isAdmin && <th>Stato</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {bozze.map((b) => (
                  <tr key={b.id}>
                    <td>{formatData(b.data)}</td>
                    {isAdmin && <td>{b.username}</td>}
                    <td>{b.cliente}</td>
                    <td>{b.commessa}</td>
                    <td>{b.ticket || "-"}</td>
                    <td>{formatOre(b.ore_lavorate)}</td>
                    <td>
                      {b.n_campioni}
                      <span className="bozze__min"> {b.minuti_stimati} min</span>
                    </td>
                    {isAdmin && <td>{STATO[b.stato] || b.stato}</td>}
                    <td className="bozze__azioni">
                      {b.stato === "da_revisionare" && (
                        <>
                          <Link className="app-home__new" to={`${base}/bozze/${b.id}`}>
                            Revisiona
                          </Link>
                          <button type="button" className="bozze__scarta" onClick={() => setToScarta(b)} disabled={busy}>
                            Scarta
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {toScarta && (
        <ConfirmDelete
          title="Scartare la bozza?"
          busy={busy}
          onCancel={() => setToScarta(null)}
          onConfirm={confermaScarta}
        >
          La bozza del <strong>{formatData(toScarta.data)}</strong> per <strong>{toScarta.cliente}</strong> non diventerà un intervento.
        </ConfirmDelete>
      )}
    </div>
  );
}
