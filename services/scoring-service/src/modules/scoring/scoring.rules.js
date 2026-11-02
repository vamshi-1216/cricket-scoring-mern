export const DISMISSAL_TYPES = [
  "BOWLED",
  "CAUGHT",
  "LBW",
  "RUN_OUT",
  "STUMPED",
  "HIT_WICKET",
  "OBSTRUCTING_FIELD",
  "HIT_BALL_TWICE",
];

export const BOWLER_CREDITED_DISMISSALS = new Set([
  "BOWLED",
  "CAUGHT",
  "LBW",
  "STUMPED",
  "HIT_WICKET",
]);

export function normalizeScoringEvent(event) {
  const batRuns = event.batRuns ?? 0;
  const extras = {
    wides: event.extras?.wides ?? 0,
    noBalls: event.extras?.noBalls ?? 0,
    byes: event.extras?.byes ?? 0,
    legByes: event.extras?.legByes ?? 0,
    penaltyRuns: event.extras?.penaltyRuns ?? 0,
  };
  const { eventType } = event;

  if (![0, 1, 2, 3, 4, 6].includes(batRuns)) {
    throw new Error("Batter runs must be 0, 1, 2, 3, 4, or 6.");
  }
  if (Object.values(extras).some((runs) => !Number.isInteger(runs) || runs < 0)) {
    throw new Error("Extra runs must be non-negative whole numbers.");
  }
  if (extras.wides > 0 && extras.noBalls > 0) {
    throw new Error("A delivery cannot be both a wide and a no-ball.");
  }
  if (extras.byes > 0 && extras.legByes > 0) {
    throw new Error("A delivery cannot score both byes and leg-byes.");
  }

  if (eventType === "NORMAL") {
    if (extras.wides || extras.noBalls || extras.byes || extras.legByes) {
      throw new Error("Normal deliveries cannot include delivery extras.");
    }
  } else if (eventType === "WIDE") {
    if (extras.wides < 1 || extras.noBalls || extras.byes || extras.legByes || batRuns) {
      throw new Error("A wide must include at least one wide run and no bat runs.");
    }
  } else if (eventType === "NO_BALL") {
    if (extras.noBalls < 1 || extras.wides || extras.byes && extras.legByes) {
      throw new Error("A no-ball must include a no-ball extra and valid additional extras.");
    }
  } else if (eventType === "BYE") {
    if (!extras.byes || extras.wides || extras.noBalls || extras.legByes || batRuns) {
      throw new Error("A bye event must contain bye extras only, apart from penalty runs.");
    }
  } else if (eventType === "LEG_BYE") {
    if (!extras.legByes || extras.wides || extras.noBalls || extras.byes || batRuns) {
      throw new Error("A leg-bye event must contain leg-bye extras only, apart from penalty runs.");
    }
  } else if (eventType === "PENALTY") {
    if (!extras.penaltyRuns || extras.wides || extras.noBalls || extras.byes || extras.legByes || batRuns) {
      throw new Error("A penalty event must contain penalty runs only.");
    }
  } else {
    throw new Error("Unsupported scoring event type.");
  }

  const completedRunLimit =
    batRuns + Math.max(0, extras.wides - 1) + extras.byes + extras.legByes;
  const completedRuns =
    event.completedRuns ??
    (batRuns > 0 && batRuns < 4 ? batRuns : 0) +
      Math.max(0, extras.wides - 1) +
      extras.byes +
      extras.legByes;

  if (
    !Number.isInteger(completedRuns) ||
    completedRuns < 0 ||
    completedRuns > completedRunLimit
  ) {
    throw new Error("Completed runs must be a valid whole number for this event.");
  }
  if (event.wicket && !DISMISSAL_TYPES.includes(event.wicket.dismissalType)) {
    throw new Error("Unsupported dismissal type.");
  }

  return {
    eventType,
    batRuns,
    extras,
    completedRuns,
    wicket: event.wicket || null,
    isLegalBall: ["NORMAL", "BYE", "LEG_BYE"].includes(eventType),
  };
}

export function isBowlerCredited(dismissalType) {
  return BOWLER_CREDITED_DISMISSALS.has(dismissalType);
}

export function deriveOvers(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}
