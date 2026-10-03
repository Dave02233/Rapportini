const API_URL = "http://localhost:8000"

export async function login(username, password) {
    const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    
    if (!res.ok) {
        throw new Error(data.detail || "Login fallito");
    }

    return data;
}