import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AppHome from "./pages/AppHome";
import NuovoIntervento from "./pages/NuovoIntervento";
import RapportinoCongiunto from "./pages/RapportinoCongiunto";
import AdminUtenti from "./pages/admin/AdminUtenti";
import AdminClienti from "./pages/admin/AdminClienti";
import AdminCommesse from "./pages/admin/AdminCommesse";
import AdminCommessaDettaglio from "./pages/admin/AdminCommessaDettaglio";
import AdminMappa from "./pages/admin/AdminMappa";
import AdminTicket from "./pages/admin/AdminTicket";
import AdminMateriali from "./pages/admin/AdminMateriali";
import AdminMaterialiUtilizzati from "./pages/admin/AdminMaterialiUtilizzati";
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppHome />} />
          <Route path="/app/interventi/nuovo" element={<NuovoIntervento />} />
          <Route path="/app/interventi/:interventoId" element={<NuovoIntervento />} />
          <Route path="/app/rapportino-congiunto" element={<RapportinoCongiunto />} />

          <Route element={<RequireAdmin />}>
            {/* Stesse pagine interventi dei tecnici: per l'admin mostrano tutti gli utenti */}
            <Route path="/admin" element={<AppHome />} />
            <Route path="/admin/interventi/nuovo" element={<NuovoIntervento />} />
            <Route path="/admin/interventi/:interventoId" element={<NuovoIntervento />} />
            <Route path="/admin/rapportino-congiunto" element={<RapportinoCongiunto />} />
            <Route path="/admin/utenti" element={<AdminUtenti />} />
            <Route path="/admin/clienti" element={<AdminClienti />} />
            <Route path="/admin/mappa" element={<AdminMappa />} />
            <Route path="/admin/commesse" element={<AdminCommesse />} />
            <Route path="/admin/commesse/:commessaId" element={<AdminCommessaDettaglio />} />
            <Route path="/admin/ticket" element={<AdminTicket />} />
            <Route path="/admin/materiali" element={<AdminMateriali />} />
            <Route path="/admin/materiali-utilizzati" element={<AdminMaterialiUtilizzati />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
