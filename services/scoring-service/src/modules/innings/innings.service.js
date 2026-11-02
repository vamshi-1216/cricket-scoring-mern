import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { Delivery } from "../deliveries/delivery.model.js";
import { calculateDelivery } from "../scoring/scoring.engine.js";
import { deriveOvers, normalizeScoringEvent } from "../scoring/scoring.rules.js";
import { Innings } from "./innings.model.js";
import {
  deliveryEventSchema,
  inningsIdSchema,
  inningsInitializationSchema,
  inningsPlayersSchema,
  matchIdSchema,
} from "./innings.validation.js";

export class ScoringServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ScoringServiceError";
    this.statusCode = statusCode;
  }
}

function parseId(schema, id, message) {
  const result = schema.safeParse(id);

  if (!result.success) {
    throw new ScoringServiceError(message, 400);
  }

  return result.data;
}

async function getSavedMatch(matchId) {
  let response;

  try {
    response = await fetch(
      `${env.MATCH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch {
    throw new ScoringServiceError(
      "Match Service is unavailable. Please try again.",
      503
    );
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

  if (!result.success || !result.data) {
    throw new ScoringServiceError(
      "Match Service returned an invalid match response.",
      502
    );
  }

  return result.data;
}

async function revalidateScoringAuthorization(matchId, authorization) {
  if (
    !authorization?.cookie ||
    authorization.matchId !== String(matchId) ||
    !Number.isInteger(authorization.version)
  ) {
    throw new ScoringServiceError("Scoring permission is unavailable.", 403);
  }

  let response;
  try {
    response = await fetch(
      `${env.MATCH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/scoring-access/authorize`,
      {
        headers: {
          Cookie: authorization.cookie,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new ScoringServiceError(
      "Match Service is unavailable; scoring permission could not be revalidated.",
      503
    );
  }
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new ScoringServiceError("Only the active scorer can update this match.", 403);
  }
  if (!response.ok || body?.success !== true || !Number.isInteger(body.data?.version)) {
    throw new ScoringServiceError("Scoring permission could not be revalidated.", 503);
  }
  if (body.data.version !== authorization.version) {
    throw new ScoringServiceError(
      "Scoring access changed during this operation. Reload and retry.",
      409
    );
  }
}

async function finalizeMatchInService(matchId) {
  let response;

  try {
    response = await fetch(
      `${env.MATCH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/finalize`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Internal-Service-Secret": env.INTERNAL_SERVICE_SECRET || "",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new ScoringServiceError(
      "Match Service is unavailable; match finalization remains pending.",
      503
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new ScoringServiceError(
      "Match Service returned an invalid finalization response.",
      502
    );
  }

  if (
    !response.ok ||
    result?.success !== true ||
    result.data?.status !== "completed" ||
    !result.data?.result
  ) {
    throw new ScoringServiceError(
      result?.message || "Match Service did not confirm match finalization.",
      response.status >= 500 ? 503 : 409
    );
  }
}

async function retryMatchFinalization(matchId, inningsId) {
  await finalizeMatchInService(matchId);
  const updated = await Innings.updateOne(
    {
      _id: inningsId,
      status: "COMPLETED",
      inningsNumber: 2,
    },
    { $set: { matchFinalizationStatus: "FINALIZED" } }
  );

  if (updated.matchedCount !== 1) {
    throw new ScoringServiceError(
      "Match was finalized, but the Scoring Service could not update its retry state.",
      500
    );
  }
}

let retryingPendingFinalizations = false;

export async function retryPendingMatchFinalizations() {
  if (retryingPendingFinalizations) return;
  retryingPendingFinalizations = true;

  try {
    const pending = await Innings.find({
      inningsNumber: 2,
      status: "COMPLETED",
      targetRuns: { $type: "number" },
      matchFinalizationStatus: { $ne: "FINALIZED" },
    })
      .sort({ updatedAt: 1 })
      .limit(25)
      .lean();

    for (const innings of pending) {
      try {
        await retryMatchFinalization(
          innings.matchId.toString(),
          innings._id
        );
      } catch (error) {
        console.error(
          `Match finalization retry failed for match ${innings.matchId}:`,
          error
        );
        try {
          await Innings.updateOne(
            { _id: innings._id, status: "COMPLETED", inningsNumber: 2 },
            { $set: { matchFinalizationStatus: "PENDING" } }
          );
        } catch (retryStateError) {
          console.error(
            `Unable to retain finalization retry state for match ${innings.matchId}:`,
            retryStateError
          );
        }
      }
    }
  } catch (error) {
    console.error("Unable to load pending match finalizations:", error);
  } finally {
    retryingPendingFinalizations = false;
  }
}

function getMatchSquads(innings, match) {
  const teamAId = String(match.teamAId || "").toLowerCase();
  const teamBId = String(match.teamBId || "").toLowerCase();
  const battingTeamId = String(innings.battingTeamId).toLowerCase();
  const bowlingTeamId = String(innings.bowlingTeamId).toLowerCase();

  if (
    !mongoose.isValidObjectId(teamAId) ||
    !mongoose.isValidObjectId(teamBId) ||
    teamAId === teamBId ||
    ![teamAId, teamBId].includes(battingTeamId) ||
    ![teamAId, teamBId].includes(bowlingTeamId) ||
    battingTeamId === bowlingTeamId
  ) {
    throw new ScoringServiceError(
      "Match teams do not match the initialized innings.",
      400
    );
  }

  const teamAPlayers = Array.isArray(match.teamAPlayerIds)
    ? match.teamAPlayerIds.map((id) => String(id).toLowerCase())
    : [];
  const teamBPlayers = Array.isArray(match.teamBPlayerIds)
    ? match.teamBPlayerIds.map((id) => String(id).toLowerCase())
    : [];
  const battingSquad = battingTeamId === teamAId ? teamAPlayers : teamBPlayers;
  const bowlingSquad = bowlingTeamId === teamAId ? teamAPlayers : teamBPlayers;

  if (
    battingSquad.length < 2 ||
    bowlingSquad.length === 0 ||
    [...battingSquad, ...bowlingSquad].some((id) => !mongoose.isValidObjectId(id))
  ) {
    throw new ScoringServiceError(
      "Saved match squads are invalid for scoring.",
      400
    );
  }
  if (teamBPlayers.some((playerId) => teamAPlayers.includes(playerId))) {
    throw new ScoringServiceError(
      "A player cannot be selected for both teams in the same match.",
      400
    );
  }

  return { battingSquad, bowlingSquad };
}

function validateSelectedPlayers(innings, match, playerIds) {
  const { battingSquad, bowlingSquad } = getMatchSquads(innings, match);
  const [strikerId, nonStrikerId, bowlerId] = playerIds.map((id) =>
    String(id).toLowerCase()
  );

  if (strikerId === nonStrikerId) {
    throw new ScoringServiceError(
      "Striker and non-striker must be different players.",
      400
    );
  }
  if (!battingSquad.includes(strikerId) || !battingSquad.includes(nonStrikerId)) {
    throw new ScoringServiceError(
      "Both batters must belong to the batting squad.",
      400
    );
  }
  if (!bowlingSquad.includes(bowlerId)) {
    throw new ScoringServiceError(
      "The bowler must belong to the bowling squad.",
      400
    );
  }

  return { strikerId, nonStrikerId, bowlerId };
}

function deriveInitialInnings(match, matchId) {
  const teamAId = String(match.teamAId || "").toLowerCase();
  const teamBId = String(match.teamBId || "").toLowerCase();
  const tossWinnerId = String(match.tossWinnerId || "").toLowerCase();

  if (
    !mongoose.isValidObjectId(teamAId) ||
    !mongoose.isValidObjectId(teamBId) ||
    teamAId === teamBId
  ) {
    throw new ScoringServiceError("Match must have two valid, different teams.", 400);
  }

  const expectedOvers = { T10: 10, T20: 20, ODI: 50 }[match.format];
  if (
    !["T10", "T20", "ODI", "TEST", "CUSTOM"].includes(match.format) ||
    !Number.isInteger(match.overs) ||
    match.overs < 1 ||
    ![1, 2].includes(match.inningsPerTeam) ||
    (expectedOvers !== undefined && match.overs !== expectedOvers) ||
    (match.format === "TEST" && match.inningsPerTeam !== 2)
  ) {
    throw new ScoringServiceError("Match format configuration is invalid.", 400);
  }

  const teamAPlayerIds = Array.isArray(match.teamAPlayerIds)
    ? match.teamAPlayerIds.map((id) => String(id).toLowerCase())
    : [];
  const teamBPlayerIds = Array.isArray(match.teamBPlayerIds)
    ? match.teamBPlayerIds.map((id) => String(id).toLowerCase())
    : [];
  const validSquad = (playerIds) =>
    playerIds.length > 0 && playerIds.every((id) => mongoose.isValidObjectId(id));

  if (!validSquad(teamAPlayerIds) || !validSquad(teamBPlayerIds)) {
    throw new ScoringServiceError(
      "Both teams must have valid saved match squads before innings initialization.",
      400
    );
  }

  if (teamBPlayerIds.some((playerId) => teamAPlayerIds.includes(playerId))) {
    throw new ScoringServiceError(
      "A player cannot be selected for both teams in the same match.",
      400
    );
  }

  for (const [captainField, wicketKeeperField, playerIds] of [
    ["teamACaptainId", "teamAWicketKeeperId", teamAPlayerIds],
    ["teamBCaptainId", "teamBWicketKeeperId", teamBPlayerIds],
  ]) {
    const captainId = String(match[captainField] || "").toLowerCase();
    const wicketKeeperId = String(match[wicketKeeperField] || "").toLowerCase();

    if (
      !mongoose.isValidObjectId(captainId) ||
      !mongoose.isValidObjectId(wicketKeeperId) ||
      !playerIds.includes(captainId) ||
      !playerIds.includes(wicketKeeperId)
    ) {
      throw new ScoringServiceError(
        "Each saved match squad must include its captain and wicket-keeper.",
        400
      );
    }
  }

  if (
    (match.tossDecision !== "bat" && match.tossDecision !== "bowl") ||
    ![teamAId, teamBId].includes(tossWinnerId)
  ) {
    throw new ScoringServiceError(
      "A valid toss winner and decision must be saved before innings initialization.",
      400
    );
  }

  const tossWinnerBats = match.tossDecision === "bat";
  const battingTeamId = tossWinnerBats
    ? tossWinnerId
    : tossWinnerId === teamAId
      ? teamBId
      : teamAId;
  const bowlingTeamId = battingTeamId === teamAId ? teamBId : teamAId;

  if (
    !match.battingFirstId ||
    String(match.battingFirstId).toLowerCase() !== battingTeamId
  ) {
    throw new ScoringServiceError(
      "Saved toss decision does not match the batting-first team.",
      400
    );
  }

  const parsed = inningsInitializationSchema.safeParse({
    matchId,
    inningsNumber: 1,
    battingTeamId,
    bowlingTeamId,
    status: "READY",
  });

  if (!parsed.success) {
    throw new ScoringServiceError(parsed.error.issues[0].message, 400);
  }

  return parsed.data;
}

export async function initializeFirstInnings(id, authorization) {
  const matchId = parseId(matchIdSchema, id, "Invalid match ID.");
  const existing = await Innings.findOne({ matchId, inningsNumber: 1 }).lean();

  if (existing) {
    return { innings: existing, created: false };
  }

  const match = await getSavedMatch(matchId);
  const initialization = deriveInitialInnings(match, matchId);
  const initialState = {
    ...initialization,
    strikerId: null,
    nonStrikerId: null,
    currentBowlerId: null,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: {
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penaltyRuns: 0,
    },
    version: 0,
  };

  await revalidateScoringAuthorization(matchId, authorization);
  try {
    const innings = await Innings.findOneAndUpdate(
      { matchId, inningsNumber: 1 },
      { $setOnInsert: initialState },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    return { innings, created: true };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const innings = await Innings.findOne({ matchId, inningsNumber: 1 }).lean();

    if (!innings) {
      throw error;
    }

    return { innings, created: false };
  }
}

export async function initializeSecondInnings(id, authorization) {
  const matchId = parseId(matchIdSchema, id, "Invalid match ID.");
  const existing = await Innings.findOne({ matchId, inningsNumber: 2 }).lean();

  if (existing) {
    return { innings: existing, created: false };
  }

  const match = await getSavedMatch(matchId);
  const teamAId = String(match.teamAId || "").toLowerCase();
  const teamBId = String(match.teamBId || "").toLowerCase();
  const expectedOvers = { T10: 10, T20: 20, ODI: 50 }[match.format];
  const supportedLimitedOversFormat = ["T10", "T20", "ODI", "CUSTOM"].includes(
    match.format
  );

  if (
    !supportedLimitedOversFormat ||
    match.inningsPerTeam !== 1 ||
    !Number.isInteger(match.overs) ||
    match.overs < 1 ||
    (expectedOvers !== undefined && match.overs !== expectedOvers)
  ) {
    throw new ScoringServiceError(
      "Second innings initialization requires a supported limited-overs match with one innings per team.",
      400
    );
  }

  if (
    !mongoose.isValidObjectId(teamAId) ||
    !mongoose.isValidObjectId(teamBId) ||
    teamAId === teamBId
  ) {
    throw new ScoringServiceError("Match must have two valid, different teams.", 400);
  }

  const firstInnings = await Innings.findOne({
    matchId,
    inningsNumber: 1,
  }).lean();

  if (!firstInnings) {
    throw new ScoringServiceError("First innings not found for this match.", 404);
  }
  if (firstInnings.status !== "COMPLETED") {
    throw new ScoringServiceError(
      "First innings must be completed before initializing the second innings.",
      409
    );
  }

  const firstBattingTeamId = String(firstInnings.battingTeamId).toLowerCase();
  const firstBowlingTeamId = String(firstInnings.bowlingTeamId).toLowerCase();

  if (
    firstBattingTeamId === firstBowlingTeamId ||
    ![teamAId, teamBId].includes(firstBattingTeamId) ||
    ![teamAId, teamBId].includes(firstBowlingTeamId)
  ) {
    throw new ScoringServiceError(
      "First innings teams do not match the saved match configuration.",
      400
    );
  }

  if (!Number.isInteger(firstInnings.runs) || firstInnings.runs < 0) {
    throw new ScoringServiceError(
      "First innings total is invalid.",
      409
    );
  }

  const targetRuns = firstInnings.runs + 1;
  const initialState = {
    matchId,
    inningsNumber: 2,
    battingTeamId: firstBowlingTeamId,
    bowlingTeamId: firstBattingTeamId,
    strikerId: null,
    nonStrikerId: null,
    currentBowlerId: null,
    previousOverBowlerId: null,
    awaitingBatter: false,
    runs: 0,
    targetRuns,
    wickets: 0,
    legalBalls: 0,
    extras: {
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penaltyRuns: 0,
    },
    battingFigures: [],
    bowlingFigures: [],
    status: "READY",
    version: 0,
  };

  await revalidateScoringAuthorization(matchId, authorization);
  try {
    const result = await Innings.findOneAndUpdate(
      { matchId, inningsNumber: 2 },
      { $setOnInsert: initialState },
      {
        upsert: true,
        new: true,
        runValidators: true,
        includeResultMetadata: true,
      }
    ).lean();

    if (!result.value || !result.lastErrorObject) {
      throw new Error("Unable to determine whether second innings was created.");
    }

    return {
      innings: result.value,
      created: Boolean(result.lastErrorObject.upserted),
    };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const innings = await Innings.findOne({ matchId, inningsNumber: 2 }).lean();

    if (!innings) {
      throw error;
    }

    return { innings, created: false };
  }
}

export async function setInningsPlayers(id, payload, authorization) {
  const inningsId = parseId(inningsIdSchema, id, "Invalid innings ID.");
  const parsed = inningsPlayersSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ScoringServiceError(parsed.error.issues[0].message, 400);
  }

  const innings = await Innings.findById(inningsId);

  if (!innings) {
    throw new ScoringServiceError("Innings not found.", 404);
  }
  if (!["READY", "IN_PROGRESS"].includes(innings.status)) {
    throw new ScoringServiceError("Players cannot be changed for this innings.", 409);
  }

  const match = await getSavedMatch(String(innings.matchId));
  const selected = validateSelectedPlayers(innings, match, [
    parsed.data.strikerId,
    parsed.data.nonStrikerId,
    parsed.data.bowlerId,
  ]);
  const hasDeliveries = innings.legalBalls > 0 || innings.runs > 0 || innings.wickets > 0;
  const currentStriker = innings.strikerId?.toString() || null;
  const currentNonStriker = innings.nonStrikerId?.toString() || null;

  if (
    (currentStriker && selected.strikerId !== currentStriker) ||
    (currentNonStriker && selected.nonStrikerId !== currentNonStriker)
  ) {
    const isFillingVacancy =
      innings.awaitingBatter &&
      ((!currentStriker && selected.nonStrikerId === currentNonStriker) ||
        (!currentNonStriker && selected.strikerId === currentStriker));

    if (!isFillingVacancy) {
      throw new ScoringServiceError(
        "An active batter can only be replaced after a wicket.",
        409
      );
    }
  }

  const currentBowler = innings.currentBowlerId?.toString() || null;
  if (
    currentBowler &&
    selected.bowlerId !== currentBowler &&
    innings.legalBalls % 6 !== 0
  ) {
    throw new ScoringServiceError(
      "The bowler can only be changed between overs.",
      409
    );
  }
  if (
    innings.previousOverBowlerId &&
    selected.bowlerId === innings.previousOverBowlerId.toString() &&
    innings.legalBalls > 0 &&
    innings.legalBalls % 6 === 0
  ) {
    throw new ScoringServiceError(
      "A bowler cannot bowl consecutive overs.",
      400
    );
  }
  if (hasDeliveries && !innings.awaitingBatter && !currentBowler &&
      innings.legalBalls % 6 !== 0) {
    throw new ScoringServiceError("Select the bowler only between overs.", 409);
  }

  await revalidateScoringAuthorization(innings.matchId.toString(), authorization);
  const updated = await Innings.findOneAndUpdate(
    { _id: inningsId, version: innings.version, status: innings.status },
    {
      $set: {
        strikerId: selected.strikerId,
        nonStrikerId: selected.nonStrikerId,
        currentBowlerId: selected.bowlerId,
        awaitingBatter: false,
      },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new ScoringServiceError(
      "Innings changed while selecting players. Reload and try again.",
      409
    );
  }

  return { ...updated, overs: deriveOvers(updated.legalBalls) };
}

function validateDismissal(event, innings) {
  if (!event.wicket) return;
  if (event.eventType === "PENALTY") {
    throw new ScoringServiceError(
      "A penalty-only scoring event cannot include a dismissal.",
      400
    );
  }

  const dismissedPlayerId = String(event.wicket.dismissedPlayerId).toLowerCase();
  const strikerId = String(innings.strikerId).toLowerCase();
  const nonStrikerId = String(innings.nonStrikerId).toLowerCase();
  const { dismissalType } = event.wicket;

  if (![strikerId, nonStrikerId].includes(dismissedPlayerId)) {
    throw new ScoringServiceError(
      "The dismissed player must be one of the current batters.",
      400
    );
  }
  if (dismissalType !== "RUN_OUT" && dismissedPlayerId !== strikerId) {
    throw new ScoringServiceError(
      "Only a run-out can dismiss the non-striker.",
      400
    );
  }
  if (
    event.eventType === "NO_BALL" &&
    !["RUN_OUT", "OBSTRUCTING_FIELD", "HIT_BALL_TWICE"].includes(dismissalType)
  ) {
    throw new ScoringServiceError(
      "This dismissal is not permitted from a no-ball.",
      400
    );
  }
  if (
    event.eventType === "WIDE" &&
    !["RUN_OUT", "STUMPED", "OBSTRUCTING_FIELD"].includes(dismissalType)
  ) {
    throw new ScoringServiceError(
      "This dismissal is not permitted from a wide.",
      400
    );
  }
  if (
    ["BOWLED", "CAUGHT", "LBW", "STUMPED", "HIT_WICKET"].includes(dismissalType) &&
    (event.batRuns > 0 || event.extras.byes > 0 || event.extras.legByes > 0)
  ) {
    throw new ScoringServiceError(
      "This dismissal cannot be combined with batter runs, byes, or leg-byes.",
      400
    );
  }
}

function validateFieldingAttribution(event, bowlingSquad) {
  const fielderIds = event.wicket?.fieldingAttribution?.fielderIds;
  if (!fielderIds) return;

  if (
    fielderIds.some((fielderId) =>
      !bowlingSquad.includes(String(fielderId).toLowerCase())
    )
  ) {
    throw new ScoringServiceError(
      "Attributed fielders must belong to the fielding team's match squad.",
      400
    );
  }
}

export async function recordDelivery(id, payload, authorization, userId) {
  const inningsId = parseId(inningsIdSchema, id, "Invalid innings ID.");
  const parsed = deliveryEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ScoringServiceError(parsed.error.issues[0].message, 400);
  }

  let event;
  try {
    event = normalizeScoringEvent(parsed.data);
  } catch (error) {
    throw new ScoringServiceError(error.message, 400);
  }

  const initialInnings = await Innings.findById(inningsId).lean();
  if (!initialInnings) {
    throw new ScoringServiceError("Innings not found.", 404);
  }

  const match = await getSavedMatch(String(initialInnings.matchId));
  const { battingSquad, bowlingSquad } = getMatchSquads(initialInnings, match);
  const session = await mongoose.startSession();
  let scorecard;

  try {
    await session.withTransaction(async () => {
      const innings = await Innings.findById(inningsId).session(session).lean();

      if (!innings) {
        throw new ScoringServiceError("Innings not found.", 404);
      }
      if (!["READY", "IN_PROGRESS"].includes(innings.status)) {
        throw new ScoringServiceError(
          "Deliveries cannot be recorded for this innings.",
          409
        );
      }
      if (innings.awaitingBatter) {
        throw new ScoringServiceError(
          "Select an incoming batter before recording another delivery.",
          409
        );
      }
      if (!innings.strikerId || !innings.nonStrikerId || !innings.currentBowlerId) {
        throw new ScoringServiceError(
          "Select the striker, non-striker, and bowler before scoring.",
          400
        );
      }
      if (innings.strikerId.toString() === innings.nonStrikerId.toString()) {
        throw new ScoringServiceError(
          "Striker and non-striker must be different players.",
          400
        );
      }

      const strikerId = innings.strikerId.toString().toLowerCase();
      const nonStrikerId = innings.nonStrikerId.toString().toLowerCase();
      const bowlerId = innings.currentBowlerId.toString().toLowerCase();

      if (!battingSquad.includes(strikerId) || !battingSquad.includes(nonStrikerId)) {
        throw new ScoringServiceError(
          "Current batters must belong to the batting squad.",
          400
        );
      }
      if (!bowlingSquad.includes(bowlerId)) {
        throw new ScoringServiceError(
          "Current bowler must belong to the bowling squad.",
          400
        );
      }

      const maxLegalBalls = Number(match.overs) * 6;
      const maxWickets = battingSquad.length - 1;
      if (
        innings.legalBalls >= maxLegalBalls ||
        innings.wickets >= maxWickets
      ) {
        throw new ScoringServiceError("The innings is already complete.", 409);
      }

      validateDismissal(event, innings);
      validateFieldingAttribution(event, bowlingSquad);
      const result = calculateDelivery(innings, {
        ...event,
        strikerId,
        bowlerId,
      }, { maxLegalBalls, maxWickets });

      const latestDelivery = await Delivery.findOne({ inningsId })
        .sort({ sequence: -1 })
        .session(session)
        .lean();
      const sequence = (latestDelivery?.sequence || 0) + 1;
      const delivery = {
        matchId: innings.matchId,
        inningsId,
        createdBy: userId,
        sequence,
        strikerId: innings.strikerId,
        nonStrikerId: innings.nonStrikerId,
        bowlerId: innings.currentBowlerId,
        eventType: event.eventType,
        batRuns: event.batRuns,
        extras: event.extras,
        totalRuns: result.totalRuns,
        isLegalBall: event.isLegalBall,
        completedRuns: event.completedRuns,
        dismissalType: event.wicket?.dismissalType || null,
        dismissedPlayerId: event.wicket?.dismissedPlayerId || null,
        crossedBeforeWicket: event.wicket?.crossedBeforeWicket || false,
        ...(event.wicket?.fieldingAttribution
          ? { fieldingAttribution: event.wicket.fieldingAttribution }
          : {}),
        beforeState: result.beforeState,
      };

      await revalidateScoringAuthorization(innings.matchId.toString(), authorization);
      const [savedDelivery] = await Delivery.create([delivery], { session });
      const nextState = { ...result.state };
      delete nextState.version;
      const updatedInnings = await Innings.findOneAndUpdate(
        {
          _id: inningsId,
          version: innings.version,
          status: innings.status,
        },
        {
          $set: {
            ...nextState,
            status: result.completed ? "COMPLETED" : "IN_PROGRESS",
            awaitingBatter: result.awaitingBatter,
            ...(result.completed && innings.inningsNumber === 2
              ? { matchFinalizationStatus: "PENDING" }
              : {}),
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true, session }
      ).lean();

      if (!updatedInnings) {
        throw new ScoringServiceError(
          "Innings changed while recording the delivery. Retry the request.",
          409
        );
      }

      const latestDeliveryView = savedDelivery.toObject();
      delete latestDeliveryView.createdBy;
      scorecard = {
        ...updatedInnings,
        overs: deriveOvers(updatedInnings.legalBalls),
        latestDelivery: latestDeliveryView,
      };
    });
  } catch (error) {
    if (
      error?.code === 11000 ||
      error?.hasErrorLabel?.("TransientTransactionError") ||
      error?.hasErrorLabel?.("WriteConflict")
    ) {
      throw new ScoringServiceError(
        "Another scoring update was recorded concurrently. Reload the scorecard and retry.",
        409
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }

  if (scorecard.status === "COMPLETED" && scorecard.inningsNumber === 2) {
    try {
      await retryMatchFinalization(
        scorecard.matchId.toString(),
        scorecard._id
      );
      scorecard.matchFinalizationStatus = "FINALIZED";
    } catch (error) {
      console.error(
        `Match finalization failed for match ${scorecard.matchId}; it will be retried:`,
        error
      );
      scorecard.matchFinalizationStatus = "PENDING";
    }
  }

  return scorecard;
}

export async function getMatchScorecard(id) {
  const matchId = parseId(matchIdSchema, id, "Invalid match ID.");
  const innings = await Innings.findOne({ matchId })
    .sort({ inningsNumber: -1 })
    .lean();

  if (!innings) {
    throw new ScoringServiceError("No innings found for this match.", 404);
  }

  return { ...innings, overs: deriveOvers(innings.legalBalls) };
}

export async function getMatchInnings(id) {
  const matchId = parseId(matchIdSchema, id, "Invalid match ID.");
  const innings = await Innings.find({ matchId })
    .sort({ inningsNumber: 1 })
    .lean();

  if (innings.length === 0) {
    throw new ScoringServiceError("No innings found for this match.", 404);
  }

  return innings.map((item) => ({
    ...item,
    overs: deriveOvers(item.legalBalls),
  }));
}

export async function getDeliveryHistory(matchId, inningsId) {
  const parsedMatchId = parseId(matchIdSchema, matchId, "Invalid match ID.");
  const parsedInningsId = parseId(inningsIdSchema, inningsId, "Invalid innings ID.");
  const innings = await Innings.findOne({
    _id: parsedInningsId,
    matchId: parsedMatchId,
  }).lean();

  if (!innings) {
    throw new ScoringServiceError("Innings not found for this match.", 404);
  }

  return Delivery.find({
    matchId: parsedMatchId,
    inningsId: parsedInningsId,
  })
    .select("-createdBy")
    .sort({ sequence: 1 })
    .lean();
}

export async function getInningsById(id) {
  const inningsId = parseId(inningsIdSchema, id, "Invalid innings ID.");
  const innings = await Innings.findById(inningsId).lean();

  if (!innings) {
    throw new ScoringServiceError("Innings not found.", 404);
  }

  return { ...innings, overs: deriveOvers(innings.legalBalls) };
}
