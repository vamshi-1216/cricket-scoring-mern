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

const fieldingAttributionSchema = new mongoose.Schema(
  {
    fielderIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
      required: true,
    },
    runOutType: {
      type: String,
      enum: ["DIRECT_HIT", "ASSISTED"],
      default: null,
    },
  },
  { _id: false }
);

const beforeStateSchema = new mongoose.Schema(
  {
    strikerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    nonStrikerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    currentBowlerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    previousOverBowlerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    runs: { type: Number, min: 0, validate: Number.isInteger, required: true },
    wickets: { type: Number, min: 0, validate: Number.isInteger, required: true },
    legalBalls: { type: Number, min: 0, validate: Number.isInteger, required: true },
    extras: { type: extrasSchema, required: true },
    version: { type: Number, min: 0, validate: Number.isInteger, required: true },
    status: { type: String, required: true },
    awaitingBatter: { type: Boolean, default: false },
    battingFigures: { type: [mongoose.Schema.Types.Mixed], default: [] },
    bowlingFigures: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    inningsId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sequence: { type: Number, required: true, min: 1, validate: Number.isInteger },
    strikerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nonStrikerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    bowlerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    eventType: { type: String, required: true, trim: true, maxlength: 30 },
    batRuns: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    extras: { type: extrasSchema, default: () => ({}) },
    totalRuns: { type: Number, min: 0, validate: Number.isInteger, required: true },
    isLegalBall: { type: Boolean, required: true },
    completedRuns: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    dismissalType: { type: String, default: null, trim: true, maxlength: 40 },
    dismissedPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    crossedBeforeWicket: { type: Boolean, default: false },
    fieldingAttribution: {
      type: fieldingAttributionSchema,
      default: undefined,
    },
    beforeState: { type: beforeStateSchema, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

deliverySchema.index({ inningsId: 1, sequence: 1 }, { unique: true });

export const Delivery = mongoose.model("Delivery", deliverySchema);
