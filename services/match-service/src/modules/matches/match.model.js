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

const scoringAccessOperationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    action: { type: String, enum: ["TRANSFER", "RECLAIM"], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    requestedAt: { type: Date, required: true },
    previousVersion: {
      type: Number,
      min: 1,
      validate: Number.isInteger,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "COMPLETED",
        "CANCELLED_TARGET_INELIGIBLE",
        "CANCELLED_MATCH_STATE",
      ],
      required: true,
    },
    resolvedAt: { type: Date, required: true },
  },
  { _id: false }
);

const pendingFinalizationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    requestId: { type: String, required: true, maxlength: 128 },
    initiatedByService: { type: String, enum: ["scoring-service"], required: true },
    status: {
      type: String,
      enum: ["DRAINING", "RECONCILIATION_REQUIRED", "FINALIZING"],
      required: true,
    },
    failureReason: {
      type: String,
      enum: [
        "PERMIT_COUNT_MISMATCH",
        "JOURNAL_UNRESOLVED",
        "SCORING_SERVICE_UNAVAILABLE",
        "FINALIZATION_DATA_INVALID",
        "AWARDS_UNAVAILABLE",
        "COMMIT_OUTCOME_UNKNOWN",
      ],
      default: null,
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    claimId: { type: String, default: null },
    claimUntil: { type: Date, default: null },
  },
  { _id: false }
);

const finalizationHistorySchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    requestId: { type: String, required: true, maxlength: 128 },
    initiatedByService: { type: String, enum: ["scoring-service"], required: true },
    status: { type: String, enum: ["COMPLETED", "CANCELLED"], required: true },
    failureReason: { type: String, default: null },
    createdAt: { type: Date, required: true },
    resolvedAt: { type: Date, required: true },
  },
  { _id: false }
);

const pendingCancellationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    requestId: { type: String, required: true, maxlength: 128 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, trim: true, maxlength: 500, default: null },
    status: {
      type: String,
      enum: ["DRAINING", "RECONCILIATION_REQUIRED"],
      required: true,
    },
    failureReason: {
      type: String,
      enum: [
        "PERMIT_COUNT_MISMATCH",
        "JOURNAL_UNRESOLVED",
        "SCORING_SERVICE_UNAVAILABLE",
      ],
      default: null,
    },
    requestedAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false }
);

const cancellationHistorySchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    requestId: { type: String, required: true, maxlength: 128 },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, trim: true, maxlength: 500, default: null },
    cancelledAt: { type: Date, required: true },
  },
  { _id: false }
);

const scoringAccessSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    activeScorerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    version: { type: Number, min: 1, validate: Number.isInteger, default: 1 },
    transferredAt: { type: Date, default: null },
    permitGate: {
      type: String,
      enum: ["OPEN", "DRAINING", "CLOSED"],
    },
    activePermitCount: {
      type: Number,
      min: 0,
      validate: Number.isInteger,
    },
    pendingChange: {
      type: new mongoose.Schema(
        {
          operationId: { type: String, required: true },
          action: { type: String, enum: ["TRANSFER", "RECLAIM"], required: true },
          fromUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
          toUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
          requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
          requestedAt: { type: Date, required: true },
          previousVersion: {
            type: Number,
            min: 1,
            validate: Number.isInteger,
            required: true,
          },
          status: {
            type: String,
            enum: [
              "DRAINING",
              "CANCELLED_TARGET_INELIGIBLE",
              "CANCELLED_MATCH_STATE",
            ],
            required: true,
          },
        },
        { _id: false }
      ),
      default: null,
    },
    changeHistory: { type: [scoringAccessOperationSchema], default: [] },
    pendingFinalization: {
      type: pendingFinalizationSchema,
      default: null,
    },
    finalizationHistory: { type: [finalizationHistorySchema], default: [] },
    pendingCancellation: {
      type: pendingCancellationSchema,
      default: null,
    },
    cancellationHistory: {
      type: [cancellationHistorySchema],
      default: [],
    },
  },
  { _id: false }
);

