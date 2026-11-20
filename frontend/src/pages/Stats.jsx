import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

const statsUrl = import.meta.env.VITE_STATS_API_URL ||
  (import.meta.env.DEV ? "http://localhost:4006/api/v1/stats" : "/api/v1/stats");
const teamsUrl = import.meta.env.VITE_TEAM_API_URL || "http://localhost:4004/api/v1/teams";
const playersUrl = import.meta.env.VITE_PLAYER_API_URL || "http://localhost:4002/api/v1/players";
const linkClass = "rounded-lg text-emerald-300 hover:text-emerald-200 focus-visible:outline-2 focus-visible:outline-emerald-300";
const panelClass = "rounded-2xl border border-white/10 bg-zinc-900/60";
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

async function readJson(url, signal) {
  const response = await fetch(url, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    throw new Error(body?.message || "Unable to load match stats.");
  }
  return body;
}

async function loadLabels(match, signal, onTeam, onPlayers) {
  await Promise.allSettled([
    ...match.teamIds.map(async (teamId) => {
      const { data } = await readJson(`${teamsUrl}/${teamId}`, signal);
      const name = data.name || data.shortName;
      if (name && !signal.aborted) onTeam(teamId, name);
    }),
    (async () => {
      const { data } = await readJson(playersUrl, signal);
      if (!signal.aborted) {
        onPlayers(Object.fromEntries(data.players.map((player) => [player._id || player.id, player.name])));
      }
    })(),
  ]);
}

