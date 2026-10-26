import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import Registration from "./pages/Registration.jsx";
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Players from "./pages/Players.jsx";
import MatchSetup from "./pages/MatchSetup.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Teams from "./pages/Teams.jsx";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4001/api/v1/auth";

function AppContent() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function initializeSession() {
      try {
        const response = await fetch(`${API_URL}/me`, {
          method: "GET",
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) setUser(null);
          return;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
          throw new Error(
            result.message || "Unable to verify your session."
          );
        }

        if (!result.data?.user) {
          throw new Error("The server did not return the signed-in user.");
        }

        if (!cancelled) {
          setUser(result.data.user);
          setSessionError("");
        }
      } catch (error) {
        if (!cancelled) {
          setUser(null);
          setSessionError(
            error instanceof TypeError
              ? "Unable to connect to the authentication server."
              : error.message || "Unable to verify your session."
          );
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    initializeSession();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleLoginSuccess(authenticatedUser) {
    setSessionError("");
    setUser(authenticatedUser);
    navigate("/home", { replace: true });
  }

  async function handleLogout() {
    setSessionError("");

    try {
      const response = await fetch(`${API_URL}/logout`, {
        method: "POST",
        credentials: "include",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Logout failed.");
      }

      setUser(null);
      navigate("/login", { replace: true });
    } catch (error) {
      setSessionError(
        error.message || "Unable to log out. Please try again."
      );
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">Checking your session...</p>
      </main>
    );
  }

  return (
    <>
      {sessionError && (
        <div
          role="alert"
          className="bg-red-950 px-4 py-3 text-center text-sm text-red-300"
        >
          {sessionError}
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <Navigate to={user ? "/home" : "/login"} replace />
          }
        />

        <Route
          path="/home"
          element={
            user ? (
              <Home user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/players"
          element={
            user ? (
              <Players user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        
        <Route
              path="/teams"
              element={
                user ? (
                  <Teams user={user} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

        <Route
          path="/match-setup"
          element={
            user ? (
              <MatchSetup user={user} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/home" replace />
            ) : (
              <Login onLoginSuccess={handleLoginSuccess} />
            )
          }
        />

        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/home" replace />
            ) : (
              <Registration onLoginSuccess={handleLoginSuccess} />
            )
          }
        />

        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="*"
          element={
            <Navigate to={user ? "/home" : "/login"} replace />
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return (
      <p className="p-6 text-red-500">
        Google OAuth configuration is missing. Check frontend/.env.
      </p>
    );
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}