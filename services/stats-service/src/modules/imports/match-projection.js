import { ServiceError } from "../../utils/service-error.js";

export const objectIdPattern = /^[a-f\d]{24}$/i;

function requireSource(condition, message) {
  if (!condition) {
    throw new ServiceError(message, 409, "INCONSISTENT_MATCH_SOURCE");
  }
}

export function getMatchSnapshot(match, matchId) {
  const result = match?._id === matchId ? match.result : null;
  const teamIds = [match?.teamAId, match?.teamBId];
  requireSource(
    match?.status === "completed" &&
      match.inningsPerTeam === 1 &&
      match.format !== "TEST" &&
      teamIds.every((id) => typeof id === "string" && objectIdPattern.test(id)) &&
      teamIds[0] !== teamIds[1] &&
      typeof result?.finalizedAt === "string" &&
      Number.isFinite(Date.parse(result.finalizedAt)) &&
      ((result.outcome === "WIN" && teamIds.includes(result.winnerTeamId)) ||
        (result.outcome === "TIE" && result.winnerTeamId === null)),
    "Match must have a finalized limited-overs win or tie."
  );

  const xi = match.playingXI;
  const lineups = xi?.isConfirmed ? [xi.teamAPlayerIds, xi.teamBPlayerIds] : null;
  if (lineups) {
    requireSource(
      lineups.every((ids) => Array.isArray(ids) && ids.length > 0 &&
        ids.every((id) => typeof id === "string" && objectIdPattern.test(id))) &&
        new Set(lineups.flat()).size === lineups[0].length + lineups[1].length &&
        Number.isSafeInteger(xi.revision) && xi.revision > 0,
      "Confirmed playing XI is invalid."
    );
  }

  return {
    matchId,
    title: typeof match.title === "string" ? match.title : null,
    format: match.format,
    teamIds,
    result: {
      outcome: result.outcome,
      winnerTeamId: result.winnerTeamId,
      finalizedAt: result.finalizedAt,
    },
    lineups: lineups?.map((ids) => [...ids].sort()) ?? null,
    playingXIRevision: lineups ? xi.revision : null,
  };
}

function count(value) {
  requireSource(Number.isSafeInteger(value) && value >= 0, "Invalid scoring total.");
  return value;
}

