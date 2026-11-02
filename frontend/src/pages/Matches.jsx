import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  Flag,
  MapPin,
  Plus,
  RefreshCw,
  Swords,
  Trophy,
  Users,
  Radio,
} from "lucide-react";

const MATCH_API_URL =
  import.meta.env.VITE_MATCH_API_URL || "http://localhost:4003/api/v1/matches";
const TEAM_API_URL =
  import.meta.env.VITE_TEAM_API_URL || "http://localhost:4004/api/v1/teams";

// Page colours are set inline so they show even if arbitrary Tailwind values fail.
const COLORS = {
  page: "#07130d",
  card: "#0c1b13",
};

/* ---------- data helpers ---------- */

async function apiRequest(url) {
  let response;

  try {
    response = await fetch(url, { credentials: "include" });
  } catch {
    throw new Error(
      "Unable to connect to a required service. Check that the backend is running."
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

function idOf(value) {
  return String(value?._id || value?.id || value || "");
}

function hasLineup(match, side) {
  return (
    match[`team${side}PlayerIds`]?.length > 0 &&
    match[`team${side}CaptainId`] &&
    match[`team${side}WicketKeeperId`]
  );
}

function setupLabel(match) {
  if (match.tossWinnerId && match.tossDecision && match.battingFirstId) {
    return "Ready to play";
  }
  if (hasLineup(match, "A") && hasLineup(match, "B")) {
    return "Toss needed";
  }
  return "Squads needed";
}

// A match is "running" when its status says it is being played / scored.
const LIVE_STATUSES = ["live", "inprogress", "running", "ongoing"];

function isLive(match) {
  return LIVE_STATUSES.includes(normalizeMatchStatus(match));
}

function isUpcoming(match) {
  return normalizeMatchStatus(match) === "scheduled";
}

function isCompleted(match) {
  return normalizeMatchStatus(match) === "completed";
}

function normalizeMatchStatus(match) {
  return String(match?.status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function hasValidResult(match) {
  const result = match?.result;
  if (!result || !["WIN", "TIE", "NO_RESULT"].includes(result.outcome)) {
    return false;
  }

  const finalizedAt = new Date(result.finalizedAt);
  if (!result.finalizedAt || Number.isNaN(finalizedAt.getTime())) {
    return false;
  }

  if (result.outcome === "WIN") {
    return (
      [idOf(match.teamAId).toLowerCase(), idOf(match.teamBId).toLowerCase()].includes(
        idOf(result.winnerTeamId).toLowerCase()
      ) &&
      ["RUNS", "WICKETS"].includes(result.margin?.type) &&
      Number.isInteger(result.margin?.value) &&
      result.margin.value > 0
    );
  }

  if (result.winnerTeamId || result.margin) return false;
  return result.outcome !== "NO_RESULT" || Boolean(result.reason?.trim());
}

function formatDate(value) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not set"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/* ---------- presentation helpers ---------- */

const SETUP_STEPS = [
  { key: "squads", label: "Squads", icon: Users },
  { key: "toss", label: "Toss", icon: Coins },
  { key: "ready", label: "Ready", icon: Flag },
];

// How many setup steps are finished: 0 = none, 1 = squads, 3 = all done
function setupProgress(match) {
  const label = setupLabel(match);
  if (label === "Ready to play") return 3;
  if (label === "Toss needed") return 1;
  return 0;
}

const FILTERS = [
  { key: "all", label: "All Matches" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

const STATUS_STYLES = {
  live: "bg-red-500/15 text-red-300 ring-red-400/30",
  completed: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/20",
  scheduled: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
};

function statusStyle(match) {
  if (isLive(match)) return STATUS_STYLES.live;
  return (
    STATUS_STYLES[normalizeMatchStatus(match)] ||
    STATUS_STYLES.scheduled
  );
}

function dateParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString(undefined, { day: "2-digit" }),
    month: date.toLocaleDateString(undefined, { month: "short" }),
    year: date.getFullYear(),
  };
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2";

/* ---------- small components ---------- */

function SetupTracker({ done }) {
  return (
    <ol
      className="flex items-center"
      aria-label={`Setup progress: ${done === 3 ? "complete" : `${done} of 3 steps done`}`}
    >
      {SETUP_STEPS.map((step, index) => {
        // squads done at 1, toss and ready done at 3
        const complete = done >= (index === 0 ? 1 : 3);
        const isCurrent = !complete && (index === 0 ? done === 0 : index === 1);
        const Icon = step.icon;

        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ring-1 ${
                  complete
                    ? "bg-emerald-400 text-emerald-950 ring-emerald-300"
                    : isCurrent
                      ? "bg-amber-300/15 text-amber-200 ring-amber-300/60"
                      : "bg-white/5 text-zinc-500 ring-white/10"
                }`}
              >
                {complete ? <Check size={14} strokeWidth={3} /> : <Icon size={13} />}
              </span>
              <span
                className={`text-xs font-medium ${
                  complete
                    ? "text-zinc-200"
                    : isCurrent
                      ? "text-amber-200"
                      : "text-zinc-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < SETUP_STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`mx-3 h-px flex-1 ${
                  complete ? "bg-emerald-400/50" : "bg-white/10"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function MatchSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((n) => (
        <div
          key={n}
          className="h-64 rounded-2xl border border-white/5 bg-white/5 motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function SectionHeading({ icon: Icon, title, count, tone = "text-white" }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {Icon && <Icon size={18} className={tone} />}
      <h2 className={`text-lg font-bold tracking-tight ${tone}`}>{title}</h2>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-zinc-300">
        {count}
      </span>
    </div>
  );
}

function MatchCard({ match, teamNames, onOpen, onScore }) {
  const done = setupProgress(match);
  const setupComplete = done === 3;
  const teamAId = idOf(match.teamAId);
  const teamBId = idOf(match.teamBId);
  const date = dateParts(match.matchDate);
  const live = isLive(match);
  const completed = normalizeMatchStatus(match) === "completed";
  const completedResultIsValid = completed && hasValidResult(match);
  const statusText = live
    ? "Live"
    : String(match.status || "scheduled").trim().replace(/[_-]/g, " ");

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border transition-colors ${
        live
          ? "border-red-400/40 hover:border-red-400/70"
          : "border-white/10 hover:border-emerald-400/30"
      }`}
      style={{ background: COLORS.card }}
    >
      {/* Top: title + status */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold tracking-tight text-white">
            {match.title || "Untitled match"}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Created {formatDate(match.createdAt)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusStyle(
            match
          )}`}
        >
          {live && (
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 motion-safe:animate-pulse" />
          )}
          {statusText}
        </span>
      </div>

      {/* Scoreboard-style fixture */}
      <div
        className="mx-5 mt-5 grid overflow-hidden rounded-xl border border-white/10 sm:mx-6"
        style={{ background: COLORS.page, gridTemplateColumns: "auto 1fr" }}
      >
        <div className="flex w-20 flex-col items-center justify-center border-r border-white/10 bg-white/5 px-3 py-4 text-center">
          {date ? (
            <>
              <span className="text-2xl font-black leading-none text-white">
                {date.day}
              </span>
              <span className="mt-1 text-xs font-semibold text-emerald-300">
                {date.month}
              </span>
              <span className="text-xs text-zinc-500">{date.year}</span>
            </>
          ) : (
            <>
              <CalendarDays size={20} className="text-zinc-600" />
              <span className="mt-1.5 text-xs leading-tight text-zinc-500">
                Date not set
              </span>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center divide-y divide-white/10">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-xs font-bold text-emerald-300">
              A
            </span>
            <p className="truncate text-sm font-semibold text-zinc-100">
              {teamNames[teamAId] || "Team A"}
            </p>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-400/10 text-xs font-bold text-sky-300">
              B
            </span>
            <p className="truncate text-sm font-semibold text-zinc-100">
              {teamNames[teamBId] || "Team B"}
            </p>
          </div>
        </div>
      </div>

      {/* Match details */}
      <dl className="mx-5 mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400 sm:mx-6">
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Format</dt>
          <Swords size={14} className="text-zinc-500" />
          <dd>{match.format || "T20"}</dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Overs</dt>
          <Clock3 size={14} className="text-zinc-500" />
          <dd>{match.overs} overs</dd>
        </div>
        {match.venue && (
          <div className="inline-flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Venue</dt>
            <MapPin size={14} className="shrink-0 text-zinc-500" />
            <dd className="truncate">{match.venue}</dd>
          </div>
        )}
      </dl>

      {/* Action area */}
      {live ? (
        <div className="mt-auto flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2 text-sm font-medium text-red-300">
            <Radio size={16} />
            Scoring in progress
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpen}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/40 hover:text-emerald-300 ${focusRing}`}
            >
              View setup
            </button>
            <button
              type="button"
              onClick={onScore}
              className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 ${focusRing}`}
            >
              Continue scoring
            </button>
          </div>
        </div>
      ) : completed ? (
        <div className="mt-auto flex justify-end border-t border-white/10 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onScore}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${focusRing} ${
              completedResultIsValid
                ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                : "border border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15"
            }`}
          >
            {completedResultIsValid ? "View Match Summary" : "Result Pending"}
          </button>
          {!completedResultIsValid && (
            <p className="sr-only">
              The match is completed, but its persisted result is not available yet.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-4 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="sm:w-3/5">
            <SetupTracker done={done} />
          </div>
          <button
            type="button"
            onClick={onOpen}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${focusRing} ${
              setupComplete
                ? "border border-white/10 text-zinc-200 hover:border-emerald-400/40 hover:text-emerald-300"
                : "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
            }`}
          >
            {setupComplete ? "View setup" : "Continue setup"}
          </button>
        </div>
      )}
    </article>
  );
}

/* ---------- page ---------- */

export default function Matches() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [teamNames, setTeamNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [firstMatchPage, teamResult] = await Promise.all([
        apiRequest(`${MATCH_API_URL}?page=1&limit=100`),
        apiRequest(`${TEAM_API_URL}?includeInactive=true&limit=100`),
      ]);
      const firstPageMatches = Array.isArray(firstMatchPage.data)
        ? firstMatchPage.data
        : [];
      const totalPages = Math.max(
        1,
        Number.parseInt(firstMatchPage.pagination?.totalPages, 10) || 1
      );
      const remainingPages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiRequest(`${MATCH_API_URL}?page=${index + 2}&limit=100`)
        )
      );
      const loadedMatches = [
        ...firstPageMatches,
        ...remainingPages.flatMap((page) =>
          Array.isArray(page.data) ? page.data : []
        ),
      ];
      const loadedTeams = Array.isArray(teamResult.data) ? teamResult.data : [];

      setMatches(loadedMatches);
      setTeamNames(
        Object.fromEntries(
          loadedTeams.map((team) => [idOf(team), team.name || team.shortName])
        )
      );
    } catch (loadError) {
      setError(loadError.message || "Unable to load matches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadMatches);
  }, [loadMatches]);

  const counts = useMemo(() => {
    const live = matches.filter(isLive).length;
    return {
      all: matches.length,
      live,
      upcoming: matches.filter(isUpcoming).length,
      completed: matches.filter(isCompleted).length,
    };
  }, [matches]);

  const liveMatches = useMemo(() => matches.filter(isLive), [matches]);
  const otherMatches = useMemo(
    () => matches.filter((match) => !isLive(match)),
    [matches]
  );
  const visibleMatches = useMemo(() => {
    if (filter === "live") return liveMatches;
    if (filter === "upcoming") return matches.filter(isUpcoming);
    if (filter === "completed") return matches.filter(isCompleted);
    return otherMatches;
  }, [filter, liveMatches, matches, otherMatches]);

  const showLiveSection = filter === "all" && liveMatches.length > 0;

  function renderCard(match) {
    return (
      <MatchCard
        key={idOf(match)}
        match={match}
        teamNames={teamNames}
        onOpen={() => navigate(`/match-setup/${idOf(match)}/players`)}
        onScore={() => navigate(`/matches/${idOf(match)}/scoring`)}
      />
    );
  }

  return (
    <main className="min-h-screen text-white" style={{ background: COLORS.page }}>
      {/* Header with mown-pitch stripes */}
      <div
        className="border-b border-white/10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(16,185,129,0.045) 0, rgba(16,185,129,0.045) 56px, transparent 56px, transparent 112px)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-8">
          <Link
            to="/home"
            className={`inline-flex items-center gap-2 rounded-md text-sm text-zinc-400 transition hover:text-emerald-300 ${focusRing}`}
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Your matches
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Jump back into running matches, or finish squads and the toss
                before scoring begins.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/match-setup")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 ${focusRing}`}
            >
              <Plus size={17} strokeWidth={2.5} />
              Create match
            </button>
          </div>

          {/* Summary strip */}
          {!loading && matches.length > 0 && (
            <dl
              className="mt-8 grid max-w-2xl grid-cols-4 divide-x divide-white/10 rounded-xl border border-white/10"
              style={{ background: "rgba(7, 19, 13, 0.7)" }}
            >
              {[
                { label: "All matches", value: counts.all, tone: "text-white" },
                { label: "Live", value: counts.live, tone: "text-red-300" },
                {
                  label: "Upcoming",
                  value: counts.upcoming,
                  tone: "text-emerald-300",
                },
                {
                  label: "Completed",
                  value: counts.completed,
                  tone: "text-zinc-300",
                },
              ].map((item) => (
                <div key={item.label} className="px-4 py-3 sm:px-5">
                  <dt className="text-xs text-zinc-500">{item.label}</dt>
                  <dd className={`mt-0.5 text-2xl font-black ${item.tone}`}>
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200"
          >
            <span className="flex items-center gap-2">
              <CircleAlert size={18} className="shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={loadMatches}
              className={`inline-flex items-center gap-2 rounded-md font-semibold hover:text-white ${focusRing}`}
            >
              <RefreshCw size={15} />
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <MatchSkeleton />
        ) : matches.length === 0 ? (
          !error && (
            <section className="mx-auto max-w-lg rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10">
                <Trophy size={26} className="text-emerald-300" />
              </div>
              <h2 className="mt-5 text-xl font-bold">No matches yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">
                Pick two teams, set the overs, and your match will show up here
                for squad and toss setup.
              </p>
              <button
                type="button"
                onClick={() => navigate("/match-setup")}
                className={`mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 ${focusRing}`}
              >
                <Plus size={16} strokeWidth={2.5} />
                Create your first match
              </button>
            </section>
          )
        ) : (
          <>
            {/* Filters */}
            <div
              role="group"
              aria-label="Filter matches"
              className="mb-6 flex flex-wrap gap-2"
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.key)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${focusRing} ${
                      active
                        ? "bg-white text-zinc-900"
                        : "border border-white/10 text-zinc-300 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {item.key === "live" && (
                      <span
                        className={`h-2 w-2 rounded-full ${
                          counts.live > 0
                            ? "bg-red-500 motion-safe:animate-pulse"
                            : "bg-zinc-500"
                        }`}
                      />
                    )}
                    {item.label}
                    <span
                      className={`rounded-full px-1.5 text-xs font-semibold ${
                        active ? "bg-zinc-900/10" : "bg-white/10 text-zinc-400"
                      }`}
                    >
                      {counts[item.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Running matches (all view) */}
            {showLiveSection && (
              <section className="mb-10">
                <SectionHeading
                  icon={Radio}
                  title="Running matches"
                  count={liveMatches.length}
                  tone="text-red-300"
                />
                <div className="grid gap-5 lg:grid-cols-2">
                  {liveMatches.map(renderCard)}
                </div>
              </section>
            )}

            {visibleMatches.length === 0 ? (
              !showLiveSection && (
                <p className="rounded-xl border border-white/10 px-5 py-10 text-center text-sm text-zinc-400">
                  {filter === "live"
                    ? "No matches are being scored right now."
                    : filter === "upcoming"
                      ? "No upcoming matches."
                      : filter === "completed"
                        ? "No completed matches yet."
                        : "No matches in this view. Switch filters to see the rest."}
                </p>
              )
            ) : (
              <section>
                {showLiveSection && (
                  <SectionHeading
                    title="Other matches"
                    count={visibleMatches.length}
                  />
                )}
                <div className="grid gap-5 lg:grid-cols-2">
                  {visibleMatches.map(renderCard)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
