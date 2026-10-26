import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  Phone,
  ShieldCheck,
  Trophy,
} from "lucide-react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:4001/api/v1/auth";

const MSG91_WIDGET_ID = import.meta.env.VITE_MSG91_WIDGET_ID;
const MSG91_TOKEN_AUTH = import.meta.env.VITE_MSG91_TOKEN_AUTH;

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [method, setMethod] = useState("email");
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);

  useEffect(() => {
    if (method !== "phone") {
      return undefined;
    }

    let cancelled = false;
    let script;

    const initializeWidget = () => {
      if (cancelled) return;

      if (typeof window.initSendOTP !== "function") {
        setError("MSG91 could not initialize. Refresh and try again.");
        return;
      }

      setWidgetReady(true);
    };

    if (!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) {
      return undefined;
    }

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
    } else {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = initializeWidget;
      script.onerror = () => {
        if (!cancelled) {
          setError("Unable to load the MSG91 widget.");
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
  }, [method]);

  function clearFeedback() {
    setMessage("");
    setError("");
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

  async function handleEmailRecovery(email) {
    const response = await fetch(`${API_URL}/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.toLowerCase(),
      }),
    });

    const result = await readResponse(response);

    setMessage(
      result.message ||
        "If an eligible account exists for that email, a reset link will be sent."
    );
  }

  async function handlePhoneRecovery(phone) {
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new Error(
        "Enter a valid phone number with country code, such as +919876543210."
      );
    }

    if (!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) {
      throw new Error(
        "MSG91 configuration is missing. Check frontend/.env."
      );
    }

    if (typeof window.initSendOTP !== "function") {
      throw new Error("MSG91 is not ready. Refresh and try again.");
    }

    setLoading(true);
    clearFeedback();

    try {
      window.initSendOTP({
        widgetId: MSG91_WIDGET_ID,
        tokenAuth: MSG91_TOKEN_AUTH,
        identifier: phone.replace(/^\+/, ""),
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

          try {
            const response = await fetch(
              `${API_URL}/forgot-password/verify-phone`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  phone,
                  accessToken,
                }),
              }
            );

            const result = await readResponse(response);
            const recoveryToken = result.data?.recoveryToken;

            if (!recoveryToken) {
              throw new Error(
                "The server did not return a recovery token."
              );
            }

            navigate(
              `/reset-password?method=phone&recoveryToken=${encodeURIComponent(
                recoveryToken
              )}`,
              { replace: true }
            );
          } catch (err) {
            setError(
              err instanceof TypeError
                ? "Unable to connect to the server. Please try again."
                : err.message || "Phone recovery failed."
            );
          } finally {
            setLoading(false);
          }
        },

        failure: () => {
          setError("MSG91 could not verify the OTP. Please try again.");
          setLoading(false);
        },
      });
    } catch {
      setError("Could not initialize MSG91. Refresh and try again.");
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearFeedback();

    const value = identifier.trim();

    if (method === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError("Enter a valid email address.");
        return;
      }

      setLoading(true);

      try {
        await handleEmailRecovery(value);
      } catch (err) {
        setError(
          err instanceof TypeError
            ? "Unable to connect to the server. Check that the Auth Service is running."
            : err.message || "Unable to request a password reset."
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    try {
      await handlePhoneRecovery(value);
    } catch (err) {
      setError(err.message || "Unable to start phone recovery.");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 py-12 text-white">
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
              CRICKET<span className="text-emerald-400">.SCORING</span>
            </p>
            <p className="text-xs text-zinc-500">
              Account recovery
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
            {message ? (
              <CheckCircle2 size={25} />
            ) : (
              <ShieldCheck size={25} />
            )}
          </div>

          <h1 className="text-2xl font-bold">
            Forgot your password?
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Choose how you want to recover access to your account.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setMethod("email");
                setIdentifier("");
                setWidgetReady(false);
                clearFeedback();
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                method === "email"
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              <Mail size={17} />
              Email
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod("phone");
                setIdentifier("");
                clearFeedback();
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                method === "phone"
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              <Phone size={17} />
              Phone OTP
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                {method === "email"
                  ? "Registered email address"
                  : "Registered phone number"}
              </label>

              <input
                id="identifier"
                type={method === "email" ? "email" : "tel"}
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  clearFeedback();
                }}
                placeholder={
                  method === "email"
                    ? "you@example.com"
                    : "+919876543210"
                }
                autoComplete={method === "email" ? "email" : "tel"}
                required
                className={inputClass}
              />

              {method === "phone" && (
                <p className="mt-2 text-xs text-zinc-500">
                  Include your country code, such as +91 for India.
                  {widgetReady ? " MSG91 is ready." : ""}
                </p>
              )}
            </div>

            {method === "phone" &&
              (!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm leading-6 text-red-300"
                >
                  MSG91 configuration is missing. Check frontend/.env
                  and restart Vite.
                </p>
              )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm leading-6 text-red-300"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                role="status"
                className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm leading-6 text-emerald-300"
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (method === "phone" &&
                  (!widgetReady ||
                    !MSG91_WIDGET_ID ||
                    !MSG91_TOKEN_AUTH))
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {method === "email" ? (
                <Mail size={17} />
              ) : (
                <Phone size={17} />
              )}

              {loading
                ? "Please wait..."
                : method === "email"
                  ? "Send reset link"
                  : "Verify phone with OTP"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
            {method === "email"
              ? "If an eligible account exists, a reset link will be sent to your email."
              : "Complete MSG91 verification to continue to password reset."}
          </p>
        </div>
      </div>
    </main>
  );
}