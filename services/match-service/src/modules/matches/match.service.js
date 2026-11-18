import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { Match } from "./match.model.js";
import { ScoringPermit } from "./scoring-permit.model.js";
import {
  createMatchSchema,
  updateMatchSchema,
  confirmPlayingXISchema,
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

async function requireActiveTransferTargetForCompletion(targetUserId) {
  if (
    typeof env.INTERNAL_SERVICE_SECRET !== "string" ||
    env.INTERNAL_SERVICE_SECRET.trim().length === 0 ||
    env.INTERNAL_SERVICE_SECRET.length < 32
  ) {
    throw new MatchServiceError(
      "Internal Auth Service authentication is not configured.",
      503
    );
  }

  let response;
  try {
    response = await fetch(
      `${env.AUTH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/auth/internal/scoring-transfer-targets/${targetUserId}`,
      {
        headers: {
          "X-Internal-Service-Secret": env.INTERNAL_SERVICE_SECRET,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new MatchServiceError("Auth Service is unavailable.", 503);
  }
  if (response.status === 404) {
    throw new MatchServiceError("Target must remain an active registered user.", 400);
  }
  const body = await response.json().catch(() => null);
  if (
    !response.ok ||
    body?.success !== true ||
    body.data?.id !== String(targetUserId).toLowerCase()
  ) {
    throw new MatchServiceError("Unable to revalidate the target user.", 503);
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

function publicMatchView(match) {
  const plainMatch = typeof match.toObject === "function" ? match.toObject() : match;
  if (!plainMatch.scoringAccess) return plainMatch;
  const scoringAccess = { ...plainMatch.scoringAccess };
  const pendingFinalization = scoringAccess.pendingFinalization;
  const history = scoringAccess.finalizationHistory || [];
  const latestFinalization = history[history.length - 1];
  delete scoringAccess.pendingChange;
  delete scoringAccess.changeHistory;
  delete scoringAccess.pendingFinalization;
  delete scoringAccess.finalizationHistory;
  delete scoringAccess.pendingCancellation;
  delete scoringAccess.cancellationHistory;
  return {
    ...plainMatch,
    scoringAccess,
    finalizationStatus:
      pendingFinalization?.status || latestFinalization?.status || null,
  };
}

function scoringChangeView(match, operationId, operationStatus, currentUserId) {
  return {
    ...accessView(match, currentUserId),
    operationId,
    operationStatus,
    activePermitCount: match.scoringAccess.activePermitCount,
    permitGate: match.scoringAccess.permitGate,
  };
}

function isScoringMatchEligible(match) {
  return ["scheduled", "in_progress"].includes(match.status);
}

function matchesPendingChange(pending, operationId) {
  return pending?.operationId === operationId && pending.status === "DRAINING";
}

async function getActivePermitCount(matchId, session) {
  let query = ScoringPermit.countDocuments({ matchId, state: "ACTIVE" });
  if (session) query = query.session(session);
  return query;
}

async function cancelPendingScoringChange(
  matchId,
  operationId,
  cancellationStatus
) {
  return runScoringPermitTransaction(async (session) => {
    const match = await Match.findById(matchId).session(session);
    if (!match) throw new MatchServiceError("Match not found.", 404);
    const pending = match.scoringAccess?.pendingChange;
    if (!matchesPendingChange(pending, operationId)) {
      return { match, operationStatus: pending?.status || "COMPLETED" };
    }

    if (match.scoringAccess.activePermitCount !== 0) {
      return { match, operationStatus: "DRAINING" };
    }
    const activePermits = await getActivePermitCount(matchId, session);
    if (activePermits !== 0) {
      console.error("Scoring permit count mismatch; leaving access gate closed.", {
        matchId: String(matchId),
        operationId,
        activePermitCount: match.scoringAccess.activePermitCount,
        activePermitRecords: activePermits,
      });
      throw new MatchServiceError(
        "Scoring permit state is inconsistent; the access gate remains closed.",
        409,
        true
      );
    }

    match.scoringAccess.pendingChange.status = cancellationStatus;
    match.scoringAccess.permitGate = isScoringMatchEligible(match)
      ? "OPEN"
      : "CLOSED";
    match.scoringAccess.changeHistory.push({
      operationId,
      action: pending.action,
      fromUserId: pending.fromUserId,
      toUserId: pending.toUserId,
      requestedBy: pending.requestedBy,
      requestedAt: pending.requestedAt,
      previousVersion: pending.previousVersion,
      status: cancellationStatus,
      resolvedAt: new Date(),
    });
    await match.save({ session, validateModifiedOnly: true });
    return { match, operationStatus: cancellationStatus };
  });
}

async function advancePendingScoringChange(matchId, operationId, currentUserId) {
  const match = await Match.findById(matchId);
  if (!match) throw new MatchServiceError("Match not found.", 404);
  const pending = match.scoringAccess?.pendingChange;
  if (!pending || pending.operationId !== operationId) {
    const completed = (match.scoringAccess?.changeHistory || []).find(
      (entry) => entry.operationId === operationId
    );
    if (completed) {
      return scoringChangeView(
        match,
        operationId,
        completed.status,
        currentUserId
      );
    }
    throw new MatchServiceError("Scoring access operation not found.", 404);
  }
  if (pending.status !== "DRAINING") {
    return scoringChangeView(match, operationId, pending.status, currentUserId);
  }

  if (match.scoringAccess.activePermitCount !== 0) {
    return scoringChangeView(match, operationId, "DRAINING", currentUserId);
  }
  const activePermits = await getActivePermitCount(matchId);
  if (activePermits !== 0) {
    console.error("Scoring permit count mismatch; leaving access gate closed.", {
      matchId: String(matchId),
      operationId,
      activePermitCount: match.scoringAccess.activePermitCount,
      activePermitRecords: activePermits,
    });
    throw new MatchServiceError(
      "Scoring permit state is inconsistent; the access gate remains closed.",
      409,
      true
    );
  }

  if (!isScoringMatchEligible(match)) {
    const cancelled = await cancelPendingScoringChange(
      matchId,
      operationId,
      "CANCELLED_MATCH_STATE"
    );
    return scoringChangeView(
      cancelled.match,
      operationId,
      cancelled.operationStatus,
      currentUserId
    );
  }

  try {
    await requireActiveTransferTargetForCompletion(
      String(pending.toUserId).toLowerCase()
    );
  } catch (error) {
    if (error.statusCode === 400) {
      const cancelled = await cancelPendingScoringChange(
        matchId,
        operationId,
        "CANCELLED_TARGET_INELIGIBLE"
      );
      return scoringChangeView(
        cancelled.match,
        operationId,
        cancelled.operationStatus,
        currentUserId
      );
    }
    if (error.statusCode !== 503) throw error;
    return scoringChangeView(match, operationId, "DRAINING", currentUserId);
  }

  const result = await runScoringPermitTransaction(async (session) => {
    const current = await Match.findById(matchId)
      .select("+scoringTransferHistory")
      .session(session);
    if (!current) throw new MatchServiceError("Match not found.", 404);
    const currentPending = current.scoringAccess?.pendingChange;
    if (!matchesPendingChange(currentPending, operationId)) {
      return {
        match: current,
        operationStatus: currentPending?.status || "COMPLETED",
      };
    }

    if (
      current.scoringAccess.permitGate !== "DRAINING" ||
      current.scoringAccess.version !== currentPending.previousVersion
    ) {
      throw new MatchServiceError(
        "Pending scoring access state is inconsistent; the gate remains closed.",
        409,
        true
      );
    }
    if (current.scoringAccess.activePermitCount !== 0) {
      return { match: current, operationStatus: "DRAINING" };
    }
    const remainingPermits = await getActivePermitCount(matchId, session);
    if (remainingPermits !== 0) {
      console.error("Scoring permit count mismatch; leaving access gate closed.", {
        matchId: String(matchId),
        operationId,
        activePermitCount: current.scoringAccess.activePermitCount,
        activePermitRecords: remainingPermits,
      });
      throw new MatchServiceError(
        "Scoring permit state is inconsistent; the access gate remains closed.",
        409,
        true
      );
    }

    if (!isScoringMatchEligible(current)) {
      current.scoringAccess.permitGate = "CLOSED";
      currentPending.status = "CANCELLED_MATCH_STATE";
      current.scoringAccess.changeHistory.push({
        operationId,
        action: currentPending.action,
        fromUserId: currentPending.fromUserId,
        toUserId: currentPending.toUserId,
        requestedBy: currentPending.requestedBy,
        requestedAt: currentPending.requestedAt,
        previousVersion: currentPending.previousVersion,
        status: "CANCELLED_MATCH_STATE",
        resolvedAt: new Date(),
      });
      await current.save({ session, validateModifiedOnly: true });
      return { match: current, operationStatus: "CANCELLED_MATCH_STATE" };
    }

    const previousScorerId = current.scoringAccess.activeScorerId;
    const transferredAt = new Date();
    current.scoringAccess.activeScorerId = currentPending.toUserId;
    current.scoringAccess.transferredAt = transferredAt;
    current.scoringAccess.version += 1;
    current.scoringAccess.permitGate = "OPEN";
    current.scoringAccess.pendingChange = null;
    current.scoringTransferHistory.push({
      operationId,
      previousVersion: currentPending.previousVersion,
      fromUserId: previousScorerId,
      toUserId: currentPending.toUserId,
      transferredBy: currentPending.requestedBy,
      transferredAt,
      action: currentPending.action,
    });
    current.scoringAccess.changeHistory.push({
      operationId,
      action: currentPending.action,
      fromUserId: previousScorerId,
      toUserId: currentPending.toUserId,
      requestedBy: currentPending.requestedBy,
      requestedAt: currentPending.requestedAt,
      previousVersion: currentPending.previousVersion,
      status: "COMPLETED",
      resolvedAt: transferredAt,
    });
    await current.save({ session, validateModifiedOnly: true });
    return { match: current, operationStatus: "COMPLETED" };
  });

  return scoringChangeView(
    result.match,
    operationId,
    result.operationStatus,
    currentUserId
  );
}

async function beginScoringAccessChange(
  match,
  action,
  targetUserId,
  actorId
) {
  const matchId = match._id;
  const access = match.scoringAccess;
  const existing = access.pendingChange;
  if (existing?.status === "DRAINING") {
    if (
      existing.action !== action ||
      String(existing.toUserId).toLowerCase() !== String(targetUserId).toLowerCase() ||
      String(existing.requestedBy).toLowerCase() !== actorId.toLowerCase()
    ) {
      throw new MatchServiceError(
        "Another scoring access change is already pending.",
        409,
        true
      );
    }
    return advancePendingScoringChange(
      matchId,
      existing.operationId,
      actorId
    );
  }
  if (access.permitGate !== "OPEN" || access.activePermitCount < 0) {
    throw new MatchServiceError(
      "Scoring access is already changing or its permit state is unavailable.",
      409,
      true
    );
  }

  const operationId = randomUUID();
  const pendingChange = {
    operationId,
    action,
    fromUserId: access.activeScorerId,
    toUserId: targetUserId,
    requestedBy: actorId,
    requestedAt: new Date(),
    previousVersion: access.version,
    status: "DRAINING",
  };

  let started;
  try {
    started = await runScoringPermitTransaction(async (session) => {
      const update = await Match.updateOne(
        {
          _id: matchId,
          status: { $in: ["scheduled", "in_progress"] },
          "scoringAccess.ownerId": access.ownerId,
          "scoringAccess.activeScorerId": access.activeScorerId,
          "scoringAccess.version": access.version,
          "scoringAccess.permitGate": "OPEN",
          "scoringAccess.pendingChange.status": { $ne: "DRAINING" },
        },
        {
          $set: {
            "scoringAccess.permitGate": "DRAINING",
            "scoringAccess.pendingChange": pendingChange,
          },
        },
        { session, runValidators: true }
      );
      if (update.modifiedCount !== 1) {
        throw new MatchServiceError(
          "Scoring access changed concurrently. Reload and retry.",
          409,
          true
        );
      }
      return true;
    });
  } catch (error) {
    if (error.statusCode === 409) {
      const latest = await Match.findById(matchId);
      const latestPending = latest?.scoringAccess?.pendingChange;
      if (
        latest &&
        latestPending?.status === "DRAINING" &&
        latestPending.action === action &&
        String(latestPending.toUserId).toLowerCase() ===
          String(targetUserId).toLowerCase() &&
        String(latestPending.requestedBy).toLowerCase() === actorId.toLowerCase()
      ) {
        return advancePendingScoringChange(
          matchId,
          latestPending.operationId,
          actorId
        );
      }
    }
    throw error;
  }
  if (!started) {
    throw new MatchServiceError("Unable to begin scoring access change.", 409, true);
  }
  return advancePendingScoringChange(matchId, operationId, actorId);
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
      if (
        access.permitGate !== "OPEN" ||
        access.pendingChange?.status === "DRAINING"
      ) {
        throw new MatchServiceError("The scoring permit gate is not open.", 409, true);
      }

      const incrementedMatch = await Match.findOneAndUpdate(
        {
          _id: matchId,
          status: { $in: ["scheduled", "in_progress"] },
          "scoringAccess.activeScorerId": scorerId,
          "scoringAccess.version": permissionVersion,
          "scoringAccess.permitGate": "OPEN",
          "scoringAccess.pendingChange.status": { $ne: "DRAINING" },
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
  const { requiredPlayerCount, ...matchData } = result.data;

  return Match.create({
    ...matchData,
    playingXI: {
      requiredPlayerCount,
      teamAPlayerIds: [],
      teamBPlayerIds: [],
      isConfirmed: false,
      confirmedBy: null,
      confirmedAt: null,
      revision: 0,
      history: [],
    },
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


export async function confirmPlayingXI(matchIdInput, payload, userId) {
  const matchId = parseMatchId(matchIdInput);
  const parsed = confirmPlayingXISchema.safeParse(payload);

  if (!parsed.success) {
    throw new MatchServiceError(parsed.error.issues[0].message, 400);
  }

  const actorId = userIdString(userId);
  const match = await getMatchWithEstablishedOwnership(matchId);
  assertMatchOwnerOrScorer(match, actorId);

  if (match.status !== "scheduled") {
    throw new MatchServiceError(
      "The playing XI can only be confirmed or changed before scoring starts.",
      409,
      true
    );
  }

  if (
    match.scoringAccess?.permitGate !== "OPEN" ||
    match.scoringAccess?.activePermitCount !== 0 ||
    match.scoringAccess?.pendingChange?.status === "DRAINING"
  ) {
    throw new MatchServiceError(
      "Playing XI cannot be changed while scoring access is changing or active.",
      409,
      true
    );
  }

  const innings = await getScoringInnings(matchId);
  if (innings.length > 0) {
    throw new MatchServiceError(
      "Playing XI cannot be changed after scoring data has been created.",
      409,
      true
    );
  }

  const teamAIds = parsed.data.teamAPlayerIds.map((id) => id.toLowerCase());
  const teamBIds = parsed.data.teamBPlayerIds.map((id) => id.toLowerCase());
  const requiredCount = match.playingXI?.requiredPlayerCount || 11;

  if (
    teamAIds.length !== requiredCount ||
    teamBIds.length !== requiredCount
  ) {
    throw new MatchServiceError(
      `Each playing XI must contain exactly ${requiredCount} players.`,
      400,
      true
    );
  }

  const squadA = new Set((match.teamAPlayerIds || []).map((id) => String(id).toLowerCase()));
  const squadB = new Set((match.teamBPlayerIds || []).map((id) => String(id).toLowerCase()));

  if (teamAIds.some((id) => !squadA.has(id))) {
    throw new MatchServiceError(
      "Every Team A playing XI player must be in Team A's match squad.",
      400,
      true
    );
  }
  if (teamBIds.some((id) => !squadB.has(id))) {
    throw new MatchServiceError(
      "Every Team B playing XI player must be in Team B's match squad.",
      400,
      true
    );
  }

  const captainChecks = [
    [match.teamACaptainId, teamAIds, "Team A captain"],
    [match.teamAWicketKeeperId, teamAIds, "Team A wicket-keeper"],
    [match.teamBCaptainId, teamBIds, "Team B captain"],
    [match.teamBWicketKeeperId, teamBIds, "Team B wicket-keeper"],
  ];

  for (const [playerId, selectedIds, label] of captainChecks) {
    if (playerId && !selectedIds.includes(String(playerId).toLowerCase())) {
      throw new MatchServiceError(`${label} must be included in the confirmed playing XI.`, 400, true);
    }
  }

  const currentXI = match.playingXI;
  const nextRevision = (currentXI?.revision || 0) + 1;

  if (currentXI?.isConfirmed) {
    currentXI.history.push({
      teamAPlayerIds: currentXI.teamAPlayerIds,
      teamBPlayerIds: currentXI.teamBPlayerIds,
      changedBy: actorId,
      changedAt: new Date(),
      revision: currentXI.revision,
      reason: parsed.data.reason || "Playing XI updated",
    });
  }

  match.playingXI.teamAPlayerIds = teamAIds;
  match.playingXI.teamBPlayerIds = teamBIds;
  match.playingXI.isConfirmed = true;
  match.playingXI.confirmedBy = actorId;
  match.playingXI.confirmedAt = new Date();
  match.playingXI.revision = nextRevision;

  await match.save();

  return match.playingXI.toObject
    ? match.playingXI.toObject()
    : match.playingXI;
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

  const innings = result.data?.innings || result.data;
  if (!response.ok || result.success !== true || !innings?._id) {
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
    matches: matches.map(publicMatchView),
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

  return publicMatchView(match);
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
  if (updates.status === "cancelled") {
    throw new MatchServiceError(
      "Use the owner-only cancellation workflow to cancel a match.",
      409,
      true
    );
  }
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
    Object.hasOwn(updates, field) &&
    String(updates[field] ?? "") !== String(existing[field] ?? "")
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

const FINALIZATION_CLAIM_MS = 30000;
const finalizationRequestIdPattern = /^[\w:.-]{1,128}$/;

function finalizationOperationView(operation, match = null) {
  return {
    operationId: operation.operationId,
    operationStatus: operation.status,
    failureReason: operation.failureReason || null,
    ...(match ? { match: publicMatchView(match) } : {}),
  };
}

function finalizationHistoryView(entry, match = null) {
  return {
    operationId: entry.operationId,
    operationStatus: entry.status,
    failureReason: entry.failureReason || null,
    ...(match ? { match: publicMatchView(match) } : {}),
  };
}

function validateFinalizationRequestId(requestId) {
  if (
    typeof requestId !== "string" ||
    !finalizationRequestIdPattern.test(requestId) ||
    !/\S/.test(requestId)
  ) {
    throw new MatchServiceError("A valid Idempotency-Key is required.", 400, true);
  }
}

async function findFinalizationState(matchId, requestId, operationId) {
  const match = await Match.findById(matchId).lean();
  if (!match) throw new MatchServiceError("Match not found.", 404);
  const pending = match.scoringAccess?.pendingFinalization;
  if (pending && (!operationId || pending.operationId === operationId)) {
    if (!requestId || pending.requestId === requestId) {
      return { match, operation: pending };
    }
  }
  const history = match.scoringAccess?.finalizationHistory || [];
  const entry = history.find(
    (item) =>
      (!operationId || item.operationId === operationId) &&
      (!requestId || item.requestId === requestId)
  );
  return { match, historyEntry: entry || null };
}

async function beginFinalization(matchId, requestId) {
  return runScoringPermitTransaction(async (session) => {
    const match = await Match.findById(matchId).session(session);
    if (!match) throw new MatchServiceError("Match not found.", 404);

    const access = match.scoringAccess;
    if (match.status === "completed" && match.result) {
      const completedOperation = (access?.finalizationHistory || []).find(
        (entry) => entry.status === "COMPLETED"
      );
      if (
        (completedOperation && completedOperation.requestId !== requestId) ||
        (!completedOperation &&
          (access?.finalizationHistory || []).some(
            (entry) => entry.requestId !== requestId
          ))
      ) {
        throw new MatchServiceError(
          "This match already has a different finalization operation.",
          409,
          true
        );
      }
      if (access?.pendingFinalization) {
        if (access.pendingFinalization.requestId !== requestId) {
          throw new MatchServiceError(
            "A different finalization operation is already pending.",
            409,
            true
          );
        }
        if (access.permitGate !== "CLOSED") {
          access.permitGate = "CLOSED";
          await match.save({ session, validateModifiedOnly: true });
        }
        return { operation: access.pendingFinalization };
      }

      const activePermitRecords = await ScoringPermit.countDocuments({
        matchId,
        state: "ACTIVE",
      }).session(session);
      const declaredPermitCount = access?.activePermitCount;
      const permitCountsMatch =
        Number.isInteger(declaredPermitCount) &&
        declaredPermitCount === activePermitRecords;
      const gateWasClosed = access?.permitGate === "CLOSED";

      if (!match.scoringAccess) {
        match.scoringAccess = {
          ownerId: null,
          activeScorerId: null,
          version: 1,
          permitGate: "CLOSED",
          pendingChange: null,
          pendingFinalization: null,
        };
      } else {
        match.scoringAccess.permitGate = "CLOSED";
      }

      if (!permitCountsMatch || activePermitRecords > 0) {
        const now = new Date();
        const operation = {
          operationId: randomUUID(),
          requestId,
          initiatedByService: "scoring-service",
          status: permitCountsMatch ? "DRAINING" : "RECONCILIATION_REQUIRED",
          failureReason: permitCountsMatch ? null : "PERMIT_COUNT_MISMATCH",
          createdAt: now,
          updatedAt: now,
          claimId: null,
          claimUntil: null,
        };
        match.scoringAccess.pendingFinalization = operation;
        await match.save({ session, validateModifiedOnly: true });
        return { operation };
      }

      if (!gateWasClosed) {
        await match.save({ session, validateModifiedOnly: true });
      }
      return {
        completed: true,
        match,
        historyEntry: completedOperation || null,
      };
    }

    const pending = access?.pendingFinalization;
    if (pending) {
      if (pending.requestId !== requestId) {
        throw new MatchServiceError(
          "A different finalization operation is already pending.",
          409,
          true
        );
      }
      return { operation: pending };
    }

    const priorOperation = (access?.finalizationHistory || []).find(
      (entry) => entry.requestId === requestId
    );
    if (priorOperation) return { historyEntry: priorOperation, match };
    if ((access?.finalizationHistory || []).length > 0) {
      throw new MatchServiceError(
        "This match already has a finalization operation.",
        409,
        true
      );
    }
    if (!access?.ownerId || !access?.activeScorerId || !access.permitGate) {
      throw new MatchServiceError(
        "Scoring ownership or permit state is unavailable; finalization is blocked.",
        409,
        true
      );
    }
    if (!isScoringMatchEligible(match)) {
      throw new MatchServiceError(
        "Only matches with scoring in progress can be finalized.",
        409,
        true
      );
    }
    if (access.permitGate !== "OPEN") {
      throw new MatchServiceError(
        "Scoring access is already draining or closed.",
        409,
        true
      );
    }
    if (access.pendingChange?.status === "DRAINING") {
      throw new MatchServiceError(
        "A scoring access transfer is already draining.",
        409,
        true
      );
    }
    if (access.pendingFinalization || access.activePermitCount < 0) {
      throw new MatchServiceError(
        "Scoring permit state is unavailable; finalization is blocked.",
        409,
        true
      );
    }

    const operation = {
      operationId: randomUUID(),
      requestId,
      initiatedByService: "scoring-service",
      status: "DRAINING",
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      claimId: null,
      claimUntil: null,
    };
    const update = await Match.updateOne(
      {
        _id: matchId,
        status: { $in: ["scheduled", "in_progress"] },
        "scoringAccess.permitGate": "OPEN",
        "scoringAccess.activePermitCount": { $gte: 0 },
        "scoringAccess.pendingChange.status": { $ne: "DRAINING" },
        $or: [
          { "scoringAccess.pendingFinalization": null },
          { "scoringAccess.pendingFinalization": { $exists: false } },
        ],
      },
      {
        $set: {
          "scoringAccess.permitGate": "DRAINING",
          "scoringAccess.pendingFinalization": operation,
        },
      },
      { session, runValidators: true }
    );
    if (update.modifiedCount !== 1) {
      throw new MatchServiceError(
        "Match state changed while finalization was starting. Retry with the same key.",
        409,
        true
      );
    }
    return { operation };
  });
}

async function claimFinalization(matchId, operationId) {
  const now = new Date();
  const claimId = randomUUID();
  const claimed = await Match.findOneAndUpdate(
    {
      _id: matchId,
      "scoringAccess.pendingFinalization.operationId": operationId,
      $or: [
        {
          "scoringAccess.pendingFinalization.status": {
            $in: ["DRAINING", "RECONCILIATION_REQUIRED"],
          },
        },
        {
          "scoringAccess.pendingFinalization.status": "FINALIZING",
          "scoringAccess.pendingFinalization.claimUntil": { $lte: now },
        },
        {
          "scoringAccess.pendingFinalization.status": "FINALIZING",
          "scoringAccess.pendingFinalization.claimUntil": { $exists: false },
        },
        {
          "scoringAccess.pendingFinalization.status": "FINALIZING",
          "scoringAccess.pendingFinalization.claimUntil": null,
        },
      ],
    },
    {
      $set: {
        "scoringAccess.pendingFinalization.status": "FINALIZING",
        "scoringAccess.pendingFinalization.failureReason": null,
        "scoringAccess.pendingFinalization.claimId": claimId,
        "scoringAccess.pendingFinalization.claimUntil": new Date(
          now.getTime() + FINALIZATION_CLAIM_MS
        ),
        "scoringAccess.pendingFinalization.updatedAt": now,
      },
    },
    { new: true, runValidators: true }
  ).lean();
  return claimed
    ? { match: claimed, claimId }
    : { match: await Match.findById(matchId).lean(), claimId: null };
}

async function updateFinalizationClaim(
  matchId,
  operationId,
  claimId,
  status,
  failureReason
) {
  const updatedAt = new Date();
  const result = await Match.updateOne(
    {
      _id: matchId,
      "scoringAccess.pendingFinalization.operationId": operationId,
      "scoringAccess.pendingFinalization.claimId": claimId,
      "scoringAccess.pendingFinalization.status": "FINALIZING",
    },
    {
      $set: {
        "scoringAccess.pendingFinalization.status": status,
        "scoringAccess.pendingFinalization.failureReason": failureReason,
        "scoringAccess.pendingFinalization.updatedAt": updatedAt,
        "scoringAccess.pendingFinalization.claimId": null,
        "scoringAccess.pendingFinalization.claimUntil": null,
      },
    },
    { runValidators: true }
  );
  return result.modifiedCount === 1;
}

async function getPermitOperationOutcome(matchId, permitId) {
  if (
    typeof env.INTERNAL_SERVICE_SECRET !== "string" ||
    env.INTERNAL_SERVICE_SECRET.trim().length === 0 ||
    env.INTERNAL_SERVICE_SECRET.length < 32
  ) {
    throw new MatchServiceError(
      "Internal Scoring Service authentication is not configured.",
      503
    );
  }
  let response;
  try {
    response = await fetch(
      `${env.SCORING_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/scoring-permits/${permitId}/operation`,
      {
        headers: {
          "X-Internal-Service-Secret": env.INTERNAL_SERVICE_SECRET,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new MatchServiceError(
      "Scoring Service is unavailable for permit reconciliation.",
      503
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true || !body.data) {
    throw new MatchServiceError(
      "Scoring Service could not confirm the permit journal outcome.",
      503
    );
  }
  const journal = body.data;
  if (
    journal.matchId !== String(matchId) ||
    journal.permitId !== permitId ||
    typeof journal.found !== "boolean"
  ) {
    throw new MatchServiceError(
      "Scoring Service returned an invalid permit journal response.",
      503
    );
  }
  return journal;
}

function definitivePermitReleaseState(journal) {
  if (!journal.found) return null;
  if (
    journal.status === "COMMITTED" &&
    journal.outcome === "COMMITTED"
  ) {
    return "RELEASED_COMMITTED";
  }
  if (journal.status === "ABORTED" && journal.outcome === "ABORTED") {
    return "RELEASED_ABORTED";
  }
  if (
    ["RELEASE_PENDING", "RELEASED"].includes(journal.status) &&
    ["COMMITTED", "ABORTED"].includes(journal.outcome)
  ) {
    return journal.outcome === "COMMITTED"
      ? "RELEASED_COMMITTED"
      : "RELEASED_ABORTED";
  }
  return null;
}

async function reconcileActivePermits(matchId, operationId, claimId) {
  const match = await Match.findById(matchId).lean();
  if (!match?.scoringAccess?.pendingFinalization ||
      match.scoringAccess.pendingFinalization.operationId !== operationId ||
      match.scoringAccess.pendingFinalization.claimId !== claimId) {
    return { claimed: false };
  }
  const permits = await ScoringPermit.find({ matchId, state: "ACTIVE" })
    .select("permitId")
    .lean();
  if (permits.length !== match.scoringAccess.activePermitCount) {
    await updateFinalizationClaim(
      matchId,
      operationId,
      claimId,
      "RECONCILIATION_REQUIRED",
      "PERMIT_COUNT_MISMATCH"
    );
    return { claimed: true, failureReason: "PERMIT_COUNT_MISMATCH" };
  }

  for (const permit of permits) {
    try {
      const journal = await getPermitOperationOutcome(matchId, permit.permitId);
      const releaseState = definitivePermitReleaseState(journal);
      if (!releaseState) {
        await updateFinalizationClaim(
          matchId,
          operationId,
          claimId,
          "RECONCILIATION_REQUIRED",
          "JOURNAL_UNRESOLVED"
        );
        return { claimed: true, failureReason: "JOURNAL_UNRESOLVED" };
      }
      await releaseScoringPermit(matchId, permit.permitId, { state: releaseState });
    } catch (error) {
      if (error.statusCode === 503) {
        await updateFinalizationClaim(
          matchId,
          operationId,
          claimId,
          "RECONCILIATION_REQUIRED",
          "SCORING_SERVICE_UNAVAILABLE"
        );
        return { claimed: true, failureReason: "SCORING_SERVICE_UNAVAILABLE" };
      }
      throw error;
    }
  }

  const [activePermitCount, activePermitRecords] = await Promise.all([
    Match.findById(matchId).select("scoringAccess.activePermitCount").lean(),
    ScoringPermit.countDocuments({ matchId, state: "ACTIVE" }),
  ]);
  if (
    activePermitCount?.scoringAccess?.activePermitCount !== 0 ||
    activePermitRecords !== 0
  ) {
    await updateFinalizationClaim(
      matchId,
      operationId,
      claimId,
      "RECONCILIATION_REQUIRED",
      "PERMIT_COUNT_MISMATCH"
    );
    return { claimed: true, failureReason: "PERMIT_COUNT_MISMATCH" };
  }
  return { claimed: true, failureReason: null };
}

async function cancelFinalizationForMatchState(matchId, operationId, claimId) {
  return runScoringPermitTransaction(async (session) => {
    const match = await Match.findById(matchId).session(session);
    const pending = match?.scoringAccess?.pendingFinalization;
    if (!match || pending?.operationId !== operationId || pending.claimId !== claimId) {
      return null;
    }
    if (match.status !== "cancelled") return null;
    match.scoringAccess.permitGate = "CLOSED";
    match.scoringAccess.finalizationHistory.push({
      operationId,
      requestId: pending.requestId,
      initiatedByService: pending.initiatedByService,
      status: "CANCELLED",
      failureReason: "MATCH_CANCELLED",
      createdAt: pending.createdAt,
      resolvedAt: new Date(),
    });
    match.scoringAccess.pendingFinalization = null;
    await match.save({ session, validateModifiedOnly: true });
    return match;
  });
}

async function persistFinalization(matchId, operationId, claimId, result) {
  return runScoringPermitTransaction(async (session) => {
    const match = await Match.findById(matchId)
      .select("+scoringTransferHistory")
      .session(session);
    if (!match) throw new MatchServiceError("Match not found.", 404);
    if (match.status === "completed" && match.result) return match;

    const pending = match.scoringAccess?.pendingFinalization;
    if (
      pending?.operationId !== operationId ||
      pending.claimId !== claimId ||
      pending.status !== "FINALIZING" ||
      match.scoringAccess.permitGate !== "DRAINING"
    ) {
      throw new MatchServiceError(
        "Finalization claim changed before result persistence.",
        409,
        true
      );
    }
    if (!isScoringMatchEligible(match)) {
      if (match.status === "cancelled") {
        match.scoringAccess.permitGate = "CLOSED";
        match.scoringAccess.finalizationHistory.push({
          operationId,
          requestId: pending.requestId,
          initiatedByService: pending.initiatedByService,
          status: "CANCELLED",
          failureReason: "MATCH_CANCELLED",
          createdAt: pending.createdAt,
          resolvedAt: new Date(),
        });
        match.scoringAccess.pendingFinalization = null;
        await match.save({ session, validateModifiedOnly: true });
        return match;
      }
      throw new MatchServiceError("Match is no longer eligible for finalization.", 409);
    }
    const [activePermits, activePermitCount] = await Promise.all([
      ScoringPermit.countDocuments({ matchId, state: "ACTIVE" }).session(session),
      Promise.resolve(match.scoringAccess.activePermitCount),
    ]);
    if (activePermits !== 0 || activePermitCount !== 0) {
      throw new MatchServiceError(
        "Active scoring permits remain; finalization is blocked.",
        409,
        true
      );
    }

    match.status = "completed";
    match.result = result;
    match.scoringAccess.permitGate = "CLOSED";
    match.scoringAccess.finalizationHistory.push({
      operationId,
      requestId: pending.requestId,
      initiatedByService: pending.initiatedByService,
      status: "COMPLETED",
      failureReason: null,
      createdAt: pending.createdAt,
      resolvedAt: new Date(),
    });
    match.scoringAccess.pendingFinalization = null;
    await match.save({ session, validateModifiedOnly: true });
    return match;
  });
}

async function completeExistingMatchPermitReconciliation(
  matchId,
  operationId,
  claimId
) {
  return runScoringPermitTransaction(async (session) => {
    const match = await Match.findById(matchId).session(session);
    const pending = match?.scoringAccess?.pendingFinalization;
    if (
      !match ||
      match.status !== "completed" ||
      !match.result ||
      pending?.operationId !== operationId ||
      pending.claimId !== claimId ||
      pending.status !== "FINALIZING" ||
      match.scoringAccess.permitGate !== "CLOSED"
    ) {
      throw new MatchServiceError(
        "Completed-match permit reconciliation claim changed.",
        409,
        true
      );
    }

    const [activePermitRecords, activePermitCount] = await Promise.all([
      ScoringPermit.countDocuments({ matchId, state: "ACTIVE" }).session(session),
      Promise.resolve(match.scoringAccess.activePermitCount),
    ]);
    if (activePermitRecords !== 0 || activePermitCount !== 0) {
      throw new MatchServiceError(
        "Active scoring permits remain; completed-match reconciliation is blocked.",
        409,
        true
      );
    }

    const history = match.scoringAccess.finalizationHistory || [];
    if (!history.some((entry) => entry.operationId === operationId)) {
      history.push({
        operationId,
        requestId: pending.requestId,
        initiatedByService: pending.initiatedByService,
        status: "COMPLETED",
        failureReason: null,
        createdAt: pending.createdAt,
        resolvedAt: new Date(),
      });
      match.scoringAccess.finalizationHistory = history;
    }
    match.scoringAccess.pendingFinalization = null;
    match.scoringAccess.permitGate = "CLOSED";
    await match.save({ session, validateModifiedOnly: true });
    return match;
  });
}

async function advanceFinalization(matchId, operationId) {
  const { match: claimedMatch, claimId } = await claimFinalization(
    matchId,
    operationId
  );
  if (!claimedMatch) throw new MatchServiceError("Match not found.", 404);
  if (!claimId) {
    const pending = claimedMatch.scoringAccess?.pendingFinalization;
    if (pending?.operationId === operationId) {
      return finalizationOperationView(pending, claimedMatch);
    }
    if (claimedMatch.status === "completed" && claimedMatch.result) {
      const entry = (claimedMatch.scoringAccess?.finalizationHistory || []).find(
        (item) => item.operationId === operationId
      );
      return entry
        ? finalizationHistoryView(entry, claimedMatch)
        : finalizationOperationView({
            operationId,
            status: "RECONCILIATION_REQUIRED",
            failureReason: null,
          }, claimedMatch);
    }
    if (!pending || pending.operationId !== operationId) {
      const entry = (claimedMatch.scoringAccess?.finalizationHistory || []).find(
        (item) => item.operationId === operationId
      );
      if (entry) return finalizationHistoryView(entry, claimedMatch);
      throw new MatchServiceError("Finalization operation not found.", 404);
    }
    return finalizationOperationView(pending);
  }

  const reconciliation = await reconcileActivePermits(
    matchId,
    operationId,
    claimId
  );
  if (!reconciliation.claimed) {
    const latest = await Match.findById(matchId).lean();
    const pending = latest?.scoringAccess?.pendingFinalization;
    if (pending?.operationId === operationId) {
      return finalizationOperationView(pending, latest);
    }
    const entry = (latest?.scoringAccess?.finalizationHistory || []).find(
      (item) => item.operationId === operationId
    );
    if (entry) return finalizationHistoryView(entry, latest);
    return finalizationOperationView(
      {
        operationId,
        status: "RECONCILIATION_REQUIRED",
        failureReason: null,
      },
      latest
    );
  }
  if (reconciliation.failureReason) {
    const latest = await Match.findById(matchId).lean();
    return finalizationOperationView(
      latest?.scoringAccess?.pendingFinalization || {
        operationId,
        status: "RECONCILIATION_REQUIRED",
        failureReason: reconciliation.failureReason,
      }
    );
  }

  let current = await Match.findById(matchId).lean();
  if (!current) throw new MatchServiceError("Match not found.", 404);
  if (current.status === "completed" && current.result) {
    const reconciledMatch = await completeExistingMatchPermitReconciliation(
      matchId,
      operationId,
      claimId
    );
    const entry = reconciledMatch.scoringAccess?.finalizationHistory?.find(
      (item) => item.operationId === operationId
    );
    return entry
      ? finalizationHistoryView(entry, reconciledMatch)
      : {
          operationId,
          operationStatus: "COMPLETED",
          match: publicMatchView(reconciledMatch),
        };
  }
  if (current.status === "cancelled") {
    const cancelled = await cancelFinalizationForMatchState(
      matchId,
      operationId,
      claimId
    );
    const entry = cancelled?.scoringAccess?.finalizationHistory?.find(
      (item) => item.operationId === operationId
    );
    return entry
      ? finalizationHistoryView(entry, cancelled)
      : finalizationOperationView(
          current.scoringAccess.pendingFinalization
        );
  }

  try {
    if (!isScoringMatchEligible(current)) {
      throw new MatchServiceError("Match is no longer eligible for finalization.", 409);
    }
    validateLimitedOversMatch(current);
    const innings = await getScoringInnings(matchId);
    if (innings.length !== 2) {
      throw new MatchServiceError(
        "Exactly two innings are required to finalize this match.",
        409
      );
    }
    current = await Match.findById(matchId).lean();
    if (
      !current ||
      !isScoringMatchEligible(current) ||
      current.scoringAccess?.pendingFinalization?.operationId !== operationId ||
      current.scoringAccess.pendingFinalization.claimId !== claimId
    ) {
      throw new MatchServiceError(
        "Match state changed while finalization was in progress.",
        409
      );
    }

    const result = calculateMatchResult(current, innings);
    if (result.outcome !== "NO_RESULT") {
      result.awards = await getScoringAwards(matchId, current);
    }

    const finalizedMatch = await persistFinalization(
      matchId,
      operationId,
      claimId,
      result
    );
    if (finalizedMatch.status === "completed" && finalizedMatch.result) {
      const entry = finalizedMatch.scoringAccess?.finalizationHistory?.find(
        (item) => item.operationId === operationId
      );
      return entry
        ? finalizationHistoryView(entry, finalizedMatch)
        : {
            operationId,
            operationStatus: "COMPLETED",
            match: publicMatchView(finalizedMatch),
          };
    }
    const cancelledEntry = finalizedMatch.scoringAccess?.finalizationHistory?.find(
      (item) => item.operationId === operationId
    );
    if (cancelledEntry) return finalizationHistoryView(cancelledEntry, finalizedMatch);
    return finalizationOperationView(
      finalizedMatch.scoringAccess.pendingFinalization
    );
  } catch (error) {
    const latest = await Match.findById(matchId).lean().catch(() => null);
    const completedEntry = latest?.scoringAccess?.finalizationHistory?.find(
      (entry) => entry.operationId === operationId
    );
    if (latest?.status === "completed" && latest.result && completedEntry) {
      return finalizationHistoryView(completedEntry, latest);
    }
    if (error?.hasErrorLabel?.("UnknownTransactionCommitResult")) {
      return finalizationOperationView(
        latest?.scoringAccess?.pendingFinalization || {
          operationId,
          status: "FINALIZING",
          failureReason: "COMMIT_OUTCOME_UNKNOWN",
        }
      );
    }
    const failureReason =
      error.statusCode === 503
        ? error.message?.includes("Awards")
          ? "AWARDS_UNAVAILABLE"
          : "SCORING_SERVICE_UNAVAILABLE"
        : "FINALIZATION_DATA_INVALID";
    await updateFinalizationClaim(
      matchId,
      operationId,
      claimId,
      "RECONCILIATION_REQUIRED",
      failureReason
    ).catch((updateError) => {
      console.error("Unable to persist finalization recovery status.", {
        matchId: String(matchId),
        operationId,
        error: updateError.message,
      });
    });
    const updated = await Match.findById(matchId).lean().catch(() => null);
    return finalizationOperationView(
      updated?.scoringAccess?.pendingFinalization || {
        operationId,
        status: "RECONCILIATION_REQUIRED",
        failureReason,
      }
    );
  }
}

export async function finalizeMatch(id, requestId) {
  const matchId = parseMatchId(id);
  validateFinalizationRequestId(requestId);
  let started;
  try {
    started = await beginFinalization(matchId, requestId);
  } catch (error) {
    const state = await findFinalizationState(matchId, requestId).catch(() => null);
    if (state?.operation) {
      return advanceFinalization(matchId, state.operation.operationId);
    }
    if (state?.historyEntry) {
      return finalizationHistoryView(state.historyEntry, state.match);
    }
    if (error instanceof MatchServiceError) throw error;
    throw new MatchServiceError(
      "Finalization start could not be confirmed. Retry with the same Idempotency-Key.",
      503,
      true
    );
  }

  if (started.completed) {
    const historyEntry = started.historyEntry;
    return historyEntry
      ? finalizationHistoryView(historyEntry, started.match)
      : {
          operationId: null,
          operationStatus: "COMPLETED",
          match: publicMatchView(started.match),
        };
  }
  if (started.historyEntry) {
    return finalizationHistoryView(started.historyEntry, started.match);
  }
  return advanceFinalization(matchId, started.operation.operationId);
}

export async function getFinalizationOperationStatus(
  matchIdInput,
  operationId,
  userId
) {
  const matchId = parseMatchId(matchIdInput);
  if (
    typeof operationId !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      operationId
    )
  ) {
    throw new MatchServiceError("Invalid finalization operation ID.", 400);
  }
  const actorId = userIdString(userId);
  const match = await Match.findById(matchId).lean();
  if (!match) throw new MatchServiceError("Match not found.", 404);
  assertMatchOwnerOrScorer(match, actorId);

  const pending = match.scoringAccess?.pendingFinalization;
  if (pending?.operationId === operationId) {
    return advanceFinalization(matchId, operationId);
  }
  const entry = (match.scoringAccess?.finalizationHistory || []).find(
    (item) => item.operationId === operationId
  );
  if (entry) return finalizationHistoryView(entry, match);
  throw new MatchServiceError("Finalization operation not found.", 404);
}

export async function resumePendingMatchFinalizations() {
  const pendingMatches = Match.find({
    "scoringAccess.pendingFinalization.status": {
      $in: ["DRAINING", "RECONCILIATION_REQUIRED", "FINALIZING"],
    },
    $or: [
      { "scoringAccess.permitGate": "DRAINING" },
      {
        "scoringAccess.permitGate": "CLOSED",
        status: "completed",
      },
    ],
  })
    .select("_id scoringAccess.pendingFinalization.operationId")
    .cursor();

  for await (const match of pendingMatches) {
    const operationId = match.scoringAccess?.pendingFinalization?.operationId;
    if (!operationId) continue;
    try {
      await advanceFinalization(match._id, operationId);
    } catch (error) {
      console.error("Unable to resume pending match finalization.", {
        matchId: String(match._id),
        operationId,
        error: error.message,
      });
    }
  }
}

function matchCancellationOperationView(operation, match = null) {
  return {
    operationId: operation.operationId,
    operationStatus: operation.status,
    failureReason: operation.failureReason || null,
    ...(match ? { match: publicMatchView(match) } : {}),
  };
}

function matchCancellationHistoryView(entry, match = null) {
  return {
    operationId: entry.operationId,
    operationStatus: "CANCELLED",
    cancelledAt: entry.cancelledAt,
    reason: entry.reason || null,
    ...(match ? { match: publicMatchView(match) } : {}),
  };
}

async function setCancellationReconciliationState(
  matchId,
  operationId,
  failureReason
) {
  await Match.updateOne(
    {
      _id: matchId,
      "scoringAccess.pendingCancellation.operationId": operationId,
      "scoringAccess.permitGate": "DRAINING",
    },
    {
      $set: {
        "scoringAccess.pendingCancellation.status": "RECONCILIATION_REQUIRED",
        "scoringAccess.pendingCancellation.failureReason": failureReason,
        "scoringAccess.pendingCancellation.updatedAt": new Date(),
      },
    },
    { runValidators: true }
  );
}

async function advanceMatchCancellation(matchId, operationId) {
  const match = await Match.findById(matchId).lean();
  if (!match) throw new MatchServiceError("Match not found.", 404);
  const pending = match.scoringAccess?.pendingCancellation;
  if (pending?.operationId !== operationId) {
    const historyEntry = (match.scoringAccess?.cancellationHistory || []).find(
      (entry) => entry.operationId === operationId
    );
    if (historyEntry) {
      return matchCancellationHistoryView(historyEntry, match);
    }
    throw new MatchServiceError("Match cancellation operation not found.", 404);
  }
  if (match.status === "completed") {
    throw new MatchServiceError(
      "A completed match cannot be cancelled.",
      409,
      true
    );
  }
  if (match.status === "cancelled") {
    throw new MatchServiceError(
      "Cancellation is being reconciled against an already cancelled match.",
      409,
      true
    );
  }
  if (match.scoringAccess?.permitGate !== "DRAINING") {
    throw new MatchServiceError(
      "Match cancellation permit gate is inconsistent.",
      409,
      true
    );
  }

  const permits = await ScoringPermit.find({
    matchId,
    state: "ACTIVE",
  })
    .select("permitId")
    .lean();
  if (permits.length !== match.scoringAccess.activePermitCount) {
    await setCancellationReconciliationState(
      matchId,
      operationId,
      "PERMIT_COUNT_MISMATCH"
    );
    const current = await Match.findById(matchId).lean();
    return matchCancellationOperationView(
      current?.scoringAccess?.pendingCancellation || pending,
      current
    );
  }

  for (const permit of permits) {
    try {
      const journal = await getPermitOperationOutcome(matchId, permit.permitId);
      const releaseState = definitivePermitReleaseState(journal);
      if (!releaseState) {
        await setCancellationReconciliationState(
          matchId,
          operationId,
          "JOURNAL_UNRESOLVED"
        );
        const current = await Match.findById(matchId).lean();
        return matchCancellationOperationView(
          current?.scoringAccess?.pendingCancellation || pending,
          current
        );
      }
      await releaseScoringPermit(matchId, permit.permitId, {
        state: releaseState,
      });
    } catch (error) {
      if (error.statusCode !== 503) throw error;
      await setCancellationReconciliationState(
        matchId,
        operationId,
        "SCORING_SERVICE_UNAVAILABLE"
      );
      const current = await Match.findById(matchId).lean();
      return matchCancellationOperationView(
        current?.scoringAccess?.pendingCancellation || pending,
        current
      );
    }
  }

  return runScoringPermitTransaction(async (session) => {
    const current = await Match.findById(matchId).session(session);
    if (!current) throw new MatchServiceError("Match not found.", 404);
    const currentPending = current.scoringAccess?.pendingCancellation;
    if (currentPending?.operationId !== operationId) {
      const entry = (current.scoringAccess?.cancellationHistory || []).find(
        (item) => item.operationId === operationId
      );
      return entry
        ? matchCancellationHistoryView(entry, current)
        : matchCancellationOperationView(currentPending, current);
    }
    if (current.status === "completed") {
      throw new MatchServiceError(
        "A completed match cannot be cancelled.",
        409,
        true
      );
    }
    if (current.status === "cancelled") {
      throw new MatchServiceError(
        "Cancellation is being reconciled against an already cancelled match.",
        409,
        true
      );
    }

    const activePermits = await getActivePermitCount(matchId, session);
    if (
      current.scoringAccess.permitGate !== "DRAINING" ||
      activePermits !== 0 ||
      current.scoringAccess.activePermitCount !== 0
    ) {
      return matchCancellationOperationView(currentPending, current);
    }

    const cancelledAt = new Date();
    current.status = "cancelled";
    current.cancellation = {
      cancelledAt,
      cancelledBy: currentPending.requestedBy,
      reason: currentPending.reason,
    };
    current.scoringAccess.permitGate = "CLOSED";
    current.scoringAccess.pendingCancellation = null;
    current.scoringAccess.cancellationHistory.push({
      operationId,
      requestId: currentPending.requestId,
      cancelledBy: currentPending.requestedBy,
      reason: currentPending.reason,
      cancelledAt,
    });
    await current.save({ session, validateModifiedOnly: true });
    return matchCancellationHistoryView(
      current.scoringAccess.cancellationHistory[
        current.scoringAccess.cancellationHistory.length - 1
      ],
      current
    );
  });
}

export async function cancelMatch(id, userId, requestId, reasonInput) {
  const matchId = parseMatchId(id);
  validateFinalizationRequestId(requestId);
  if (
    reasonInput !== undefined &&
    reasonInput !== null &&
    typeof reasonInput !== "string"
  ) {
    throw new MatchServiceError("Cancellation reason must be text.", 400);
  }
  const reason = typeof reasonInput === "string" ? reasonInput.trim() : "";
  if (reason.length > 500) {
    throw new MatchServiceError(
      "Cancellation reason cannot exceed 500 characters.",
      400
    );
  }

  const actorId = userIdString(userId);
  const established = await getMatchWithEstablishedOwnership(matchId);
  if (
    String(established.scoringAccess.ownerId).toLowerCase() !==
    actorId.toLowerCase()
  ) {
    throw new MatchServiceError("Only the permanent match owner can cancel it.", 403, true);
  }

  const started = await runScoringPermitTransaction(async (session) => {
    const match = await Match.findById(matchId).session(session);
    if (!match) throw new MatchServiceError("Match not found.", 404);
    const access = match.scoringAccess;
    if (
      String(access?.ownerId).toLowerCase() !== actorId.toLowerCase()
    ) {
      throw new MatchServiceError("Only the permanent match owner can cancel it.", 403, true);
    }
    if (match.status === "cancelled") {
      return { match, operation: null };
    }
    if (match.status === "completed") {
      throw new MatchServiceError("A completed match cannot be cancelled.", 409, true);
    }

    const pending = access.pendingCancellation;
    if (pending) {
      if (String(pending.requestedBy).toLowerCase() !== actorId.toLowerCase()) {
        throw new MatchServiceError(
          "Another match cancellation is already pending.",
          409,
          true
        );
      }
      return { match, operation: pending };
    }
    if (
      access.permitGate !== "OPEN" ||
      access.pendingChange?.status === "DRAINING" ||
      access.pendingFinalization
    ) {
      throw new MatchServiceError(
        "Another scoring access or finalization operation is in progress. Retry cancellation after it resolves.",
        409,
        true
      );
    }

    const activePermitRecords = await getActivePermitCount(matchId, session);
    const countsMatch =
      Number.isInteger(access.activePermitCount) &&
      access.activePermitCount === activePermitRecords;
    const now = new Date();
    const operation = {
      operationId: randomUUID(),
      requestId,
      requestedBy: actorId,
      reason: reason || null,
      status: countsMatch ? "DRAINING" : "RECONCILIATION_REQUIRED",
      failureReason: countsMatch ? null : "PERMIT_COUNT_MISMATCH",
      requestedAt: now,
      updatedAt: now,
    };
    access.permitGate = "DRAINING";
    access.pendingCancellation = operation;
    await match.save({ session, validateModifiedOnly: true });
    return { match, operation };
  });

  if (!started.operation) {
    const history = (started.match.scoringAccess?.cancellationHistory || []).find(
      (entry) => String(entry.cancelledBy) === actorId
    );
    return history
      ? matchCancellationHistoryView(history, started.match)
      : {
          operationId: null,
          operationStatus: "CANCELLED",
          match: publicMatchView(started.match),
        };
  }
  return advanceMatchCancellation(matchId, started.operation.operationId);
}

export async function getMatchCancellationOperationStatus(
  id,
  operationId,
  userId
) {
  const matchId = parseMatchId(id);
  if (
    typeof operationId !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      operationId
    )
  ) {
    throw new MatchServiceError("Invalid cancellation operation ID.", 400);
  }
  const actorId = userIdString(userId);
  const match = await Match.findById(matchId).lean();
  if (!match) throw new MatchServiceError("Match not found.", 404);
  if (
    String(match.scoringAccess?.ownerId).toLowerCase() !==
    actorId.toLowerCase()
  ) {
    throw new MatchServiceError("Only the match owner can view cancellation status.", 403, true);
  }
  if (match.scoringAccess?.pendingCancellation?.operationId === operationId) {
    return advanceMatchCancellation(matchId, operationId);
  }
  const history = (match.scoringAccess?.cancellationHistory || []).find(
    (entry) => entry.operationId === operationId
  );
  if (history) return matchCancellationHistoryView(history, match);
  throw new MatchServiceError("Match cancellation operation not found.", 404);
}

export async function getScoringAccess(id, userId) {
  const matchId = parseMatchId(id);
  const match = await getMatchWithEstablishedOwnership(matchId);
  const finalizationHistory = match.scoringAccess?.finalizationHistory || [];
  const isOwner =
    String(match.scoringAccess?.ownerId).toLowerCase() ===
    String(userId).toLowerCase();
  return {
    ...accessView(match, userId),
    matchId: match._id.toString(),
    matchStatus: match.status,
    permitGate: match.scoringAccess?.permitGate || null,
    activePermitCount: match.scoringAccess?.activePermitCount ?? null,
    pendingOperation: match.scoringAccess?.pendingChange
      ? {
          operationId: match.scoringAccess.pendingChange.operationId,
          action: match.scoringAccess.pendingChange.action,
          status: match.scoringAccess.pendingChange.status,
        }
      : null,
    pendingCancellation: isOwner && match.scoringAccess?.pendingCancellation
      ? {
          operationId: match.scoringAccess.pendingCancellation.operationId,
          status: match.scoringAccess.pendingCancellation.status,
          failureReason:
            match.scoringAccess.pendingCancellation.failureReason || null,
        }
      : null,
    pendingFinalization: match.scoringAccess?.pendingFinalization
      ? {
          operationId: match.scoringAccess.pendingFinalization.operationId,
          status: match.scoringAccess.pendingFinalization.status,
          failureReason: match.scoringAccess.pendingFinalization.failureReason,
        }
      : null,
    finalizationStatus:
      match.scoringAccess?.pendingFinalization?.status ||
      finalizationHistory[finalizationHistory.length - 1]?.status ||
      null,
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
  if (access.permitGate !== "OPEN") {
    throw new MatchServiceError(
      "Scoring changes are temporarily blocked while scoring access is draining or closed.",
      409,
      true
    );
  }
  return access;
}

export async function transferScoringAccess(id, targetUserId, userId, cookie) {
  const matchId = parseMatchId(id);
  const match = await getMatchWithEstablishedOwnership(matchId);
  const actorId = userIdString(userId);
  assertMatchOwnerOrScorer(match, actorId);
  if (!isScoringMatchEligible(match)) {
    throw new MatchServiceError("Scoring cannot be transferred for this match.", 409, true);
  }
  if (typeof targetUserId !== "string" || !/^[a-f\d]{24}$/i.test(targetUserId)) {
    throw new MatchServiceError("Invalid target user ID.", 400);
  }
  const normalizedTargetId = targetUserId.toLowerCase();
  if (normalizedTargetId === actorId.toLowerCase()) {
    throw new MatchServiceError("Scoring cannot be transferred to the current user or scorer.", 400);
  }
  if (
    String(match.scoringAccess.activeScorerId).toLowerCase() ===
    normalizedTargetId
  ) {
    return {
      ...accessView(match, actorId),
      operationStatus: "COMPLETED",
      operationId: null,
    };
  }
  const pending = match.scoringAccess.pendingChange;
  const matchingPending =
    pending?.status === "DRAINING" &&
    pending.action === "TRANSFER" &&
    String(pending.toUserId).toLowerCase() === normalizedTargetId &&
    String(pending.requestedBy).toLowerCase() === actorId.toLowerCase();
  if (!matchingPending) {
    await requireRegisteredTransferTarget(normalizedTargetId, cookie);
  }
  return beginScoringAccessChange(
    match,
    "TRANSFER",
    new mongoose.Types.ObjectId(normalizedTargetId),
    actorId
  );
}

export async function reclaimScoringAccess(id, userId) {
  const matchId = parseMatchId(id);
  const match = await getMatchWithEstablishedOwnership(matchId);
  const actorId = userIdString(userId);
  if (String(match.scoringAccess.ownerId).toLowerCase() !== actorId.toLowerCase()) {
    throw new MatchServiceError("Only the match owner can reclaim scoring.", 403, true);
  }
  if (!isScoringMatchEligible(match)) {
    throw new MatchServiceError("Scoring cannot be reclaimed for this match.", 409, true);
  }
  if (
    String(match.scoringAccess.activeScorerId).toLowerCase() === actorId.toLowerCase()
  ) {
    if (match.scoringAccess.pendingChange?.status === "DRAINING") {
      throw new MatchServiceError(
        "Another scoring access change is already pending.",
        409,
        true
      );
    }
    return {
      ...accessView(match, actorId),
      operationStatus: "COMPLETED",
      operationId: null,
    };
  }

  return beginScoringAccessChange(
    match,
    "RECLAIM",
    match.scoringAccess.ownerId,
    actorId
  );
}

export async function getScoringAccessOperationStatus(
  matchIdInput,
  operationId,
  userId
) {
  const matchId = parseMatchId(matchIdInput);
  if (
    typeof operationId !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      operationId
    )
  ) {
    throw new MatchServiceError("Invalid scoring access operation ID.", 400);
  }
  const actorId = userIdString(userId);
  const match = await Match.findById(matchId).select("+scoringTransferHistory");
  if (!match) throw new MatchServiceError("Match not found.", 404);
  const access = match.scoringAccess;
  const pending = access?.pendingChange;
  const historyEntry = (access?.changeHistory || []).find(
    (entry) => entry.operationId === operationId
  );
  const requestedBy =
    pending?.operationId === operationId
      ? pending.requestedBy
      : historyEntry?.requestedBy;
  if (
    String(access?.ownerId).toLowerCase() !== actorId.toLowerCase() &&
    String(access?.activeScorerId).toLowerCase() !== actorId.toLowerCase() &&
    String(requestedBy).toLowerCase() !== actorId.toLowerCase()
  ) {
    throw new MatchServiceError("You cannot view this scoring access operation.", 403, true);
  }

  if (pending?.operationId === operationId) {
    if (pending.status === "DRAINING") {
      return advancePendingScoringChange(
        matchId,
        operationId,
        actorId
      );
    }
    return scoringChangeView(match, operationId, pending.status, actorId);
  }
  if (historyEntry) {
    return scoringChangeView(match, operationId, historyEntry.status, actorId);
  }
  throw new MatchServiceError("Scoring access operation not found.", 404);
}

export async function resumePendingScoringAccessChanges() {
  const pendingMatches = Match.find({
    "scoringAccess.permitGate": "DRAINING",
    "scoringAccess.pendingChange.status": "DRAINING",
  })
    .select("_id scoringAccess.pendingChange.operationId")
    .cursor();

  for await (const match of pendingMatches) {
    const matchId = match._id;
    try {
      const operationId = match?.scoringAccess?.pendingChange?.operationId;
      if (operationId) {
        await advancePendingScoringChange(matchId, operationId, "");
      }
    } catch (error) {
      if (error.statusCode === 503) continue;
      console.error("Unable to resume pending scoring access change.", {
        matchId: String(matchId),
        error: error.message,
      });
    }
  }

  const pendingCancellations = Match.find({
    "scoringAccess.permitGate": "DRAINING",
    "scoringAccess.pendingCancellation.status": {
      $in: ["DRAINING", "RECONCILIATION_REQUIRED"],
    },
  })
    .select("_id scoringAccess.pendingCancellation.operationId")
    .cursor();

  for await (const match of pendingCancellations) {
    const operationId = match.scoringAccess?.pendingCancellation?.operationId;
    if (!operationId) continue;
    try {
      await advanceMatchCancellation(match._id, operationId);
    } catch (error) {
      if (error.statusCode === 503) continue;
      console.error("Unable to resume pending match cancellation.", {
        matchId: String(match._id),
        operationId,
        error: error.message,
      });
    }
  }
}
