import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Coins,
  Flag,
  LoaderCircle,
  Swords,
  Users,
} from "lucide-react";

const TEAM_API_URL =
  import.meta.env.VITE_TEAM_API_URL || "http://localhost:4004/api/v1/teams";
const PLAYER_API_URL =
  import.meta.env.VITE_PLAYER_API_URL || "http://localhost:4002/api/v1/players";
const MATCH_API_URL =
  import.meta.env.VITE_MATCH_API_URL || "http://localhost:4003/api/v1/matches";

/* ---------- shared styles ---------- */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07130d]";
const primaryButton = `inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-emerald-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

const TEAM_TONES = {
  A: { badge: "bg-emerald-400/10 text-emerald-300", bar: "bg-emerald-400" },
  B: { badge: "bg-sky-400/10 text-sky-300", bar: "bg-sky-400" },
};

const STEPS = [
  { key: "players", label: "Squads", icon: Users },
  { key: "toss", label: "Toss", icon: Coins },
  { key: "complete", label: "Ready", icon: Flag },
];

/* ---------- data helpers (unchanged behaviour) ---------- */

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
    throw new Error(
      result.message || `Request failed with status ${response.status}.`
    );
  }

  return result;
}

function readPlayers(result) {
  const records = result?.data?.players ?? result?.players ?? result?.data;
  return Array.isArray(records) ? records : [];
}

function idOf(value) {
  return String(value?._id || value?.id || value || "");
}

function playerName(player) {
  return player.name || player.fullName || player.playerName || "Unnamed player";
}

/* ---------- components ---------- */

function Stepper({ step }) {
  const activeIndex = STEPS.findIndex((item) => item.key === step);

  return (
    <ol className="mt-6 flex max-w-md items-center" aria-label="Setup progress">
      {STEPS.map((item, index) => {
        const complete = index < activeIndex || step === "complete";
        const current = index === activeIndex && step !== "complete";
        const Icon = item.icon;

        return (
          <li
            key={item.key}
            aria-current={current ? "step" : undefined}
            className="flex flex-1 items-center last:flex-none"
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ring-1 ${
                  complete
                    ? "bg-emerald-400 text-emerald-950 ring-emerald-300"
                    : current
                      ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/60"
                      : "bg-white/[0.03] text-zinc-500 ring-white/10"
                }`}
              >
                {complete ? <Check size={15} strokeWidth={3} /> : <Icon size={14} />}
              </span>
              <span
                className={`text-sm font-medium ${
                  complete || current ? "text-white" : "text-zinc-500"
                }`}
              >
                {item.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
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

function RoleButton({ label, title, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`h-7 min-w-8 rounded-md px-1.5 text-xs font-bold ring-1 transition ${focusRing} ${
        active
          ? "bg-amber-300 text-amber-950 ring-amber-200"
          : "bg-white/[0.03] text-zinc-400 ring-white/10 hover:text-white hover:ring-white/30"
      }`}
    >
      {label}
    </button>
  );
}

