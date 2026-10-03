import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./useAuth";

export function RequireAdmin() {
    const { user } = useAuth();

    if (user?.role !== "admin") {
        return <Navigate to="/app" replace />;
    }

    return <Outlet />;
}
