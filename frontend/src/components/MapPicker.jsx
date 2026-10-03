import { useEffect, useRef } from "react";
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

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const start = startRef.current;
    const map = createMap(containerRef.current);
    map.setView(start || DEFAULT_CENTER, start ? 14 : 9);
    map.on("click", (e) => onPickRef.current(round6(e.latlng.lat), round6(e.latlng.lng)));
    mapRef.current = map;
    // In dev StrictMode monta due volte: senza remove() Leaflet dà "Map container is already initialized"
    return () => {
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

  return <div ref={containerRef} className="map map--picker" />;
}
