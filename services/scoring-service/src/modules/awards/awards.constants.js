export const AWARDS_SCORING_VERSION = 1;

export const AWARD_POINTS = {
  batting: {
    perRun: 1,
    perFour: 1,
    perSix: 2,
    halfCentury: 10,
    century: 20,
    notOut: 5,
    strikeRateMinimumBalls: 10,
    strikeRateTiers: [
      { minimum: 200, points: 15 },
      { minimum: 150, points: 10 },
      { minimum: 100, points: 5 },
    ],
  },
  bowling: {
    perWicket: 20,
    perDotBall: 1,
    perMaidenOver: 12,
    economyMinimumLegalBalls: 12,
    economyTiers: [
      { maximum: 4, points: 15 },
      { maximum: 5, points: 10 },
      { maximum: 6, points: 5 },
      { maximum: 10, inclusive: true, points: 0 },
      { maximum: Infinity, points: -5 },
    ],
    perWide: -2,
    perNoBall: -2,
  },
  fielding: {
    catch: 8,
    stumping: 12,
    assistedRunOut: 8,
    directHitRunOut: 12,
  },
};

export const AWARD_DISMISSALS = {
  CAUGHT: "CAUGHT",
  STUMPED: "STUMPED",
  RUN_OUT: "RUN_OUT",
};
