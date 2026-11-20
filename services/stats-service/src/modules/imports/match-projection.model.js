import mongoose from "mongoose";

const matchProjectionSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    fingerprint: { type: String, required: true },
    revision: { type: String, required: true },
    projection: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, versionKey: false }
);

matchProjectionSchema.index({ "projection.players.playerId": 1 });

export const MatchProjection = mongoose.model("MatchProjection", matchProjectionSchema);
