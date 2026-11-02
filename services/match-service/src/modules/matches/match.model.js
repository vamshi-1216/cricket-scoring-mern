import mongoose from "mongoose";

const resultMarginSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["RUNS", "WICKETS"],
      required: true,
    },
    value: {
      type: Number,
      min: 1,
      validate: Number.isInteger,
      required: true,
    },
  },
  { _id: false }
);

const manOfTheMatchBreakdownSchema = new mongoose.Schema(
  {
    battingPoints: { type: Number, validate: Number.isFinite, required: true },
    bowlingPoints: { type: Number, validate: Number.isFinite, required: true },
    fieldingPoints: { type: Number, validate: Number.isFinite, required: true },
  },
  { _id: false }
);

const bestBatsmanBreakdownSchema = new mongoose.Schema(
  {
    runs: { type: Number, validate: Number.isFinite, required: true },
    boundaryBonus: { type: Number, validate: Number.isFinite, required: true },
    milestoneBonus: { type: Number, validate: Number.isFinite, required: true },
    strikeRateBonus: { type: Number, validate: Number.isFinite, required: true },
    notOutBonus: { type: Number, validate: Number.isFinite, required: true },
  },
  { _id: false }
);

const bestBowlerBreakdownSchema = new mongoose.Schema(
  {
    wickets: { type: Number, validate: Number.isFinite, required: true },
    dotBalls: { type: Number, validate: Number.isFinite, required: true },
    maidenOvers: { type: Number, validate: Number.isFinite, required: true },
    economyBonus: { type: Number, validate: Number.isFinite, required: true },
    extrasPenalty: { type: Number, validate: Number.isFinite, required: true },
  },
  { _id: false }
);

function createAwardWinnerSchema(breakdownSchema) {
  return new mongoose.Schema(
    {
      playerId: { type: mongoose.Schema.Types.ObjectId, required: true },
      teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
      points: {
        type: Number,
        min: Number.MIN_VALUE,
        validate: Number.isFinite,
        required: true,
      },
      breakdown: { type: breakdownSchema, required: true },
    },
    { _id: false }
  );
}

const awardsSchema = new mongoose.Schema(
  {
    scoringVersion: {
      type: Number,
      min: 1,
      validate: Number.isInteger,
      required: true,
    },
    calculatedAt: { type: Date, required: true },
    manOfTheMatch: {
      type: [createAwardWinnerSchema(manOfTheMatchBreakdownSchema)],
      default: [],
    },
    bestBatsman: {
      type: [createAwardWinnerSchema(bestBatsmanBreakdownSchema)],
      default: [],
    },
    bestBowler: {
      type: [createAwardWinnerSchema(bestBowlerBreakdownSchema)],
      default: [],
    },
  },
  { _id: false }
);

const matchResultSchema = new mongoose.Schema(
  {
    outcome: {
      type: String,
      enum: ["WIN", "TIE", "NO_RESULT"],
      required: true,
    },
    winnerTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    margin: {
      type: resultMarginSchema,
      default: null,
    },
    finalizedAt: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    awards: {
      type: awardsSchema,
      default: null,
    },
  },
  { _id: false }
);

matchResultSchema.pre("validate", function validateResult(next) {
  if (this.outcome === "WIN") {
    if (!this.winnerTeamId) {
      this.invalidate("winnerTeamId", "A winning result requires a winner.");
    }
    if (!this.margin) {
      this.invalidate("margin", "A winning result requires a margin.");
    }
  } else {
    if (this.winnerTeamId) {
      this.invalidate("winnerTeamId", "A tie or no-result cannot have a winner.");
    }
    if (this.margin) {
      this.invalidate("margin", "A tie or no-result cannot have a margin.");
    }
  }

  if (this.outcome === "NO_RESULT" && !this.reason?.trim()) {
    this.invalidate("reason", "A no-result requires a reason.");
  }
  if (this.outcome === "NO_RESULT" && this.awards) {
    this.invalidate("awards", "A no-result cannot include awards.");
  }

  next();
});

const matchSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    teamAId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    teamBId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    format: {
      type: String,
      enum: ["T10", "T20", "ODI", "TEST", "CUSTOM"],
      required: true,
      default: "T20",
    },

    overs: {
      type: Number,
      required: true,
      min: 1,
      max: 450,
      default: 20,
    },

    inningsPerTeam: {
      type: Number,
      enum: [1, 2],
      default: 1,
      required: true,
    },

    teamAPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },

    teamACaptainId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    teamAWicketKeeperId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    teamBPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },

    teamBCaptainId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    teamBWicketKeeperId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    venue: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    matchDate: {
      type: Date,
      default: null,
    },

    tossWinnerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    tossDecision: {
      type: String,
      enum: ["bat", "bowl", null],
      default: null,
    },

    battingFirstId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
      default: "scheduled",
      index: true,
    },

    result: {
      type: matchResultSchema,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

matchSchema.pre("validate", function validateMatch(next) {
  if (
    this.teamAId &&
    this.teamBId &&
    this.teamAId.toString() === this.teamBId.toString()
  ) {
    this.invalidate("teamBId", "A team cannot play against itself.");
  }

  if (
    this.tossWinnerId &&
    ![this.teamAId?.toString(), this.teamBId?.toString()].includes(
      this.tossWinnerId.toString()
    )
  ) {
    this.invalidate("tossWinnerId", "The toss winner must be one of the participating teams.");
  }

  if (
    this.battingFirstId &&
    ![this.teamAId?.toString(), this.teamBId?.toString()].includes(
      this.battingFirstId.toString()
    )
  ) {
    this.invalidate("battingFirstId", "The batting-first team must be a participating team.");
  }

  if (
    this.result?.winnerTeamId &&
    ![this.teamAId?.toString(), this.teamBId?.toString()].includes(
      this.result.winnerTeamId.toString()
    )
  ) {
    this.invalidate("result.winnerTeamId", "The winner must be a participating team.");
  }

  for (const [playerIdsField, captainField, wicketKeeperField] of [
    ["teamAPlayerIds", "teamACaptainId", "teamAWicketKeeperId"],
    ["teamBPlayerIds", "teamBCaptainId", "teamBWicketKeeperId"],
  ]) {
    const playerIds = (this[playerIdsField] || []).map(String);

    if (new Set(playerIds).size !== playerIds.length) {
      this.invalidate(playerIdsField, "A player cannot appear more than once in a match squad.");
    }
    if (this[captainField] && !playerIds.includes(this[captainField].toString())) {
      this.invalidate(captainField, "The captain must be part of the match squad.");
    }
    if (
      this[wicketKeeperField] &&
      !playerIds.includes(this[wicketKeeperField].toString())
    ) {
      this.invalidate(wicketKeeperField, "The wicket-keeper must be part of the match squad.");
    }
  }

  if (this.tossWinnerId && this.tossDecision && !this.battingFirstId) {
    this.invalidate("battingFirstId", "Set the batting-first team after recording the toss.");
  }

  next();
});

export const Match = mongoose.model("Match", matchSchema);