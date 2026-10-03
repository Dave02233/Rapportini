import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import "../pages/AppHome.css";

const ADMIN_NAV = [
  { to: "/admin", label: "Interventi", end: true },
  { to: "/admin/mappa", label: "Mappa" },
  { to: "/admin/utenti", label: "Utenti" },
  { to: "/admin/clienti", label: "Clienti" },
  { to: "/admin/commesse", label: "Commesse" },
  { to: "/admin/ticket", label: "Ticket" },
  { to: "/admin/materiali", label: "Materiali" },
  { to: "/admin/materiali-utilizzati", label: "Materiali utilizzati" },
];

export default function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

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
            {isAdmin ? "Admin" : "Tecnico"} · #{user?.id}
          </p>
        </div>
      </div>
      <button type="button" className="app-home__logout" onClick={handleLogout}>
        Esci
      </button>

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
