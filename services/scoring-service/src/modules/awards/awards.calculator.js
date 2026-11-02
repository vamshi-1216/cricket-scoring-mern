import {
  AWARD_DISMISSALS,
  AWARD_POINTS,
  AWARDS_SCORING_VERSION,
} from "./awards.constants.js";
import { isBowlerCredited } from "../scoring/scoring.rules.js";

function idString(id) {
  return id ? String(id).toLowerCase() : "";
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function createPlayerMap(match) {
  const players = new Map();
  const squads = [
    [match.teamAId, match.teamAPlayerIds],
    [match.teamBId, match.teamBPlayerIds],
  ];

  for (const [teamId, playerIds] of squads) {
    const teamKey = idString(teamId);
    if (!teamKey || !Array.isArray(playerIds)) continue;

    for (const playerId of playerIds) {
      const playerKey = idString(playerId);
      if (!playerKey || players.has(playerKey)) return null;
      players.set(playerKey, { playerId: playerKey, teamId: teamKey });
    }
  }

  return players;
}

function validInnings(match, innings) {
  if (
    !Array.isArray(innings) ||
    innings.length !== 2 ||
    innings[0]?.inningsNumber !== 1 ||
    innings[1]?.inningsNumber !== 2 ||
    innings.some(
      (item) =>
        item.status !== "COMPLETED" ||
        idString(item.matchId) !== idString(match._id)
    )
  ) {
    return false;
  }

  const teamAId = idString(match.teamAId);
  const teamBId = idString(match.teamBId);
  const [first, second] = innings;
  const firstBattingTeamId = idString(first.battingTeamId);
  const firstBowlingTeamId = idString(first.bowlingTeamId);

  return Boolean(
    teamAId &&
      teamBId &&
      teamAId !== teamBId &&
      [teamAId, teamBId].includes(firstBattingTeamId) &&
      [teamAId, teamBId].includes(firstBowlingTeamId) &&
      firstBattingTeamId !== firstBowlingTeamId &&
      idString(second.battingTeamId) === firstBowlingTeamId &&
      idString(second.bowlingTeamId) === firstBattingTeamId
  );
}

function ensurePerformance(playerMap, performances, playerId, expectedTeamId) {
  const playerKey = idString(playerId);
  const player = playerMap.get(playerKey);
  if (!player || (expectedTeamId && player.teamId !== idString(expectedTeamId))) {
    return null;
  }

  let performance = performances.get(playerKey);
  if (!performance) {
    performance = {
      ...player,
      batting: {
        runs: 0,
        boundaryBonus: 0,
        milestoneBonus: 0,
        strikeRateBonus: 0,
        notOutBonus: 0,
        ballsFaced: 0,
      },
      bowling: {
        wickets: 0,
        dotBalls: 0,
        maidenOvers: 0,
        economyBonus: 0,
        extrasPenalty: 0,
        legalBalls: 0,
        runsConceded: 0,
        deliveries: 0,
      },
      fieldingPoints: 0,
    };
    performances.set(playerKey, performance);
  }

  return performance;
}

function addBattingPoints(innings, playerMap, performances) {
  for (const figure of innings.battingFigures || []) {
    const performance = ensurePerformance(
      playerMap,
      performances,
      figure.playerId,
      innings.battingTeamId
    );
    if (!performance) continue;

    const runs = numberOrZero(figure.runs);
    const ballsFaced = numberOrZero(figure.ballsFaced);
    const fours = numberOrZero(figure.fours);
    const sixes = numberOrZero(figure.sixes);
    const batting = performance.batting;
    const boundaryBonus =
      fours * AWARD_POINTS.batting.perFour +
      sixes * AWARD_POINTS.batting.perSix;
    const milestoneBonus =
      runs >= 100
        ? AWARD_POINTS.batting.century
        : runs >= 50
          ? AWARD_POINTS.batting.halfCentury
          : 0;
    const strikeRate =
      ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0;
    const strikeRateBonus =
      ballsFaced >= AWARD_POINTS.batting.strikeRateMinimumBalls
        ? AWARD_POINTS.batting.strikeRateTiers.find(
            (tier) => strikeRate >= tier.minimum
          )?.points || 0
        : 0;
    const notOutBonus =
      ballsFaced > 0 && !figure.isOut ? AWARD_POINTS.batting.notOut : 0;

    batting.runs += runs;
    batting.boundaryBonus += boundaryBonus;
    batting.milestoneBonus += milestoneBonus;
    batting.strikeRateBonus += strikeRateBonus;
    batting.notOutBonus += notOutBonus;
    batting.ballsFaced += ballsFaced;
  }
}

function getDeliveryKey(delivery) {
  const inningsId = idString(delivery.inningsId);
  if (inningsId && Number.isInteger(delivery.sequence)) {
    return `${inningsId}:${delivery.sequence}`;
  }
  return idString(delivery._id) || null;
}

function getBowlerRunsConceded(delivery) {
  const extras = delivery.extras || {};
  return (
    numberOrZero(delivery.batRuns) +
    numberOrZero(extras.wides) +
    numberOrZero(extras.noBalls)
  );
}

function addBowlingAndFieldingPoints(innings, deliveries, playerMap, performances) {
  const inningsById = new Map(innings.map((item) => [idString(item._id), item]));
  const seenDeliveryKeys = new Set();
  const overGroups = new Map();
  const legalBallsByInnings = new Map();
  const uniqueDeliveries = [...(deliveries || [])].sort((left, right) => {
    const leftInnings = inningsById.get(idString(left.inningsId));
    const rightInnings = inningsById.get(idString(right.inningsId));
    return (
      (leftInnings?.inningsNumber || 0) - (rightInnings?.inningsNumber || 0) ||
      numberOrZero(left.sequence) - numberOrZero(right.sequence)
    );
  });

  for (const delivery of uniqueDeliveries) {
    const inningsId = idString(delivery.inningsId);
    const inningsItem = inningsById.get(inningsId);
    const key = getDeliveryKey(delivery);
    if (!inningsItem || !key || seenDeliveryKeys.has(key)) continue;
    seenDeliveryKeys.add(key);

    const bowlerKey = idString(delivery.bowlerId);
    const performance = ensurePerformance(
      playerMap,
      performances,
      bowlerKey,
      inningsItem.bowlingTeamId
    );
    const legalBallsBefore = legalBallsByInnings.get(inningsId) || 0;
    const overNumber = Math.floor(legalBallsBefore / 6);
    const overKey = `${inningsId}:${overNumber}`;
    let over = overGroups.get(overKey);
    if (!over) {
      over = { inningsId, legalBalls: 0, bowlers: new Map() };
      overGroups.set(overKey, over);
    }

    const runsConceded = getBowlerRunsConceded(delivery);
    const extras = delivery.extras || {};
    const legalBall = delivery.isLegalBall === true;

    if (performance) {
      const bowling = performance.bowling;
      bowling.deliveries += 1;
      bowling.runsConceded += runsConceded;
      bowling.legalBalls += Number(legalBall);
      bowling.extrasPenalty +=
        Number(numberOrZero(extras.wides) > 0) * AWARD_POINTS.bowling.perWide +
        Number(numberOrZero(extras.noBalls) > 0) * AWARD_POINTS.bowling.perNoBall;

      if (legalBall && numberOrZero(delivery.totalRuns) === 0) {
        bowling.dotBalls += 1;
      }
      if (delivery.dismissalType && isBowlerCredited(delivery.dismissalType)) {
        bowling.wickets += 1;
      }
    }

    const bowlerOver = over.bowlers.get(bowlerKey) || {
      runsConceded: 0,
      legalBalls: 0,
    };
    bowlerOver.runsConceded += runsConceded;
    bowlerOver.legalBalls += Number(legalBall);
    over.bowlers.set(bowlerKey, bowlerOver);
    over.legalBalls += Number(legalBall);

    if (legalBall) {
      legalBallsByInnings.set(inningsId, legalBallsBefore + 1);
    }

    addFieldingPoints(
      delivery,
      inningsItem.bowlingTeamId,
      playerMap,
      performances
    );
  }

  for (const over of overGroups.values()) {
    if (over.legalBalls !== 6 || over.bowlers.size !== 1) continue;
    const [bowlerKey, bowlerOver] = over.bowlers.entries().next().value;
    if (bowlerOver.runsConceded !== 0) continue;
    const inningsItem = inningsById.get(over.inningsId);
    const performance = ensurePerformance(
      playerMap,
      performances,
      bowlerKey,
      inningsItem?.bowlingTeamId
    );
    if (performance) performance.bowling.maidenOvers += 1;
  }

  for (const performance of performances.values()) {
    const bowling = performance.bowling;
    if (bowling.legalBalls < AWARD_POINTS.bowling.economyMinimumLegalBalls) continue;
    const economy = bowling.runsConceded / (bowling.legalBalls / 6);
    const tier = AWARD_POINTS.bowling.economyTiers.find(
      (item) =>
        economy < item.maximum ||
        (item.inclusive && economy === item.maximum)
    );
    bowling.economyBonus = tier?.points || 0;
  }
}

function addFieldingPoints(delivery, fieldingTeamId, playerMap, performances) {
  const attribution = delivery.fieldingAttribution;
  const dismissalType = delivery.dismissalType;
  const fielderIds = attribution?.fielderIds;
  if (!Array.isArray(fielderIds) || fielderIds.length === 0) return;

  const uniqueFielderIds = [...new Set(fielderIds.map(idString).filter(Boolean))];
  if (
    uniqueFielderIds.some((fielderId) => {
      const fielder = playerMap.get(fielderId);
      return !fielder || fielder.teamId !== idString(fieldingTeamId);
    })
  ) {
    return;
  }
  if (dismissalType === AWARD_DISMISSALS.CAUGHT && uniqueFielderIds.length === 1) {
    const performance = ensurePerformance(
      playerMap,
      performances,
      uniqueFielderIds[0],
      fieldingTeamId
    );
    if (performance) performance.fieldingPoints += AWARD_POINTS.fielding.catch;
  } else if (
    dismissalType === AWARD_DISMISSALS.STUMPED &&
    uniqueFielderIds.length === 1
  ) {
    const performance = ensurePerformance(
      playerMap,
      performances,
      uniqueFielderIds[0],
      fieldingTeamId
    );
    if (performance) performance.fieldingPoints += AWARD_POINTS.fielding.stumping;
  } else if (dismissalType === AWARD_DISMISSALS.RUN_OUT) {
    const totalPoints =
      attribution.runOutType === "DIRECT_HIT"
        ? AWARD_POINTS.fielding.directHitRunOut
        : attribution.runOutType === "ASSISTED"
          ? AWARD_POINTS.fielding.assistedRunOut
          : 0;
    if (!totalPoints) return;

    const eligibleFielders = uniqueFielderIds.filter(
      (fielderId) => fielderId !== idString(delivery.dismissedPlayerId)
    );
    if (!eligibleFielders.length) return;
    const pointsPerFielder = totalPoints / eligibleFielders.length;
    for (const fielderId of eligibleFielders) {
      const performance = ensurePerformance(
        playerMap,
        performances,
        fielderId,
        fieldingTeamId
      );
      if (performance) performance.fieldingPoints += pointsPerFielder;
    }
  }
}

function battingPoints(batting) {
  return (
    batting.runs * AWARD_POINTS.batting.perRun +
    batting.boundaryBonus +
    batting.milestoneBonus +
    batting.strikeRateBonus +
    batting.notOutBonus
  );
}

function bowlingPoints(bowling) {
  return (
    bowling.wickets * AWARD_POINTS.bowling.perWicket +
    bowling.dotBalls * AWARD_POINTS.bowling.perDotBall +
    bowling.maidenOvers * AWARD_POINTS.bowling.perMaidenOver +
    bowling.economyBonus +
    bowling.extrasPenalty
  );
}

function winners(candidates) {
  const positive = candidates.filter(
    (candidate) => Number.isFinite(candidate.points) && candidate.points > 0
  );
  if (positive.length === 0) return [];
  const highest = Math.max(...positive.map((candidate) => candidate.points));
  return positive
    .filter((candidate) => candidate.points === highest)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

export function calculateMatchAwards({ match, innings, deliveries }) {
  if (
    !match ||
    match.result?.outcome === "NO_RESULT" ||
    !validInnings(match, innings)
  ) {
    return null;
  }

  const playerMap = createPlayerMap(match);
  if (!playerMap) return null;

  const performances = new Map();
  for (const item of innings) {
    addBattingPoints(item, playerMap, performances);
  }
  addBowlingAndFieldingPoints(innings, deliveries, playerMap, performances);

  const allPlayers = [...performances.values()];
  const manOfTheMatch = winners(
    allPlayers.map((performance) => ({
      playerId: performance.playerId,
      teamId: performance.teamId,
      points:
        battingPoints(performance.batting) +
        bowlingPoints(performance.bowling) +
        performance.fieldingPoints,
      breakdown: {
        battingPoints: battingPoints(performance.batting),
        bowlingPoints: bowlingPoints(performance.bowling),
        fieldingPoints: performance.fieldingPoints,
      },
    }))
  );

  const bestBatsman = winners(
    allPlayers
      .filter((performance) => performance.batting.ballsFaced > 0)
      .map((performance) => ({
        playerId: performance.playerId,
        teamId: performance.teamId,
        points: battingPoints(performance.batting),
        breakdown: {
          runs: performance.batting.runs,
          boundaryBonus: performance.batting.boundaryBonus,
          milestoneBonus: performance.batting.milestoneBonus,
          strikeRateBonus: performance.batting.strikeRateBonus,
          notOutBonus: performance.batting.notOutBonus,
        },
      }))
  );

  const bestBowler = winners(
    allPlayers
      .filter((performance) => performance.bowling.deliveries > 0)
      .map((performance) => ({
        playerId: performance.playerId,
        teamId: performance.teamId,
        points: bowlingPoints(performance.bowling),
        breakdown: {
          wickets: performance.bowling.wickets,
          dotBalls: performance.bowling.dotBalls,
          maidenOvers: performance.bowling.maidenOvers,
          economyBonus: performance.bowling.economyBonus,
          extrasPenalty: performance.bowling.extrasPenalty,
        },
      }))
  );

  return {
    scoringVersion: AWARDS_SCORING_VERSION,
    manOfTheMatch,
    bestBatsman,
    bestBowler,
  };
}
