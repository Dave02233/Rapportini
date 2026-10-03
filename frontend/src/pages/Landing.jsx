import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { parseJwt } from "../auth/auth";
import "./Landing.css";

export default function Landing() {
  const { token } = useAuth();

  if (token) {
    const { role } = parseJwt(token);
    return <Navigate to={role === "admin" ? "/admin" : "/app"} replace />;
  }

  return (
    <div className="landing">
      <main className="landing__main">
        <div className="landing__logo-wrap">
          <img
            className="landing__logo"
            src="/logoTECEnergie.png"
            alt="TEC Energie"
          />
        </div>
        <h1 className="landing__title">Rapportini</h1>
        <p className="landing__lead">
          Gestione interventi, commesse e materiali per i tecnici di{" "}
          TEC Energie — Impianti industriali ed efficentamento energetico.
        </p>
        <Link className="landing__cta" to="/login">
          Accedi
        </Link>
      </main>
      <footer className="landing__footer">
        TEC ENERGIE s.r.l.u. · Via Arturo Mercanti 11, Montichiari (BS) ·{" "}
        <a href="https://tecenergie.com/" target="_blank" rel="noreferrer">
          tecenergie.com
        </a>
      </footer>
    </div>
  );
}
