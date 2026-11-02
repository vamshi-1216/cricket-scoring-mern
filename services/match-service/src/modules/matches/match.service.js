import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { Match } from "./match.model.js";
import { ScoringPermit } from "./scoring-permit.model.js";
import {
  createMatchSchema,
  updateMatchSchema,
  matchIdSchema,
} from "./match.validation.js";
import {
  acquireScoringPermitSchema,
  releaseScoringPermitSchema,
  scoringPermitIdSchema,
} from "./scoring-permit.validation.js";
import { env } from "../../config/env.js";

export class MatchServiceError extends Error {
  constructor(message, statusCode = 400, exposeMessage = false) {
    super(message);
    this.name = "MatchServiceError";
    this.statusCode = statusCode;
    this.exposeMessage = exposeMessage;
  }
}

function userIdString(userId) {
  if (typeof userId !== "string" || !/^[a-f\d]{24}$/i.test(userId)) {
    throw new MatchServiceError("Authenticated user identity is invalid.", 401);
  }
  return String(userId);
}

function assertMatchOwnerOrScorer(match, userId) {
  const access = match.scoringAccess;
  const user = userIdString(userId).toLowerCase();
  if (!access?.ownerId || !access?.activeScorerId) {
    throw new MatchServiceError(
      "Scoring ownership has not been established for this existing match.",
      409,
      true
    );
  }
  if (
    String(access.ownerId).toLowerCase() !== user &&
    String(access.activeScorerId).toLowerCase() !== user
  ) {
    throw new MatchServiceError("You cannot manage this match.", 403, true);
  }
}

async function getMatchWithEstablishedOwnership(matchId) {
  let match = await Match.findById(matchId);
  if (!match) throw new MatchServiceError("Match not found.", 404);
  if (match.scoringAccess?.ownerId && match.scoringAccess?.activeScorerId) {
    return match;
  }
  if (!mongoose.isValidObjectId(match.createdBy)) {
    throw new MatchServiceError(
      "Scoring ownership has not been established for this existing match.",
      409,
      true
    );
  }

  const creatorId = match.createdBy;
  const migrated = await Match.findOneAndUpdate(
    {
      _id: match._id,
      $or: [
        { "scoringAccess.ownerId": { $exists: false } },
        { "scoringAccess.ownerId": null },
      ],
    },
    {
      $set: {
        scoringAccess: {
          ownerId: creatorId,
          activeScorerId: creatorId,
          version: 1,
          transferredAt: null,
          permitGate: "OPEN",
          activePermitCount: 0,
          pendingChange: null,
        },
      },
    },
    { new: true, runValidators: true }
  );
  match = migrated || (await Match.findById(matchId));
  if (!match?.scoringAccess?.ownerId || !match?.scoringAccess?.activeScorerId) {
    throw new MatchServiceError(
      "Scoring ownership could not be established for this match.",
      409,
      true
    );
  }
  return match;
}

