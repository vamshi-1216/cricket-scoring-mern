import { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  Trophy,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:4001/api/v1/auth";

const MSG91_WIDGET_ID = import.meta.env.VITE_MSG91_WIDGET_ID;
const MSG91_TOKEN_AUTH = import.meta.env.VITE_MSG91_TOKEN_AUTH;

const initialForm = {
  name: "",
  identifier: "",
  password: "",
  confirmPassword: "",
};

export default function Registration({ onLoginSuccess }) {
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState("register");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (step !== "verify-phone") return undefined;

    if (!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) {
      return undefined;
    }

    let cancelled = false;
    let script;

    const initializeWidget = () => {
      if (cancelled) return;

      if (typeof window.initSendOTP !== "function") {
        setError("MSG91 widget did not initialize. Refresh and try again.");
        return;
      }

      try {
        window.initSendOTP({
          widgetId: MSG91_WIDGET_ID,
          tokenAuth: MSG91_TOKEN_AUTH,
          identifier: form.identifier.trim().replace(/^\+/, ""),
          exposeMethods: false,

          success: async (data) => {
            const accessToken =
              data?.["access-token"] ??
              data?.accessToken ??
              data?.token ??
              data?.data?.["access-token"] ??
              data?.data?.accessToken ??
              (data?.type === "success" &&
              typeof data?.message === "string" &&
              data.message.split(".").length === 3
                ? data.message
                : null);

            if (
              typeof accessToken !== "string" ||
              !accessToken.trim()
            ) {
              setError(
                "MSG91 did not return a recognized verification token. Please try again."
              );
              setLoading(false);
              return;
            }

            setLoading(true);
            setError("");
            setSuccess("OTP verified. Confirming your phone number...");

            try {
              const response = await fetch(
                `${API_URL}/verify-phone-otp`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    phone: form.identifier.trim(),
                    accessToken,
                  }),
                }
              );

              const result = await response.json().catch(() => ({}));

              if (!response.ok || result.success === false) {
                throw new Error(
                  result.message || "Phone verification failed."
                );
              }

              setVerified(true);
              setSuccess(
                result.message || "Phone number verified successfully."
              );
            } catch (err) {
              setError(
                err instanceof TypeError
                  ? "Unable to connect to the server. Check that the Auth Service is running."
                  : err.message || "Phone verification failed."
              );
              setSuccess("");
            } finally {
              setLoading(false);
            }
          },

          failure: () => {
            setError(
              "MSG91 could not complete phone verification. Check the widget configuration and try again."
            );
            setLoading(false);
          },
        });
      } catch {
        setError("Could not initialize MSG91. Check the widget configuration.");
        setLoading(false);
      }
    };

    const scriptUrl = "https://verify.msg91.com/otp-provider.js";
    const existingScript = document.querySelector(
      `script[src="${scriptUrl}"]`
    );

    if (
      existingScript &&
      typeof window.initSendOTP === "function"
    ) {
      initializeWidget();
    } else if (existingScript) {
      existingScript.addEventListener("load", initializeWidget, {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () => {
          if (!cancelled) {
            setError("Unable to load the MSG91 widget script.");
          }
        },
        { once: true }
      );
    } else {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = initializeWidget;
      script.onerror = () => {
        if (!cancelled) {
          setError("Unable to load the MSG91 widget script.");
        }
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
    };
  }, [step, form.identifier]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  async function readResponse(response) {
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || "The request failed. Please try again."
      );
    }

    return result;
  }

  async function requestEmailOtp(email) {
    const response = await fetch(`${API_URL}/send-email-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    return readResponse(response);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = form.name.trim();
    const identifier = form.identifier.trim();
    const password = form.password;
    const emailRegistration = identifier.includes("@");

    if (name.length < 2) {
      setError("Name must contain at least 2 characters.");
      return;
    }

    if (!identifier) {
      setError("Enter your email address or phone number.");
      return;
    }

    if (
      emailRegistration &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
    ) {
      setError("Enter a valid email address.");
      return;
    }

    if (
      !emailRegistration &&
      !/^\+[1-9]\d{7,14}$/.test(identifier)
    ) {
      setError(
        "Enter a valid phone number with country code, e.g. +919876543210."
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

    if (password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const payload = {
      name,
      password,
      ...(emailRegistration
        ? { email: identifier.toLowerCase() }
        : { phone: identifier }),
    };

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await readResponse(response);

      if (emailRegistration) {
        setForm({
          ...initialForm,
          identifier: identifier.toLowerCase(),
        });

        setStep("verify-email");
        setOtp("");
        setVerified(false);

        try {
          await requestEmailOtp(identifier.toLowerCase());

          setSuccess(
            "Account created. A verification code has been sent to your email."
          );
        } catch {
          setError(
            "Your account was created, but the verification email could not be sent. Use Resend OTP to try again."
          );
        }
      } else {
        setForm({
          ...initialForm,
          identifier,
        });

        setStep("verify-phone");
        setVerified(false);
        setSuccess(
          "Account created. Complete phone verification using MSG91."
        );
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server. Check that the Auth Service is running."
          : err.message || "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmail(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/verify-email-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.identifier.trim().toLowerCase(),
          otp,
        }),
      });

      const result = await readResponse(response);

      setVerified(true);
      setOtp("");
      setSuccess(result.message || "Email verified successfully.");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server. Check that the Auth Service is running."
          : err.message || "Email verification failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const result = await requestEmailOtp(
        form.identifier.trim().toLowerCase()
      );

      setOtp("");
      setSuccess(
        result.message ||
          "If the account exists and needs verification, an email will be sent."
      );
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server."
          : err.message || "Unable to resend the verification code."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleBackToRegistration() {
    setStep("register");
    setForm(initialForm);
    setOtp("");
    setError("");
    setSuccess("");
    setVerified(false);
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError("");
    setSuccess("");

    if (!credentialResponse?.credential) {
      setError("Google did not return an authentication credential.");
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
        body: JSON.stringify({
          credential: credentialResponse.credential,
        }),
      });

      const result = await readResponse(response);
      const user = result.data?.user;

      if (!user) {
        throw new Error(
          "Google sign-up succeeded, but the server did not return the user."
        );
      }

      if (typeof onLoginSuccess !== "function") {
        throw new Error(
          "Authentication succeeded, but the app session handler is missing."
        );
      }

      onLoginSuccess(user);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Unable to connect to the server. Please try again."
          : err.message || "Google sign-up failed."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15";

  const labelClass =
    "mb-2 block text-sm font-medium text-zinc-300";

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-green-500/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-2 lg:gap-8 lg:px-12">
        <section className="hidden lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-lg font-black text-zinc-950">
              CS
            </div>

            <div>
              <p className="text-lg font-bold tracking-wide">
                CRICKET
                <span className="text-emerald-400">.SCORING</span>
              </p>
              <p className="text-xs tracking-[0.25em] text-zinc-500">
                YOUR GAME. YOUR LEGACY.
              </p>
            </div>
          </div>

          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
            Every run tells a story
          </p>

          <h1 className="max-w-xl text-4xl font-black leading-tight xl:text-5xl">
            Your cricket journey
            <span className="mt-2 block text-emerald-400">
              starts here.
            </span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-8 text-zinc-400">
            Create your account and get ready to manage teams, score
            matches, and track every performance.
          </p>

          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4">
            {[
              ["01", "Create teams"],
              ["02", "Score matches"],
              ["03", "Track stats"],
            ].map(([number, label]) => (
              <div
                key={number}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-sm font-bold text-emerald-400">
                  {number}
                </p>
                <p className="mt-2 text-sm text-zinc-300">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-lg">
          <Link
            to="/login"
            className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-emerald-400"
          >
            <ArrowLeft size={16} />
            Back to login
          </Link>

          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950">
              <Trophy size={23} />
            </div>
            <p className="font-black tracking-wide">
              CRICKET<span className="text-emerald-400">.SCORING</span>
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-6 sm:p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
              {step === "register" ? (
                <UserPlus size={24} />
              ) : (
                <ShieldCheck size={24} />
              )}
            </div>

            <h2 className="text-2xl font-bold">
              {step === "register"
                ? "Create your account"
                : step === "verify-email"
                  ? "Verify your email"
                  : "Verify your phone"}
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {step === "register"
                ? "Join the community and keep your cricket records in one place."
                : step === "verify-email"
                  ? `Enter the six-digit code sent to ${form.identifier}.`
                  : `Complete MSG91 OTP verification for ${form.identifier}.`}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm leading-6 text-red-300"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm leading-6 text-emerald-300"
              >
                {success}
              </div>
            )}

            {step === "register" && (
              <>
                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="name" className={labelClass}>
                      Full name
                    </label>
                    <input
                      id="name"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Enter your name"
                      autoComplete="name"
                      required
                      minLength={2}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="identifier" className={labelClass}>
                      Email or phone number
                    </label>
                    <input
                      id="identifier"
                      name="identifier"
                      value={form.identifier}
                      onChange={handleChange}
                      placeholder="you@example.com or +919876543210"
                      autoComplete="username"
                      required
                      className={inputClass}
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      For phone registration, include the country code.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="password" className={labelClass}>
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={handleChange}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        className={`${inputClass} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        className="absolute inset-y-0 right-3 text-zinc-400 hover:text-white"
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
                    <label htmlFor="confirmPassword" className={labelClass}>
                      Confirm password
                    </label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={handleChange}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      required
                      className={inputClass}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Please wait..." : "Create account"}
                  </button>
                </form>

                <div className="my-6 flex items-center gap-4">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-zinc-500">
                    OR CONTINUE WITH
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => {
                      setError("Google sign-up was unsuccessful.");
                    }}
                    useOneTap={false}
                  />
                </div>

                <p className="mt-6 text-center text-sm text-zinc-400">
                  Already have an account?{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}

            {step === "verify-email" && (
              <form
                onSubmit={handleVerifyEmail}
                className="mt-6 space-y-5"
              >
                <div>
                  <label htmlFor="otp" className={labelClass}>
                    Six-digit verification code
                  </label>
                  <input
                    id="otp"
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                      setError("");
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    required
                    maxLength={6}
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || verified}
                  className="w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
                >
                  {verified
                    ? "Email verified"
                    : loading
                      ? "Verifying..."
                      : "Verify email"}
                </button>

                {!verified && (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 hover:border-emerald-400/50 disabled:opacity-60"
                  >
                    Resend verification code
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleBackToRegistration}
                  className="w-full text-sm text-zinc-400 hover:text-white"
                >
                  Use a different email or phone
                </button>

                {verified && (
                  <Link
                    to="/login"
                    className="block text-center text-sm font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Continue to login
                  </Link>
                )}
              </form>
            )}

            {step === "verify-phone" && (
              <div className="mt-6 space-y-5">
                {(!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) && !verified && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
                  >
                    MSG91 widget configuration is missing. Check
                    frontend/.env and restart Vite.
                  </div>
                )}

                {!verified && (
                  <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-400">
                    Use the MSG91 verification widget to receive and verify
                    your phone OTP. The widget opens when this step loads.
                  </div>
                )}

                {verified && (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-300">
                    Phone verified successfully. You can now sign in.
                  </div>
                )}

                {verified ? (
                  <Link
                    to="/login"
                    className="block w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-center text-sm font-bold text-zinc-950 hover:bg-emerald-300"
                  >
                    Continue to login
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleBackToRegistration}
                    className="w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 hover:border-emerald-400/50"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <ArrowLeft size={16} />
                      Back to registration
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}