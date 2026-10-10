import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { apiFetch } from "../../api";
import { formatEuro } from "../../format";
import { DEFAULT_CENTER, createMap } from "../../map";
import AppHeader from "../../components/AppHeader";
import { STATO_COMMESSA, speseCommessa } from "./commesse";
import "../AppHome.css";
import "./Admin.css";

function dotClass(c) {
  if (c.stato !== "in_corso") return "map-dot map-dot--closed";
  return speseCommessa(c) > c.budget ? "map-dot map-dot--over" : "map-dot map-dot--ok";
}

// textContent e non HTML: il nome della commessa è testo inserito dagli utenti
function textEl(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
}

function riepilogo(c) {
  return `${STATO_COMMESSA[c.stato] || c.stato} - ${formatEuro(speseCommessa(c))} su ${formatEuro(c.budget)}`;
}

export default function AdminMappa() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [commesse, setCommesse] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await apiFetch("/commesse/riepilogo");
        if (!cancelled) setCommesse(list || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare le commesse");
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
    if (loading) return;
    const map = createMap(containerRef.current);
    const points = commesse.map((c) => {
      const latlng = [c.lat, c.lon];
      const open = () => navigate(`/admin/commesse/${c.id}`);
      L.circleMarker(latlng, { radius: 10, className: dotClass(c) })
        .bindTooltip(textEl(riepilogo(c)), { direction: "bottom", offset: [0, 12] })
        .on("click", open)
        .addTo(map);
      // Tooltip standalone sopra il punto; senza permanent Leaflet lo chiude al primo click sulla mappa
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
      return latlng;
    });
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView(DEFAULT_CENTER, 9);
    }
    return () => map.remove();
  }, [loading, commesse, navigate]);

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <div>
            <h2>Mappa commesse</h2>
            <p className="app-home__hint">Clicca su una commessa per aprirne la gestione</p>
          </div>
        </div>

        {error && <p className="app-home__error">{error}</p>}

        <div ref={containerRef} className="map map--overview" />

        <div className="map-legend">
          <span>
            <i className="map-legend__dot map-legend__dot--ok" /> In corso, nel budget
          </span>
          <span>
            <i className="map-legend__dot map-legend__dot--over" /> In corso, oltre il budget
          </span>
          <span>
            <i className="map-legend__dot map-legend__dot--closed" /> Completata o annullata
          </span>
        </div>
        <div className="map-legend">
          <span>Nome:</span>
          {Object.entries(STATO_COMMESSA).map(([stato, label]) => (
            <span key={stato} className={`map-label map-label--${stato}`}>
              {label}
            </span>
          ))}
        </div>

        {!loading && !error && commesse.length === 0 && (
          <p className="app-home__empty">Nessuna commessa da mostrare.</p>
        )}
      </main>
    </div>
  );
}
