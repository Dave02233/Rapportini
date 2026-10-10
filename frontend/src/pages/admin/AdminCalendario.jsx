import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api";
import { byId, formatPeriodo } from "../../format";
import AppHeader from "../../components/AppHeader";
import { STATO_COMMESSA, STATO_TICKET } from "./commesse";
import "../AppHome.css";
import "./Admin.css";

const DAY = 86400000;
const ZOOM = [3, 6, 12];
const GIORNI_PARTENZA = 30;

// Giorni interi in UTC: il cambio dell'ora legale non sposta le barre
function toDay(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

function meseLabel(day, conAnno) {
  const label = new Date(day * DAY).toLocaleDateString("it-IT", {
    month: "short",
    year: conAnno ? "numeric" : undefined,
    timeZone: "UTC",
  });
  return label[0].toUpperCase() + label.slice(1);
}

function byInizio(a, b) {
  if (a.data_inizio !== b.data_inizio) {
    if (!a.data_inizio) return 1;
    if (!b.data_inizio) return -1;
    return a.data_inizio.localeCompare(b.data_inizio);
  }
  return a.nome.localeCompare(b.nome, "it");
}

// Barra in % della finestra [start, end); null se cade fuori o non ha data di inizio
function posizione(item, start, end) {
  if (!item.data_inizio) return null;
  const s = toDay(item.data_inizio);
  const e = item.data_fine ? toDay(item.data_fine) + 1 : null; // data_fine inclusa
  if (s >= end || (e !== null && e <= start)) return null;
  const from = Math.max(s, start);
  const to = e === null ? end : Math.min(e, end);
  return {
    left: ((from - start) / (end - start)) * 100,
    width: ((to - from) / (end - start)) * 100,
    tagliataInizio: s < start,
    tagliataFine: e === null || e > end,
    aperta: e === null,
  };
}

function attivo(x, oggi) {
  if (x.stato !== "in_corso" || !x.data_inizio) return false;
  return toDay(x.data_inizio) <= oggi && (!x.data_fine || toDay(x.data_fine) >= oggi);
}

function inPartenza(x, oggi) {
  if (x.stato !== "in_corso" || !x.data_inizio) return false;
  const s = toDay(x.data_inizio);
  return s > oggi && s <= oggi + GIORNI_PARTENZA;
}

function tipCommessa(c) {
  return `Commessa - ${c.nome}\n${formatPeriodo(c)} - ${STATO_COMMESSA[c.stato] || c.stato}`;
}

function tipTicket(t, c) {
  return `Ticket - ${t.nome}\nCommessa - ${c.nome}\n${formatPeriodo(t)} - ${STATO_TICKET[t.stato] || t.stato}`;
}

function Barra({ pos, larghezza, ticket, chiusa, testo, tip, onOpen, onTip }) {
  // Stima ~7px a carattere + padding: se il nome non entra, va accanto alla barra
  const stretta = (pos.width / 100) * larghezza < testo.length * 7 + 14;
  const className = [
    "cal__bar",
    ticket && "cal__bar--ticket",
    chiusa && "cal__bar--closed",
    pos.tagliataInizio && "cal__bar--cut-start",
    pos.tagliataFine && "cal__bar--cut-end",
    pos.aperta && "cal__bar--open",
  ]
    .filter(Boolean)
    .join(" ");
  const showTip = (e) => onTip({ text: tip, x: e.clientX, y: e.clientY });

  return (
    <>
      <button
        type="button"
        className={className}
        style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
        aria-label={tip}
        onClick={onOpen}
        onMouseEnter={showTip}
        onMouseMove={showTip}
        onMouseLeave={() => onTip(null)}
      >
        {!stretta && <span>{testo}</span>}
      </button>
      {stretta && (
        <span
          className={chiusa ? "cal__label-out cal__label-out--closed" : "cal__label-out"}
          style={
            pos.left + pos.width > 70
              ? { right: `calc(${100 - pos.left}% + 0.35rem)` }
              : { left: `calc(${pos.left + pos.width}% + 0.35rem)` }
          }
        >
          {testo}
        </span>
      )}
    </>
  );
}

export default function AdminCalendario() {
  const navigate = useNavigate();
  const [commesse, setCommesse] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mesi, setMesi] = useState(6);
  const [offset, setOffset] = useState(0); // mesi di spostamento dalla finestra di default
  const [mostraChiusi, setMostraChiusi] = useState(false);
  const [tip, setTip] = useState(null);
  const innerRef = useRef(null);
  const [larghezza, setLarghezza] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [commesseRes, ticketsRes] = await Promise.all([
          apiFetch("/commesse"),
          apiFetch("/ticket"),
        ]);
        if (cancelled) return;
        setCommesse(commesseRes || []);
        setTickets(ticketsRes || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare il calendario");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setLarghezza(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  const now = new Date();
  const oggi = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY;
  const anno = now.getFullYear();
  const primoMese = now.getMonth() - 1 + offset; // di default si parte dal mese scorso
  const start = Date.UTC(anno, primoMese, 1) / DAY;
  const end = Date.UTC(anno, primoMese + mesi, 1) / DAY;
  const pct = (day) => ((day - start) / (end - start)) * 100;

  const mesiFinestra = Array.from({ length: mesi }, (_, i) => {
    const s = Date.UTC(anno, primoMese + i, 1) / DAY;
    const e = Date.UTC(anno, primoMese + i + 1, 1) / DAY;
    const gennaio = new Date(s * DAY).getUTCMonth() === 0;
    return { key: s, left: pct(s), width: pct(e) - pct(s), label: meseLabel(s, i === 0 || gennaio) };
  });
  const oggiVisibile = oggi >= start && oggi < end;
  const oggiLeft = `${pct(oggi + 0.5)}%`;

  const commesseById = byId(commesse);
  const visibile = (stato) => mostraChiusi || stato === "in_corso";

  const gruppi = commesse
    .filter((c) => visibile(c.stato))
    .sort(byInizio)
    .map((c) => ({
      commessa: c,
      pos: posizione(c, start, end),
      righe: tickets
        .filter((t) => t.commessa_id === c.id && visibile(t.stato))
        .sort(byInizio)
        .map((t) => ({ ticket: t, pos: posizione(t, start, end) }))
        .filter((r) => r.pos),
    }))
    .filter((g) => g.pos || g.righe.length > 0);

  const senzaDate = [
    ...commesse
      .filter((c) => visibile(c.stato) && !c.data_inizio)
      .map((c) => ({ key: `c${c.id}`, commessaId: c.id, testo: c.nome })),
    ...tickets
      .filter(
        (t) =>
          !t.data_inizio && visibile(t.stato) && visibile(commesseById[t.commessa_id]?.stato)
      )
      .map((t) => ({
        key: `t${t.id}`,
        commessaId: t.commessa_id,
        testo: `${t.nome} (ticket di ${commesseById[t.commessa_id]?.nome || "commessa sconosciuta"})`,
      })),
  ];

  const commesseInPartenza = commesse.filter((c) => inPartenza(c, oggi)).length;
  const ticketInPartenza = tickets.filter((t) => inPartenza(t, oggi)).length;
  const apri = (commessaId) => navigate(`/admin/commesse/${commessaId}`);

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <div>
            <h2>Calendario commesse</h2>
            <p className="app-home__hint">
              Oggi è{" "}
              {now.toLocaleDateString("it-IT", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . Clicca una barra per aprire la commessa.
            </p>
          </div>
        </div>

        {error && <p className="app-home__error">{error}</p>}

        <section className="admin-stats" aria-label="Situazione di oggi">
          <div className="admin-stats__item">
            <span className="app-home__label">Commesse attive</span>
            <strong>{commesse.filter((c) => attivo(c, oggi)).length}</strong>
          </div>
          <div className="admin-stats__item">
            <span className="app-home__label">Ticket attivi</span>
            <strong>{tickets.filter((t) => attivo(t, oggi)).length}</strong>
          </div>
          <div className="admin-stats__item">
            <span className="app-home__label">In partenza</span>
            <strong>{commesseInPartenza + ticketInPartenza}</strong>
            <span className="admin-stats__sub">
              {commesseInPartenza} {commesseInPartenza === 1 ? "commessa" : "commesse"}  - {" "}
              {ticketInPartenza} ticket nei prossimi {GIORNI_PARTENZA} giorni
            </span>
          </div>
        </section>

        <div className="cal__toolbar">
          <div className="cal__buttons" role="group" aria-label="Periodo visibile">
            {ZOOM.map((n) => (
              <button
                key={n}
                type="button"
                className={
                  n === mesi
                    ? "app-home__btn app-home__btn--edit"
                    : "app-home__btn app-home__btn--ghost"
                }
                aria-pressed={n === mesi}
                onClick={() => setMesi(n)}
              >
                {n} mesi
              </button>
            ))}
          </div>
          <div className="cal__buttons">
            <button
              type="button"
              className="app-home__btn app-home__btn--ghost"
              aria-label="Mese precedente"
              onClick={() => setOffset((o) => o - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="app-home__btn app-home__btn--ghost"
              onClick={() => setOffset(0)}
            >
              Oggi
            </button>
            <button
              type="button"
              className="app-home__btn app-home__btn--ghost"
              aria-label="Mese successivo"
              onClick={() => setOffset((o) => o + 1)}
            >
              ›
            </button>
          </div>
          <span className="cal__range">
            {meseLabel(start, true)} - {meseLabel(end - 1, true)}
          </span>
          <label className="cal__toggle">
            <input
              type="checkbox"
              checked={mostraChiusi}
              onChange={(e) => setMostraChiusi(e.target.checked)}
            />
            Mostra chiusi
          </label>
        </div>

        {loading && <p className="app-home__status">Caricamento...</p>}

        {!loading && (
          <div className="cal">
            <div className="cal__inner" ref={innerRef}>
              <div className="cal__months">
                {mesiFinestra.map((m) => (
                  <span
                    key={m.key}
                    className="cal__month"
                    style={{ left: `${m.left}%`, width: `${m.width}%` }}
                  >
                    {m.label}
                  </span>
                ))}
                {oggiVisibile && (
                  <span className="cal__today-label" style={{ left: oggiLeft }}>
                    Oggi
                  </span>
                )}
              </div>

              <div className="cal__body">
                {mesiFinestra.map((m) => (
                  <i key={m.key} className="cal__gridline" style={{ left: `${m.left}%` }} />
                ))}
                {oggiVisibile && <i className="cal__today" style={{ left: oggiLeft }} />}

                {gruppi.length === 0 && (
                  <p className="cal__empty">Nessuna commessa o ticket in questo periodo.</p>
                )}

                {gruppi.map(({ commessa: c, pos, righe }) => (
                  <div className="cal__group" key={c.id}>
                    <div className="cal__row">
                      {pos ? (
                        <Barra
                          pos={pos}
                          larghezza={larghezza}
                          chiusa={c.stato !== "in_corso"}
                          testo={c.nome}
                          tip={tipCommessa(c)}
                          onOpen={() => apri(c.id)}
                          onTip={setTip}
                        />
                      ) : (
                        <span className="cal__muted">{c.nome}</span>
                      )}
                    </div>
                    {righe.map(({ ticket: t, pos: posTicket }) => (
                      <div className="cal__row cal__row--ticket" key={t.id}>
                        <Barra
                          pos={posTicket}
                          larghezza={larghezza}
                          ticket
                          chiusa={t.stato !== "in_corso"}
                          testo={t.nome}
                          tip={tipTicket(t, c)}
                          onOpen={() => apri(c.id)}
                          onTip={setTip}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="cal__legend">
          <span>
            <i className="cal__swatch" /> Commessa
          </span>
          <span>
            <i className="cal__swatch cal__swatch--ticket" /> Ticket (sotto la sua commessa)
          </span>
          <span>
            <i className="cal__swatch cal__swatch--open" /> Fine non definita
          </span>
          <span>
            <i className="cal__swatch cal__swatch--today" /> Oggi
          </span>
        </div>

        {!loading && senzaDate.length > 0 && (
          <section className="admin-section">
            <div className="admin-section__head">
              <h3>Senza date</h3>
            </div>
            <p className="app-home__hint">
              Non compaiono sul calendario finché non hanno una data di inizio.
            </p>
            <ul className="cal__nodate">
              {senzaDate.map((x) => (
                <li key={x.key}>
                  <Link to={`/admin/commesse/${x.commessaId}`}>{x.testo}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {tip && (
        <div className="cal__tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
