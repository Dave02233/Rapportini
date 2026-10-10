import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Montichiari (BS), sede TEC Energie
export const DEFAULT_CENTER = [45.41, 10.39];

export function createMap(container) {
  const map = L.map(container);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}
