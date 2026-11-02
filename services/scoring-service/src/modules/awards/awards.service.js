import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { Delivery } from "../deliveries/delivery.model.js";
import { Innings } from "../innings/innings.model.js";
import { ScoringServiceError } from "../innings/innings.service.js";
import { matchIdSchema } from "../innings/innings.validation.js";
import { calculateMatchAwards } from "./awards.calculator.js";

async function getMatch(matchId) {
  let response;
  try {
    response = await fetch(
      `${env.MATCH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch {
    throw new ScoringServiceError("Match Service is unavailable.", 503);
  }

  if (response.status === 404) {
    throw new ScoringServiceError("Match not found.", 404);
  }
  if (!response.ok) {
    throw new ScoringServiceError(
      "Unable to retrieve match configuration from Match Service.",
      502
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new ScoringServiceError(
      "Match Service returned an invalid response.",
      502
    );
  }
  if (result?.success !== true || !result.data?._id) {
    throw new ScoringServiceError(
      "Match Service returned an invalid match response.",
      502
    );
  }
  return result.data;
}

export async function calculateAwardsForMatch(id) {
  const parsedId = matchIdSchema.safeParse(id);
  if (!parsedId.success || !mongoose.isValidObjectId(parsedId.data)) {
    throw new ScoringServiceError("Invalid match ID.", 400);
  }

  const match = await getMatch(parsedId.data);
  if (match.result?.outcome === "NO_RESULT") {
    throw new ScoringServiceError("No-result matches cannot receive awards.", 409);
  }

  const innings = await Innings.find({ matchId: parsedId.data })
    .sort({ inningsNumber: 1 })
    .lean();

  if (innings.length === 0) {
    throw new ScoringServiceError("No innings found for this match.", 404);
  }
  if (innings.length !== 2 || innings.some((item) => item.status !== "COMPLETED")) {
    throw new ScoringServiceError(
      "Both innings must be completed before calculating awards.",
      409
    );
  }

  const deliveries = await Delivery.find({ matchId: parsedId.data })
    .sort({ inningsId: 1, sequence: 1 })
    .lean();

  const awards = calculateMatchAwards({ match, innings, deliveries });
  if (!awards) {
    throw new ScoringServiceError(
      "Awards could not be calculated from the saved match and innings.",
      409
    );
  }
  return awards;
}
