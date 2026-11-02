import mongoose from "mongoose";

const scoringPermitSchema = new mongoose.Schema(
  {
    permitId: { type: String, required: true, unique: true },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Match",
    },
    scorerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    permissionVersion: { type: Number, min: 1, validate: Number.isInteger, required: true },
    requestId: { type: String, required: true, maxlength: 128 },
    state: {
      type: String,
      enum: ["ACTIVE", "RELEASED_COMMITTED", "RELEASED_ABORTED"],
      required: true,
      default: "ACTIVE",
    },
    acquiredAt: { type: Date, required: true, default: Date.now },
    releasedAt: { type: Date, default: null },
  },
  { versionKey: false }
);

scoringPermitSchema.index(
  { matchId: 1, requestId: 1 },
  { unique: true, name: "match_request_unique" }
);
scoringPermitSchema.index(
  { matchId: 1, state: 1, acquiredAt: 1 },
  { name: "match_state_acquired" }
);

export const ScoringPermit = mongoose.model("ScoringPermit", scoringPermitSchema);
