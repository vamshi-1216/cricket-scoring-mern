import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleAlert, Keyboard, LoaderCircle, Trophy } from "lucide-react";

const SCORING_API_URL =
  import.meta.env.VITE_SCORING_API_URL || "http://localhost:4005";
const MATCH_API_URL =
  import.meta.env.VITE_MATCH_API_URL || "http://localhost:4003/api/v1/matches";
const AUTH_API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4001/api/v1/auth";
const TEAM_API_URL =
  import.meta.env.VITE_TEAM_API_URL || "http://localhost:4004/api/v1/teams";
const PLAYER_API_URL =
  import.meta.env.VITE_PLAYER_API_URL || "http://localhost:4002/api/v1/players";

// ---------------------------------------------------------------------------
// Design tokens.
// Custom colours are applied with inline styles so they show up even if your
// Tailwind setup does not generate arbitrary-value classes like bg-[#04170f].
// ---------------------------------------------------------------------------
const C = {
  page: "#04170f",
  panel: "#0a2a20",
  inner: "#061c15",
  border: "rgba(110, 231, 183, 0.2)",
  innerBorder: "rgba(255, 255, 255, 0.12)",
  mint: "#00e0a6",
  mintLight: "#4df5c5",
  yellow: "#ffcc1f",
  dark: "#032017",
  striker: "#0c3a2c",
  wicketBg: "#3a0d12",
  wicketBorder: "rgba(239, 68, 68, 0.7)",
};

const panelStyle = { background: C.panel, borderColor: C.border };
const innerStyle = { background: C.inner, borderColor: C.innerBorder };

const panelClass = "rounded-2xl border";
const innerClass = "rounded-xl border";
const headerButtonClass =
  "flex items-center justify-center rounded-xl border text-white transition hover:brightness-125";
const selectClass =
  "w-full rounded-xl border px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-300";
const selectStyle = { background: C.inner, borderColor: C.innerBorder };
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonStyle = { background: C.mint, color: C.dark };
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonStyle = { borderColor: "rgba(255, 255, 255, 0.2)" };
const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";

const DISMISSALS = [
  { value: "BOWLED", label: "Bowled" },
  { value: "CAUGHT", label: "Caught" },
  { value: "LBW", label: "LBW" },
  { value: "RUN_OUT", label: "Run out" },
  { value: "STUMPED", label: "Stumped" },
  { value: "HIT_WICKET", label: "Hit wicket" },
  { value: "OBSTRUCTING_FIELD", label: "Obstructing the field" },
  { value: "HIT_BALL_TWICE", label: "Hit the ball twice" },
];

// Pick a modifier, then tap the runs.
const MODIFIERS = [
  { id: "WIDE", label: "Wide", key: "w", display: "W" },
  { id: "NO_BALL", label: "No-ball", key: "n", display: "n" },
  { id: "BYE", label: "Bye", key: "b", display: "b" },
  { id: "LEG_BYE", label: "Leg-bye", key: "l", display: "l" },
  { id: "PENALTY", label: "Penalty", key: "p", display: "p" },
  { id: "WICKET", label: "Wicket", key: "k", display: "k" },
];

const MODE_RUNS = {
  NORMAL: [0, 1, 2, 3, 4, 6],
  WIDE: [0, 1, 2, 3, 4],
  NO_BALL: [0, 1, 2, 3, 4, 6],
  BYE: [1, 2, 3, 4],
  LEG_BYE: [1, 2, 3, 4],
  PENALTY: [1, 2, 3, 4, 5],
};

const MODE_HELP = {
  WIDE: "Wide ball. Tap the extra runs run on top of the wide (0 = just the wide).",
  NO_BALL: "No-ball. Pick where the runs came from, then tap the runs.",
  BYE: "Byes. Tap the runs completed.",
  LEG_BYE: "Leg-byes. Tap the runs completed.",
  PENALTY: "Penalty runs. Tap the runs awarded.",
  WICKET: "Choose the dismissal, then confirm the wicket.",
};

const DEFAULT_HINT =
  "Number keys score runs. w / n / b / l / p / k pick a modifier. Esc clears it.";

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
      "Unable to connect to a required service. Check that the backend is running."
    );
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || `Request failed with status ${response.status}.`
    );
    error.status = response.status;
    error.code = result.code;
    throw error;
  }

  return result;
}

function createDeliveryIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure request IDs are unavailable in this browser.");
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function idOf(value) {
  return String(value?._id ?? value?.id ?? value ?? "");
}

function getPlayerName(player) {
  return player?.name || player?.fullName || player?.playerName || "Unnamed player";
}

function readPlayers(result) {
  const players = result?.data?.players ?? result?.players ?? result?.data;
  return Array.isArray(players) ? players : [];
}

