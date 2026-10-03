import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { parseJwt } from "../auth/auth";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const { login, token } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (token) {
    const { role } = parseJwt(token);
    return <Navigate to={role === "admin" ? "/admin" : "/app"} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.target);
    const username = formData.get("username");
    const password = formData.get("password");

    try {
      await login(username, password);
      const saved = localStorage.getItem("token");
      const { role } = parseJwt(saved);
      navigate(role === "admin" ? "/admin" : "/app", { replace: true });
    } catch (err) {
      setError(err.message || "Accesso non riuscito");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <main className="login__main">
        <div className="login__logo-wrap">
          <img
            className="login__logo"
            src="/logoTECEnergie.png"
            alt="TEC Energie"
          />
        </div>
        <h1 className="login__title">Accedi</h1>
        <p className="login__lead">Area riservata tecnici e amministrazione.</p>
        <form className="login__form" onSubmit={handleSubmit}>
          <div className="login__field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>
          <div className="login__field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>
          {error && <p className="login__error">{error}</p>}
          <button className="login__submit" type="submit" disabled={loading}>
            {loading ? "Accesso…" : "Accedi"}
          </button>
        </form>
        <p className="login__back">
          <Link to="/">← Torna alla home</Link>
        </p>
      </main>
    </div>
  );
}
