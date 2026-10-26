import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MapPin,
  Shield,
  Swords,
  Trophy,
} from "lucide-react";

const TEAM_API_URL =
  import.meta.env.VITE_TEAM_API_URL ||
  "http://localhost:4004/api/v1/teams";

const MATCH_API_URL =
  import.meta.env.VITE_MATCH_API_URL ||
  "http://localhost:4003/api/v1/matches";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/50";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-emerald-400/30 hover:text-white";

const FORMATS = [
  { value: "T10", label: "T10", overs: 10, description: "10 overs" },
  { value: "T20", label: "T20", overs: 20, description: "20 overs" },
  { value: "ODI", label: "ODI", overs: 50, description: "50 overs" },
  { value: "TEST", label: "Test", overs: 90, description: "Two innings per team" },
  { value: "CUSTOM", label: "Custom", overs: null, description: "Choose your overs" },
];

async function apiRequest(url, options = {}) {
  let response;

  try {
    response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Unable to connect to the service. Check that the backend is running."
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message || `Request failed with status ${response.status}.`
    );
  }

  return result;
}

export default function MatchSetup() {
  const navigate = useNavigate();

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMatch, setSuccessMatch] = useState(null);

  const [form, setForm] = useState({
    title: "",
    teamAId: "",
    teamBId: "",
    format: "T20",
    overs: 20,
    inningsPerTeam: 1,
    venue: "",
    matchDate: "",
  });

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    setError("");

    try {
      const result = await apiRequest(TEAM_API_URL);
      const records = Array.isArray(result.data) ? result.data : [];

      const activeTeams = records.filter((team) => team.isActive === true);
      setTeams(activeTeams);

      setForm((current) => ({
        ...current,
        teamAId: activeTeams.some((team) => team._id === current.teamAId)
          ? current.teamAId
          : activeTeams[0]?._id || "",
        teamBId: activeTeams.some((team) => team._id === current.teamBId)
          ? current.teamBId
          : activeTeams.find((team) => team._id !== activeTeams[0]?._id)?._id || "",
      }));
    } catch (err) {
      setError(err.message || "Unable to load teams.");
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  function updateField(event) {
    const { name, value } = event.target;

    setError("");
    setSuccessMatch(null);

    setForm((current) => {
      if (name === "format") {
        const selectedFormat = FORMATS.find((item) => item.value === value);

        return {
          ...current,
          format: value,
          overs: selectedFormat?.overs ?? 20,
          inningsPerTeam: value === "TEST" ? 2 : 1,
        };
      }

      if (name === "overs") {
        return { ...current, overs: Number(value) };
      }

      return { ...current, [name]: value };
    });
  }

  async function submitForm(event) {
    event.preventDefault();
    setError("");
    setSuccessMatch(null);

    if (teams.length < 2) {
      setError("Create at least two active teams before setting up a match.");
      return;
    }

    if (!form.teamAId || !form.teamBId) {
      setError("Select both teams.");
      return;
    }

    if (form.teamAId === form.teamBId) {
      setError("Choose two different teams.");
      return;
    }

    if (!form.title.trim() || form.title.trim().length < 2) {
      setError("Enter a match title with at least two characters.");
      return;
    }

    if (!Number.isInteger(Number(form.overs)) || form.overs < 1 || form.overs > 450) {
      setError("Overs must be a whole number between 1 and 450.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        title: form.title.trim(),
        teamAId: form.teamAId,
        teamBId: form.teamBId,
        format: form.format,
        overs: Number(form.overs),
        inningsPerTeam: form.format === "TEST" ? 2 : 1,
        venue: form.venue.trim(),
        matchDate: form.matchDate
          ? new Date(`${form.matchDate}T12:00:00`).toISOString()
          : null,
      };

      const result = await apiRequest(MATCH_API_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSuccessMatch(result.data);
    } catch (err) {
      setError(err.message || "Unable to create the match.");
    } finally {
      setSaving(false);
    }
  }

  const teamA = teams.find((team) => team._id === form.teamAId);
  const teamB = teams.find((team) => team._id === form.teamBId);

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/[0.07] blur-[110px]" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-green-500/[0.05] blur-[110px]" />

      <div className="relative mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <Link
              to="/home"
              className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-emerald-300"
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>

            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
              Match management
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Match <span className="text-emerald-400">setup.</span>
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              Choose your teams, configure the game, and get ready for the toss.
            </p>
          </div>

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08]">
            <Trophy size={27} className="text-emerald-300" />
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300"
          >
            <CircleAlert size={19} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMatch ? (
          <section className="rounded-3xl border border-emerald-400/20 bg-zinc-900/70 p-6 sm:p-9">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10">
              <CheckCircle2 size={30} className="text-emerald-300" />
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
              Match created
            </p>

            <h2 className="mt-2 text-2xl font-black">
              {successMatch.title}
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Your match has been saved successfully.
            </p>

            <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500">Match ID</p>
              <p className="mt-2 break-all font-mono text-sm text-emerald-300">
                {successMatch._id}
              </p>
            </div>

            <p className="mt-4 text-xs leading-5 text-zinc-500">
              Match setup is saved. The live scoring screen will be connected
              after we implement the scoring workflow.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className={primaryButton}
                onClick={() => navigate("/home")}
              >
                <ArrowLeft size={16} />
                Return Home
              </button>

              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setSuccessMatch(null);
                  setForm((current) => ({
                    ...current,
                    title: "",
                    venue: "",
                    matchDate: "",
                  }));
                }}
              >
                Create another match
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={submitForm} className="space-y-6">
            <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-5 sm:p-7">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-xl bg-emerald-400/10 p-3">
                  <Swords size={20} className="text-emerald-300" />
                </div>
                <div>
                  <h2 className="font-bold">Choose your teams</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Select two different active teams.
                  </p>
                </div>
              </div>

              {loadingTeams ? (
                <div className="flex items-center gap-3 py-8 text-sm text-zinc-400">
                  <LoaderCircle size={20} className="animate-spin text-emerald-400" />
                  Loading teams...
                </div>
              ) : teams.length < 2 ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                  <p className="text-sm text-amber-200">
                    You need at least two active teams to create a match.
                  </p>
                  <Link
                    to="/teams"
                    className="mt-3 inline-flex text-sm font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    Team management will be connected next.
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-zinc-300">
                    Team A
                    <select
                      className={inputClass}
                      name="teamAId"
                      value={form.teamAId}
                      onChange={updateField}
                      required
                    >
                      <option value="">Select Team A</option>
                      {teams.map((team) => (
                        <option key={team._id} value={team._id}>
                          {team.name} ({team.shortName})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-zinc-300">
                    Team B
                    <select
                      className={inputClass}
                      name="teamBId"
                      value={form.teamBId}
                      onChange={updateField}
                      required
                    >
                      <option value="">Select Team B</option>
                      {teams.map((team) => (
                        <option key={team._id} value={team._id}>
                          {team.name} ({team.shortName})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {teamA && teamB && teamA._id !== teamB._id && (
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/[0.07] bg-zinc-950/70 p-4">
                  <div className="min-w-0 text-center">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10">
                      <Shield className="text-emerald-300" size={20} />
                    </div>
                    <p className="truncate text-sm font-bold">{teamA.shortName}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">{teamA.name}</p>
                  </div>

                  <span className="text-xs font-black tracking-widest text-zinc-600">
                    VS
                  </span>

                  <div className="min-w-0 text-center">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10">
                      <Shield className="text-sky-300" size={20} />
                    </div>
                    <p className="truncate text-sm font-bold">{teamB.shortName}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">{teamB.name}</p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-5 sm:p-7">
              <h2 className="font-bold">Match details</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Configure the format and match conditions.
              </p>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-zinc-300 sm:col-span-2">
                  Match title
                  <input
                    className={inputClass}
                    name="title"
                    value={form.title}
                    onChange={updateField}
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Weekend Gully Cricket"
                    required
                  />
                </label>

                <div className="grid gap-2 sm:col-span-2">
                  <span className="text-sm font-medium text-zinc-300">
                    Match format
                  </span>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {FORMATS.map((format) => (
                      <button
                        key={format.value}
                        type="button"
                        onClick={() => {
                          updateField({
                            target: { name: "format", value: format.value },
                          });
                        }}
                        className={`rounded-xl border p-3 text-left transition ${
                          form.format === format.value
                            ? "border-emerald-400/50 bg-emerald-400/[0.08]"
                            : "border-white/10 bg-zinc-950 hover:border-white/20"
                        }`}
                      >
                        <span className="block text-sm font-bold">
                          {format.label}
                        </span>
                        <span className="mt-1 block text-[10px] text-zinc-500">
                          {format.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="grid gap-2 text-sm font-medium text-zinc-300">
                  Overs
                  <input
                    className={inputClass}
                    type="number"
                    name="overs"
                    value={form.overs}
                    onChange={updateField}
                    min={1}
                    max={450}
                    step={1}
                    required
                    disabled={form.format !== "CUSTOM"}
                  />
                  {form.format !== "CUSTOM" && (
                    <span className="text-xs text-zinc-500">
                      Set by the selected format.
                    </span>
                  )}
                </label>

                <label className="grid gap-2 text-sm font-medium text-zinc-300">
                  Venue
                  <span className="relative">
                    <MapPin
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      name="venue"
                      value={form.venue}
                      onChange={updateField}
                      maxLength={150}
                      placeholder="e.g. Nagole Cricket Ground"
                    />
                  </span>
                </label>

                <label className="grid gap-2 text-sm font-medium text-zinc-300 sm:col-span-2">
                  Match date (optional)
                  <span className="relative">
                    <CalendarDays
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                    <input
                      className={`${inputClass} pl-9`}
                      type="date"
                      name="matchDate"
                      value={form.matchDate}
                      onChange={updateField}
                    />
                  </span>
                </label>
              </div>

              {form.format === "TEST" && (
                <p className="mt-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.05] p-3 text-xs leading-5 text-sky-200">
                  Test matches are configured with two innings per team. The
                  innings and scoring rules will be implemented in the scoring workflow.
                </p>
              )}
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => navigate("/home")}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className={primaryButton}
                disabled={saving || loadingTeams || teams.length < 2}
              >
                {saving ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" />
                    Creating match...
                  </>
                ) : (
                  <>
                    <Trophy size={17} />
                    Create Match
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}