function formatOvers(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function playerFigure(figures, playerId) {
  return figures?.find((figure) => idOf(figure.playerId) === idOf(playerId));
}

function hasValidMatchResult(match) {
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

function getAwardPlayer(playersById, playerId) {
  const key = idOf(playerId).toLowerCase();
  return (
    playersById[key] ||
    Object.values(playersById).find(
      (player) => idOf(player).toLowerCase() === key
    )
  );
}

function formatAwardPoints(value) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function AwardCard({ title, winners, breakdownLabels, playersById, teamById }) {
  return (
    <article className={`${innerClass} min-w-0 p-4`} style={innerStyle}>
      <h3 className="font-bold text-emerald-200">{title}</h3>
      {winners.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No eligible winner</p>
      ) : (
        <div className="mt-3 space-y-3">
          {winners.map((winner, index) => {
            const player = getAwardPlayer(playersById, winner.playerId);
            const team = teamById[idOf(winner.teamId).toLowerCase()];
            return (
              <div
                key={`${idOf(winner.playerId)}-${index}`}
                className="rounded-lg border border-white/10 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {player ? getPlayerName(player) : "Player unavailable"}
                    </p>
                    <p className="truncate text-sm text-zinc-400">
                      {team?.name || "Team unavailable"}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-black">
                    {formatAwardPoints(winner.points)} pts
                  </p>
                </div>
                <details className="mt-2 text-sm text-zinc-300">
                  <summary className="cursor-pointer text-emerald-200">
                    Points breakdown
                  </summary>
                  <dl className="mt-2 space-y-1">
                    {breakdownLabels.map(([field, label]) => (
                      <div key={field} className="flex justify-between gap-3">
                        <dt>{label}</dt>
                        <dd className="font-medium">
                          {formatAwardPoints(winner.breakdown[field])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function MatchAwards({ result, playersById, teamById }) {
  if (result?.outcome === "NO_RESULT") {
    return (
      <section className={`${panelClass} p-5 sm:p-6`} style={panelStyle}>
        <h2 className="text-lg font-bold">Match Awards</h2>
        <p className="mt-3 text-sm text-zinc-400">No awards for this match.</p>
      </section>
    );
  }

  const awards = result?.awards;
  const categories = [
    {
      key: "manOfTheMatch",
      title: "Man of the Match",
      breakdownLabels: [
        ["battingPoints", "Batting points"],
        ["bowlingPoints", "Bowling points"],
        ["fieldingPoints", "Fielding points"],
      ],
    },
    {
      key: "bestBatsman",
      title: "Best Batsman",
      breakdownLabels: [
        ["runs", "Runs"],
        ["boundaryBonus", "Boundary bonus"],
        ["milestoneBonus", "Milestone bonus"],
        ["strikeRateBonus", "Strike-rate bonus"],
        ["notOutBonus", "Not-out bonus"],
      ],
    },
    {
      key: "bestBowler",
      title: "Best Bowler",
      breakdownLabels: [
        ["wickets", "Wickets"],
        ["dotBalls", "Dot balls"],
        ["maidenOvers", "Maiden overs"],
        ["economyBonus", "Economy bonus"],
        ["extrasPenalty", "Extras penalty"],
      ],
    },
  ];
  const awardsAvailable =
    Number.isInteger(awards?.scoringVersion) &&
    categories.every(
      (category) =>
        Array.isArray(awards[category.key]) &&
        awards[category.key].every(
          (winner) =>
            winner &&
            typeof winner.playerId === "string" &&
            typeof winner.teamId === "string" &&
            Number.isFinite(winner.points) &&
            winner.breakdown &&
            category.breakdownLabels.every(([field]) =>
              Number.isFinite(winner.breakdown[field])
            )
        )
    );

  return (
    <section className={`${panelClass} p-5 sm:p-6`} style={panelStyle}>
      <h2 className="text-lg font-bold">Match Awards</h2>
      {!awardsAvailable ? (
        <p className="mt-3 text-sm text-zinc-400">
          Award data is unavailable for this match.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {categories.map((category) => (
            <AwardCard
              key={category.key}
              title={category.title}
              winners={awards[category.key]}
              breakdownLabels={category.breakdownLabels}
              playersById={playersById}
              teamById={teamById}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function formatMatchDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

// Turns a modifier + runs tap into the payload the Scoring Service expects.
function buildDelivery(mode, runs, noBallSource) {
  switch (mode) {
    case "WIDE":
      return { eventType: "WIDE", batRuns: 0, extras: { wides: runs + 1 } };
    case "NO_BALL":
      if (noBallSource === "BYE" && runs > 0) {
        return { eventType: "NO_BALL", batRuns: 0, extras: { noBalls: 1, byes: runs } };
      }
      if (noBallSource === "LEG_BYE" && runs > 0) {
        return { eventType: "NO_BALL", batRuns: 0, extras: { noBalls: 1, legByes: runs } };
      }
      return { eventType: "NO_BALL", batRuns: runs, extras: { noBalls: 1 } };
    case "BYE":
      return { eventType: "BYE", batRuns: 0, extras: { byes: runs } };
    case "LEG_BYE":
      return { eventType: "LEG_BYE", batRuns: 0, extras: { legByes: runs } };
    case "PENALTY":
      return { eventType: "PENALTY", batRuns: 0, extras: { penaltyRuns: runs } };
    default:
      return { eventType: "NORMAL", batRuns: runs, extras: {} };
  }
}

function runCaption(mode, runs, noBallSource) {
  if (mode === "NORMAL") {
    return { 0: "dot", 1: "run", 4: "four", 6: "six" }[runs] || "runs";
  }
  if (mode === "WIDE") return `${runs + 1} wd`;
  if (mode === "NO_BALL") {
    if (noBallSource === "BYE") return `nb + ${runs} b`;
    if (noBallSource === "LEG_BYE") return `nb + ${runs} lb`;
    return `nb + ${runs}`;
  }
  if (mode === "BYE") return runs === 1 ? "bye" : "byes";
  if (mode === "LEG_BYE") return runs === 1 ? "leg-bye" : "leg-byes";
  return "penalty";
}

function deliveryOutcome(delivery) {
  if (delivery.dismissalType) return "W";
  switch (delivery.eventType) {
    case "NORMAL":
      return String(delivery.batRuns);
    case "WIDE":
      return `${delivery.totalRuns}wd`;
    case "NO_BALL":
      return `${delivery.totalRuns}nb`;
    case "BYE":
      return `${delivery.totalRuns}b`;
    case "LEG_BYE":
      return `${delivery.totalRuns}lb`;
    default:
      return `${delivery.totalRuns}p`;
  }
}

function runButtonStyle(mode, runs) {
  if (mode !== "NORMAL") {
    return {
      background: "rgba(252, 211, 77, 0.12)",
      borderColor: "rgba(252, 211, 77, 0.35)",
      color: "#fef3c7",
    };
  }
  if (runs === 6) {
    return { background: C.yellow, borderColor: "transparent", color: "#2b1d00" };
  }
  if (runs === 1) {
    return { background: C.mintLight, borderColor: "transparent", color: C.dark };
  }
  if (runs === 2 || runs === 3) {
    return { background: C.mint, borderColor: "transparent", color: C.dark };
  }
  // 0 and 4
  return { background: C.page, borderColor: "rgba(255, 255, 255, 0.85)", color: "#ffffff" };
}

function modifierStyle(active, isWicket) {
  if (active) {
    return isWicket
      ? { background: "#f87171", borderColor: "#fca5a5", color: "#450a0a" }
      : { background: "#fcd34d", borderColor: "#fde68a", color: "#451a03" };
  }
  return isWicket
    ? { background: C.wicketBg, borderColor: C.wicketBorder, color: "#ffffff" }
    : { background: C.panel, borderColor: C.border, color: "#ffffff" };
}

function BatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.5 3.5l6 6-9.2 9.2a2 2 0 01-2.8 0l-3.2-3.2a2 2 0 010-2.8L14.5 3.5z"
        fill="#10d9a0"
      />
      <path d="M6 15.5L3 21l5.5-3" stroke="#10d9a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BallIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="#ef4444" />
      <path d="M6 5.5c3 2.5 3 10.5 0 13M18 5.5c-3 2.5-3 10.5 0 13" stroke="#fecaca" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ScoreSetupForm({
  innings,
  battingPlayers,
  bowlingPlayers,
  selection,
  setSelection,
  saving,
  onSubmit,
  replacement,
}) {
  const outIds = (innings.battingFigures || [])
    .filter((figure) => figure.isOut)
    .map((figure) => idOf(figure.playerId));
  const strikerOptions = battingPlayers.filter(
    (player) =>
      !outIds.includes(idOf(player)) &&
      (idOf(player) === selection.strikerId ||
        idOf(player) !== selection.nonStrikerId)
  );
  const nonStrikerOptions = battingPlayers.filter(
    (player) =>
      !outIds.includes(idOf(player)) &&
      (idOf(player) === selection.nonStrikerId ||
        idOf(player) !== selection.strikerId)
  );
  const bowlerOptions = bowlingPlayers.filter(
    (player) =>
      !(
        innings.previousOverBowlerId &&
        idOf(player) === idOf(innings.previousOverBowlerId)
      ) || idOf(player) === selection.bowlerId
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-zinc-300">
          {replacement && !innings.strikerId ? "Incoming batter (striker)" : "Striker"}
          <select
            className={selectClass}
            style={selectStyle}
            value={selection.strikerId}
            onChange={(event) =>
              setSelection((current) => ({ ...current, strikerId: event.target.value }))
            }
            required
          >
            <option value="">Select striker</option>
            {strikerOptions.map((player) => (
              <option key={idOf(player)} value={idOf(player)}>
                {getPlayerName(player)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-300">
          {replacement && !innings.nonStrikerId
            ? "Incoming batter (non-striker)"
            : "Non-striker"}
          <select
            className={selectClass}
            style={selectStyle}
            value={selection.nonStrikerId}
            onChange={(event) =>
              setSelection((current) => ({
                ...current,
                nonStrikerId: event.target.value,
              }))
            }
            required
          >
            <option value="">Select non-striker</option>
            {nonStrikerOptions.map((player) => (
              <option key={idOf(player)} value={idOf(player)}>
                {getPlayerName(player)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-zinc-300">
          {innings.currentBowlerId ? "Current bowler" : "Opening / next-over bowler"}
          <select
            className={selectClass}
            style={selectStyle}
            value={selection.bowlerId}
            onChange={(event) =>
              setSelection((current) => ({ ...current, bowlerId: event.target.value }))
            }
            required
          >
            <option value="">Select bowler</option>
            {bowlerOptions.map((player) => (
              <option key={idOf(player)} value={idOf(player)}>
                {getPlayerName(player)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="submit"
        className={primaryButtonClass}
        style={primaryButtonStyle}
        disabled={saving}
      >
        {saving && <LoaderCircle size={16} className="animate-spin" />}
        {replacement
          ? "Confirm players and resume"
          : innings.currentBowlerId
            ? "Confirm players"
            : innings.legalBalls > 0
              ? "Set next bowler"
              : "Start innings"}
      </button>
    </form>
  );
}

function Chip({ active, children, className = "", style, ...props }) {
  const base = active
    ? { background: C.mint, borderColor: C.mint, color: C.dark }
    : { background: C.inner, borderColor: C.innerBorder };
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${focusRing} disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "" : "text-zinc-300 hover:text-white"
      } ${className}`}
      style={{ ...base, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

function WicketPanel({
  innings,
  batters,
  fielders,
  fieldingDataWarning,
  onCancel,
  onSubmit,
  disabled,
}) {
  const [deliveryType, setDeliveryType] = useState("NORMAL");
  const [dismissalType, setDismissalType] = useState("BOWLED");
  const [batRuns, setBatRuns] = useState(0);
  const [dismissedPlayerId, setDismissedPlayerId] = useState(
    innings.strikerId ? idOf(innings.strikerId) : batters[0]?.id || ""
  );
  const [crossedBeforeWicket, setCrossedBeforeWicket] = useState(false);
  const [fielderIds, setFielderIds] = useState([""]);
  const [runOutType, setRunOutType] = useState("DIRECT_HIT");
  const needsFieldingAttribution = ["CAUGHT", "STUMPED", "RUN_OUT"].includes(
    dismissalType
  );
  const selectedFielderIds = fielderIds.filter(Boolean);
  const fieldingDetailsValid =
    !needsFieldingAttribution ||
    (selectedFielderIds.length >= 1 &&
      selectedFielderIds.length === fielderIds.length &&
      new Set(selectedFielderIds).size === selectedFielderIds.length &&
      (dismissalType !== "RUN_OUT" || Boolean(runOutType)));

  const eligibleDismissals =
    deliveryType === "WIDE"
      ? ["RUN_OUT", "STUMPED", "OBSTRUCTING_FIELD"]
      : deliveryType === "NO_BALL"
        ? ["RUN_OUT", "OBSTRUCTING_FIELD", "HIT_BALL_TWICE"]
        : DISMISSALS.map(({ value }) => value);
  const showRuns =
    deliveryType === "NO_BALL" ||
    (deliveryType === "NORMAL" && dismissalType === "RUN_OUT");

  function chooseDelivery(nextType) {
    setDeliveryType(nextType);
    setDismissalType(nextType === "NORMAL" ? "BOWLED" : "RUN_OUT");
    setBatRuns(0);
    setFielderIds([""]);
    setRunOutType("DIRECT_HIT");
    setCrossedBeforeWicket(false);
  }

  function chooseDismissal(nextType) {
    setDismissalType(nextType);
    setFielderIds([""]);
    setRunOutType("DIRECT_HIT");
    setCrossedBeforeWicket(false);
  }

  function submit(event) {
    event.preventDefault();
    if (!dismissedPlayerId || !fieldingDetailsValid) return;
    onSubmit({
      eventType: deliveryType,
      batRuns: showRuns ? batRuns : 0,
      extras:
        deliveryType === "NORMAL"
          ? {}
          : { [deliveryType === "WIDE" ? "wides" : "noBalls"]: 1 },
      wicket: {
        dismissalType,
        dismissedPlayerId,
        ...(dismissalType === "RUN_OUT" ? { crossedBeforeWicket } : {}),
        ...(needsFieldingAttribution
          ? {
              fieldingAttribution: {
                fielderIds: selectedFielderIds,
                ...(dismissalType === "RUN_OUT" ? { runOutType } : {}),
              },
            }
          : {}),
      },
    });
  }

  function updateFielder(index, playerId) {
    setFielderIds((current) =>
      current.map((fielderId, currentIndex) =>
        currentIndex === index ? playerId : fielderId
      )
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid h-full min-h-0 gap-4 overflow-y-auto rounded-xl border border-red-400/30 bg-red-950/30 p-3 md:grid-cols-2"
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-zinc-300">
            How was the ball bowled?
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["NORMAL", "Normal"],
              ["WIDE", "Wide"],
              ["NO_BALL", "No-ball"],
            ].map(([value, label]) => (
              <Chip
                key={value}
                active={deliveryType === value}
                onClick={() => chooseDelivery(value)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-zinc-300">Dismissal</legend>
          <div className="grid grid-cols-2 gap-2">
            {DISMISSALS.filter(({ value }) => eligibleDismissals.includes(value)).map(
              ({ value, label }) => (
                <Chip
                  key={value}
                  active={dismissalType === value}
                  onClick={() => chooseDismissal(value)}
                >
                  {label}
                </Chip>
              )
            )}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-zinc-300">Who is out?</legend>
          <div className="grid gap-2">
            {batters.map((batter) => (
              <Chip
                key={batter.id}
                active={dismissedPlayerId === batter.id}
                onClick={() => setDismissedPlayerId(batter.id)}
                className="text-left"
              >
                {batter.name}
                <span className="ml-2 text-xs font-normal opacity-70">{batter.role}</span>
              </Chip>
            ))}
          </div>
        </fieldset>

        {needsFieldingAttribution && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-zinc-300">
              {dismissalType === "RUN_OUT" ? "Fielders involved" : "Fielder"}
            </legend>
            {fieldingDataWarning && (
              <p className="text-sm text-amber-200">{fieldingDataWarning}</p>
            )}
            {fielders.length ? (
              fielderIds.map((fielderId, index) => {
                const otherFielderId = fielderIds.find(
                  (_, otherIndex) => otherIndex !== index
                );
                return (
                  <div key={index} className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`fielder-${index}`}>
                      {index === 0 ? "Fielder" : "Second fielder"}
                    </label>
                    <select
                      id={`fielder-${index}`}
                      className={selectClass}
                      style={selectStyle}
                      value={fielderId}
                      onChange={(event) => updateFielder(index, event.target.value)}
                      required
                    >
                      <option value="">Select a fielder</option>
                      {fielders.map((fielder) => {
                        const playerId = idOf(fielder);
                        return (
                          <option
                            key={playerId}
                            value={playerId}
                            disabled={playerId === otherFielderId}
                          >
                            {getPlayerName(fielder)}
                          </option>
                        );
                      })}
                    </select>
                    {dismissalType === "RUN_OUT" && index > 0 && (
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        style={secondaryButtonStyle}
                        onClick={() =>
                          setFielderIds((current) =>
                            current.filter((_, currentIndex) => currentIndex !== index)
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-amber-200">
                Fielding squad player details are unavailable. Reload the match data before recording this dismissal.
              </p>
            )}
            {dismissalType === "RUN_OUT" && fielderIds.length < 2 && fielders.length > 1 && (
              <button
                type="button"
                className={secondaryButtonClass}
                style={secondaryButtonStyle}
                onClick={() => setFielderIds((current) => [...current, ""])}
              >
                Add another fielder
              </button>
            )}
            {dismissalType === "RUN_OUT" && (
              <label className="block text-sm text-zinc-300">
                Run-out type
                <select
                  className={`${selectClass} mt-1`}
                  style={selectStyle}
                  value={runOutType}
                  onChange={(event) => setRunOutType(event.target.value)}
                >
                  <option value="DIRECT_HIT">Direct hit</option>
                  <option value="ASSISTED">Assisted</option>
                </select>
              </label>
            )}
          </fieldset>
        )}

        {showRuns && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-zinc-300">
              {deliveryType === "NO_BALL"
                ? "Runs off the bat"
                : "Runs completed before the run-out"}
            </legend>
            <div className="grid grid-cols-6 gap-2">
              {[0, 1, 2, 3, 4, 6].map((runs) => (
                <Chip key={runs} active={batRuns === runs} onClick={() => setBatRuns(runs)}>
                  {runs}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}

        {dismissalType === "RUN_OUT" && (
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={crossedBeforeWicket}
              onChange={(event) => setCrossedBeforeWicket(event.target.checked)}
              className="accent-emerald-400"
            />
            Batters crossed before the run-out
          </label>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-400 px-5 py-3 text-sm font-bold text-red-950 transition hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || !dismissedPlayerId || !fieldingDetailsValid}
          >
            Confirm wicket
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            style={secondaryButtonStyle}
            onClick={onCancel}
            disabled={disabled}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

export default function ScoringSetup({ user }) {
  const { matchId } = useParams();
  const pendingDeliveryRequestRef = useRef(null);

  function clearPendingDeliveryRequest(storageKey) {
    pendingDeliveryRequestRef.current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch (storageError) {
      console.error("Unable to clear the completed delivery request key:", storageError);
    }
  }
  const [innings, setInnings] = useState(null);
  const [allInnings, setAllInnings] = useState([]);
  const [match, setMatch] = useState(null);
  const [teams, setTeams] = useState([]);
  const [playersById, setPlayersById] = useState({});
  const [playerDataWarning, setPlayerDataWarning] = useState("");
  const [matchView, setMatchView] = useState("summary");
  const [selection, setSelection] = useState({
    strikerId: "",
    nonStrikerId: "",
    bowlerId: "",
  });
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingSecondInnings, setStartingSecondInnings] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("NORMAL");
  const [noBallSource, setNoBallSource] = useState("BAT");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [targetScorerId, setTargetScorerId] = useState("");
  const [targetScorerSearch, setTargetScorerSearch] = useState("");
  const [targetScorerOptions, setTargetScorerOptions] = useState([]);
  const [targetScorerSearchError, setTargetScorerSearchError] = useState("");
  const [changingAccess, setChangingAccess] = useState(false);
  const [permissionFresh, setPermissionFresh] = useState(false);
  const [permissionRefreshError, setPermissionRefreshError] = useState("");
  const keyHandlerRef = useRef(() => {});

  useEffect(() => {
    let cancelled = false;

    async function loadScorecard() {
      setLoading(true);
      setPermissionFresh(false);
      setError("");
      setInnings(null);
      setAllInnings([]);
      setMatch(null);
      setTeams([]);
      setPlayersById({});
      setPlayerDataWarning("");
      setRecentDeliveries([]);
      setMatchView("summary");

      try {
        const [inningsResult, matchResult, playerResponse] = await Promise.all([
          apiRequest(`${SCORING_API_URL}/api/v1/matches/${matchId}/innings`).catch(
            (inningsError) => {
              if (inningsError.message === "No innings found for this match.") {
                return { data: { innings: [] } };
              }
              throw inningsError;
            }
          ),
          apiRequest(`${MATCH_API_URL}/${matchId}`),
          apiRequest(PLAYER_API_URL)
            .then((result) => ({ result }))
            .catch((playerError) => ({ error: playerError })),
        ]);
        const allInnings = inningsResult.data?.innings;
        const currentInnings = Array.isArray(allInnings)
          ? [...allInnings].sort(
                (left, right) => right.inningsNumber - left.inningsNumber
              )[0] || null
          : (
            await apiRequest(
              `${SCORING_API_URL}/api/v1/matches/${matchId}/scorecard`
            )
          ).data;
        let accessResult = null;
        let accessLoadError = "";
        if (user) {
          try {
            accessResult = await apiRequest(
              `${MATCH_API_URL}/${matchId}/scoring-access`
            );
          } catch (accessError) {
            accessLoadError = accessError.message || "Unable to verify scoring access.";
          }
        }
        const savedMatch = accessResult?.data
          ? { ...matchResult.data, scoringAccess: accessResult.data }
          : matchResult.data;

        const [teamAResult, teamBResult] = await Promise.all([
          apiRequest(`${TEAM_API_URL}/${savedMatch.teamAId}`),
          apiRequest(`${TEAM_API_URL}/${savedMatch.teamBId}`),
        ]);
        const historyResult =
          currentInnings &&
          savedMatch.status !== "completed" &&
          currentInnings.status !== "COMPLETED"
            ? await apiRequest(
            `${SCORING_API_URL}/api/v1/matches/${matchId}/innings/${currentInnings._id}/deliveries`
              )
            : null;
        const players = readPlayers(playerResponse.result);
        const playerMap = Object.fromEntries(
          players.map((player) => [idOf(player), player])
        );

        if (!cancelled) {
          setInnings(currentInnings);
          setAllInnings(
            Array.isArray(allInnings)
              ? allInnings
              : currentInnings
                ? [currentInnings]
                : []
          );
          setMatch(savedMatch);
          setPermissionFresh(!user || Boolean(accessResult?.data));
          setPermissionRefreshError(accessLoadError);
          setTeams([teamAResult.data, teamBResult.data]);
          setPlayersById(playerMap);
          setPlayerDataWarning(
            playerResponse.error
              ? "Player names could not be loaded. Fielding selectors will identify squad members by ID."
              : ""
          );
          setRecentDeliveries(historyResult?.data?.deliveries || []);
          setSelection({
            strikerId: idOf(currentInnings?.strikerId),
            nonStrikerId: idOf(currentInnings?.nonStrikerId),
            bowlerId: idOf(currentInnings?.currentBowlerId),
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load the match scorecard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadScorecard();
    return () => {
      cancelled = true;
    };
  }, [matchId, reloadKey, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const refreshMatchAccess = async () => {
      try {
        const result = await apiRequest(
          user
            ? `${MATCH_API_URL}/${matchId}/scoring-access`
            : `${MATCH_API_URL}/${matchId}`
        );
        if (!cancelled && result.data) {
          if (user) {
            setMatch((current) => ({
              ...current,
              status: result.data.matchStatus || current?.status,
              scoringAccess: result.data,
            }));
          } else {
            setMatch(result.data);
          }
          setPermissionFresh(true);
          setPermissionRefreshError("");
        }
      } catch (refreshError) {
        if (!cancelled) {
          setPermissionFresh(false);
          setPermissionRefreshError(
            refreshError.message || "Unable to refresh scoring permissions."
          );
        }
      }
    };
    const intervalId = window.setInterval(() => {
      void refreshMatchAccess();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [matchId, user?.id]);

  useEffect(() => {
    const query = targetScorerSearch.trim();
    if (!user || query.length < 2) {
      setTargetScorerOptions([]);
      setTargetScorerSearchError("");
      return undefined;
    }

    let cancelled = false;
    const timerId = window.setTimeout(async () => {
      try {
        const result = await apiRequest(
          `${AUTH_API_URL}/scoring-transfer-targets?query=${encodeURIComponent(query)}`
        );
        if (!cancelled) {
          setTargetScorerOptions(
            (Array.isArray(result.data) ? result.data : []).filter(
              (target) => idOf(target).toLowerCase() !== idOf(user.id).toLowerCase()
            )
          );
          setTargetScorerSearchError("");
        }
      } catch (searchError) {
        if (!cancelled) {
          setTargetScorerOptions([]);
          setTargetScorerSearchError(searchError.message || "Unable to search users.");
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [targetScorerSearch, user?.id]);

  const teamById = useMemo(
    () => Object.fromEntries(teams.map((team) => [idOf(team).toLowerCase(), team])),
    [teams]
  );
  const battingTeam = innings
    ? teamById[idOf(innings.battingTeamId).toLowerCase()]
    : null;
  const bowlingTeam = innings
    ? teamById[idOf(innings.bowlingTeamId).toLowerCase()]
    : null;

  const battingSquad = useMemo(
    () =>
      (innings && match
        ? idOf(innings.battingTeamId).toLowerCase() === idOf(match.teamAId).toLowerCase()
          ? match.teamAPlayerIds
          : match.teamBPlayerIds
        : []
      )
        ?.map((id) => playersById[idOf(id)])
        .filter(Boolean) || [],
    [innings, match, playersById]
  );
  const bowlingSquad = useMemo(
    () =>
      (innings && match
        ? idOf(innings.bowlingTeamId).toLowerCase() === idOf(match.teamAId).toLowerCase()
          ? match.teamAPlayerIds
          : match.teamBPlayerIds
        : []
      )
        ?.map((id) => playersById[idOf(id)])
        .filter(Boolean) || [],
    [innings, match, playersById]
  );
  const fieldingSquad = useMemo(() => {
    const squadIds =
      innings && match
        ? idOf(innings.bowlingTeamId).toLowerCase() === idOf(match.teamAId).toLowerCase()
          ? match.teamAPlayerIds
          : match.teamBPlayerIds
        : [];
    return (
      squadIds?.map((id) => {
        const playerId = idOf(id);
        return (
          playersById[playerId] || {
            _id: playerId,
            isUnavailable: true,
            name: `Player details unavailable (${playerId.slice(-6)})`,
          }
        );
      }) || []
    );
  }, [innings, match, playersById]);
  const fieldingDataWarning =
    playerDataWarning ||
    (fieldingSquad.some((player) => player.isUnavailable)
      ? "Some player names are unavailable; those squad members are identified by player ID."
      : "");

  const striker = playersById[idOf(innings?.strikerId)];
  const nonStriker = playersById[idOf(innings?.nonStrikerId)];
  const bowler = playersById[idOf(innings?.currentBowlerId)];
  const tossWinner = teams.find(
    (team) => idOf(team).toLowerCase() === idOf(match?.tossWinnerId).toLowerCase()
  );
  const currentBowlerFigure = playerFigure(
    innings?.bowlingFigures,
    innings?.currentBowlerId
  );
  const strikerFigure = playerFigure(innings?.battingFigures, innings?.strikerId);
  const nonStrikerFigure = playerFigure(innings?.battingFigures, innings?.nonStrikerId);
  const currentRunRate =
    innings?.legalBalls > 0 ? (innings.runs * 6) / innings.legalBalls : null;
  const totalExtras = innings
    ? (innings.extras?.wides || 0) +
      (innings.extras?.noBalls || 0) +
      (innings.extras?.byes || 0) +
      (innings.extras?.legByes || 0) +
      (innings.extras?.penaltyRuns || 0)
    : 0;
  const overNumber = innings
    ? innings.legalBalls > 0
      ? Math.ceil(innings.legalBalls / 6)
      : 1
    : 1;

  // Runs (and legal balls) since the last wicket.
  const partnership = useMemo(() => {
    let runs = 0;
    let balls = 0;
    for (const delivery of recentDeliveries) {
      runs += delivery.totalRuns || 0;
      if (delivery.isLegalBall) balls += 1;
      if (delivery.dismissalType) {
        runs = 0;
        balls = 0;
      }
    }
    return { runs, balls };
  }, [recentDeliveries]);

  const currentOverDeliveries = useMemo(() => {
    if (!innings || recentDeliveries.length === 0) return [];

    const overIndex =
      innings.legalBalls > 0
        ? Math.ceil(innings.legalBalls / 6) - 1
        : 0;
    let legalCount = 0;
    return recentDeliveries.filter((delivery) => {
      const deliveryOver = Math.floor(legalCount / 6);
      if (delivery.isLegalBall) legalCount += 1;
      return deliveryOver === overIndex;
    });
  }, [innings, recentDeliveries]);

  const needsPlayerSetup =
    innings &&
    (innings.awaitingBatter ||
      !innings.strikerId ||
      !innings.nonStrikerId ||
      !innings.currentBowlerId);
  const isMatchOwner =
    Boolean(user?.id && match?.scoringAccess?.ownerId) &&
    idOf(match.scoringAccess.ownerId).toLowerCase() ===
      idOf(user.id).toLowerCase();
  const isActiveScorer =
    Boolean(user?.id && match?.scoringAccess?.activeScorerId) &&
    idOf(match.scoringAccess.activeScorerId).toLowerCase() ===
      idOf(user.id).toLowerCase();
  const canManageScoring =
    isActiveScorer &&
    permissionFresh &&
    match?.status !== "completed" &&
    match?.status !== "cancelled";
  const canScore =
    (innings?.status === "READY" || innings?.status === "IN_PROGRESS") &&
    canManageScoring;
  const padDisabled = saving || !canScore || Boolean(needsPlayerSetup);
  const finalizedMatch =
    match?.status === "completed" && hasValidMatchResult(match);
  const inningsTwoCompleted = allInnings.some(
    (item) => item.inningsNumber === 2 && item.status === "COMPLETED"
  ) || (innings?.inningsNumber === 2 && innings.status === "COMPLETED");
  const canStartSecondInnings =
    innings?.status === "COMPLETED" &&
    innings.inningsNumber === 1 &&
    match?.inningsPerTeam === 1 &&
    ["T10", "T20", "ODI", "CUSTOM"].includes(match?.format) &&
    Number.isInteger(match?.overs) &&
    match.overs > 0;

  async function changeScoringAccess(action) {
    setError("");
    setSuccess("");
    const target = targetScorerId.trim();
    if (action === "transfer" && !target) {
      setError("Enter the registered user's ID.");
      return;
    }
    if (
      !window.confirm(
        action === "transfer"
          ? "Transfer scoring access to this registered user?"
          : "Reclaim scoring access immediately?"
      )
    ) {
      return;
    }

    setChangingAccess(true);
    try {
      const result = await apiRequest(
        `${MATCH_API_URL}/${matchId}/scoring-access/${action}`,
        {
          method: "POST",
          ...(action === "transfer"
            ? { body: JSON.stringify({ targetUserId: target }) }
            : {}),
        }
      );
      if (!result.data?.activeScorerId || !Number.isInteger(result.data.version)) {
        throw new Error("Match Service returned invalid scoring access.");
      }
      setTargetScorerId("");
      setTargetScorerSearch("");
      setTargetScorerOptions([]);
      setSuccess(
        action === "transfer"
          ? "Scoring access transferred."
          : "Scoring access reclaimed."
      );
      setReloadKey((key) => key + 1);
    } catch (accessError) {
      setError(accessError.message || "Unable to update scoring access.");
    } finally {
      setChangingAccess(false);
    }
  }

  const activeBatters = [
    { role: "Striker", player: striker, id: idOf(innings?.strikerId) },
    { role: "Non-striker", player: nonStriker, id: idOf(innings?.nonStrikerId) },
  ]
    .filter((batter) => batter.id)
    .map((batter) => ({
      id: batter.id,
      role: batter.role,
      name: getPlayerName(batter.player),
    }));

  async function submitPlayerSelection(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (
      !selection.strikerId ||
      !selection.nonStrikerId ||
      !selection.bowlerId ||
      selection.strikerId === selection.nonStrikerId
    ) {
      setError("Select two different batters and a bowler.");
      return;
    }

    setSaving(true);
    try {
      const result = await apiRequest(
        `${SCORING_API_URL}/api/v1/innings/${innings._id}/players`,
        {
          method: "PATCH",
          body: JSON.stringify(selection),
        }
      );
      setInnings(result.data);
      setSelection({
        strikerId: idOf(result.data.strikerId),
        nonStrikerId: idOf(result.data.nonStrikerId),
        bowlerId: idOf(result.data.currentBowlerId),
      });
      setSuccess("Player selections saved.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save player selections.");
      if (saveError.message?.includes("active scorer")) {
        setReloadKey((key) => key + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  async function startSecondInnings() {
    setError("");
    setSuccess("");
    setStartingSecondInnings(true);

    try {
      const result = await apiRequest(
        `${SCORING_API_URL}/api/v1/matches/${matchId}/innings/2`,
        { method: "POST" }
      );

      if (
        !result.data?._id ||
        result.data.inningsNumber !== 2
      ) {
        throw new Error("Scoring Service did not return the second innings.");
      }

      setSuccess("Second innings is ready.");
      setReloadKey((key) => key + 1);
    } catch (startError) {
      setError(startError.message || "Unable to start the second innings.");
      if (startError.message?.includes("active scorer")) {
        setReloadKey((key) => key + 1);
      }
    } finally {
      setStartingSecondInnings(false);
    }
  }

  async function submitDelivery(payload) {
    setError("");
    setSuccess("");
    setSaving(true);
    const requestFingerprint = JSON.stringify(payload);
    const storageKey = `cricket-scoring:pending-delivery:${matchId}:${innings._id}`;
    let pendingRequest;
    try {
      pendingRequest =
        pendingDeliveryRequestRef.current?.storageKey === storageKey
          ? pendingDeliveryRequestRef.current
          : JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (
        pendingRequest &&
        pendingRequest.fingerprint !== requestFingerprint
      ) {
        throw new Error(
          "Retry or resolve the pending delivery before submitting a different one."
        );
      }
      if (!pendingRequest) {
        pendingRequest = {
          storageKey,
          fingerprint: requestFingerprint,
          key: createDeliveryIdempotencyKey(),
        };
      } else {
        pendingRequest.storageKey = storageKey;
      }
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, JSON.stringify(pendingRequest));
      }
      pendingDeliveryRequestRef.current = pendingRequest;
    } catch (requestError) {
      setError(requestError.message || "Unable to prepare a safe delivery request.");
      setSaving(false);
      return;
    }

    try {
      const result = await apiRequest(
        `${SCORING_API_URL}/api/v1/innings/${innings._id}/deliveries`,
        {
          method: "POST",
          headers: { "Idempotency-Key": pendingRequest.key },
          body: JSON.stringify(payload),
        }
      );
      clearPendingDeliveryRequest(storageKey);
      setInnings(result.data);
      setSelection({
        strikerId: idOf(result.data.strikerId),
        nonStrikerId: idOf(result.data.nonStrikerId),
        bowlerId: idOf(result.data.currentBowlerId),
      });
      setMode("NORMAL");
      setNoBallSource("BAT");
      setSuccess("Delivery recorded.");
      try {
        const historyResult = await apiRequest(
          `${SCORING_API_URL}/api/v1/matches/${matchId}/innings/${innings._id}/deliveries`
        );
        setRecentDeliveries(historyResult.data?.deliveries || []);
      } catch {
        setError("Delivery was recorded, but delivery history could not be refreshed.");
      }
    } catch (saveError) {
      if (saveError.code === "DELIVERY_OPERATION_ABORTED") {
        clearPendingDeliveryRequest(storageKey);
      }
      setError(saveError.message || "Unable to record delivery.");
      if (saveError.message?.includes("active scorer")) {
        setReloadKey((key) => key + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  function pressRuns(runs) {
    if (padDisabled) return;
    void submitDelivery(buildDelivery(mode, runs, noBallSource));
  }

  function toggleMode(nextMode) {
    setMode((current) => (current === nextMode ? "NORMAL" : nextMode));
    setNoBallSource("BAT");
  }

  // Keyboard shortcuts: 0-6 for runs, w/n/b/l/p/k for modifiers, Esc to clear.
  keyHandlerRef.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if (padDisabled) return;

    const key = event.key.toLowerCase();
    if (key === "escape") {
      setMode("NORMAL");
      return;
    }
    const modifier = MODIFIERS.find((item) => item.key === key);
    if (modifier) {
      event.preventDefault();
      toggleMode(modifier.id);
      return;
    }
    if (/^[0-9]$/.test(key) && mode !== "WICKET") {
      const runs = Number(key);
      if (MODE_RUNS[mode]?.includes(runs)) {
        event.preventDefault();
        pressRuns(runs);
      }
    }
  };

  useEffect(() => {
    const listener = (event) => keyHandlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  if (loading) {
    return (
      <main
        className="flex items-center justify-center text-zinc-400"
        style={{ background: C.page, minHeight: "100vh" }}
      >
        <LoaderCircle className="mr-3 animate-spin text-emerald-300" />
        Loading scorecard...
      </main>
    );
  }

  const runCount = MODE_RUNS[mode]?.length || 0;
  const padCols =
    runCount === 5 ? "grid-cols-6" : runCount === 4 ? "grid-cols-2" : "grid-cols-3";
  const matchTitle =
    teams.length === 2
      ? [
          `${teams[0]?.name} vs ${teams[1]?.name}`,
          match?.format,
          Number.isInteger(match?.overs) ? `${match.overs} overs` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : match?.title || "Match scoring";
  const tossLine =
    tossWinner
      ? `${tossWinner.name} won the toss${
          match?.tossDecision ? ` and chose to ${match.tossDecision}` : ""
        }`
      : match?.tossDecision
        ? `Toss decision: ${match.tossDecision}`
        : "";
  const oversText = innings ? innings.overs || formatOvers(innings.legalBalls) : "0.0";
  const matchDateText = formatMatchDate(match?.matchDate);
  const finalResult = match?.result;
  const winnerName = finalResult?.winnerTeamId
    ? teamById[idOf(finalResult.winnerTeamId).toLowerCase()]?.name
    : null;
  const resultHeadline =
    finalResult?.outcome === "WIN" && winnerName
      ? `${winnerName} won by ${finalResult.margin.value} ${
          finalResult.margin.type === "WICKETS" ? "wickets" : "runs"
        }`
      : finalResult?.outcome === "TIE"
        ? "Match tied"
        : finalResult?.outcome === "NO_RESULT"
          ? "No result"
          : "";
  const userLabel = (playerId) => {
    if (!playerId) return "Unassigned";
    if (user?.id && idOf(playerId).toLowerCase() === idOf(user.id).toLowerCase()) {
      return `${user.name || "You"} (you)`;
    }
    return `User ${idOf(playerId).slice(0, 8)}`;
  };

  function renderInningsScorecard(item) {
    const itemBattingTeam = teamById[idOf(item.battingTeamId).toLowerCase()];
    const itemBowlingTeam = teamById[idOf(item.bowlingTeamId).toLowerCase()];
    const extras = item.extras || {};
    const extrasKeys = ["wides", "noBalls", "byes", "legByes", "penaltyRuns"];
    const extrasAvailable = extrasKeys.every((key) =>
      Number.isInteger(extras[key])
    );
    const extrasTotal = [
      extras.wides,
      extras.noBalls,
      extras.byes,
      extras.legByes,
      extras.penaltyRuns,
    ].reduce((total, runs) => total + (Number.isInteger(runs) ? runs : 0), 0);
    const extrasDescription = [
      ["Wd", extras.wides],
      ["NB", extras.noBalls],
      ["B", extras.byes],
      ["LB", extras.legByes],
      ["P", extras.penaltyRuns],
    ]
      .filter(([, runs]) => Number.isInteger(runs) && runs > 0)
      .map(([label, runs]) => `${label} ${runs}`)
      .join(" · ");

    return (
      <section key={idOf(item)} className={`${panelClass} space-y-4 p-4 sm:p-6`} style={panelStyle}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              Innings {item.inningsNumber} · {itemBattingTeam?.name || "Batting team"} batting
            </p>
            <h2 className="mt-1 text-3xl font-black">
              {Number.isInteger(item.runs) ? item.runs : "—"}/
              {Number.isInteger(item.wickets) ? item.wickets : "—"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {item.overs ||
                (Number.isInteger(item.legalBalls) ? formatOvers(item.legalBalls) : "—")} overs ·{" "}
              {itemBowlingTeam?.name || "Bowling team"} bowling
            </p>
          </div>
          {Number.isInteger(item.targetRuns) &&
            item.targetRuns > 0 &&
            item.inningsNumber === 2 && (
            <div className={`${innerClass} px-4 py-3`} style={innerStyle}>
              <p className="text-xs text-zinc-400">Target</p>
              <p className="text-2xl font-bold">{item.targetRuns}</p>
            </div>
          )}
        </div>

        <div className={`${innerClass} p-3 sm:p-4`} style={innerStyle}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">Batting</h3>
            <p className="text-sm text-zinc-400">
              Extras: {extrasAvailable ? extrasTotal : "—"}
              {extrasDescription ? ` (${extrasDescription})` : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  {["Batter", "R", "B", "4s", "6s", "SR"].map((heading) => (
                    <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(item.battingFigures || []).length ? (
                  item.battingFigures.map((figure) => {
                    const batter = playersById[idOf(figure.playerId)];
                    const balls = figure.ballsFaced;
                    const strikeRate =
                      Number.isInteger(figure.runs) &&
                      Number.isInteger(balls) &&
                      balls > 0
                        ? ((figure.runs / balls) * 100).toFixed(2)
                        : "—";
                    return (
                      <tr key={idOf(figure.playerId)} className="border-t border-white/10">
                        <td className="px-2 py-2.5 font-semibold">
                          {batter ? getPlayerName(batter) : "Player"}
                          {figure.isOut && figure.dismissalType
                            ? ` · ${figure.dismissalType.replaceAll("_", " ").toLowerCase()}`
                            : ""}
                        </td>
                        <td className="px-2 py-2.5">{Number.isInteger(figure.runs) ? figure.runs : "—"}</td>
                        <td className="px-2 py-2.5">{Number.isInteger(balls) ? balls : "—"}</td>
                        <td className="px-2 py-2.5">{Number.isInteger(figure.fours) ? figure.fours : "—"}</td>
                        <td className="px-2 py-2.5">{Number.isInteger(figure.sixes) ? figure.sixes : "—"}</td>
                        <td className="px-2 py-2.5">{strikeRate}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan="6" className="px-2 py-4 text-zinc-400">No batting figures available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${innerClass} p-3 sm:p-4`} style={innerStyle}>
          <h3 className="mb-3 font-bold">Bowling</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  {["Bowler", "O", "M", "R", "W", "Econ"].map((heading) => (
                    <th key={heading} className="px-2 py-2 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(item.bowlingFigures || []).length ? (
                  item.bowlingFigures.map((figure) => {
                    const bowler = playersById[idOf(figure.playerId)];
                    const balls = figure.legalBalls;
                    const economy =
                      Number.isInteger(figure.runsConceded) &&
                      Number.isInteger(balls) &&
                      balls > 0
                        ? (figure.runsConceded / (balls / 6)).toFixed(2)
                        : "—";
                    return (
                      <tr key={idOf(figure.playerId)} className="border-t border-white/10">
                        <td className="px-2 py-2.5 font-semibold">
                          {bowler ? getPlayerName(bowler) : "Player"}
                        </td>
                        <td className="px-2 py-2.5">{Number.isInteger(balls) ? formatOvers(balls) : "—"}</td>
                        <td className="px-2 py-2.5 text-zinc-400" title="Maidens are not stored by Scoring Service">—</td>
                        <td className="px-2 py-2.5">{Number.isInteger(figure.runsConceded) ? figure.runsConceded : "—"}</td>
                        <td className="px-2 py-2.5">{Number.isInteger(figure.wickets) ? figure.wickets : "—"}</td>
                        <td className="px-2 py-2.5">{economy}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan="6" className="px-2 py-4 text-zinc-400">No bowling figures available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }
  if (finalizedMatch) {
    const orderedInnings = [...allInnings].sort(
      (left, right) => left.inningsNumber - right.inningsNumber
    );
    const teamA = teamById[idOf(match.teamAId).toLowerCase()];
    const teamB = teamById[idOf(match.teamBId).toLowerCase()];
    const summaryTotals = orderedInnings.map((item) => ({
      item,
      team: teamById[idOf(item.battingTeamId).toLowerCase()],
    }));

    return (
      <main className="min-h-screen text-white" style={{ background: C.page }}>
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/matches"
              className={`${headerButtonClass} h-12 overflow-hidden ${focusRing}`}
              style={panelStyle}
              aria-label="Back to matches"
            >
              <span className="flex h-full w-12 items-center justify-center border-r" style={{ borderColor: C.border }}>
                <ArrowLeft size={20} />
              </span>
              <span className="flex h-full items-center gap-2 px-4 font-bold">
                <Trophy size={21} className="text-emerald-300" />
                Matches
              </span>
            </Link>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-200">
              Match completed
            </span>
          </header>

          <section className={`${panelClass} overflow-hidden p-5 sm:p-8`} style={panelStyle}>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {match.format || "Match"}
              {Number.isInteger(match.overs) ? ` · ${match.overs} overs` : ""}
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">
              {match.title || `${teamA?.name || "Team A"} vs ${teamB?.name || "Team B"}`}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
              {matchDateText && <span>{matchDateText}</span>}
              {match.venue && <span>{match.venue}</span>}
              {tossLine && <span>{tossLine}</span>}
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {summaryTotals.map(({ item, team }) => (
                <div
                  key={idOf(item)}
                  className={`${innerClass} flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5`}
                  style={innerStyle}
                >
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">
                      Innings {item.inningsNumber} · {team?.name || "Team"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {item.overs ||
                        (Number.isInteger(item.legalBalls)
                          ? formatOvers(item.legalBalls)
                          : "—")} overs
                    </p>
                  </div>
                  <p className="text-3xl font-black tracking-tight sm:text-4xl">
                    {Number.isInteger(item.runs) ? item.runs : "—"}/
                    {Number.isInteger(item.wickets) ? item.wickets : "—"}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 sm:px-5">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                Result
              </p>
              <p className="mt-1 text-xl font-black text-white sm:text-2xl">
                {resultHeadline}
              </p>
              {finalResult.outcome === "NO_RESULT" && finalResult.reason && (
                <p className="mt-2 text-sm text-zinc-300">{finalResult.reason}</p>
              )}
            </div>
          </section>

          <div className="flex gap-2 border-b border-white/10" role="tablist" aria-label="Match details">
            {[
              ["summary", "Summary"],
              ["scorecard", "Scorecard"],
            ].map(([view, label]) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={matchView === view}
                onClick={() => setMatchView(view)}
                className={`border-b-2 px-4 py-3 text-sm font-bold transition ${
                  matchView === view
                    ? "border-emerald-300 text-emerald-200"
                    : "border-transparent text-zinc-400 hover:text-white"
                } ${focusRing}`}
              >
                {label}
              </button>
            ))}
          </div>

          {matchView === "summary" ? (
            <div className="space-y-4" role="tabpanel">
              <section className={`${panelClass} p-5 sm:p-6`} style={panelStyle}>
                <h2 className="text-lg font-bold">Match summary</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {teamA?.name || "Team A"} <span className="text-zinc-500">vs</span>{" "}
                  {teamB?.name || "Team B"}
                </p>
                {matchDateText && <p className="mt-1 text-sm text-zinc-400">{matchDateText}</p>}
                {match.venue && <p className="mt-1 text-sm text-zinc-400">{match.venue}</p>}
                {tossLine && <p className="mt-1 text-sm text-zinc-400">{tossLine}</p>}
                <p className="mt-4 font-semibold text-emerald-200">{resultHeadline}</p>
                {finalResult.outcome === "NO_RESULT" && finalResult.reason && (
                  <p className="mt-1 text-sm text-zinc-400">{finalResult.reason}</p>
                )}
              </section>
              <MatchAwards
                result={finalResult}
                playersById={playersById}
                teamById={teamById}
              />
            </div>
          ) : orderedInnings.length ? (
            <div className="space-y-4" role="tabpanel">
              {orderedInnings.length < 2 && (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                  The Scoring Service returned an incomplete innings scorecard.
                </p>
              )}
              {orderedInnings.map(renderInningsScorecard)}
            </div>
          ) : (
            <section className={`${panelClass} p-5 text-sm text-zinc-300`} style={panelStyle} role="tabpanel">
              The match result is available, but the Scoring Service did not return innings scorecards.
            </section>
          )}
        </div>
      </main>
    );
  }

  const resultPending =
    match?.status === "completed" ||
    (inningsTwoCompleted && !finalizedMatch);

  const footerText =
    error ||
    success ||
    (mode !== "NORMAL" && canScore && !needsPlayerSetup ? MODE_HELP[mode] : DEFAULT_HINT);

  const statusLine = (
    <p
      role={error ? "alert" : "status"}
      className={`flex shrink-0 items-center gap-3 text-sm ${
        error ? "text-red-300" : success ? "text-emerald-300" : "text-zinc-300"
      }`}
    >
      {error ? (
        <CircleAlert size={18} className="shrink-0" />
      ) : (
        <Keyboard size={22} className="shrink-0 text-zinc-400" />
      )}
      {footerText}
    </p>
  );

  return (
    // The page itself scrolls inside this container, so scrolling works
    // regardless of any global CSS on body / #root.
    <main
      className="text-white"
      style={{ background: C.page, height: "100vh", overflowY: "auto", overflowX: "hidden" }}
    >
      <div className="flex min-h-full flex-col">
        {/* Header */}
        <header
          className="shrink-0 border-b px-3 py-2.5"
          style={{ borderColor: "rgba(110, 231, 183, 0.12)" }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/matches"
              className={`${headerButtonClass} h-12 overflow-hidden ${focusRing}`}
              style={panelStyle}
              aria-label="Back to matches"
            >
              <span
                className="flex h-full w-12 items-center justify-center border-r"
                style={{ borderColor: C.border }}
              >
                <ArrowLeft size={20} />
              </span>
              <span className="flex h-full items-center gap-2 px-4 font-bold">
                <Trophy size={22} className="text-emerald-300" />
                Matches
              </span>
            </Link>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold sm:text-lg">{matchTitle}</h1>
              {tossLine && <p className="truncate text-sm text-zinc-400">{tossLine}</p>}
            </div>

            {innings && (
              <>
                <span
                  className="rounded-full border border-emerald-300/50 px-5 py-2 text-sm font-bold tracking-wide text-emerald-300"
                  style={{ background: "rgba(110, 231, 183, 0.08)" }}
                >
                  {innings.status.replaceAll("_", " ")}
                </span>
                <div className="hidden text-center sm:block">
                  <p className="text-lg leading-tight">
                    <span className="font-bold">{oversText}</span>
                    {Number.isInteger(match?.overs) && (
                      <span className="text-zinc-400"> / {match.overs} ov</span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-400">
                    RR {currentRunRate !== null ? currentRunRate.toFixed(2) : "—"}
                  </p>
                </div>
              </>
            )}

            <div className="relative">
              <button
                type="button"
                aria-label="Match options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className={`${headerButtonClass} h-12 w-12 flex-col gap-1 ${focusRing}`}
                style={panelStyle}
              >
                <span className="h-1 w-1 rounded-full bg-white" />
                <span className="h-1 w-1 rounded-full bg-white" />
                <span className="h-1 w-1 rounded-full bg-white" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border p-1 shadow-xl"
                    style={panelStyle}
                  >
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10"
                      onClick={() => {
                        setMenuOpen(false);
                        setReloadKey((key) => key + 1);
                      }}
                    >
                      Refresh scorecard
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {match && (
          <section className="mx-3 mt-3 rounded-xl border px-4 py-3" style={panelStyle}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[220px] flex-1">
                <h2 className="font-bold">Scoring access</h2>
                <p className="mt-1 text-sm text-zinc-300">
                  Owner: {userLabel(match.scoringAccess?.ownerId)}
                  <span className="mx-2 text-zinc-600">·</span>
                  Active scorer: {userLabel(match.scoringAccess?.activeScorerId)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {permissionRefreshError
                    ? `${permissionRefreshError} Scoring controls are disabled until permission is confirmed.`
                    : !user
                    ? "You are viewing this match. Sign in as the active scorer to update the score."
                    : isActiveScorer
                      ? "You are the active scorer and may update this score."
                      : isMatchOwner
                        ? "You own this match but are not the active scorer. You may reclaim scoring."
                        : "You are viewing this match. Only the active scorer can update the score."}
                </p>
              </div>
              {(isMatchOwner || isActiveScorer) &&
                match.status !== "completed" &&
                match.status !== "cancelled" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-56 text-xs text-zinc-400">
                      Find registered user
                      <input
                        value={targetScorerSearch}
                        onChange={(event) => {
                          setTargetScorerSearch(event.target.value);
                          setTargetScorerId("");
                        }}
                        placeholder="Search by name"
                        className="mt-1 w-full rounded-lg border bg-black/20 px-3 py-2 text-sm text-white"
                        style={{ borderColor: C.innerBorder }}
                        disabled={changingAccess}
                      />
                      {targetScorerSearch.trim().length >= 2 && (
                        <select
                          value={targetScorerId}
                          onChange={(event) => setTargetScorerId(event.target.value)}
                          className="mt-2 w-full rounded-lg border bg-black/20 px-3 py-2 text-sm text-white"
                          style={{ borderColor: C.innerBorder }}
                          disabled={changingAccess}
                        >
                          <option value="">
                            {targetScorerOptions.length
                              ? "Select a user"
                              : "No matching active users"}
                          </option>
                          {targetScorerOptions.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.name} · {target.id.slice(-6)}
                            </option>
                          ))}
                        </select>
                      )}
                      {targetScorerSearchError && (
                        <span className="mt-1 block text-xs text-red-300">
                          {targetScorerSearchError}
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      className={`${primaryButtonClass} px-4 py-2.5`}
                      style={primaryButtonStyle}
                      disabled={changingAccess}
                      onClick={() => void changeScoringAccess("transfer")}
                    >
                      Transfer scoring
                    </button>
                    {isMatchOwner && !isActiveScorer && (
                      <button
                        type="button"
                        className={`${secondaryButtonClass} py-2.5`}
                        style={secondaryButtonStyle}
                        disabled={changingAccess}
                        onClick={() => void changeScoringAccess("reclaim")}
                      >
                        Reclaim scoring
                      </button>
                    )}
                  </div>
                )}
            </div>
          </section>
        )}

        {match && (
          <details className="mx-3 mt-2 rounded-xl border px-4 py-3" style={panelStyle}>
            <summary className="cursor-pointer font-semibold">Match squads</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                {
                  team: teamById[idOf(match.teamAId).toLowerCase()],
                  playerIds: match.teamAPlayerIds || [],
                },
                {
                  team: teamById[idOf(match.teamBId).toLowerCase()],
                  playerIds: match.teamBPlayerIds || [],
                },
              ].map(({ team, playerIds }, index) => (
                <div key={idOf(team) || index} className="rounded-lg border p-3" style={innerStyle}>
                  <h3 className="font-semibold">{team?.name || `Team ${index + 1}`}</h3>
                  <ul className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-300">
                    {playerIds.map((playerId) => {
                      const playerKey = idOf(playerId);
                      return (
                        <li
                          key={playerKey}
                          className="rounded-md bg-white/5 px-2 py-1"
                        >
                          {playersById[playerKey]
                            ? getPlayerName(playersById[playerKey])
                            : `Player ${playerKey.slice(-6)}`}
                        </li>
                      );
                    })}
                    {playerIds.length === 0 && (
                      <li className="text-zinc-500">Squad not available</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        {!innings ? (
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-7">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200"
              >
                <CircleAlert size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <section className={`${panelClass} p-4`} style={panelStyle}>
              <h2 className="font-bold">
                {match?.status === "scheduled" ? "Match has not started" : "Scorecard unavailable"}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {error ||
                  (match?.status === "scheduled"
                    ? "The scorecard will appear after the first innings is initialized."
                    : "No innings is available for this match.")}
              </p>
              {teams.length === 2 && (
                <p className="mt-3 text-sm text-zinc-300">
                  {teams[0].name} vs {teams[1].name}
                </p>
              )}
            </section>
          </div>
        ) : resultPending ? (
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-7">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200"
              >
                <CircleAlert size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <section className={`${panelClass} p-5 sm:p-6`} style={panelStyle}>
              <h2 className="text-xl font-bold">
                Result Pending
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {match?.status === "completed"
                  ? "The match is marked completed, but Match Service has not returned a valid persisted result. No winner is shown."
                  : "Both innings are complete. The official match result has not been finalized yet."}
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className={`${primaryButtonClass} mt-5 ${focusRing}`}
                style={primaryButtonStyle}
              >
                Refresh match status
              </button>
            </section>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 p-3">
            {/* Score summary */}
            <section className={`${panelClass} shrink-0 px-6 py-3`} style={panelStyle}>
              <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
                <div className="flex flex-wrap items-center gap-x-10 gap-y-2">
                  <div>
                    <p className="font-semibold text-emerald-300">
                      {battingTeam?.name || "Batting team"} · Innings {innings.inningsNumber || 1}
                    </p>
                    <p className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-6xl font-black leading-none tracking-tight text-transparent xl:text-7xl">
                      {innings.runs}/{innings.wickets}
                    </p>
                  </div>
                  <div className="self-end pb-1 text-zinc-400">
                    <p className="text-xl">
                      <span className="font-bold text-white">{oversText}</span>
                      {Number.isInteger(match?.overs) && ` / ${match.overs} overs`}
                    </p>
                    <p>
                      Run Rate: {currentRunRate !== null ? currentRunRate.toFixed(2) : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-wrap items-stretch justify-end gap-3">
                  <div
                    className={`${innerClass} px-5 py-3`}
                    style={{ ...innerStyle, minWidth: 128 }}
                  >
                    <p className="font-semibold">Extras</p>
                    <p className="mt-1 text-3xl font-bold">{totalExtras}</p>
                  </div>
                  <div
                    className={`${innerClass} px-5 py-3`}
                    style={{ ...innerStyle, minWidth: 160 }}
                  >
                    <p className="font-semibold">Partnership</p>
                    <p className="mt-1 text-3xl font-bold">
                      {partnership.runs} ({partnership.balls})
                    </p>
                  </div>
                  <div
                    className={`${innerClass} px-5 py-3`}
                    style={{ ...innerStyle, minWidth: 128 }}
                  >
                    <p className="font-semibold">Target</p>
                    <p className="mt-1 text-3xl font-bold">
                      {Number.isInteger(innings.targetRuns) ? innings.targetRuns : "-"}
                    </p>
                  </div>
                  <div
                    className={`${innerClass} px-5 py-3`}
                    style={{ ...innerStyle, minWidth: 224 }}
                  >
                    <p className="font-semibold">This Over</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2" style={{ minHeight: 44 }}>
                      {currentOverDeliveries.length ? (
                        currentOverDeliveries.map((delivery) => {
                          const isWicket = Boolean(delivery.dismissalType);
                          return (
                            <span
                              key={delivery._id || delivery.sequence}
                              title={(delivery.dismissalType || delivery.eventType).replaceAll(
                                "_",
                                " "
                              )}
                              className={`flex items-center justify-center rounded-full border px-2 text-base font-bold ${
                                isWicket
                                  ? "border-red-400/60 bg-red-500/20 text-red-200"
                                  : "border-white/20 text-white"
                              }`}
                              style={{
                                height: 44,
                                minWidth: 44,
                                ...(isWicket ? {} : { background: C.page }),
                              }}
                            >
                              {deliveryOutcome(delivery)}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-sm text-zinc-500">No balls yet</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Batting + bowling */}
            <div
              className="grid shrink-0 gap-3"
              style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}
            >
              <section className={`${panelClass} p-4`} style={panelStyle}>
                <h2 className="mb-3 flex items-center gap-3 text-lg font-bold">
                  <BatIcon />
                  Batting
                </h2>
                <div className={`${innerClass} overflow-hidden`} style={innerStyle}>
                  <table className="w-full table-fixed text-left">
                    <thead className="text-zinc-400">
                      <tr>
                        <th className="px-4 py-2.5 font-normal">Batter</th>
                        {["R", "B", "4s", "6s", "SR"].map((heading) => (
                          <th
                            key={heading}
                            className="py-2.5 text-center font-normal"
                            style={{ width: 64 }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Striker", striker, strikerFigure],
                        ["Non-striker", nonStriker, nonStrikerFigure],
                      ].map(([label, player, figure]) => {
                        const runs = figure?.runs ?? 0;
                        const balls = figure?.ballsFaced ?? 0;
                        return (
                          <tr
                            key={label}
                            style={label === "Striker" ? { background: C.striker } : undefined}
                          >
                            <td className="truncate px-4 py-3 font-bold">
                              {player ? getPlayerName(player) : "Not selected"}
                              {label === "Striker" && " *"}
                            </td>
                            <td className="py-3 text-center font-bold">{runs}</td>
                            <td className="py-3 text-center">{balls}</td>
                            <td className="py-3 text-center">{figure?.fours ?? 0}</td>
                            <td className="py-3 text-center">{figure?.sixes ?? 0}</td>
                            <td className="py-3 text-center">
                              {balls ? ((runs / balls) * 100).toFixed(0) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={`${panelClass} p-4`} style={panelStyle}>
                <h2 className="mb-3 flex items-center gap-3 text-lg font-bold">
                  <BallIcon />
                  Bowling
                </h2>
                <div className={`${innerClass} overflow-hidden`} style={innerStyle}>
                  <table className="w-full table-fixed text-left">
                    <thead className="text-zinc-400">
                      <tr>
                        <th className="px-4 py-2.5 font-normal">Bowler</th>
                        {["O", "R", "W", "Econ"].map((heading) => (
                          <th
                            key={heading}
                            className="py-2.5 text-center font-normal"
                            style={{ width: 80 }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="truncate px-4 py-3 font-bold">
                          {bowler ? getPlayerName(bowler) : "Not selected"}
                        </td>
                        <td className="py-3 text-center">
                          {formatOvers(currentBowlerFigure?.legalBalls || 0)}
                        </td>
                        <td className="py-3 text-center">
                          {currentBowlerFigure?.runsConceded ?? 0}
                        </td>
                        <td className="py-3 text-center">{currentBowlerFigure?.wickets ?? 0}</td>
                        <td className="py-3 text-center">
                          {currentBowlerFigure?.legalBalls
                            ? (
                                currentBowlerFigure.runsConceded /
                                (currentBowlerFigure.legalBalls / 6)
                              ).toFixed(2)
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Scoring area */}
            {canManageScoring ? (
            <section
              className={`${panelClass} flex flex-1 flex-col gap-3 px-6 py-4`}
              style={{ ...panelStyle, minHeight: 380 }}
            >
              <div className="flex shrink-0 items-center justify-between gap-3">
                <h2 className="text-lg font-bold">
                  {needsPlayerSetup && innings.status !== "COMPLETED" ? (
                    innings.awaitingBatter
                      ? "Select an incoming batter"
                      : innings.legalBalls > 0 && !innings.currentBowlerId
                        ? "Select the next-over bowler"
                        : "Set up the innings"
                  ) : (
                    <>
                      <span className="text-emerald-300">
                        {striker ? getPlayerName(striker) : "Striker"} *
                      </span>{" "}
                      <span className="font-semibold text-zinc-400">facing</span>{" "}
                      {bowler ? getPlayerName(bowler) : "bowler"}
                    </>
                  )}
                </h2>
                <span className="text-zinc-400">Over {overNumber}</span>
              </div>

              {needsPlayerSetup && innings.status !== "COMPLETED" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="min-h-0 flex-1">
                    <p className="mb-4 text-sm text-zinc-400">
                      {battingTeam?.name} batting · {bowlingTeam?.name} bowling. Choose players
                      from the saved match squads.
                    </p>
                    <ScoreSetupForm
                      innings={innings}
                      battingPlayers={battingSquad}
                      bowlingPlayers={bowlingSquad}
                      selection={selection}
                      setSelection={setSelection}
                      saving={saving}
                      onSubmit={submitPlayerSelection}
                      replacement={Boolean(innings.awaitingBatter)}
                    />
                  </div>
                  {statusLine}
                </div>
              ) : innings.status === "COMPLETED" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100">
                    This innings is complete. Further deliveries are disabled.
                  </div>
                  {canStartSecondInnings && (
                    <button
                      type="button"
                      disabled={startingSecondInnings}
                      onClick={() => void startSecondInnings()}
                      className={`${primaryButtonClass} w-full sm:w-auto ${focusRing}`}
                      style={primaryButtonStyle}
                    >
                      {startingSecondInnings ? (
                        <>
                          <LoaderCircle size={18} className="animate-spin" />
                          Starting second innings...
                        </>
                      ) : (
                        "Start Second Innings"
                      )}
                    </button>
                  )}
                  {statusLine}
                </div>
              ) : (
                <div className="flex flex-1 gap-6" style={{ minHeight: 320 }}>
                  {/* Left: run pad / wicket panel + hint */}
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {mode === "NO_BALL" && (
                      <div className="grid shrink-0 grid-cols-3 gap-2">
                        {[
                          ["BAT", "Off the bat"],
                          ["BYE", "Byes"],
                          ["LEG_BYE", "Leg-byes"],
                        ].map(([value, label]) => (
                          <Chip
                            key={value}
                            active={noBallSource === value}
                            onClick={() => setNoBallSource(value)}
                          >
                            {label}
                          </Chip>
                        ))}
                      </div>
                    )}

                    {mode === "WICKET" ? (
                      <div className="min-h-0 flex-1" style={{ minHeight: 260 }}>
                        <WicketPanel
                          key={`${idOf(innings.strikerId)}-${innings.legalBalls}`}
                          innings={innings}
                          batters={activeBatters}
                          fielders={fieldingSquad}
                          fieldingDataWarning={fieldingDataWarning}
                          disabled={saving}
                          onCancel={() => setMode("NORMAL")}
                          onSubmit={(payload) => void submitDelivery(payload)}
                        />
                      </div>
                    ) : (
                      <div
                        className={`grid flex-1 auto-rows-fr gap-3 ${padCols}`}
                        style={{ minHeight: 220 }}
                      >
                        {MODE_RUNS[mode].map((runs, index) => (
                          <button
                            key={runs}
                            type="button"
                            disabled={padDisabled}
                            onClick={() => pressRuns(runs)}
                            className={`flex flex-col items-center justify-center rounded-xl border-2 transition hover:brightness-110 active:scale-[0.98] ${focusRing} disabled:cursor-not-allowed disabled:opacity-50 ${
                              runCount === 5 ? (index < 3 ? "col-span-2" : "col-span-3") : ""
                            }`}
                            style={runButtonStyle(mode, runs)}
                          >
                            <span className="text-5xl font-black leading-none">{runs}</span>
                            <span className="mt-1.5 text-base font-semibold">
                              {runCaption(mode, runs, noBallSource)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {statusLine}
                  </div>

                  {/* Right: modifier column, full height of the pad + hint */}
                  <div className="flex shrink-0 flex-col gap-2" style={{ width: 176 }}>
                    {MODIFIERS.map((modifier) => {
                      const active = mode === modifier.id;
                      const isWicket = modifier.id === "WICKET";
                      return (
                        <button
                          key={modifier.id}
                          type="button"
                          aria-pressed={active}
                          disabled={saving}
                          onClick={() => toggleMode(modifier.id)}
                          className={`flex items-center justify-between rounded-xl border px-3 font-bold transition hover:brightness-110 ${focusRing} disabled:cursor-not-allowed disabled:opacity-50 ${
                            isWicket ? "flex-1" : "shrink-0"
                          }`}
                          style={{
                            ...modifierStyle(active, isWicket),
                            ...(isWicket ? { minHeight: 48 } : { height: 40 }),
                          }}
                        >
                          {modifier.label}
                          <kbd
                            className="flex items-center justify-center rounded-md border text-xs font-medium"
                            style={{
                              width: 24,
                              height: 24,
                              borderColor: "rgba(255, 255, 255, 0.3)",
                              color: active ? "inherit" : "#d4d4d8",
                            }}
                          >
                            {modifier.display}
                          </kbd>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
            ) : (
              <section className={`${panelClass} p-5`} style={panelStyle}>
                <p className="text-sm text-zinc-300">
                  {match?.status === "completed" || match?.status === "cancelled"
                    ? "This match is no longer accepting scoring changes."
                    : "You are viewing this match. Only the active scorer can update the score."}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
