import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AppHome from "./pages/AppHome";
import NuovoIntervento from "./pages/NuovoIntervento";
import RapportinoCongiunto from "./pages/RapportinoCongiunto";
import BozzeInterventi from "./pages/BozzeInterventi";
import AdminUtenti from "./pages/admin/AdminUtenti";
import AdminVeicoli from "./pages/admin/AdminVeicoli";
import AdminClienti from "./pages/admin/AdminClienti";
import AdminOfferte from "./pages/admin/AdminOfferte";
import AdminCommesse from "./pages/admin/AdminCommesse";
import AdminCommessaDettaglio from "./pages/admin/AdminCommessaDettaglio";
import AdminMappa from "./pages/admin/AdminMappa";
import AdminCalendario from "./pages/admin/AdminCalendario";
import AdminTicket from "./pages/admin/AdminTicket";
import AdminMateriali from "./pages/admin/AdminMateriali";
import AdminMaterialiUtilizzati from "./pages/admin/AdminMaterialiUtilizzati";
import AdminCostiIntervento from "./pages/admin/AdminCostiIntervento";

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
          <Route path="/app/bozze" element={<BozzeInterventi />} />
          <Route path="/app/bozze/:bozzaId" element={<NuovoIntervento />} />

          <Route element={<RequireAdmin />}>
            {/* Stesse pagine interventi dei tecnici: per l'admin mostrano tutti gli utenti */}
            <Route path="/admin" element={<AppHome />} />
            <Route path="/admin/interventi/nuovo" element={<NuovoIntervento />} />
            <Route path="/admin/interventi/:interventoId" element={<NuovoIntervento />} />
            <Route path="/admin/rapportino-congiunto" element={<RapportinoCongiunto />} />
            <Route path="/admin/bozze" element={<BozzeInterventi />} />
            <Route path="/admin/bozze/:bozzaId" element={<NuovoIntervento />} />
            <Route path="/admin/utenti" element={<AdminUtenti />} />
            <Route path="/admin/veicoli" element={<AdminVeicoli />} />
            <Route path="/admin/clienti" element={<AdminClienti />} />
            <Route path="/admin/offerte" element={<AdminOfferte />} />
            <Route path="/admin/mappa" element={<AdminMappa />} />
            <Route path="/admin/calendario" element={<AdminCalendario />} />
            <Route path="/admin/commesse" element={<AdminCommesse />} />
            <Route path="/admin/commesse/:commessaId" element={<AdminCommessaDettaglio />} />
            <Route path="/admin/ticket" element={<AdminTicket />} />
            <Route path="/admin/materiali" element={<AdminMateriali />} />
            <Route path="/admin/materiali-utilizzati" element={<AdminMaterialiUtilizzati />} />
            <Route path="/admin/costi-intervento" element={<AdminCostiIntervento />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
    
  )
}

export default App