function TeamLineup({
  team,
  teamKey,
  players,
  lineup,
  onChange,
  opposingPlayerIds,
  opposingTeamName,
}) {
  const tone = TEAM_TONES[teamKey];
  const selectedCount = lineup.playerIds.length;

  function togglePlayer(playerId) {
    const playerIds = lineup.playerIds.includes(playerId)
      ? lineup.playerIds.filter((id) => id !== playerId)
      : [...lineup.playerIds, playerId];

    onChange({
      playerIds,
      captainId: playerIds.includes(lineup.captainId) ? lineup.captainId : "",
      wicketKeeperId: playerIds.includes(lineup.wicketKeeperId)
        ? lineup.wicketKeeperId
        : "",
    });
  }

  function toggleRole(field, playerId) {
    onChange({ ...lineup, [field]: lineup[field] === playerId ? "" : playerId });
  }

  const captain = players.find((p) => idOf(p) === lineup.captainId);
  const keeper = players.find((p) => idOf(p) === lineup.wicketKeeperId);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1b13]">
      <div className={`h-1 ${tone.bar}`} />
      <div className="flex items-center gap-3 px-5 pb-4 pt-5 sm:px-6">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-black ${tone.badge}`}
        >
          {teamKey}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold tracking-tight">
            {team.name}
          </h2>
          <p className="text-xs text-zinc-500">
            {players.length} available player{players.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black leading-none">{selectedCount}</p>
          <p className="mt-1 text-xs text-zinc-500">selected</p>
        </div>
      </div>

      {players.length === 0 ? (
        <p className="mx-5 mb-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm leading-6 text-amber-200 sm:mx-6">
          No players are assigned to this team yet. Add players in{" "}
          <Link className="font-semibold underline" to="/teams">
            Team Management
          </Link>{" "}
          to continue.
        </p>
      ) : (
        <>
          <ul className="max-h-[26rem] divide-y divide-white/[0.05] overflow-y-auto border-y border-white/[0.06]">
            {players.map((player) => {
              const playerId = idOf(player);
              const selected = lineup.playerIds.includes(playerId);
              const selectedByOpponent = opposingPlayerIds.includes(playerId);

              return (
                <li
                  key={playerId}
                  className={`flex items-center gap-2 pr-4 transition-colors sm:pr-5 ${
                    selected
                      ? "bg-emerald-400/[0.05]"
                      : selectedByOpponent
                        ? "opacity-60"
                        : "hover:bg-white/[0.02]"
                  }`}
                >
                  <label
                    className={`flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 sm:pl-6 ${
                      selectedByOpponent && !selected
                        ? "cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={selectedByOpponent && !selected}
                      onChange={() => togglePlayer(playerId)}
                      className="h-4 w-4 shrink-0 accent-emerald-400"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {playerName(player)}
                      </span>
                      <span className="block text-xs capitalize text-zinc-500">
                        {player.role || player.playingRole || "Player"}
                      </span>
                      {selectedByOpponent && (
                        <span className="block text-xs text-amber-300">
                          Selected for {opposingTeamName}
                        </span>
                      )}
                    </span>
                  </label>
                  {selected && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <RoleButton
                        label="C"
                        title={`Make ${playerName(player)} captain`}
                        active={lineup.captainId === playerId}
                        onClick={() => toggleRole("captainId", playerId)}
                      />
                      <RoleButton
                        label="WK"
                        title={`Make ${playerName(player)} wicket-keeper`}
                        active={lineup.wicketKeeperId === playerId}
                        onClick={() => toggleRole("wicketKeeperId", playerId)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <dl className="grid grid-cols-2 divide-x divide-white/[0.06] text-sm">
            <div className="px-5 py-3 sm:px-6">
              <dt className="text-xs text-zinc-500">Captain</dt>
              <dd
                className={`mt-0.5 truncate font-semibold ${
                  captain ? "text-white" : "text-amber-200"
                }`}
              >
                {captain ? playerName(captain) : "Not chosen"}
              </dd>
            </div>
            <div className="px-5 py-3 sm:px-6">
              <dt className="text-xs text-zinc-500">Wicket-keeper</dt>
              <dd
                className={`mt-0.5 truncate font-semibold ${
                  keeper ? "text-white" : "text-amber-200"
                }`}
              >
                {keeper ? playerName(keeper) : "Not chosen"}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

function ChoiceCard({ name, value, checked, onChange, title, hint }) {
  return (
    <label className="block cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#07130d] px-4 py-4 transition peer-checked:border-emerald-400 peer-checked:bg-emerald-400/[0.08] peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300 hover:border-white/25">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{title}</span>
          {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
        </span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ${
            checked
              ? "bg-emerald-400 text-emerald-950 ring-emerald-300"
              : "ring-white/20"
          }`}
        >
          {checked && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
    </label>
  );
}

/* ---------- page ---------- */

export default function MatchSquadSetup() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [teams, setTeams] = useState([]);
  const [playersByTeam, setPlayersByTeam] = useState({});
  const [lineups, setLineups] = useState({
    A: { playerIds: [], captainId: "", wicketKeeperId: "" },
    B: { playerIds: [], captainId: "", wicketKeeperId: "" },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState("players");
  const [tossWinnerId, setTossWinnerId] = useState("");
  const [tossDecision, setTossDecision] = useState("");
  const [error, setError] = useState("");

  const loadSetup = useCallback(async () => {
    try {
      const [matchResult, playerResult] = await Promise.all([
        apiRequest(`${MATCH_API_URL}/${matchId}`),
        apiRequest(PLAYER_API_URL),
      ]);
      const loadedMatch = matchResult.data;
      const [teamAResult, teamBResult] = await Promise.all([
        apiRequest(`${TEAM_API_URL}/${loadedMatch.teamAId}`),
        apiRequest(`${TEAM_API_URL}/${loadedMatch.teamBId}`),
      ]);
      const loadedTeams = [teamAResult.data, teamBResult.data];
      const availablePlayers = readPlayers(playerResult).filter(
        (player) => player.isActive !== false
      );
      const playerMap = {};

      loadedTeams.forEach((team, index) => {
        const teamPlayers = new Set((team.playerIds || []).map(idOf));
        playerMap[index === 0 ? "A" : "B"] = availablePlayers.filter((player) =>
          teamPlayers.has(idOf(player))
        );
      });

      setMatch(loadedMatch);
      setTeams(loadedTeams);
      setPlayersByTeam(playerMap);
      setLineups({
        A: {
          playerIds: loadedMatch.teamAPlayerIds || [],
          captainId: loadedMatch.teamACaptainId || "",
          wicketKeeperId: loadedMatch.teamAWicketKeeperId || "",
        },
        B: {
          playerIds: loadedMatch.teamBPlayerIds || [],
          captainId: loadedMatch.teamBCaptainId || "",
          wicketKeeperId: loadedMatch.teamBWicketKeeperId || "",
        },
      });
      setTossWinnerId(loadedMatch.tossWinnerId || "");
      setTossDecision(loadedMatch.tossDecision || "");
    } catch (loadError) {
      setError(loadError.message || "Unable to load the match squad setup.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void Promise.resolve().then(loadSetup);
  }, [loadSetup]);

  function updateLineup(teamKey, lineup) {
    setLineups((current) => ({ ...current, [teamKey]: lineup }));
    setError("");
  }

  async function saveLineups(event) {
    event.preventDefault();
    setError("");

    for (const [index, key] of ["A", "B"].entries()) {
      const lineup = lineups[key];
      if (lineup.playerIds.length === 0) {
        setError(`Select at least one player for ${teams[index].name}.`);
        return;
      }
      if (!lineup.captainId || !lineup.wicketKeeperId) {
        setError(`Choose a captain and wicket-keeper for ${teams[index].name}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const result = await apiRequest(`${MATCH_API_URL}/${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({
          teamAPlayerIds: lineups.A.playerIds,
          teamACaptainId: lineups.A.captainId,
          teamAWicketKeeperId: lineups.A.wicketKeeperId,
          teamBPlayerIds: lineups.B.playerIds,
          teamBCaptainId: lineups.B.captainId,
          teamBWicketKeeperId: lineups.B.wicketKeeperId,
        }),
      });
      setMatch(result.data);
      setStep("toss");
    } catch (saveError) {
      setError(saveError.message || "Unable to save match squads.");
    } finally {
      setSaving(false);
    }
  }

  async function saveToss(event) {
    event.preventDefault();
    setError("");

    if (!tossWinnerId || !tossDecision) {
      setError("Select the toss winner and their decision.");
      return;
    }

    const otherTeamId = idOf(teams.find((team) => idOf(team) !== tossWinnerId));
    const battingFirstId = tossDecision === "bat" ? tossWinnerId : otherTeamId;

    setSaving(true);
    try {
      await apiRequest(`${MATCH_API_URL}/${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({
          tossWinnerId,
          tossDecision,
          battingFirstId,
        }),
      });
      navigate(`/matches/${matchId}/scoring`);
    } catch (saveError) {
      setError(saveError.message || "Unable to save toss details.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main
        role="status"
        className="flex min-h-screen items-center justify-center bg-[#07130d] text-zinc-400"
      >
        <LoaderCircle className="mr-3 text-emerald-400 motion-safe:animate-spin" />
        Loading match setup...
      </main>
    );
  }

  if (!match || teams.length !== 2) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130d] px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-400/25 bg-red-400/[0.07] p-6">
          <div className="flex items-start gap-3 text-red-200">
            <CircleAlert size={20} className="mt-0.5 shrink-0" />
            <p role="alert" className="text-sm leading-6">
              {error || "Match or team details could not be loaded."}
            </p>
          </div>
          <Link
            className={`mt-5 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-emerald-300 hover:text-emerald-200 ${focusRing}`}
            to="/home"
          >
            <ArrowLeft size={16} />
            Return home
          </Link>
        </div>
      </main>
    );
  }

  const tossWinner = teams.find((team) => idOf(team) === tossWinnerId);
  const battingFirst =
    tossWinner && tossDecision
      ? tossDecision === "bat"
        ? tossWinner
        : teams.find((team) => idOf(team) !== tossWinnerId)
      : null;
  const missingPlayers = Object.values(playersByTeam).some(
    (players) => players.length === 0
  );

  return (
    <main className="min-h-screen bg-[#07130d] text-white">
      {/* Header with mown-pitch stripes */}
      <div
        className="border-b border-white/[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(16,185,129,0.045) 0, rgba(16,185,129,0.045) 56px, transparent 56px, transparent 112px)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-8">
          <Link
            to="/match-setup"
            className={`inline-flex items-center gap-2 rounded-md text-sm text-zinc-400 transition hover:text-emerald-300 ${focusRing}`}
          >
            <ArrowLeft size={16} />
            New match
          </Link>

          <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
            {match.title}
          </h1>
          <p className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-200">{teams[0].name}</span>
            <Swords size={14} className="text-zinc-600" aria-label="versus" />
            <span className="font-semibold text-zinc-200">{teams[1].name}</span>
          </p>

          <Stepper step={step} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/[0.08] p-4 text-sm text-red-200"
          >
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "players" && (
          <form onSubmit={saveLineups}>
            <p className="mb-5 max-w-2xl text-sm leading-6 text-zinc-400">
              Tick the players taking part in this match, then mark one captain
              (C) and one wicket-keeper (WK) for each team.
            </p>
            <div className="grid gap-5 lg:grid-cols-2">
              <TeamLineup
                team={teams[0]}
                teamKey="A"
                players={playersByTeam.A || []}
                lineup={lineups.A}
                opposingPlayerIds={lineups.B.playerIds.map(String)}
                opposingTeamName={teams[1].name}
                onChange={(lineup) => updateLineup("A", lineup)}
              />
              <TeamLineup
                team={teams[1]}
                teamKey="B"
                players={playersByTeam.B || []}
                lineup={lineups.B}
                opposingPlayerIds={lineups.A.playerIds.map(String)}
                opposingTeamName={teams[0].name}
                onChange={(lineup) => updateLineup("B", lineup)}
              />
            </div>

            <div className="sticky bottom-0 -mx-4 mt-8 border-t border-white/[0.08] bg-[#07130d]/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => navigate("/home")}
                  disabled={saving}
                >
                  Return home
                </button>
                <button
                  type="submit"
                  className={primaryButton}
                  disabled={saving || missingPlayers}
                >
                  {saving ? (
                    <LoaderCircle size={17} className="motion-safe:animate-spin" />
                  ) : (
                    <Users size={17} />
                  )}
                  {saving ? "Saving squads..." : "Save squads and continue"}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === "toss" && (
          <form
            onSubmit={saveToss}
            className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1b13]"
          >
            <div className="border-b border-white/[0.06] px-5 py-5 sm:px-7">
              <h2 className="text-lg font-bold tracking-tight">Record the toss</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Choose who won the toss and what they decided to do.
              </p>
            </div>

            <div className="space-y-7 px-5 py-6 sm:px-7">
              <fieldset>
                <legend className="mb-3 text-sm font-medium text-zinc-300">
                  Toss winner
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {teams.map((team, index) => (
                    <ChoiceCard
                      key={idOf(team)}
                      name="tossWinner"
                      value={idOf(team)}
                      checked={tossWinnerId === idOf(team)}
                      onChange={() => setTossWinnerId(idOf(team))}
                      title={team.name}
                      hint={`Team ${index === 0 ? "A" : "B"}`}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-zinc-300">
                  Decision
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    name="tossDecision"
                    value="bat"
                    checked={tossDecision === "bat"}
                    onChange={() => setTossDecision("bat")}
                    title="Bat first"
                  />
                  <ChoiceCard
                    name="tossDecision"
                    value="bowl"
                    checked={tossDecision === "bowl"}
                    onChange={() => setTossDecision("bowl")}
                    title="Bowl first"
                  />
                </div>
              </fieldset>

              <p
                aria-live="polite"
                className="rounded-xl border border-white/[0.07] bg-[#07130d] px-4 py-3 text-sm text-zinc-400"
              >
                {battingFirst ? (
                  <>
                    <span className="font-semibold text-white">
                      {battingFirst.name}
                    </span>{" "}
                    will bat first.
                  </>
                ) : (
                  "Select a winner and a decision to see who bats first."
                )}
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setStep("players")}
                disabled={saving}
              >
                <ArrowLeft size={16} />
                Edit squads
              </button>
              <button type="submit" className={primaryButton} disabled={saving}>
                {saving ? (
                  <LoaderCircle size={17} className="motion-safe:animate-spin" />
                ) : (
                  <Check size={17} />
                )}
                {saving ? "Saving toss..." : "Save toss"}
              </button>
            </div>
          </form>
        )}

        {step === "complete" && (
          <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-emerald-400/25 bg-[#0c1b13]">
            <div className="h-1 bg-emerald-400" />
            <div className="p-6 sm:p-9">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                <Check size={28} strokeWidth={3} />
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-tight">
                Match is ready to play
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Squads and toss are saved. You can start scoring this match.
              </p>

              <dl className="mt-6 grid divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-[#07130d] text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="px-4 py-3">
                  <dt className="text-xs text-zinc-500">Toss won by</dt>
                  <dd className="mt-0.5 font-semibold">{tossWinner?.name}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-xs text-zinc-500">Decision</dt>
                  <dd className="mt-0.5 font-semibold capitalize">
                    {tossDecision}
                  </dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-xs text-zinc-500">Batting first</dt>
                  <dd className="mt-0.5 font-semibold">{battingFirst?.name}</dd>
                </div>
              </dl>

              <button
                type="button"
                className={`${primaryButton} mt-7`}
                onClick={() => navigate("/home")}
              >
                Return home
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}