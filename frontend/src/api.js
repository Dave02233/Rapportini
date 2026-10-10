// Vuoto in produzione: la SPA è servita da FastAPI sulla stessa origine
const API_URL = import.meta.env.VITE_API_URL ?? "";

function detailToMessage(detail) {
  if (typeof detail === "string") return detail;
  // FastAPI 422: detail è un array di oggetti
  if (Array.isArray(detail)) {
    return "Dati non validi. Controlla i campi inseriti.";
  }
  return null;
}

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error("Server non raggiungibile. Verifica che l'API sia avviata.");
  }
}

export async function login(username, password) {
  const res = await request(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(detailToMessage(data?.detail) || "Accesso non riuscito");
  }

  return data;
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("Devi effettuare l'accesso");
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const res = await request(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);

  // Token scaduto o non valido: ricaricando la pagina AuthProvider riparte senza token
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.replace("/login");
  }

  if (!res.ok) {
    throw new Error(detailToMessage(data?.detail) || "Richiesta non riuscita");
  }

  return data;
}
