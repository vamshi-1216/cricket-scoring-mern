
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Trophy,
  CheckCircle2,
} from "lucide-react";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4001/api/v1/auth";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const method = searchParams.get("method") || "email";
  const isPhoneRecovery = method === "phone";

  const token = searchParams.get("token") || "";
  const recoveryToken = searchParams.get("recoveryToken") || "";

  const activeToken = isPhoneRecovery ? recoveryToken : token;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!activeToken) {
      setError(
        isPhoneRecovery
          ? "Your phone recovery session is missing or expired. Verify your phone again."
          : "This reset link is invalid or missing. Request a new link."
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError("Password must not exceed 72 UTF-8 bytes.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = isPhoneRecovery
        ? "/reset-password/phone"
        : "/reset-password";

      const payload = isPhoneRecovery
        ? { recoveryToken: activeToken, password }
        : { token: activeToken, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message ||
            "Unable to reset your password. Please verify your recovery link or session."
        );
      }

      setSuccess("Your password has been reset successfully.");

      // Remove sensitive recovery tokens from the browser URL.
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server. Please try again."
          : err.message || "Unable to reset your password."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 py-12 text-white">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-emerald-400"
        >
          <ArrowLeft size={16} />
          Back to login
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
            <Trophy size={24} />
          </div>

          <div>
            <p className="font-black tracking-wider">
              CRICKET<span className="text-emerald-400">.</span>SCORING
            </p>
            <p className="text-xs text-zinc-500">Account security</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
            {success ? (
              <CheckCircle2 size={25} />
            ) : (
              <ShieldCheck size={25} />
            )}
          </div>

          <h1 className="text-2xl font-bold">
            {success ? "Password updated" : "Create a new password"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {success
              ? "Your account password has been changed. You can now sign in with your new password."
              : isPhoneRecovery
                ? "Your phone has been verified. Choose a new password to secure your account."
                : "Choose a strong password that you haven't used for this account before."}
          </p>

          {!success && (
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  New password
                </label>

                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
                  />

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className={`${inputClass} pl-11 pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-0 top-0 flex h-full items-center px-4 text-zinc-500 hover:text-white"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Confirm new password
                </label>

                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  className={inputClass}
                />
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
                disabled={loading || !activeToken}
                className="w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating password..." : "Reset password"}
              </button>

              {!activeToken && (
                <p className="text-sm text-amber-300">
                  {isPhoneRecovery
                    ? "No phone recovery token was found. Return to Forgot Password and verify your phone again."
                    : "No reset token was found. Request a new reset link."}
                </p>
              )}
            </form>
          )}

          {success && (
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-7 w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300"
            >
              Continue to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
