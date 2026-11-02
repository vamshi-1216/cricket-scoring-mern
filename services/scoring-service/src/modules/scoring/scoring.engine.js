import {
  isBowlerCredited,
  normalizeScoringEvent,
} from "./scoring.rules.js";

function idString(id) {
  return id ? String(id) : null;
}

function swapEnds(state) {
  [state.strikerId, state.nonStrikerId] = [
    state.nonStrikerId,
    state.strikerId,
  ];
}

function updateFigure(figures, playerId, update) {
  const id = idString(playerId);
  const current = figures.find((figure) => idString(figure.playerId) === id);

  if (current) {
    Object.assign(current, update(current));
    return figures;
  }

  figures.push({ playerId, ...update({}) });
  return figures;
}

export function calculateDelivery(innings, input, { maxLegalBalls, maxWickets }) {
  const event = normalizeScoringEvent(input);
  const state = {
    strikerId: idString(innings.strikerId),
    nonStrikerId: idString(innings.nonStrikerId),
    currentBowlerId: idString(innings.currentBowlerId),
    previousOverBowlerId: idString(innings.previousOverBowlerId),
    runs: innings.runs,
    wickets: innings.wickets,
    legalBalls: innings.legalBalls,
    version: innings.version,
    extras: {
      wides: innings.extras?.wides || 0,
      noBalls: innings.extras?.noBalls || 0,
      byes: innings.extras?.byes || 0,
      legByes: innings.extras?.legByes || 0,
      penaltyRuns: innings.extras?.penaltyRuns || 0,
    },
    battingFigures: (innings.battingFigures || []).map((figure) => ({
      ...figure,
      playerId: idString(figure.playerId),
    })),
    bowlingFigures: (innings.bowlingFigures || []).map((figure) => ({
      ...figure,
      playerId: idString(figure.playerId),
    })),
  };

  const totalRuns =
    event.batRuns +
    event.extras.wides +
    event.extras.noBalls +
    event.extras.byes +
    event.extras.legByes +
    event.extras.penaltyRuns;
  const bowlerRuns =
    event.batRuns + event.extras.wides + event.extras.noBalls;
  const ballsFaced =
    event.eventType !== "WIDE" && event.eventType !== "PENALTY";
  const before = {
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    currentBowlerId: state.currentBowlerId,
    previousOverBowlerId: state.previousOverBowlerId,
    runs: state.runs,
    wickets: state.wickets,
    legalBalls: state.legalBalls,
    version: state.version,
    extras: { ...state.extras },
    status: innings.status,
    awaitingBatter: Boolean(innings.awaitingBatter),
    battingFigures: state.battingFigures.map((figure) => ({ ...figure })),
    bowlingFigures: state.bowlingFigures.map((figure) => ({ ...figure })),
  };

  state.runs += totalRuns;
  for (const [extra, runs] of Object.entries(event.extras)) {
    state.extras[extra] += runs;
  }
  if (event.isLegalBall) state.legalBalls += 1;

  state.battingFigures = updateFigure(
    state.battingFigures,
    state.strikerId,
    (figure) => ({
      runs: (figure.runs || 0) + event.batRuns,
      ballsFaced: (figure.ballsFaced || 0) + Number(ballsFaced),
      fours: (figure.fours || 0) + Number(event.batRuns === 4),
      sixes: (figure.sixes || 0) + Number(event.batRuns === 6),
      dismissalType: figure.dismissalType || null,
      isOut: Boolean(figure.isOut),
    })
  );
  state.bowlingFigures = updateFigure(
    state.bowlingFigures,
    state.currentBowlerId,
    (figure) => ({
      runsConceded: (figure.runsConceded || 0) + bowlerRuns,
      legalBalls: (figure.legalBalls || 0) + Number(event.isLegalBall),
      wickets: figure.wickets || 0,
      wides: (figure.wides || 0) + event.extras.wides,
      noBalls: (figure.noBalls || 0) + event.extras.noBalls,
    })
  );

  if (event.completedRuns % 2 === 1) {
    swapEnds(state);
  }

  if (event.wicket) {
    const dismissedPlayerId = idString(event.wicket.dismissedPlayerId);
    const isRunOut = event.wicket.dismissalType === "RUN_OUT";

    if (isRunOut && event.wicket.crossedBeforeWicket) {
      swapEnds(state);
    }

    if (state.strikerId === dismissedPlayerId) {
      state.strikerId = null;
    } else if (state.nonStrikerId === dismissedPlayerId) {
      state.nonStrikerId = null;
    }

    state.wickets += 1;
    const batter = state.battingFigures.find(
      (figure) => idString(figure.playerId) === dismissedPlayerId
    );
    if (batter) {
      batter.isOut = true;
      batter.dismissalType = event.wicket.dismissalType;
    }

    if (isBowlerCredited(event.wicket.dismissalType)) {
      const bowler = state.bowlingFigures.find(
        (figure) => idString(figure.playerId) === state.currentBowlerId
      );
      if (bowler) bowler.wickets += 1;
    }
  }

  const overEnded = event.isLegalBall && state.legalBalls % 6 === 0;
  if (overEnded) {
    swapEnds(state);
    state.previousOverBowlerId = state.currentBowlerId;
    state.currentBowlerId = null;
  }

  const allOut = state.wickets >= maxWickets;
  const oversComplete = state.legalBalls >= maxLegalBalls;
  const targetReached =
    Number.isInteger(innings.targetRuns) &&
    innings.targetRuns > 0 &&
    state.runs >= innings.targetRuns;
  const completed = allOut || oversComplete || targetReached;

  return {
    state,
    totalRuns,
    bowlerRuns,
    ballsFaced,
    overEnded,
    completed,
    awaitingBatter: Boolean(event.wicket) && !completed,
    dismissalType: event.wicket?.dismissalType || null,
    dismissedPlayerId: event.wicket?.dismissedPlayerId || null,
    beforeState: before,
  };
}
