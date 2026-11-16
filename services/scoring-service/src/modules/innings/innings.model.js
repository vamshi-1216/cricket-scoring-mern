import mongoose from "mongoose";

const extrasSchema = new mongoose.Schema(
  {
    wides: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    noBalls: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    byes: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    legByes: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    penaltyRuns: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
  },
  { _id: false }
);

const battingFigureSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    runs: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    ballsFaced: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    fours: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    sixes: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    isOut: { type: Boolean, default: false },
    dismissalType: { type: String, default: null },
    retiredHurt: { type: Boolean, default: false },
  },
  { _id: false }
);

const retirementEventSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    eventType: {
      type: String,
      enum: ["RETIRED_HURT", "RESUMED_BATTING"],
      required: true,
    },
    playerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    replacementPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    position: { type: String, enum: ["STRIKER", "NON_STRIKER"], required: true },
    reason: {
      type: String,
      enum: ["INJURY", "UNABLE_TO_CONTINUE", null],
      default: null,
    },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const inningsEndEventSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    reason: { type: String, enum: ["MANUAL_END"], required: true },
    endedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    endedAt: { type: Date, required: true },
  },
  { _id: false }
);

const bowlingFigureSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    runsConceded: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    legalBalls: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    wickets: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    wides: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    noBalls: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
  },
  { _id: false }
);

const inningsSchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    inningsNumber: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
    battingTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    bowlingTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    strikerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    nonStrikerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    currentBowlerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    previousOverBowlerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    awaitingBatter: { type: Boolean, default: false },
    runs: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    targetRuns: { type: Number, min: 1, validate: Number.isInteger },
    wickets: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    legalBalls: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    extras: { type: extrasSchema, default: () => ({}) },
    battingFigures: { type: [battingFigureSchema], default: [] },
    bowlingFigures: { type: [bowlingFigureSchema], default: [] },
    retirementEvents: { type: [retirementEventSchema], default: [] },
    completionReason: {
      type: String,
      enum: ["AUTOMATIC", "MANUAL_END", null],
      default: null,
    },
    completedAt: { type: Date, default: null },
    endHistory: { type: [inningsEndEventSchema], default: [] },
    status: {
      type: String,
      enum: ["READY", "IN_PROGRESS", "COMPLETED", "ABANDONED"],
      default: "READY",
      required: true,
    },
    matchFinalizationStatus: {
      type: String,
      enum: ["PENDING", "FINALIZED", "CANCELLED"],
      default: null,
    },
    version: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

inningsSchema.index({ matchId: 1, inningsNumber: 1 }, { unique: true });

export const Innings = mongoose.model("Innings", inningsSchema);