async function requireRegisteredTransferTarget(targetUserId, cookie) {
  if (typeof targetUserId !== "string" || !/^[a-f\d]{24}$/i.test(targetUserId)) {
    throw new MatchServiceError("Invalid target user ID.", 400);
  }
  const normalizedTargetId = String(targetUserId).toLowerCase();
  let response;
  try {
    response = await fetch(
      `${env.AUTH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/auth/scoring-transfer-targets/${normalizedTargetId}`,
      {
        headers: { Cookie: cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new MatchServiceError("Auth Service is unavailable.", 503);
  }
  if (response.status === 404) {
    throw new MatchServiceError("Target must be an active registered user.", 400);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true || body.data?.id !== normalizedTargetId) {
    throw new MatchServiceError("Unable to validate the target user.", 503);
  }
  return body.data;
}

function accessView(match, currentUserId) {
  const access = match.scoringAccess;
  return {
    ownerId: String(access.ownerId),
    activeScorerId: String(access.activeScorerId),
    version: access.version,
    transferredAt: access.transferredAt || null,
    isOwner: String(access.ownerId) === String(currentUserId),
    isActiveScorer: String(access.activeScorerId) === String(currentUserId),
  };
}

function parseMatchId(id) {
  const result = matchIdSchema.safeParse(id);

  if (!result.success) {
    throw new MatchServiceError("Invalid match ID.", 400);
  }

  return result.data;
}

function parseScoringPermitId(id) {
  const result = scoringPermitIdSchema.safeParse(id);
  if (!result.success) {
    throw new MatchServiceError("Invalid scoring permit ID.", 400);
  }
  return result.data;
}

function scoringPermitView(permit) {
  return {
    permitId: permit.permitId,
    matchId: String(permit.matchId),
    scorerId: String(permit.scorerId),
    permissionVersion: permit.permissionVersion,
    requestId: permit.requestId,
    state: permit.state,
    acquiredAt: permit.acquiredAt,
    releasedAt: permit.releasedAt || null,
  };
}

function assertDuplicatePermitMatches(permit, scorerId, permissionVersion) {
  if (
    String(permit.scorerId).toLowerCase() !== String(scorerId).toLowerCase() ||
    permit.permissionVersion !== permissionVersion
  ) {
    throw new MatchServiceError(
      "Request ID is already associated with a different scoring permit.",
      409,
      true
    );
  }
  if (permit.state !== "ACTIVE") {
    throw new MatchServiceError(
      "Request ID has already been completed and cannot acquire another permit.",
      409,
      true
    );
  }
}

function isTransactionSupportError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === 20 ||
    error?.codeName === "IllegalOperation" ||
    /transaction numbers are only allowed|transactions are not supported|does not support transactions/i.test(
      message
    )
  );
}

async function runScoringPermitTransaction(operation) {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } catch (error) {
    if (error instanceof MatchServiceError) throw error;
    if (isTransactionSupportError(error)) {
      throw new MatchServiceError(
        "Scoring permits require MongoDB transaction support.",
        503,
        true
      );
    }
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}

export async function acquireScoringPermit(id, payload) {
  const matchId = parseMatchId(id);
  const parsed = acquireScoringPermitSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MatchServiceError(parsed.error.issues[0].message, 400);
  }

  const scorerId = new mongoose.Types.ObjectId(parsed.data.scorerId);
  const permissionVersion = parsed.data.permissionVersion;
  const requestId = parsed.data.requestId;

  try {
    return await runScoringPermitTransaction(async (session) => {
      const existing = await ScoringPermit.findOne({ matchId, requestId })
        .session(session)
        .lean();
      if (existing) {
        assertDuplicatePermitMatches(existing, scorerId, permissionVersion);
        return { permit: scoringPermitView(existing), created: false };
      }

      const match = await Match.findById(matchId)
        .select("status scoringAccess.activeScorerId scoringAccess.version scoringAccess.permitGate scoringAccess.pendingChange")
        .session(session)
        .lean();
      if (!match) throw new MatchServiceError("Match not found.", 404);
      if (match.status === "completed" || match.status === "cancelled") {
        throw new MatchServiceError("This match no longer accepts scoring permits.", 409, true);
      }

      const access = match.scoringAccess;
      if (
        !access?.activeScorerId ||
        String(access.activeScorerId).toLowerCase() !== String(scorerId).toLowerCase()
      ) {
        throw new MatchServiceError("Only the active scorer may acquire a scoring permit.", 403, true);
      }
      if (access.version !== permissionVersion) {
        throw new MatchServiceError("Scoring permission version is stale.", 409, true);
      }
      if (access.permitGate !== "OPEN" || access.pendingChange != null) {
        throw new MatchServiceError("The scoring permit gate is not open.", 409, true);
      }

      const incrementedMatch = await Match.findOneAndUpdate(
        {
          _id: matchId,
          status: { $in: ["scheduled", "in_progress"] },
          "scoringAccess.activeScorerId": scorerId,
          "scoringAccess.version": permissionVersion,
          "scoringAccess.permitGate": "OPEN",
          $or: [
            { "scoringAccess.pendingChange": null },
            { "scoringAccess.pendingChange": { $exists: false } },
          ],
        },
        { $inc: { "scoringAccess.activePermitCount": 1 } },
        { new: true, session, runValidators: true }
      );
      if (!incrementedMatch) {
        throw new MatchServiceError(
          "Scoring access changed while the permit was being acquired.",
          409,
          true
        );
      }

      const permitId = randomUUID();
      const acquiredAt = new Date();
      const [permit] = await ScoringPermit.create(
        [
          {
            permitId,
            matchId,
            scorerId,
            permissionVersion,
            requestId,
            state: "ACTIVE",
            acquiredAt,
            releasedAt: null,
          },
        ],
        { session }
      );
      return { permit: scoringPermitView(permit), created: true };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await ScoringPermit.findOne({ matchId, requestId }).lean();
      if (existing) {
        assertDuplicatePermitMatches(existing, scorerId, permissionVersion);
        return { permit: scoringPermitView(existing), created: false };
      }
    }
    throw error;
  }
}

export async function releaseScoringPermit(matchIdInput, permitIdInput, payload) {
  const matchId = parseMatchId(matchIdInput);
  const permitId = parseScoringPermitId(permitIdInput);
  const parsed = releaseScoringPermitSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MatchServiceError(parsed.error.issues[0].message, 400);
  }

  return runScoringPermitTransaction(async (session) => {
    const permit = await ScoringPermit.findOne({ matchId, permitId })
      .session(session)
      .lean();
    if (!permit) throw new MatchServiceError("Scoring permit not found.", 404);

    if (permit.state !== "ACTIVE") {
      if (permit.state !== parsed.data.state) {
        throw new MatchServiceError(
          "Scoring permit was already released with a different outcome.",
          409,
          true
        );
      }
      return scoringPermitView(permit);
    }

    const releasedAt = new Date();
    const permitUpdate = await ScoringPermit.updateOne(
      { _id: permit._id, state: "ACTIVE" },
      { $set: { state: parsed.data.state, releasedAt } },
      { session, runValidators: true }
    );
    if (permitUpdate.modifiedCount !== 1) {
      throw new MatchServiceError(
        "Scoring permit changed concurrently. Retry the release.",
        409,
        true
      );
    }

    const matchUpdate = await Match.updateOne(
      { _id: matchId, "scoringAccess.activePermitCount": { $gt: 0 } },
      { $inc: { "scoringAccess.activePermitCount": -1 } },
      { session, runValidators: true }
    );
    if (matchUpdate.modifiedCount !== 1) {
      throw new MatchServiceError(
        "Scoring permit count is inconsistent; release was not applied.",
        409,
        true
      );
    }

    return {
      ...scoringPermitView(permit),
      state: parsed.data.state,
      releasedAt,
    };
  });
}

