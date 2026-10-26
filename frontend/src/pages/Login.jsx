
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Trophy,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  Activity,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4001/api/v1/auth";

export default function Login({ onLoginSuccess }) {
  const [form, setForm] = useState({
    identifier: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  async function readResponse(response) {
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || `Request failed (${response.status}).`
      );
    }

    return result;
  }

  async function loadCurrentUser() {
    const response = await fetch(`${API_URL}/me`, {
      method: "GET",
      credentials: "include",
    });

    const result = await readResponse(response);

    if (!result.data?.user) {
      throw new Error(
        "Login succeeded, but the application session could not be verified."
      );
    }

    return result.data.user;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const identifier = form.identifier.trim();
    const password = form.password;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const isPhone = /^\+[1-9]\d{7,14}$/.test(identifier);

    if (!identifier || !password) {
      setError("Enter your email or phone number and password.");
      return;
    }

    if (!isEmail && !isPhone) {
      setError(
        "Enter a valid email address or phone number with country code, e.g. +919876543210."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          identifier: isEmail ? identifier.toLowerCase() : identifier,
          password,
        }),
      });

      await readResponse(response);

      // Verify the session cookie and retrieve the actual user.
      const user = await loadCurrentUser();

      // Update App.jsx state and navigate to Home.
      onLoginSuccess(user);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server. Check that the Auth Service is running."
          : err.message || "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    const credential = credentialResponse?.credential;

    setError("");

    if (!credential) {
      setError("Google did not return a credential. Please try again.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ credential }),
      });

      await readResponse(response);

      const user = await loadCurrentUser();

      // Google sign-in uses the same session update.
      onLoginSuccess(user);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server. Check that the Auth Service is running."
          : err.message || "Google sign-in failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleError() {
    setError("Google sign-in failed. Please try again.");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden overflow-hidden border-r border-white/10 bg-zinc-900/50 p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-emerald-400/10 blur-[120px]" />

          <Link to="/login" className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
              <Trophy size={23} strokeWidth={2.5} />
            </div>

            <div>
              <p className="text-lg font-black tracking-wider">
                CRICKET<span className="text-emerald-400">.</span>SCORING
              </p>
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-zinc-500">
                Every run counts
              </p>
            </div>
          </Link>

          <div className="relative max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs font-medium text-emerald-300">
              <Activity size={14} />
              YOUR GAME. YOUR STATS.
            </div>

            <h1 className="text-5xl font-black leading-tight tracking-tight xl:text-6xl">
              Welcome back
              <br />
              to the <span className="text-emerald-400">crease.</span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-7 text-zinc-400">
              Your matches, your milestones, your cricket journey. Sign in to
              continue where your game left off.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
                <ShieldCheck size={22} className="mb-4 text-emerald-400" />
                <p className="font-semibold">Your cricket profile</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Keep your journey organized.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
                <Trophy size={22} className="mb-4 text-emerald-400" />
                <p className="font-semibold">Track every milestone</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Follow your performance.
                </p>
              </div>
            </div>
          </div>

          <p className="relative text-xs text-zinc-600">
            BUILT FOR THE LOVE OF CRICKET.
          </p>
        </section>

        <main className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-12">
          <div className="w-full max-w-md">
            <Link
              to="/login"
              className="mb-12 flex items-center gap-3 lg:hidden"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
                <Trophy size={21} />
              </div>
              <span className="font-black tracking-wider">
                CRICKET<span className="text-emerald-400">.</span>SCORING
              </span>
            </Link>

            <div className="mb-8">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                SIGN IN
              </p>

              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Welcome back
              </h2>

              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Sign in to continue to your cricket dashboard.
              </p>
            </div>

            <div className="mb-6">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                theme="filled_black"
                shape="rectangular"
                size="large"
                text="continue_with"
                width="400"
                useOneTap={false}
              />
            </div>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-center text-xs text-zinc-600">
                OR CONTINUE WITH EMAIL OR PHONE
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="identifier"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Email or phone number
                </label>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500">
                    {form.identifier.includes("@") ? (
                      <Mail size={18} />
                    ) : (
                      <Phone size={18} />
                    )}
                  </div>

                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    value={form.identifier}
                    onChange={handleChange}
                    placeholder="you@example.com or +919876543210"
                    required
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Password
                </label>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500">
                    <Lock size={18} />
                  </div>

                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    required
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 py-3.5 pl-11 pr-12 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500 transition hover:text-white"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>
              
                      
              <div className="flex justify-end">
                <Link
                to="/forgot-password"
                className="text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
                >
                Forgot Password?
                </Link>
              </div>


              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm leading-6 text-red-300"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && (
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                )}
              </button>
            </form>

            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-zinc-600">NEW TO THE GAME?</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <Link
              to="/register"
              className="flex w-full items-center justify-center rounded-xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-zinc-300 transition hover:border-emerald-400/40 hover:text-emerald-300"
            >
              Create an account
            </Link>

            <p className="mt-8 text-center text-xs leading-5 text-zinc-600">
              Secure authentication for your cricket journey.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
