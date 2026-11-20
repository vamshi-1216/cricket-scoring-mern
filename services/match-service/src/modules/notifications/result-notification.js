import mongoose from "mongoose";
import { z } from "zod";

const matchId = z.string().regex(/^[a-f0-9]{24}$/i);

export const resultEventSchema = z.object({
  matchId,
  title: z.string().min(2).max(100),
  outcome: z.enum(["WIN", "TIE", "NO_RESULT"]),
  winnerTeamId: matchId.nullable(),
  finalizedAt: z.string().datetime(),
});

const schema = new mongoose.Schema(
  {
    _id: String,
    matchId: String,
    title: String,
    outcome: String,
    winnerTeamId: String,
    finalizedAt: Date,
  },
  { versionKey: false }
);

schema.index({ finalizedAt: -1, _id: -1 });

export const ResultNotification = mongoose.model("ResultNotification", schema);