export async function getScoringPermitStatus(matchIdInput, permitIdInput) {
  const matchId = parseMatchId(matchIdInput);
  const permitId = parseScoringPermitId(permitIdInput);
  const permit = await ScoringPermit.findOne({ matchId, permitId }).lean();
  if (!permit) throw new MatchServiceError("Scoring permit not found.", 404);
  return scoringPermitView(permit);
}

async function getScoringInnings(matchId) {
  let response;

  try {
    response = await fetch(
      `${env.SCORING_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/innings`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch {
    throw new MatchServiceError(
      "Scoring Service is unavailable. Please try again.",
      503
    );
  }

  if (response.status === 404) {
    let body;

    try {
      body = await response.json();
    } catch {
      throw new MatchServiceError(
        "Scoring Service returned an invalid response.",
        502
      );
    }

    if (
      body?.success === false &&
      body.message === "No innings found for this match."
    ) {
      return [];
    }

    throw new MatchServiceError(
      "Scoring Service returned an unexpected not-found response.",
      502
    );
  }

  if (!response.ok) {
    throw new MatchServiceError(
      "Unable to retrieve innings from Scoring Service.",
      502
    );
  }

  let body;

  try {
    body = await response.json();
  } catch {
    throw new MatchServiceError(
      "Scoring Service returned an invalid response.",
      502
    );
  }

  if (body?.success !== true || !Array.isArray(body.data?.innings)) {
    throw new MatchServiceError(
      "Scoring Service returned an invalid innings response.",
      502
    );
  }

  return body.data.innings;
}

function hasExactKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateAwardWinners(winners, match, breakdownFields, awardName) {
  if (!Array.isArray(winners)) {
    throw new MatchServiceError(
      `Scoring Service returned invalid ${awardName} winners.`,
      502
    );
  }

  const teamAId = String(match.teamAId).toLowerCase();
  const teamBId = String(match.teamBId).toLowerCase();
  const squads = new Map([
    [teamAId, new Set((match.teamAPlayerIds || []).map((id) => String(id).toLowerCase()))],
    [teamBId, new Set((match.teamBPlayerIds || []).map((id) => String(id).toLowerCase()))],
  ]);
  const seenPlayerIds = new Set();
  let tiedPoints = null;

  for (const winner of winners) {
    if (
      !hasExactKeys(winner, ["playerId", "teamId", "points", "breakdown"]) ||
      typeof winner.playerId !== "string" ||
      typeof winner.teamId !== "string" ||
      !mongoose.isValidObjectId(winner.playerId) ||
      !mongoose.isValidObjectId(winner.teamId) ||
      !isFiniteNumber(winner.points) ||
      winner.points <= 0 ||
      !hasExactKeys(winner.breakdown, breakdownFields) ||
      breakdownFields.some((field) => !isFiniteNumber(winner.breakdown[field]))
    ) {
      throw new MatchServiceError(
        `Scoring Service returned malformed ${awardName} winner data.`,
        502
      );
    }

    const playerId = String(winner.playerId).toLowerCase();
    const teamId = String(winner.teamId).toLowerCase();
    if (
      seenPlayerIds.has(playerId) ||
      !squads.has(teamId) ||
      !squads.get(teamId).has(playerId) ||
      squads.get(teamId === teamAId ? teamBId : teamAId).has(playerId)
    ) {
      throw new MatchServiceError(
        `Scoring Service returned a ${awardName} player outside the match squads.`,
        502
      );
    }
    if (tiedPoints !== null && winner.points !== tiedPoints) {
      throw new MatchServiceError(
        `Scoring Service returned untied ${awardName} winners.`,
        502
      );
    }

    seenPlayerIds.add(playerId);
    tiedPoints = winner.points;
  }

  return winners.map((winner) => ({
    playerId: winner.playerId,
    teamId: winner.teamId,
    points: winner.points,
    breakdown: Object.fromEntries(
      breakdownFields.map((field) => [field, winner.breakdown[field]])
    ),
  }));
}

function validateAwardsResponse(awards, match) {
  const breakdowns = {
    manOfTheMatch: ["battingPoints", "bowlingPoints", "fieldingPoints"],
    bestBatsman: [
      "runs",
      "boundaryBonus",
      "milestoneBonus",
      "strikeRateBonus",
      "notOutBonus",
    ],
    bestBowler: [
      "wickets",
      "dotBalls",
      "maidenOvers",
      "economyBonus",
      "extrasPenalty",
    ],
  };
  const keys = ["scoringVersion", ...Object.keys(breakdowns)];
  if (
    !hasExactKeys(awards, keys) ||
    !Number.isInteger(awards.scoringVersion) ||
    awards.scoringVersion < 1
  ) {
    throw new MatchServiceError(
      "Scoring Service returned an invalid awards response.",
      502
    );
  }

  const validated = {
    scoringVersion: awards.scoringVersion,
    calculatedAt: new Date(),
  };
  for (const [awardName, fields] of Object.entries(breakdowns)) {
    validated[awardName] = validateAwardWinners(
      awards[awardName],
      match,
      fields,
      awardName
    );
  }

  for (const winner of validated.manOfTheMatch) {
    const { battingPoints, bowlingPoints, fieldingPoints } = winner.breakdown;
    if (winner.points !== battingPoints + bowlingPoints + fieldingPoints) {
      throw new MatchServiceError(
        "Scoring Service returned inconsistent Man of the Match points.",
        502
      );
    }
  }
  for (const winner of validated.bestBatsman) {
    const { runs, boundaryBonus, milestoneBonus, strikeRateBonus, notOutBonus } =
      winner.breakdown;
    if (
      winner.points !==
      runs + boundaryBonus + milestoneBonus + strikeRateBonus + notOutBonus
    ) {
      throw new MatchServiceError(
        "Scoring Service returned inconsistent Best Batsman points.",
        502
      );
    }
  }

  return validated;
}

async function getScoringAwards(matchId, match) {
  let response;
  try {
    response = await fetch(
      `${env.SCORING_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/awards`,
      {
        headers: {
          "X-Internal-Service-Secret": env.INTERNAL_SERVICE_SECRET || "",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new MatchServiceError(
      "Scoring Service is unavailable. Awards were not finalized.",
      503
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new MatchServiceError(
      "Scoring Service returned an invalid awards response.",
      502
    );
  }
  if (!response.ok || body?.success !== true || !body.data) {
    if (response.status === 409) {
      throw new MatchServiceError(
        body?.message || "Awards are not ready for this match.",
        409
      );
    }
    throw new MatchServiceError(
      "Scoring Service did not confirm award calculation.",
      response.status >= 500 ? 503 : 502
    );
  }

  return validateAwardsResponse(body.data, match);
}

async function validateParticipatingTeams(teamAId, teamBId) {
  const teamIds = [teamAId, teamBId];

  const results = await Promise.all(
    teamIds.map(async (teamId) => {
      let response;

      try {
        response = await fetch(
          `${env.TEAM_SERVICE_URL}/api/v1/teams/${teamId}`,
          {
            signal: AbortSignal.timeout(5000),
          }
        );
      } catch {
        throw new MatchServiceError(
          "Team Service is unavailable. Please try again.",
          503
        );
      }

      if (response.status === 404) {
        throw new MatchServiceError(
          `Team ${teamId} does not exist or is inactive.`,
          400
        );
      }

      if (!response.ok) {
        throw new MatchServiceError(
          "Unable to validate teams with Team Service.",
          503
        );
      }

      let result;

      try {
        result = await response.json();
      } catch {
        throw new MatchServiceError(
          "Team Service returned an invalid response.",
          503
        );
      }

      if (!result.success || !result.data?._id || result.data.isActive !== true) {
        throw new MatchServiceError(
          `Team ${teamId} does not exist or is inactive.`,
          400
        );
      }

      return result.data;
    })
  );

  return results;
}

export async function createMatch(payload, creatorId) {
  const result = createMatchSchema.safeParse(payload);

  if (!result.success) {
    throw new MatchServiceError(result.error.issues[0].message, 400);
  }

  await validateParticipatingTeams(
    result.data.teamAId,
    result.data.teamBId
  );

  const ownerId = userIdString(creatorId);
  return Match.create({
    ...result.data,
    createdBy: ownerId,
    scoringAccess: {
      ownerId,
      activeScorerId: ownerId,
      version: 1,
      transferredAt: null,
      permitGate: "OPEN",
      activePermitCount: 0,
      pendingChange: null,
    },
  });
}

async function initializeFirstInnings(matchId, cookie) {
  let response;

  try {
    response = await fetch(
      `${env.SCORING_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/innings`,
      {
        method: "POST",
        headers: { Accept: "application/json", Cookie: cookie || "" },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new MatchServiceError(
      "Toss details were saved, but Scoring Service is unavailable. Retry saving the toss to try again.",
      503,
      true
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new MatchServiceError(
      "Toss details were saved, but Scoring Service returned an invalid response. Retry saving the toss to try again.",
      502,
      true
    );
  }

  if (!response.ok || result.success !== true || !result.data?._id) {
    const statusCode = response.status >= 400 && response.status < 500 ? 400 : 503;
    const detail =
      result.message || "Scoring Service did not confirm first innings initialization.";
    throw new MatchServiceError(
      `Toss details were saved, but scoring initialization failed: ${detail} Retry saving the toss to try again.`,
      statusCode,
      true
    );
  }
}

export async function listMatches(query = {}) {
  const filter = {};

  if (query.status) {
    const allowedStatuses = [
      "scheduled",
      "in_progress",
      "completed",
      "cancelled",
    ];

    if (!allowedStatuses.includes(query.status)) {
      throw new MatchServiceError("Invalid match status.", 400);
    }

    filter.status = query.status;
  }

  if (query.teamId) {
    if (!mongoose.isValidObjectId(query.teamId)) {
      throw new MatchServiceError("Invalid team ID.", 400);
    }

    filter.$or = [
      { teamAId: query.teamId },
      { teamBId: query.teamId },
    ];
  }

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));

  const [matches, total] = await Promise.all([
    Match.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Match.countDocuments(filter),
  ]);

  return {
    matches,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMatchById(id) {
  const matchId = parseMatchId(id);
  const match = await Match.findById(matchId).lean();

  if (!match) {
    throw new MatchServiceError("Match not found.", 404);
  }

  return match;
}

export async function updateMatch(id, payload, userId, cookie) {
  const matchId = parseMatchId(id);
  const result = updateMatchSchema.safeParse(payload);

  if (!result.success) {
    throw new MatchServiceError(result.error.issues[0].message, 400);
  }

  const existing = await Match.findById(matchId);

  if (!existing) {
    throw new MatchServiceError("Match not found.", 404);
  }

  const authorizedMatch = await getMatchWithEstablishedOwnership(matchId);
  assertMatchOwnerOrScorer(authorizedMatch, userId);

  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new MatchServiceError("Completed or cancelled matches cannot be updated.", 409);
  }

  const updates = result.data;
  const scoringConfigurationFields = [
    "teamAPlayerIds",
    "teamACaptainId",
    "teamAWicketKeeperId",
    "teamBPlayerIds",
    "teamBCaptainId",
    "teamBWicketKeeperId",
    "tossWinnerId",
    "tossDecision",
    "battingFirstId",
  ];
  const changesScoringConfiguration = scoringConfigurationFields.some((field) =>
    Object.hasOwn(updates, field)
  );
  const initializesInnings =
    updates.tossWinnerId !== undefined ||
    updates.tossDecision !== undefined ||
    updates.battingFirstId !== undefined;
  if (
    initializesInnings &&
    String(authorizedMatch.scoringAccess.activeScorerId).toLowerCase() !==
      userIdString(userId).toLowerCase()
  ) {
    throw new MatchServiceError(
      "Only the active scorer can initialize scoring.",
      403,
      true
    );
  }

  if (changesScoringConfiguration) {
    if (existing.status === "in_progress") {
      throw new MatchServiceError(
        "Match configuration cannot be changed after scoring has started.",
        409
      );
    }

    const innings = await getScoringInnings(matchId);

    if (innings.length > 0) {
      throw new MatchServiceError(
        "Match configuration cannot be changed after scoring has started.",
        409
      );
    }
  }

  if (updates.teamAPlayerIds !== undefined) {
    const [teamA, teamB] = await validateParticipatingTeams(
      existing.teamAId.toString(),
      existing.teamBId.toString()
    );
    const teamAPlayers = new Set((teamA.playerIds || []).map(String));
    const teamBPlayers = new Set((teamB.playerIds || []).map(String));

    if (updates.teamAPlayerIds.some((playerId) => !teamAPlayers.has(playerId))) {
      throw new MatchServiceError(
        "Team A's match squad must contain only players assigned to Team A.",
        400
      );
    }
    if (updates.teamBPlayerIds.some((playerId) => !teamBPlayers.has(playerId))) {
      throw new MatchServiceError(
        "Team B's match squad must contain only players assigned to Team B.",
        400
      );
    }
  }

  if (updates.status === "in_progress" && existing.status !== "in_progress") {
    // Match configuration must be complete before scoring starts.
    if (!existing.teamAId || !existing.teamBId) {
      throw new MatchServiceError("Both teams are required to start a match.", 400);
    }
  }

  if (updates.tossWinnerId !== undefined) {
    const winner = updates.tossWinnerId?.toString();

    if (winner && ![
      existing.teamAId.toString(),
      existing.teamBId.toString(),
    ].includes(winner)) {
      throw new MatchServiceError("Toss winner must be one of the participating teams.", 400);
    }
  }

  if (updates.battingFirstId !== undefined) {
    const battingFirst = updates.battingFirstId?.toString();

    if (battingFirst && ![
      existing.teamAId.toString(),
      existing.teamBId.toString(),
    ].includes(battingFirst)) {
      throw new MatchServiceError("Batting-first team must be one of the participating teams.", 400);
    }
  }

  if (updates.tossDecision !== undefined && updates.tossDecision !== null) {
    const effectiveWinner = updates.tossWinnerId !== undefined
      ? updates.tossWinnerId
      : existing.tossWinnerId;

    if (!effectiveWinner) {
      throw new MatchServiceError("Select the toss winner before recording the toss decision.", 400);
    }

    const effectiveBattingFirst = updates.battingFirstId !== undefined
      ? updates.battingFirstId
      : existing.battingFirstId;

    if (!effectiveBattingFirst) {
      throw new MatchServiceError("Select the batting-first team.", 400);
    }
  }

  Object.assign(existing, updates);
  await existing.save();

  if (initializesInnings) {
    await initializeFirstInnings(existing._id.toString(), cookie);

    const startedMatch = await Match.findOneAndUpdate(
      {
        _id: existing._id,
        status: { $in: ["scheduled", "in_progress"] },
      },
      { $set: { status: "in_progress" } },
      { new: true, runValidators: true }
    ).lean();

    if (!startedMatch) {
      throw new MatchServiceError(
        "Match status changed before scoring could start. Reload the match and retry.",
        409
      );
    }

    return startedMatch;
  }

  return existing.toObject();
}

function getMatchTeams(match) {
  const teamAId = String(match.teamAId || "").toLowerCase();
  const teamBId = String(match.teamBId || "").toLowerCase();

  if (
    !mongoose.isValidObjectId(teamAId) ||
    !mongoose.isValidObjectId(teamBId) ||
    teamAId === teamBId
  ) {
    throw new MatchServiceError(
      "Match must have two valid, different teams.",
      409
    );
  }

  return { teamAId, teamBId };
}

function validateLimitedOversMatch(match) {
  const supportedFormats = ["T10", "T20", "ODI", "CUSTOM"];
  const expectedOvers = { T10: 10, T20: 20, ODI: 50 }[match.format];

  if (
    !supportedFormats.includes(match.format) ||
    match.inningsPerTeam !== 1 ||
    !Number.isInteger(match.overs) ||
    match.overs < 1 ||
    (expectedOvers !== undefined && match.overs !== expectedOvers)
  ) {
    throw new MatchServiceError(
      "Finalization requires a supported limited-overs match with one innings per team.",
      409
    );
  }
}

function calculateMatchResult(match, innings) {
  if (
    innings.length !== 2 ||
    innings[0]?.inningsNumber !== 1 ||
    innings[1]?.inningsNumber !== 2
  ) {
    throw new MatchServiceError(
      "Exactly two ordered innings are required to finalize this match.",
      409
    );
  }

  const [firstInnings, secondInnings] = innings;
  if (
    innings.some(
      (item) =>
        String(item.matchId).toLowerCase() !== String(match._id).toLowerCase()
    )
  ) {
    throw new MatchServiceError(
      "Scoring innings do not belong to this match.",
      409
    );
  }
  if (
    firstInnings.status !== "COMPLETED" ||
    secondInnings.status !== "COMPLETED"
  ) {
    throw new MatchServiceError(
      "Both innings must be completed before finalizing the match.",
      409
    );
  }

  const { teamAId, teamBId } = getMatchTeams(match);
  const firstBattingTeamId = String(firstInnings.battingTeamId || "").toLowerCase();
  const firstBowlingTeamId = String(firstInnings.bowlingTeamId || "").toLowerCase();
  const secondBattingTeamId = String(secondInnings.battingTeamId || "").toLowerCase();
  const secondBowlingTeamId = String(secondInnings.bowlingTeamId || "").toLowerCase();

  if (
    ![teamAId, teamBId].includes(firstBattingTeamId) ||
    ![teamAId, teamBId].includes(firstBowlingTeamId) ||
    firstBattingTeamId === firstBowlingTeamId ||
    firstBattingTeamId !== String(match.battingFirstId || "").toLowerCase() ||
    secondBattingTeamId !== firstBowlingTeamId ||
    secondBowlingTeamId !== firstBattingTeamId
  ) {
    throw new MatchServiceError(
      "Scoring innings teams do not match the saved match configuration.",
      409
    );
  }

  if (
    !Number.isInteger(firstInnings.runs) ||
    firstInnings.runs < 0 ||
    !Number.isInteger(secondInnings.runs) ||
    secondInnings.runs < 0 ||
    !Number.isInteger(secondInnings.targetRuns) ||
    secondInnings.targetRuns < 1 ||
    secondInnings.targetRuns !== firstInnings.runs + 1
  ) {
    throw new MatchServiceError(
      "Scoring innings totals or chase target are invalid.",
      409
    );
  }

  if (secondInnings.runs >= secondInnings.targetRuns) {
    const battingSquad =
      secondBattingTeamId === teamAId
        ? match.teamAPlayerIds
        : match.teamBPlayerIds;
    const wicketsAvailable = Array.isArray(battingSquad)
      ? battingSquad.length - 1
      : 0;
    const wicketsLost = secondInnings.wickets;
    const wicketsMargin = wicketsAvailable - wicketsLost;

    if (
      wicketsAvailable < 1 ||
      !Number.isInteger(wicketsLost) ||
      wicketsLost < 0 ||
      wicketsLost > wicketsAvailable ||
      !Number.isInteger(wicketsMargin) ||
      wicketsMargin < 1
    ) {
      throw new MatchServiceError(
        "The chase result has an invalid wickets margin.",
        409
      );
    }

    return {
      outcome: "WIN",
      winnerTeamId: secondBattingTeamId,
      margin: { type: "WICKETS", value: wicketsMargin },
      finalizedAt: new Date(),
      reason: null,
    };
  }

  if (secondInnings.runs === firstInnings.runs) {
    return {
      outcome: "TIE",
      winnerTeamId: null,
      margin: null,
      finalizedAt: new Date(),
      reason: null,
    };
  }

  return {
    outcome: "WIN",
    winnerTeamId: firstBattingTeamId,
    margin: {
      type: "RUNS",
      value: firstInnings.runs - secondInnings.runs,
    },
    finalizedAt: new Date(),
    reason: null,
  };
}

export async function finalizeMatch(id) {
  const matchId = parseMatchId(id);
  const match = await Match.findById(matchId).lean();

  if (!match) {
    throw new MatchServiceError("Match not found.", 404);
  }
  if (match.status === "completed" && match.result) {
    return match;
  }
  if (!["scheduled", "in_progress"].includes(match.status)) {
    throw new MatchServiceError(
      "Only matches with scoring in progress can be finalized.",
      409
    );
  }

  validateLimitedOversMatch(match);
  const innings = await getScoringInnings(matchId);
  if (innings.length !== 2) {
    throw new MatchServiceError(
      "Exactly two innings are required to finalize this match.",
      409
    );
  }

  const result = calculateMatchResult(match, innings);
  if (result.outcome !== "NO_RESULT") {
    result.awards = await getScoringAwards(matchId, match);
  }
  const finalizedMatch = await Match.findOneAndUpdate(
    {
      _id: matchId,
      status: { $in: ["scheduled", "in_progress"] },
      $or: [{ result: null }, { result: { $exists: false } }],
    },
    {
      $set: {
        status: "completed",
        result,
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (finalizedMatch) {
    return finalizedMatch;
  }

  const latestMatch = await Match.findById(matchId).lean();
  if (!latestMatch) {
    throw new MatchServiceError("Match not found.", 404);
  }
  if (latestMatch.status === "completed" && latestMatch.result) {
    return latestMatch;
  }

  throw new MatchServiceError(
    "Match changed while finalization was in progress. Reload and retry.",
    409
  );
}

export async function cancelMatch(id, userId, cookie) {
  return updateMatch(id, { status: "cancelled" }, userId, cookie);
}

export async function getScoringAccess(id, userId) {
  const matchId = parseMatchId(id);
  const match = await getMatchWithEstablishedOwnership(matchId);
  return {
    ...accessView(match, userId),
    matchId: match._id.toString(),
    matchStatus: match.status,
  };
}

export async function authorizeScoringAccess(id, userId) {
  const access = await getScoringAccess(id, userId);
  if (!access.isActiveScorer) {
    throw new MatchServiceError("Only the active scorer may update this match.", 403, true);
  }
  if (access.matchStatus === "completed" || access.matchStatus === "cancelled") {
    throw new MatchServiceError("This match no longer accepts scoring changes.", 409, true);
  }
  return access;
}

export async function transferScoringAccess(id, targetUserId, userId, cookie) {
  const matchId = parseMatchId(id);
  const match = await getMatchWithEstablishedOwnership(matchId);
  const actorId = userIdString(userId);
  assertMatchOwnerOrScorer(match, actorId);
  if (match.status === "completed" || match.status === "cancelled") {
    throw new MatchServiceError("Scoring cannot be transferred for this match.", 409, true);
  }
  if (typeof targetUserId !== "string" || !/^[a-f\d]{24}$/i.test(targetUserId)) {
    throw new MatchServiceError("Invalid target user ID.", 400);
  }
  if (
    String(targetUserId).toLowerCase() === actorId.toLowerCase() ||
    String(targetUserId).toLowerCase() ===
      String(match.scoringAccess.activeScorerId).toLowerCase()
  ) {
    throw new MatchServiceError("Scoring cannot be transferred to the current user or scorer.", 400);
  }
  await requireRegisteredTransferTarget(String(targetUserId), cookie);

  const transferredAt = new Date();
  const updated = await Match.findOneAndUpdate(
    {
      _id: matchId,
      status: { $nin: ["completed", "cancelled"] },
      "scoringAccess.ownerId": match.scoringAccess.ownerId,
      "scoringAccess.activeScorerId": match.scoringAccess.activeScorerId,
      "scoringAccess.version": match.scoringAccess.version,
    },
    {
      $set: {
        "scoringAccess.activeScorerId": targetUserId,
        "scoringAccess.transferredAt": transferredAt,
      },
      $inc: { "scoringAccess.version": 1 },
      $push: {
        scoringTransferHistory: {
          fromUserId: match.scoringAccess.activeScorerId,
          toUserId: targetUserId,
          transferredBy: actorId,
          transferredAt,
          action: "TRANSFER",
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) {
    throw new MatchServiceError(
      "Scoring access changed concurrently. Reload and retry.",
      409,
      true
    );
  }
  return accessView(updated, actorId);
}

export async function reclaimScoringAccess(id, userId) {
  const matchId = parseMatchId(id);
  const match = await getMatchWithEstablishedOwnership(matchId);
  const actorId = userIdString(userId);
  if (String(match.scoringAccess.ownerId).toLowerCase() !== actorId.toLowerCase()) {
    throw new MatchServiceError("Only the match owner can reclaim scoring.", 403, true);
  }
  if (match.status === "completed" || match.status === "cancelled") {
    throw new MatchServiceError("Scoring cannot be reclaimed for this match.", 409, true);
  }
  if (
    String(match.scoringAccess.activeScorerId).toLowerCase() === actorId.toLowerCase()
  ) {
    const unchanged = await Match.findOneAndUpdate(
      {
        _id: matchId,
        status: { $nin: ["completed", "cancelled"] },
        "scoringAccess.ownerId": match.scoringAccess.ownerId,
        "scoringAccess.activeScorerId": match.scoringAccess.activeScorerId,
        "scoringAccess.version": match.scoringAccess.version,
      },
      { $set: { "scoringAccess.activeScorerId": match.scoringAccess.ownerId } },
      { new: true, runValidators: true }
    );
    if (!unchanged) {
      throw new MatchServiceError(
        "Scoring access changed concurrently. Reload and retry.",
        409,
        true
      );
    }
    return accessView(unchanged, actorId);
  }

  const transferredAt = new Date();
  const updated = await Match.findOneAndUpdate(
    {
      _id: matchId,
      status: { $nin: ["completed", "cancelled"] },
      "scoringAccess.ownerId": match.scoringAccess.ownerId,
      "scoringAccess.activeScorerId": match.scoringAccess.activeScorerId,
      "scoringAccess.version": match.scoringAccess.version,
    },
    {
      $set: {
        "scoringAccess.activeScorerId": match.scoringAccess.ownerId,
        "scoringAccess.transferredAt": transferredAt,
      },
      $inc: { "scoringAccess.version": 1 },
      $push: {
        scoringTransferHistory: {
          fromUserId: match.scoringAccess.activeScorerId,
          toUserId: match.scoringAccess.ownerId,
          transferredBy: actorId,
          transferredAt,
          action: "RECLAIM",
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!updated) {
    throw new MatchServiceError(
      "Scoring access changed concurrently. Reload and retry.",
      409,
      true
    );
  }
  return accessView(updated, actorId);
}