const scoringTransferHistorySchema = new mongoose.Schema(
  {
    operationId: { type: String, default: null },
    previousVersion: { type: Number, min: 1, validate: Number.isInteger },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    transferredAt: { type: Date, required: true },
    action: { type: String, enum: ["TRANSFER", "RECLAIM"], required: true },
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

// Historical snapshot schema intentionally excludes the history array.
// This avoids circular schema initialization.
const playingXIHistorySnapshotSchema = new mongoose.Schema(
  {
    teamAPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    teamBPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    requiredPlayerCount: {
      type: Number,
      min: 1,
      max: 15,
      validate: Number.isInteger,
      default: 11,
    },
    isConfirmed: {
      type: Boolean,
      default: false,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    revision: {
      type: Number,
      min: 0,
      validate: Number.isInteger,
      default: 0,
    },
  },
  { _id: false }
);

const playingXIHistorySchema = new mongoose.Schema(
  {
    playingXI: {
      type: playingXIHistorySnapshotSchema,
      required: true,
    },
    teamAPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    teamBPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    revision: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  { _id: false }
);

const playingXISchema = new mongoose.Schema(
  {
    teamAPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    teamBPlayerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    requiredPlayerCount: {
      type: Number,
      min: 1,
      max: 15,
      validate: Number.isInteger,
      default: 11,
    },
    isConfirmed: {
      type: Boolean,
      default: false,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    revision: {
      type: Number,
      min: 0,
      validate: Number.isInteger,
      default: 0,
    },
    history: {
      type: [playingXIHistorySchema],
      default: [],
    },
  },
  { _id: false }
);

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

    cancellation: {
      cancelledAt: { type: Date, default: null },
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      reason: { type: String, trim: true, maxlength: 500, default: null },
    },

    result: {
      type: matchResultSchema,
      default: null,
    },

    playingXI: {
      type: playingXISchema,
      default: undefined,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    scoringAccess: {
      type: scoringAccessSchema,
      default: undefined,
    },

    scoringTransferHistory: {
      type: [scoringTransferHistorySchema],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

matchSchema.index({
  "scoringAccess.permitGate": 1,
  "scoringAccess.pendingChange.status": 1,
  "scoringAccess.pendingFinalization.status": 1,
});

matchSchema.pre("validate", function validateMatch(next) {
  const pendingScoringChange =
    this.scoringAccess?.pendingChange?.status === "DRAINING";

  const pendingFinalization = [
    "DRAINING",
    "RECONCILIATION_REQUIRED",
    "FINALIZING",
  ].includes(this.scoringAccess?.pendingFinalization?.status);

  const pendingCancellation = [
    "DRAINING",
    "RECONCILIATION_REQUIRED",
  ].includes(this.scoringAccess?.pendingCancellation?.status);

  const gateIsDraining = this.scoringAccess?.permitGate === "DRAINING";

  const pendingDrainCount =
    Number(pendingScoringChange) +
    Number(pendingCancellation) +
    Number(pendingFinalization && gateIsDraining);

  if (
    (gateIsDraining && pendingDrainCount !== 1) ||
    (!gateIsDraining &&
      (pendingScoringChange ||
        pendingCancellation ||
        (pendingFinalization && this.status !== "completed")))
  ) {
    this.invalidate(
      "scoringAccess",
      "A draining permit gate must have exactly one pending scoring operation."
    );
  }

  if (
    this.status === "completed" &&
    this.scoringAccess?.permitGate !== "CLOSED"
  ) {
    this.invalidate(
      "scoringAccess.permitGate",
      "A completed match must have a closed permit gate."
    );
  }

  if (
    this.status === "cancelled" &&
    this.scoringAccess?.permitGate !== "CLOSED"
  ) {
    this.invalidate(
      "scoringAccess.permitGate",
      "A cancelled match must have a closed permit gate."
    );
  }

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
    this.invalidate(
      "tossWinnerId",
      "The toss winner must be one of the participating teams."
    );
  }

  if (
    this.battingFirstId &&
    ![this.teamAId?.toString(), this.teamBId?.toString()].includes(
      this.battingFirstId.toString()
    )
  ) {
    this.invalidate(
      "battingFirstId",
      "The batting-first team must be a participating team."
    );
  }

  if (
    this.result?.winnerTeamId &&
    ![this.teamAId?.toString(), this.teamBId?.toString()].includes(
      this.result.winnerTeamId.toString()
    )
  ) {
    this.invalidate(
      "result.winnerTeamId",
      "The winner must be one of the participating teams."
    );
  }

  for (const [playerIdsField, captainField, wicketKeeperField] of [
    ["teamAPlayerIds", "teamACaptainId", "teamAWicketKeeperId"],
    ["teamBPlayerIds", "teamBCaptainId", "teamBWicketKeeperId"],
  ]) {
    const playerIds = (this[playerIdsField] || []).map(String);

    if (new Set(playerIds).size !== playerIds.length) {
      this.invalidate(
        playerIdsField,
        "A player cannot appear more than once in a match squad."
      );
    }

    if (
      this[captainField] &&
      !playerIds.includes(this[captainField].toString())
    ) {
      this.invalidate(
        captainField,
        "The captain must be part of the match squad."
      );
    }

    if (
      this[wicketKeeperField] &&
      !playerIds.includes(this[wicketKeeperField].toString())
    ) {
      this.invalidate(
        wicketKeeperField,
        "The wicket-keeper must be part of the match squad."
      );
    }
  }

  if (this.tossWinnerId && this.tossDecision && !this.battingFirstId) {
    this.invalidate(
      "battingFirstId",
      "Set the batting-first team after recording the toss."
    );
  }

  const playingXI = this.playingXI;

  if (playingXI?.isConfirmed) {
    const teamAPlayingIds = (playingXI.teamAPlayerIds || []).map((id) =>
      String(id).toLowerCase()
    );

    const teamBPlayingIds = (playingXI.teamBPlayerIds || []).map((id) =>
      String(id).toLowerCase()
    );

    const requiredCount = playingXI.requiredPlayerCount || 11;

    if (
      teamAPlayingIds.length !== requiredCount ||
      teamBPlayingIds.length !== requiredCount
    ) {
      this.invalidate(
        "playingXI",
        `Each playing XI must contain exactly ${requiredCount} players.`
      );
    }

    if (
      new Set(teamAPlayingIds).size !== teamAPlayingIds.length ||
      new Set(teamBPlayingIds).size !== teamBPlayingIds.length
    ) {
      this.invalidate(
        "playingXI",
        "Duplicate players are not allowed in a playing XI."
      );
    }

    if (teamBPlayingIds.some((id) => teamAPlayingIds.includes(id))) {
      this.invalidate(
        "playingXI",
        "A player cannot appear in both playing XIs."
      );
    }

    const squadA = (this.teamAPlayerIds || []).map((id) =>
      String(id).toLowerCase()
    );

    const squadB = (this.teamBPlayerIds || []).map((id) =>
      String(id).toLowerCase()
    );

    if (teamAPlayingIds.some((id) => !squadA.includes(id))) {
      this.invalidate(
        "playingXI.teamAPlayerIds",
        "Team A playing XI must be selected from Team A's match squad."
      );
    }

    if (teamBPlayingIds.some((id) => !squadB.includes(id))) {
      this.invalidate(
        "playingXI.teamBPlayerIds",
        "Team B playing XI must be selected from Team B's match squad."
      );
    }

    if (
      this.teamACaptainId &&
      !teamAPlayingIds.includes(String(this.teamACaptainId).toLowerCase())
    ) {
      this.invalidate(
        "playingXI.teamAPlayerIds",
        "Team A captain must be in the confirmed playing XI."
      );
    }

    if (
      this.teamAWicketKeeperId &&
      !teamAPlayingIds.includes(
        String(this.teamAWicketKeeperId).toLowerCase()
      )
    ) {
      this.invalidate(
        "playingXI.teamAPlayerIds",
        "Team A wicket-keeper must be in the confirmed playing XI."
      );
    }

    if (
      this.teamBCaptainId &&
      !teamBPlayingIds.includes(String(this.teamBCaptainId).toLowerCase())
    ) {
      this.invalidate(
        "playingXI.teamBPlayerIds",
        "Team B captain must be in the confirmed playing XI."
      );
    }

    if (
      this.teamBWicketKeeperId &&
      !teamBPlayingIds.includes(
        String(this.teamBWicketKeeperId).toLowerCase()
      )
    ) {
      this.invalidate(
        "playingXI.teamBPlayerIds",
        "Team B wicket-keeper must be in the confirmed playing XI."
      );
    }

    if (
      !playingXI.confirmedBy ||
      !playingXI.confirmedAt ||
      playingXI.revision < 1
    ) {
      this.invalidate(
        "playingXI",
        "Confirmed playing XI requires confirmation metadata."
      );
    }
  }

  next();
});

export const Match = mongoose.model("Match", matchSchema);