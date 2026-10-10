import { useState } from "react"
import { parseJwt, loginAuth, logoutAuth } from "./auth"
import { AuthContext } from "./useAuth"

// Letto al primo render: altrimenti al refresh RequireAuth vede token null e manda a /login
function readStoredToken() {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
        parseJwt(token);
        return token;
    } catch {
        localStorage.removeItem("token");
        return null;
    }
}

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(readStoredToken);
    const user = token ? parseJwt(token) : null;

    const login = async (username, password) => {
        setToken(await loginAuth(username, password));
    }

    const logout = () => {
        logoutAuth();
        setToken(null);
    }

    return (
        <AuthContext.Provider value={{ token, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    )

}
