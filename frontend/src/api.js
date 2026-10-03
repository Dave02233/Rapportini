const API_URL = "http://localhost:8000";

/** Messaggi API noti (backend spesso in inglese) → italiano per la UI */
const DETAIL_IT = {
  Forbidden: "Operazione non consentita",
  "Invalid role": "Ruolo non valido",
  "Invalid stato": "Stato non valido",
  "Invalid username or password": "Username o password non corretti",
  "Username already exists": "Username già in uso",
  "User not found": "Utente non trovato",
  "User in use": "Utente non eliminabile: è in uso",
  "Cliente not found": "Cliente non trovato",
  "Cliente in use": "Cliente non eliminabile: è in uso",
  "Ragione sociale or partita IVA already exists":
    "Ragione sociale o partita IVA già esistenti",
  "Commessa not found": "Commessa non trovata",
  "Ticket not found": "Ticket non trovato",
  "Intervento not found": "Intervento non trovato",
  "User, cliente or ticket not found": "Utente, cliente o ticket non trovato",
  "Materiale not found": "Materiale non trovato",
  "Materiale in use": "Materiale non eliminabile: è già usato in una commessa",
  "Materiale utilizzato not found": "Materiale utilizzato non trovato",
  "Commessa or materiale not found": "Commessa o materiale non trovati",
  "Token expired": "Sessione scaduta, effettua di nuovo l'accesso",
  "Invalid token": "Sessione non valida, effettua di nuovo l'accesso",
};

function detailToItalian(detail) {
  if (detail == null) return null;
  if (typeof detail === "string") {
    return DETAIL_IT[detail] || detail;
  }
  // FastAPI 422: detail è un array di oggetti
  if (Array.isArray(detail)) {
    return "Dati non validi. Controlla i campi inseriti.";
  }
  return "Si è verificato un errore";
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
    throw new Error(detailToItalian(data?.detail) || "Accesso non riuscito");
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

  if (!res.ok) {
    throw new Error(detailToItalian(data?.detail) || "Richiesta non riuscita");
  }

  return data;
}
