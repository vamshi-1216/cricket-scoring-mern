import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CircleAlert, Plus, RefreshCw, Trophy } from "lucide-react";

const MATCH_API_URL =
  import.meta.env.VITE_MATCH_API_URL || "http://localhost:4003/api/v1/matches";
const TEAM_API_URL =
  import.meta.env.VITE_TEAM_API_URL || "http://localhost:4004/api/v1/teams";

const SCORING_API_URL =
  import.meta.env.VITE_SCORING_API_URL || "http://localhost:4005";

/* ---------- data helpers ---------- */

async function apiRequest(url, { signal } = {}) {
  let response;

  try {
    response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal,
    });
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
  return String(value?._id ?? value?.id ?? value ?? "");
}

function normalizedId(value) {
  return idOf(value).trim().toLowerCase();
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

function isCancelled(match) {
  return normalizeMatchStatus(match) === "cancelled";
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
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

const MATCH_TABS = [
  { key: "live", label: "Live", includes: isLive },
  { key: "recent", label: "Recent", includes: (match) => isCompleted(match) || isCancelled(match) },
  { key: "upcoming", label: "Upcoming", includes: isUpcoming },
];

const MATCH_FORMATS = ["TEST", "ODI", "T20", "T10", "CUSTOM"];
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07130d]";
const matchAction = `rounded px-1 py-1 text-sm font-semibold text-emerald-300 hover:text-white ${focusRing}`;

function MatchSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading matches…</span>
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-36 rounded-xl border border-white/10 bg-white/5 motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function matchStatusText(match, teamNames) {
  if (isLive(match)) return "Scoring in progress";
  if (isCancelled(match)) return "Match cancelled";
  if (isUpcoming(match)) return setupLabel(match);
  if (!hasValidResult(match)) return "Awaiting official result";
  if (match.result.outcome === "TIE") return "Match tied";
  if (match.result.outcome === "NO_RESULT") return "No result";
  const { winnerTeamId, margin } = match.result;
  const winner = teamNames[idOf(winnerTeamId)] ||
    (idOf(winnerTeamId) === idOf(match.teamAId) ? "Team A" : "Team B");
  const unit = margin.type === "RUNS" ? "run" : "wicket";
  return `${winner} won by ${margin.value} ${unit}${margin.value === 1 ? "" : "s"}`;
}

function MatchCard({ match, scores, teamNames, scoringAccess, scoringAccessError, currentUserId }) {
  const matchId = idOf(match);
  const scoringPath = `/matches/${matchId}/scoring`;
  const live = isLive(match);
  const upcoming = isUpcoming(match);
  const isMatchOwner = currentUserId && normalizedId(scoringAccess?.ownerId) === currentUserId;
  const canContinueScoring =
    live && currentUserId &&
    normalizedId(scoringAccess?.activeScorerId) === currentUserId &&
    scoringAccess.permitGate === "OPEN" &&
    !scoringAccess.pendingCancellation;
  const details = [
    match.format === "TEST" ? "Test" : match.format,
    match.venue,
    formatDate(match.matchDate),
    match.format !== "TEST" && match.overs ? `${match.overs} overs` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className="overflow-hidden rounded-xl border border-emerald-200/10 bg-[#0c1b13]">
      <h3 className="border-b border-emerald-200/10 bg-emerald-300/10 px-4 py-2.5 text-sm font-bold text-emerald-50">
        {match.title || "Untitled match"}
      </h3>
      <div className="px-4 pb-3 pt-2.5">
        {details && <p className="mb-2 text-xs text-zinc-400">{details}</p>}
        <dl className="max-w-lg space-y-1.5">
          {[
            [idOf(match.teamAId), "Team A"],
            [idOf(match.teamBId), "Team B"],
          ].map(([teamId, fallback]) => {
            const innings = scores.filter((score) => idOf(score.battingTeamId) === teamId);
            return (
              <div key={fallback} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                <dt className="text-sm font-semibold text-zinc-100">{teamNames[teamId] || fallback}</dt>
                <dd className="text-right text-sm font-bold tabular-nums">
                  {innings.length ? innings.map((score) =>
                    `${score.runs}/${score.wickets}${live ? ` (${score.overs} ov)` : ""}`
                  ).join(" & ") : <span className="text-zinc-600">—</span>}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className={`mt-2.5 text-sm ${live ? "text-rose-300" : "text-emerald-200"}`}>
          {matchStatusText(match, teamNames)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {upcoming && currentUserId ? (
            <Link className={matchAction} to={`/match-setup/${matchId}/players`}>
              {setupLabel(match) === "Ready to play" ? "View setup" : "Continue setup"}
            </Link>
          ) : (
            <Link className={matchAction} to={scoringPath}>
              {canContinueScoring ? "Continue scoring" : live ? "Live score" : "Scorecard"}
            </Link>
          )}
          {live && isMatchOwner && !canContinueScoring && (
            <Link className={matchAction} to={`${scoringPath}#scoring-access`}>Manage match</Link>
          )}
          {isCompleted(match) && hasValidResult(match) && (
            <Link className={matchAction} to={`/stats/${matchId}`}>Match stats</Link>
          )}
        </div>
        {live && scoringAccessError && (
          <p role="status" className="mt-2 text-xs text-amber-200">
            Unable to verify scoring access. The live score is still available.
          </p>
        )}
      </div>
    </article>
  );
}

/* ---------- page ---------- */

export default function Matches({ user }) {
  const navigate = useNavigate();
  const currentUserId = normalizedId(user?.id);
  const [matches, setMatches] = useState([]);
  const [resultNotifications, setResultNotifications] = useState([]);
  const [scoringAccessByMatch, setScoringAccessByMatch] = useState({});
  const [scoringAccessUserId, setScoringAccessUserId] = useState("");
  const [teamNames, setTeamNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("live");
  const [format, setFormat] = useState("");
  const [scoresByMatch, setScoresByMatch] = useState({});
  const requestId = useRef(0);

  const loadMatches = useCallback(async ({ silent = false } = {}) => {
    const currentRequestId = ++requestId.current;
    if (!silent) setLoading(true);
    setError("");
    setScoringAccessByMatch({});
    setScoringAccessUserId("");

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
      const accessEntries = currentUserId
        ? await Promise.all(
            loadedMatches.filter(isLive).map(async (match) => {
              const matchId = idOf(match);
              try {
                const result = await apiRequest(
                  `${MATCH_API_URL}/${matchId}/scoring-access`
                );
                const access = result.data;
                if (
                  result.success !== true ||
                  !access ||
                  !normalizedId(access.ownerId) ||
                  !normalizedId(access.activeScorerId) ||
                  !Number.isInteger(access.version) ||
                  typeof access.matchStatus !== "string"
                ) {
                  return [
                    matchId,
                    {
                      access: null,
                      error: "Unable to verify scoring access.",
                    },
                  ];
                }
                return [matchId, { access, error: "" }];
              } catch {
                return [
                  matchId,
                  {
                    access: null,
                    error: "Unable to verify scoring access.",
                  },
                ];
              }
            })
          )
        : [];

      if (currentRequestId !== requestId.current) return;

      const accessByMatch = Object.fromEntries(accessEntries);
      const matchesWithFreshStatus = loadedMatches.map((match) => {
        const status = accessByMatch[idOf(match)]?.access?.matchStatus;
        return status ? { ...match, status } : match;
      });

      setMatches(matchesWithFreshStatus);
      setScoringAccessByMatch(accessByMatch);
      setScoringAccessUserId(currentUserId);
      setTeamNames(
        Object.fromEntries(
          loadedTeams.map((team) => [idOf(team), team.name || team.shortName])
        )
      );
    } catch (loadError) {
      if (currentRequestId === requestId.current) {
        setError(loadError.message || "Unable to load matches.");
      }
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    let notificationRequest;
    const refreshNotifications = async () => {
      notificationRequest?.abort();
      const request = new AbortController();
      notificationRequest = request;
      try {
        const result = await apiRequest(`${MATCH_API_URL}/notifications`, {
          signal: request.signal,
        });
        if (!request.signal.aborted && Array.isArray(result.data)) {
          setResultNotifications(result.data);
        }
      } catch {
        // Keep the last available feed if a refresh fails.
      }
    };
    const initialLoadTimer = window.setTimeout(() => {
      void loadMatches();
      void refreshNotifications();
    }, 0);
    const refreshMatches = () => {
      if (document.hidden) return;
      void loadMatches({ silent: true });
      void refreshNotifications();
    };
    const intervalId = window.setInterval(refreshMatches, 30_000);
    window.addEventListener("focus", refreshMatches);
    window.addEventListener("matches-refresh", refreshMatches);
    return () => {
      notificationRequest?.abort();
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshMatches);
      window.removeEventListener("matches-refresh", refreshMatches);
      requestId.current += 1;
    };
  }, [loadMatches]);

  const tabMatches = useMemo(() => {
    const activeTab = MATCH_TABS.find(({ key }) => key === tab);
    const subset = matches.filter(activeTab.includes);
    if (tab === "recent") {
      const lastPlayed = (match) => Date.parse(
        match.result?.finalizedAt || match.cancellation?.cancelledAt || match.updatedAt
      ) || 0;
      subset.sort((a, b) => lastPlayed(b) - lastPlayed(a));
    }
    if (tab === "upcoming") {
      const startTime = (match) => Date.parse(match.matchDate) || Number.MAX_SAFE_INTEGER;
      subset.sort((a, b) => startTime(a) - startTime(b));
    }
    return subset;
  }, [matches, tab]);

  const formats = MATCH_FORMATS.filter((item) => tabMatches.some((match) => match.format === item));
  const visibleMatches = useMemo(() => (
    format ? tabMatches.filter((match) => match.format === format) : tabMatches
  ), [format, tabMatches]);

  useEffect(() => {
    if (visibleMatches.length === 0 || tab === "upcoming") return;
    const controller = new AbortController();

    async function loadScores() {
      const requestedIds = visibleMatches.map(idOf).filter(Boolean);
      for (let index = 0; index < requestedIds.length; index += 50) {
        if (controller.signal.aborted) return;
        const ids = requestedIds.slice(index, index + 50);
        try {
          const query = new URLSearchParams({ ids: ids.join(",") });
          const result = await apiRequest(`${SCORING_API_URL}/api/v1/matches/score-summaries?${query}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted || !Array.isArray(result.data)) return;
          const updatedScores = Object.fromEntries(ids.map((id) => [id, []]));
          for (const score of result.data) {
            updatedScores[idOf(score.matchId)]?.push(score);
          }
          setScoresByMatch((previous) => ({ ...previous, ...updatedScores }));
        } catch {
          // Keep match details and the last available scores when scoring is offline.
        }
      }
    }

    void loadScores();
    return () => controller.abort();
  }, [tab, visibleMatches]);

  function renderCard(match) {
    const matchId = idOf(match);
    const entry = scoringAccessUserId === currentUserId
      ? scoringAccessByMatch[matchId]
      : null;

    return (
      <MatchCard
        key={matchId}
        match={match}
        scores={scoresByMatch[matchId] ?? []}
        teamNames={teamNames}
        scoringAccess={entry?.access}
        scoringAccessError={entry?.error}
        currentUserId={currentUserId}
      />
    );
  }

  return (
    <main className="min-h-screen text-white" style={{ background: "#07130d" }}>
      {/* Header with mown-pitch stripes */}
      <div
        className="border-b border-white/10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(16,185,129,0.045) 0, rgba(16,185,129,0.045) 56px, transparent 56px, transparent 112px)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 pb-6 pt-6 sm:px-6 sm:pt-8">
          <Link
            to={currentUserId ? "/home" : "/login"}
            className={`inline-flex items-center gap-2 rounded-md text-sm text-zinc-400 transition hover:text-emerald-300 ${focusRing}`}
          >
            <ArrowLeft size={16} />
            {currentUserId ? "Back to home" : "Sign in"}
          </Link>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                {currentUserId ? "Your matches" : "Matches"}
              </h1>
              <Link to="/stats" className={`mt-3 inline-block rounded-md text-sm font-semibold text-emerald-300 hover:text-emerald-200 ${focusRing}`}>
                Match stats
              </Link>
            </div>
            {currentUserId && (
              <button
                type="button"
                onClick={() => navigate("/match-setup")}
                className={`inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 ${focusRing}`}
              >
                <Plus size={17} strokeWidth={2.5} />
                Create match
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {resultNotifications.length > 0 && (
          <section className="mb-6 rounded-xl border border-white/10 p-4">
            <h2 className="font-bold text-white">Recent results</h2>
            <ul className="mt-2 divide-y divide-white/10" aria-live="polite">
              {resultNotifications.map((notification) => {
                const winnerName = teamNames[notification.winnerTeamId];
                const outcomeLabel = {
                  WIN: winnerName ? `${winnerName} won` : "Winner decided",
                  TIE: "Match tied",
                  NO_RESULT: "No result",
                }[notification.outcome];

                return (
                  <li key={notification.matchId} className="py-2 text-sm text-zinc-300">
                    <Link
                      to={`/stats/${notification.matchId}`}
                      className={`rounded-sm font-semibold text-emerald-300 hover:text-emerald-200 ${focusRing}`}
                    >
                      {notification.title}
                    </Link>
                    <span className="ml-2">{outcomeLabel}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
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
              {currentUserId && (
                <button
                  type="button"
                  onClick={() => navigate("/match-setup")}
                  className={`mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 ${focusRing}`}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Create your first match
                </button>
              )}
            </section>
          )
        ) : (
          <>
            <div role="group" aria-label="Match status" className="mb-3 flex gap-5 border-b border-white/10">
              {MATCH_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => {
                    setTab(key);
                    setFormat("");
                  }}
                  className={`border-b-2 px-1 pb-2.5 text-sm font-semibold ${focusRing} ${
                    tab === key
                      ? "border-emerald-300 text-emerald-200"
                      : "border-transparent text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {formats.length > 0 && (
              <div role="group" aria-label="Match format" className="mb-4 flex flex-wrap gap-2">
                {["", ...formats].map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={item === format}
                    onClick={() => setFormat(item)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${focusRing} ${
                      item === format
                        ? "bg-emerald-300 text-emerald-950"
                        : "bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
                    }`}
                  >
                    {{ "": "All formats", TEST: "Test", CUSTOM: "Custom" }[item] || item}
                  </button>
                ))}
              </div>
            )}
            {visibleMatches.length ? (
              <div className="space-y-3">{visibleMatches.map(renderCard)}</div>
            ) : (
              <p className="rounded-xl border border-white/10 px-5 py-8 text-sm text-zinc-400">
                {format ? "No matches in this format." : {
                  live: "No matches are being scored right now.",
                  recent: "No recent results yet.",
                  upcoming: "No upcoming matches.",
                }[tab]}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
