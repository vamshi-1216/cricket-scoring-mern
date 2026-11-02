import mongoose from "mongoose";

const scoringOperationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, unique: true },
    requestId: { type: String, required: true, maxlength: 128 },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Match",
    },
    inningsId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Innings",
    },
    scorerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    permissionVersion: {
      type: Number,
      min: 1,
      validate: Number.isInteger,
      required: true,
    },
    permitId: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "PREPARED",
        "COMMITTED",
        "ABORTED",
        "RELEASE_PENDING",
        "RELEASED",
      ],
      required: true,
      default: "PREPARED",
    },
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

scoringOperationSchema.index(
  { matchId: 1, requestId: 1 },
  { unique: true, name: "match_request_unique" }
);
scoringOperationSchema.index(
  { status: 1, updatedAt: 1 },
  { name: "status_updated_recovery" }
);

export const ScoringOperation = mongoose.model(
  "ScoringOperation",
  scoringOperationSchema
);