function overs(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function matchTitle(match) {
  return match.title || `Match ${match.matchId.slice(-6)}`;
}

function PlayerFigures({ players, playerNames }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-y border-white/10 bg-zinc-950/60 text-zinc-400">
          <tr>
            <th scope="col" className="px-5 py-3">Player</th>
            <th scope="col" className="px-4 py-3">Playing XI</th>
            <th scope="col" className="px-4 py-3">Runs (balls)</th>
            <th scope="col" className="px-4 py-3">4s / 6s</th>
            <th scope="col" className="px-4 py-3">Wickets / runs</th>
            <th scope="col" className="px-4 py-3">Overs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {players.map(({ playerId, appearance, batting, bowling }) => (
            <tr key={playerId}>
              <th scope="row" className="px-5 py-3 font-medium">
                <Link className={linkClass} to={`/stats?tab=players&player=${playerId}`}>
                  {playerNames[playerId] || `Player ${playerId.slice(-6)}`}
                </Link>
              </th>
              <td className="px-4 py-3 text-zinc-300">{appearance === null ? "Unknown" : appearance ? "Yes" : "No"}</td>
              <td className="px-4 py-3 tabular-nums">{batting ? `${batting.runs}${batting.isOut ? "" : "*"} (${batting.ballsFaced})` : "—"}</td>
              <td className="px-4 py-3 tabular-nums">{batting ? `${batting.fours} / ${batting.sixes}` : "—"}</td>
              <td className="px-4 py-3 tabular-nums">{bowling ? `${bowling.wickets} / ${bowling.runsConceded}` : "—"}</td>
              <td className="px-4 py-3 tabular-nums">{bowling ? overs(bowling.legalBalls) : "—"}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr><td colSpan={6} className="px-5 py-4 text-zinc-400">No player figures recorded.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MatchStats({ match }) {
  const [teamNames, setTeamNames] = useState({});
  const [playerNames, setPlayerNames] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    void loadLabels(match, controller.signal,
      (teamId, name) => setTeamNames((names) => ({ ...names, [teamId]: name })),
      setPlayerNames);
    return () => controller.abort();
  }, [match]);

  const teamName = (id) => teamNames[id] || (id === match.teamIds[0] ? "Team A" : "Team B");
  return (
    <div className="space-y-6">
      <section className={`${panelClass} p-5 sm:p-6`}>
        <p className="text-sm text-zinc-400">{match.format} · {dateFormat.format(new Date(match.result.finalizedAt))}</p>
        <h2 className="mt-2 text-2xl font-bold">
          {match.title || match.teamIds.map(teamName).join(" vs ")}
        </h2>
        <p className="mt-2 font-semibold text-emerald-300">
          {match.result.outcome === "TIE" ? "Match tied" : `${teamName(match.result.winnerTeamId)} won`}
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {match.innings.map((innings) => (
            <div key={innings.inningsId} className="rounded-xl border border-white/10 bg-zinc-950/60 p-4">
              <dt className="font-medium text-zinc-300">{teamName(innings.battingTeamId)}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{innings.runs}/{innings.wickets}
                <span className="ml-3 text-sm font-normal text-zinc-400">{overs(innings.legalBalls)} overs</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {!match.lineups && <p className="text-sm text-zinc-400">The official playing XI is unavailable for this match.</p>}
      {match.teamIds.map((teamId) => (
        <section key={teamId} className={panelClass}>
          <h3 className="px-5 py-4 text-lg font-bold">{teamName(teamId)} player figures</h3>
          <PlayerFigures players={match.players.filter((player) => player.teamId === teamId)} playerNames={playerNames} />
        </section>
      ))}
      <p className="text-sm text-zinc-400">* Batter finished not out.</p>
    </div>
  );
}

function StatsContent({ matchId, cursor }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const suffix = matchId ? `/${encodeURIComponent(matchId)}` :
      (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
    readJson(`${statsUrl}/matches${suffix}`, controller.signal).then(
      (body) => { if (!controller.signal.aborted) setResult(body); },
      (error) => {
        if (!controller.signal.aborted) {
          setResult({ error: error instanceof TypeError ? "Unable to reach the Stats Service." : error.message });
        }
      }
    );
    return () => controller.abort();
  }, [matchId, cursor, attempt]);

  if (!result) return <p role="status" className="text-zinc-400">Loading match stats…</p>;
  if (result.error) {
    return (
      <div className={`${panelClass} p-5`}>
        <p role="alert" className="text-red-300">{result.error}</p>
        <button type="button" className={`mt-3 ${linkClass}`} onClick={() => {
          setResult(null);
          setAttempt((value) => value + 1);
        }}>Retry</button>
      </div>
    );
  }
  if (matchId) return <MatchStats match={result.data} />;
  if (result.data.length === 0) {
    return <p className={`${panelClass} p-5 text-zinc-400`}>No match stats have been imported yet.</p>;
  }
  return (
    <>
      <ul className={`${panelClass} divide-y divide-white/10`}>
        {result.data.map((match) => (
          <li key={match.matchId}>
            <Link to={`/stats/${match.matchId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-5 py-4 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-emerald-300">
              <span className="font-semibold text-emerald-300">{matchTitle(match)}</span>
              <span className="text-sm text-zinc-400">{match.format} · {dateFormat.format(new Date(match.finalizedAt))}</span>
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label="Stats pages" className="mt-5 flex gap-6">
        {cursor && <Link className={linkClass} to="/stats">First page</Link>}
        {result.nextCursor && <Link className={linkClass} to={`?cursor=${result.nextCursor}`}>Next page</Link>}
      </nav>
    </>
  );
}

function useStatsResource(url) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    readJson(url, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) setResult({ url, data });
      },
      (error) => {
        if (!controller.signal.aborted) {
          setResult({ url, error: error instanceof TypeError ? "Unable to connect to the service." : error.message });
        }
      }
    );
    return () => controller.abort();
  }, [url, attempt]);
  return {
    result: result?.url === url ? result : null,
    retry() {
      setResult(null);
      setAttempt((value) => value + 1);
    },
  };
}

const rateFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function formatRate(rate) {
  return rate == null ? "—" : rateFormat.format(rate);
}

const careerFormats = ["TEST", "ODI", "T20", "T10", "CUSTOM"];
const careerFormatLabel = { TEST: "Test", CUSTOM: "Custom" };
const bestBowling = (best) => best ? `${best.wickets}/${best.runs}` : null;
const battingRows = [
  ["Matches", (summary) => summary.appearances],
  ["Innings", ({ batting }) => batting.innings],
  ["Runs", ({ batting }) => batting.runs],
  ["Balls", ({ batting }) => batting.balls],
  ["Highest", ({ batting }) => batting.highest &&
    `${batting.highest.runs}${batting.highest.isOut ? "" : "*"}`],
  ["Average", ({ batting }) => formatRate(batting.average)],
  ["Strike rate", ({ batting }) => formatRate(batting.strikeRate)],
  ["Not outs", ({ batting }) => batting.notOuts],
  ["Fours", ({ batting }) => batting.fours],
  ["Sixes", ({ batting }) => batting.sixes],
  ["Ducks", ({ batting }) => batting.ducks],
  ["50s", ({ batting }) => batting.fifties],
  ["100s", ({ batting }) => batting.hundreds],
  ["200s", ({ batting }) => batting.doubleHundreds],
  ["300s", ({ batting }) => batting.tripleHundreds],
  ["400s", ({ batting }) => batting.quadrupleHundreds],
];
const bowlingRows = [
  ["Matches", (summary) => summary.appearances],
  ["Innings", ({ bowling }) => bowling.innings],
  ["Balls", ({ bowling }) => bowling.balls],
  ["Runs conceded", ({ bowling }) => bowling.runs],
  ["Maidens", ({ bowling }) => bowling.maidens],
  ["Wickets", ({ bowling }) => bowling.wickets],
  ["Average", ({ bowling }) => formatRate(bowling.average)],
  ["Economy", ({ bowling }) => formatRate(bowling.economy)],
  ["Strike rate", ({ bowling }) => formatRate(bowling.strikeRate)],
  ["Best innings", ({ bowling }) => bestBowling(bowling.best)],
  ["Best match", ({ bowling }) => bestBowling(bowling.best)],
  ["4 wickets", ({ bowling }) => bowling.fourWicketHauls],
  ["5+ wickets", ({ bowling }) => bowling.fiveWicketHauls],
  ["10 wickets in a match", ({ bowling }) => bowling.tenWicketMatches],
];

function CareerTable({ title, columns, rows }) {
  return (
    <div className={`${panelClass} overflow-x-auto`}>
      <table className="w-full border-collapse text-left text-sm tabular-nums">
        <caption className="bg-emerald-400/10 px-4 py-3 text-left font-bold text-emerald-100">
          {title}
        </caption>
        <thead className="bg-black/20 text-xs font-semibold text-zinc-300">
          <tr>
            <th scope="col" className="whitespace-nowrap px-4 py-2">Statistic</th>
            {columns.map(([label]) => (
              <th key={label} scope="col" className="whitespace-nowrap px-3 py-2 text-right">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map(([label, read]) => (
            <tr key={label} className="odd:bg-white/[0.025]">
              <th scope="row" className="min-w-28 px-4 py-1.5 font-medium text-zinc-300">{label}</th>
              {columns.map(([format, summary]) => (
                <td key={format} className="border-l border-white/10 px-3 py-1.5 text-right text-zinc-100">
                  {read(summary) ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerStats({ playerId, onSelect }) {
  const [search, setSearch] = useState("");
  const players = useStatsResource(playersUrl);
  const summary = useStatsResource(playerId ? `${statsUrl}/players/${encodeURIComponent(playerId)}` : null);
  const directory = players.result?.data?.players || [];
  const query = search.trim().toLowerCase();
  const matches = directory.filter((player) => player.name.toLowerCase().includes(query));
  const selectedPlayer = directory.find((player) => (player._id || player.id) === playerId);
  const showSelected = playerId && !matches.some((player) => (player._id || player.id) === playerId);
  const data = summary.result?.data;
  const formats = data?.byFormat ?? {};
  const columns = data ? [
    ["All", data],
    ...careerFormats.filter((format) => formats[format])
      .map((format) => [careerFormatLabel[format] ?? format, formats[format]]),
  ] : [];

  return (
    <div className="space-y-6">
      <div className={`${panelClass} p-5 sm:p-6`}>
        <label htmlFor="stats-player-search" className="block font-semibold">Search players</label>
        <input
          id="stats-player-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
          aria-controls="stats-player"
          className="mt-2 mb-4 block w-full max-w-md rounded-lg border border-white/15 bg-zinc-950 px-3 py-2.5 text-white focus-visible:outline-2 focus-visible:outline-emerald-300"
        />
        <label htmlFor="stats-player" className="block font-semibold">Player</label>
        <select
          id="stats-player"
          value={playerId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={!players.result?.data && !playerId}
          className="mt-2 w-full max-w-md rounded-lg border border-white/15 bg-zinc-950 px-3 py-2.5 text-white focus-visible:outline-2 focus-visible:outline-emerald-300"
        >
          <option value="">{players.result ? "Select a player" : "Loading players…"}</option>
          {showSelected && <option value={playerId}>{selectedPlayer?.name || `Player ${playerId.slice(-6)}`}</option>}
          {matches.map((player) => (
            <option key={player._id || player.id} value={player._id || player.id}>{player.name}</option>
          ))}
        </select>
        {query && players.result?.data && matches.length === 0 && (
          <p role="status" className="mt-3 text-sm text-zinc-400">No players match your search.</p>
        )}
        {players.result?.error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            Unable to load players. <button type="button" className={linkClass} onClick={players.retry}>Retry</button>
          </p>
        )}
        {players.result?.data && !directory.length && !playerId && (
          <p className="mt-3 text-sm text-zinc-400">No players are registered yet.</p>
        )}
        <p className="mt-3 text-sm text-zinc-400">Career tables use imported completed matches. Match counts use confirmed playing XIs.</p>
      </div>
      {playerId && !summary.result && <p role="status" className="text-zinc-400">Loading player stats…</p>}
      {summary.result?.error && (
        <div className={`${panelClass} p-5`}>
          <p role="alert" className="text-red-300">{summary.result.error}</p>
          <button type="button" className={`mt-3 ${linkClass}`} onClick={summary.retry}>Retry</button>
        </div>
      )}
      {data?.importedMatches === 0 && (
        <p className={`${panelClass} p-5 text-zinc-400`}>No match stats have been imported for this player yet.</p>
      )}
      {data?.importedMatches > 0 && (
        <>
          {data.unknownAppearances > 0 && (
            <p className="text-sm text-zinc-400">Playing XI unavailable for {data.unknownAppearances} imported {data.unknownAppearances === 1 ? "match" : "matches"}.</p>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <CareerTable title="Batting career summary" columns={columns} rows={battingRows} />
            <CareerTable title="Bowling career summary" columns={columns} rows={bowlingRows} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Stats() {
  const { matchId } = useParams();
  const [params, setParams] = useSearchParams();
  const cursor = params.get("cursor");
  const showPlayers = !matchId && params.get("tab") === "players";
  const playerId = params.get("player") || "";
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-7 border-b border-white/10 pb-6">
          <Link className={linkClass} to={matchId ? "/stats" : "/matches"}>
            {matchId ? "All match stats" : "Matches"}
          </Link>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            {showPlayers ? "Player stats" : "Match stats"}
          </h1>
          {!matchId && (
            <nav aria-label="Stats views" className="mt-5 flex gap-3">
              {[["/stats", "Match stats", !showPlayers], ["/stats?tab=players", "Player stats", showPlayers]].map(([to, label, active]) => (
                <Link key={to} to={to} aria-current={active ? "page" : undefined}
                  className={`rounded-lg border px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-emerald-300 ${active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-zinc-300 hover:bg-white/5"}`}>
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </header>
        {showPlayers ? (
          <PlayerStats playerId={playerId} onSelect={(player) => setParams(player ? { tab: "players", player } : { tab: "players" })} />
        ) : (
          <StatsContent key={matchId || cursor || "first"} matchId={matchId} cursor={cursor} />
        )}
      </div>
    </main>
  );
}
