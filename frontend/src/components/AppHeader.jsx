import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../api";
import "../pages/AppHome.css";

const ADMIN_NAV = [
  { to: "/admin", label: "Interventi", end: true },
  { to: "/admin/bozze", label: "Bozze" },
  { to: "/admin/mappa", label: "Mappa" },
  { to: "/admin/calendario", label: "Calendario" },
  { to: "/admin/utenti", label: "Utenti" },
  { to: "/admin/veicoli", label: "Veicoli" },
  { to: "/admin/clienti", label: "Clienti" },
  { to: "/admin/offerte", label: "Offerte" },
  { to: "/admin/commesse", label: "Commesse" },
  { to: "/admin/ticket", label: "Ticket" },
  { to: "/admin/materiali", label: "Materiali" },
  { to: "/admin/materiali-utilizzati", label: "Materiali utilizzati" },
  { to: "/admin/costi-intervento", label: "Costi d'intervento" },
];

export default function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [bozzaOggi, setBozzaOggi] = useState(false);

  useEffect(() => {
    if (!user || isAdmin) return;
    let cancelled = false;
    apiFetch("/bozze/notifica")
      .then((res) => {
        if (!cancelled) setBozzaOggi(Boolean(res?.presente));
      })
      .catch(() => {
        if (!cancelled) setBozzaOggi(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="app-home__header">
      <div className="app-home__brand">
        <img
          className="app-home__logo"
          src="/logoTECEnergie.png"
          alt="TEC Energie"
        />
        <div>
          <h1 className="app-home__header-title">Rapportini</h1>
          <p className="app-home__header-meta">
            {isAdmin ? "Admin" : "Tecnico"} - #{user?.id}
          </p>
        </div>
      </div>
      <div className="app-home__header-actions">
        {!isAdmin && (
          <Link className="app-home__bozze" to="/app/bozze">
            {bozzaOggi && <span className="app-home__bozze-dot" aria-hidden="true" />}
            Bozze
          </Link>
        )}
        <button type="button" className="app-home__logout" onClick={handleLogout}>
          Esci
        </button>
      </div>

      {isAdmin && (
        <nav className="app-home__nav" aria-label="Sezioni amministrazione">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? "app-home__nav-link app-home__nav-link--active"
                  : "app-home__nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
