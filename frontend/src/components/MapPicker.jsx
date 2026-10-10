import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { DEFAULT_CENTER, createMap } from "../map";

function toPoint(lat, lon) {
  if (lat === "" || lon === "") return null;
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return [la, lo];
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

export default function MapPicker({ lat, lon, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  const startRef = useRef(toPoint(lat, lon));
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const start = startRef.current;
    const map = createMap(containerRef.current);
    map.setView(start || DEFAULT_CENTER, start ? 14 : 9);
    map.on("click", (e) => onPickRef.current(round6(e.latlng.lat), round6(e.latlng.lng)));
    mapRef.current = map;
    const frame = requestAnimationFrame(() => map.invalidateSize());
    // In dev StrictMode monta due volte: senza remove() Leaflet dà "Map container is already initialized"
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const point = toPoint(lat, lon);
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current) {
      markerRef.current.setLatLng(point);
    } else {
      markerRef.current = L.circleMarker(point, {
        radius: 9,
        interactive: false,
        className: "map-dot map-dot--ok",
      }).addTo(map);
    }
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [lat, lon]);

  async function cercaIndirizzo() {
    const q = query.trim();
    if (!q || searching) return;

    setSearching(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({
        q,
        format: "json",
        limit: "1",
      });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error("Ricerca non riuscita");
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (!hit?.lat || !hit?.lon) {
        setSearchError("Nessun risultato per questo indirizzo");
        return;
      }
      const la = round6(Number(hit.lat));
      const lo = round6(Number(hit.lon));
      onPickRef.current(la, lo);
      mapRef.current?.setView([la, lo], 16);
    } catch (err) {
      setSearchError(err.message || "Ricerca non riuscita");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="map-picker">
      {/* Niente <form>: MapPicker sta già dentro il form commessa/offerta */}
      <div className="map-picker__search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              cercaIndirizzo();
            }
          }}
          placeholder="Cerca indirizzo..."
          disabled={searching}
          aria-label="Cerca indirizzo"
        />
        <button
          type="button"
          onClick={cercaIndirizzo}
          disabled={searching || !query.trim()}
        >
          {searching ? "..." : "Cerca"}
        </button>
      </div>
      {searchError && <p className="map-picker__error">{searchError}</p>}
      <div ref={containerRef} className="map map--picker" />
    </div>
  );
}