export function buildMatchProjection(match, inningsSources) {
  const players = new Map();
  function player(playerId, teamId) {
    requireSource(typeof playerId === "string" && objectIdPattern.test(playerId),
      "Invalid scoring player ID.");
    if (!players.has(playerId)) {
      players.set(playerId, {
        playerId,
        teamId,
        appearance: match.lineups ? match.lineups[match.teamIds.indexOf(teamId)].includes(playerId) : null,
        batting: null,
        bowling: null,
      });
    }
    const entry = players.get(playerId);
    requireSource(entry.teamId === teamId, "Player is attributed to both teams.");
    return entry;
  }

  match.lineups?.forEach((ids, index) => {
    ids.forEach((id) => player(id, match.teamIds[index]));
  });

  const innings = inningsSources.map(({ source, deliveries }, index) => {
    const { battingTeamId, bowlingTeamId } = source;
    requireSource(source.inningsNumber === index + 1 &&
      match.teamIds.includes(battingTeamId) && match.teamIds.includes(bowlingTeamId) &&
      battingTeamId !== bowlingTeamId &&
      Array.isArray(source.battingFigures) && Array.isArray(source.bowlingFigures),
      "Invalid innings teams or figures.");
    const bowlers = new Map();
    const maidens = new Map();
    let maidenDataAvailable = true;
    let overBowlers = new Set();
    let overBowlerRuns = 0;
    const dismissals = new Map();
    const batters = new Set();
    let runs = 0;
    let legalBalls = 0;
    for (const [deliveryIndex, delivery] of deliveries.entries()) {
      requireSource(delivery.sequence === deliveryIndex + 1 &&
        typeof delivery.isLegalBall === "boolean", "Delivery history is incomplete.");
      runs += count(delivery.totalRuns);
      const batRuns = delivery.batRuns;
      const wides = delivery.extras?.wides ?? 0;
      const noBalls = delivery.extras?.noBalls ?? 0;
      maidenDataAvailable &&= Number.isSafeInteger(batRuns) &&
        Number.isSafeInteger(wides) && Number.isSafeInteger(noBalls);
      overBowlers.add(delivery.bowlerId);
      overBowlerRuns += (batRuns ?? 0) + wides + noBalls;
      legalBalls += Number(delivery.isLegalBall);
      if (delivery.isLegalBall && legalBalls % 6 === 0) {
        if (overBowlers.size === 1 && overBowlerRuns === 0) {
          maidens.set(delivery.bowlerId, (maidens.get(delivery.bowlerId) ?? 0) + 1);
        }
        overBowlers = new Set();
        overBowlerRuns = 0;
      }
      batters.add(delivery.strikerId);
      batters.add(delivery.nonStrikerId);
      bowlers.set(delivery.bowlerId,
        (bowlers.get(delivery.bowlerId) ?? 0) + Number(delivery.isLegalBall));
      if (delivery.dismissedPlayerId) {
        requireSource(
          !dismissals.has(delivery.dismissedPlayerId) &&
            typeof delivery.dismissalType === "string" &&
            [delivery.strikerId, delivery.nonStrikerId].includes(delivery.dismissedPlayerId),
          "Invalid delivery dismissal."
        );
        dismissals.set(delivery.dismissedPlayerId, delivery.dismissalType);
      }
    }
    const wickets = count(source.wickets);
    requireSource(runs === source.runs && legalBalls === source.legalBalls &&
      dismissals.size === wickets, "Delivery totals disagree with the innings scorecard.");

    for (const figure of source.battingFigures) {
      const entry = player(figure.playerId, battingTeamId);
      requireSource(!entry.batting, "Duplicate batting figure.");
      entry.batting = {
        runs: count(figure.runs),
        ballsFaced: count(figure.ballsFaced),
        fours: count(figure.fours),
        sixes: count(figure.sixes),
        isOut: dismissals.has(figure.playerId) || figure.isOut === true,
        dismissalType: dismissals.get(figure.playerId) ?? figure.dismissalType ?? null,
      };
    }
    for (const playerId of batters) {
      const entry = player(playerId, battingTeamId);
      entry.batting ??= {
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0,
        isOut: dismissals.has(playerId),
        dismissalType: dismissals.get(playerId) ?? null,
      };
    }
    for (const figure of source.bowlingFigures) {
      if (!bowlers.has(figure.playerId)) continue;
      const entry = player(figure.playerId, bowlingTeamId);
      const bowledBalls = bowlers.get(figure.playerId);
      requireSource(!entry.bowling && figure.legalBalls === bowledBalls,
        "Bowling figure disagrees with delivery history.");
      entry.bowling = {
        runsConceded: count(figure.runsConceded),
        legalBalls: bowledBalls,
        wickets: count(figure.wickets),
        ...(maidenDataAvailable ? { maidens: maidens.get(figure.playerId) ?? 0 } : {}),
      };
      bowlers.delete(figure.playerId);
    }
    requireSource(bowlers.size === 0, "Missing bowling figures.");

    return {
      inningsId: source._id, inningsNumber: source.inningsNumber,
      sourceRevision: source.sourceRevision, battingTeamId, bowlingTeamId,
      runs, wickets, legalBalls,
    };
  });

  requireSource(innings.length === 2 && innings[0].battingTeamId !== innings[1].battingTeamId,
    "Expected one completed innings per team.");
  const [first, second] = innings;
  const winnerTeamId = first.runs === second.runs ? null :
    (first.runs > second.runs ? first.battingTeamId : second.battingTeamId);
  requireSource(winnerTeamId === match.result.winnerTeamId,
    "Official result disagrees with the innings scores.");

  return {
    schemaVersion: 1,
    ...match,
    innings,
    players: [...players.values()].sort((a, b) => a.playerId.localeCompare(b.playerId)),
  };
}
