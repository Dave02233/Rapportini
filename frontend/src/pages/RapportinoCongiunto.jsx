import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../api";
import { byId, formatData, formatOre } from "../format";
import AppHeader from "../components/AppHeader";
import "./AppHome.css";
import "./NuovoIntervento.css";
import "./RapportinoCongiunto.css";

function readIds() {
  try {
    const raw = sessionStorage.getItem("rapportino_congiunto_ids");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

export default function RapportinoCongiunto() {
  const { user } = useAuth();
  const base = user?.role === "admin" ? "/admin" : "/app";

  const [ids] = useState(readIds);
  const [interventi, setInterventi] = useState([]);
  const [clientiById, setClientiById] = useState({});
  const [ticketsById, setTicketsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [luogo, setLuogo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (ids.length === 0) {
        setLoading(false);
        setError("Nessun intervento selezionato.");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [allInterventi, clienti, tickets] = await Promise.all([
          apiFetch("/interventi"),
          apiFetch("/clienti"),
          apiFetch("/ticket"),
        ]);
        if (cancelled) return;

        const idSet = new Set(ids);
        const selected = (allInterventi || [])
          .filter((i) => idSet.has(i.id))
          .sort((a, b) => {
            const cmp = a.data.localeCompare(b.data);
            return cmp !== 0 ? cmp : a.id - b.id;
          });

        setInterventi(selected);
        setClientiById(byId(clienti));
        setTicketsById(byId(tickets));

        if (selected.length === 0) {
          setError("Gli interventi selezionati non sono più disponibili.");
        } else if (selected.length < ids.length) {
          setError(
            `Attenzione: ${ids.length - selected.length} intervento/i non trovato/i e escluso/i dalla revisione.`
          );
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Caricamento non riuscito");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const warnings = [];
  const blocking = [];

  if (!loading && ids.length === 0) {
    blocking.push("Non hai selezionato alcun intervento.");
  }
  if (!loading && ids.length > 0 && interventi.length === 0) {
    blocking.push("Nessun intervento valido da includere nel rapportino.");
  }

  const clienteIds = new Set(interventi.map((i) => i.cliente_id));
  if (clienteIds.size > 1) {
    blocking.push(
      "Sono presenti clienti diversi: un rapportino deve riguardare un solo cliente."
    );
  }

  for (const i of interventi) {
    if (!i.ore_lavorate || i.ore_lavorate <= 0) {
      blocking.push(`Intervento #${i.id}: ore lavorate non valide.`);
    }
    if (!clientiById[i.cliente_id]) {
      warnings.push(`Intervento #${i.id}: cliente non trovato in anagrafica.`);
    }
  }

  const canConfirm = !loading && blocking.length === 0 && interventi.length > 0;

  const totLavorate = interventi.reduce((s, i) => s + (i.ore_lavorate || 0), 0);
  const totViaggio = interventi.reduce((s, i) => s + (i.ore_viaggio || 0), 0);
  const totOre = interventi.reduce((s, i) => s + (i.ore_totali || 0), 0);
  const totKm = interventi.reduce((s, i) => s + (i.km || 0), 0);

  const cliente = clientiById[interventi[0]?.cliente_id];
  const primaData = interventi[0]?.data;
  const ultimaData = interventi[interventi.length - 1]?.data;
  const periodo =
    primaData === ultimaData
      ? formatData(primaData)
      : `${formatData(primaData)} - ${formatData(ultimaData)}`;
  const interventiConDescrizione = interventi.filter((i) => i.descrizione);
  const interventiConNoteEsterne = interventi.filter((i) => (i.note_esterne || "").trim());

  function handleConfirmPrint() {
    if (!canConfirm || !confirmed) return;
    // Il titolo della pagina diventa il nome file proposto da "Salva come PDF"
    const title = document.title;
    document.title = `Rapportino - ${cliente?.ragione_sociale || "cliente"} - ${primaData}`;
    window.addEventListener(
      "afterprint",
      () => {
        document.title = title;
      },
      { once: true }
    );
    window.print();
  }

  return (
    <div className="cong">
      <AppHeader />

      <main className="cong__main">
        <p className="cong__back">
          <Link to={base}>Torna agli interventi</Link>
        </p>
        <h2>Revisione rapportino</h2>
        <p className="cong__lead">
          Controlla i dati prima di confermare la stampa. Nel dialogo di stampa
          scegli "Salva come PDF".
        </p>

        {loading && <p className="cong__status">Caricamento...</p>}

        {blocking.map((msg) => (
          <p className="cong__error" key={msg}>
            {msg}
          </p>
        ))}
        {error && !blocking.includes(error) && (
          <p className="cong__warn">{error}</p>
        )}
        {warnings.map((msg) => (
          <p className="cong__warn" key={msg}>
            {msg}
          </p>
        ))}

        {!loading && interventi.length > 0 && (
          <>
            <div className="cong__table-wrap">
              <table className="cong__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Ticket</th>
                    <th>Ore</th>
                    <th>Viaggio</th>
                    <th>Km</th>
                    <th>Tot.</th>
                    <th>Descrizione</th>
                    <th>Note interne</th>
                    <th>Note esterne</th>
                  </tr>
                </thead>
                <tbody>
                  {interventi.map((i) => (
                    <tr key={i.id}>
                      <td>{formatData(i.data)}</td>
                      <td>
                        {clientiById[i.cliente_id]?.ragione_sociale || "-"}
                      </td>
                      <td>
                        {i.ticket_id != null
                          ? ticketsById[i.ticket_id]?.nome || `#${i.ticket_id}`
                          : "-"}
                      </td>
                      <td>{formatOre(i.ore_lavorate)}</td>
                      <td>{formatOre(i.ore_viaggio)}</td>
                      <td>{i.km ?? 0}</td>
                      <td>{formatOre(i.ore_totali)}</td>
                      <td className="cong__note">{i.descrizione || "-"}</td>
                      <td className="cong__note">{i.note_interne || "-"}</td>
                      <td className="cong__note">{i.note_esterne || "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Totali ({interventi.length} interventi)</td>
                    <td>{formatOre(totLavorate)}</td>
                    <td>{formatOre(totViaggio)}</td>
                    <td>{totKm}</td>
                    <td>{formatOre(totOre)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="nuovo__field cong__luogo">
              <label htmlFor="luogo">
                Impianto <span className="nuovo__optional">(opzionale)</span>
              </label>
              <input
                id="luogo"
                value={luogo}
                onChange={(e) => setLuogo(e.target.value)}
                disabled={!canConfirm}
              />
              <p className="nuovo__hint">
                Se lo lasci vuoto, sul PDF resta la riga da compilare a mano.
              </p>
            </div>

            <label className="cong__confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!canConfirm}
              />
              <span>
                Confermo di aver revisionato i dati e che non ci sono errori.
                Autorizzo la generazione del PDF del rapportino.
              </span>
            </label>

            <div className="cong__actions">
              <button
                type="button"
                className="cong__submit"
                disabled={!canConfirm || !confirmed}
                onClick={handleConfirmPrint}
              >
                Conferma e stampa PDF
              </button>
              <Link className="cong__cancel" to={base}>
                Annulla
              </Link>
            </div>
          </>
        )}

        {!loading && interventi.length === 0 && (
          <p className="cong__actions">
            <Link className="cong__cancel" to={base}>
              Torna alla lista
            </Link>
          </p>
        )}
      </main>

      {canConfirm && (
        <article className="stampa">
          <header className="stampa__head">
            <div className="stampa__brand">
              <img className="stampa__logo" src="/logoTECEnergie.png" alt="" />
              <p className="stampa__wordmark">
                <span className="stampa__tec">TEC</span> ENERGIE
              </p>
              <p className="stampa__contatti">
                Via Arturo Mercanti, 11 - 25018 Montichiari (BS)
                <br />
                T 0039.030.8088470 - servizioclienti@tecenergie.com
              </p>
            </div>
            <div className="stampa__cliente">
              <p>Spett.</p>
              <p className="stampa__ragione">{cliente?.ragione_sociale || "-"}</p>
              {cliente?.via ? <p>{cliente.via}</p> : null}
              {(cliente?.cap || cliente?.citta) && (
                <p>
                  {[cliente.cap, cliente.citta].filter(Boolean).join(" ")}
                </p>
              )}
              <p>P.IVA {cliente?.partita_iva || "-"}</p>
              <p className="stampa__compila">
                Impianto
                <span>{luogo.trim()}</span>
              </p>
            </div>
          </header>

          <h1 className="stampa__title">
            Rapporto d&apos;intervento
            <span>{periodo}</span>
          </h1>

          <table className="stampa__table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ore lavorate</th>
                <th>Ore viaggio</th>
                <th>Km</th>
              </tr>
            </thead>
            <tbody>
              {interventi.map((i) => (
                <tr key={i.id}>
                  <td>{formatData(i.data)}</td>
                  <td>{formatOre(i.ore_lavorate)}</td>
                  <td>{formatOre(i.ore_viaggio)}</td>
                  <td>{i.km ?? 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Totale</td>
                <td>{formatOre(totLavorate)}</td>
                <td>{formatOre(totViaggio)}</td>
                <td>{totKm}</td>
              </tr>
            </tfoot>
          </table>

          {interventiConDescrizione.length > 0 && (
            <section className="stampa__note">
              <h2>Descrizione</h2>
              {interventiConDescrizione.map((i) => (
                <p key={i.id}>
                  <strong>{formatData(i.data)}</strong>
                  <span>{i.descrizione}</span>
                </p>
              ))}
            </section>
          )}

          {interventiConNoteEsterne.length > 0 && (
            <section className="stampa__note">
              <h2>Note</h2>
              {interventiConNoteEsterne.map((i) => (
                <p key={i.id}>
                  <strong>{formatData(i.data)}</strong>
                  <span>{i.note_esterne}</span>
                </p>
              ))}
            </section>
          )}

          <div className="stampa__firma">
            <span>Nome e cognome</span>
            <span>Firma cliente</span>
          </div>
        </article>
      )}
    </div>
  );
}
