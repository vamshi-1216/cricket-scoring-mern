import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { ScoringOperation } from "./scoring-operation.model.js";

const operationStates = [
  "PREPARED",
  "COMMITTED",
  "ABORTED",
  "RELEASE_PENDING",
  "RELEASED",
];

const allowedTransitions = {
  PREPARED: ["COMMITTED", "ABORTED"],
  COMMITTED: ["RELEASE_PENDING"],
  ABORTED: ["RELEASE_PENDING"],
  RELEASE_PENDING: ["RELEASED"],
  RELEASED: [],
};

const uuidSchema = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ScoringOperationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ScoringOperationError";
    this.statusCode = statusCode;
  }
}

function isObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function validateCreateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ScoringOperationError("Scoring operation details are required.", 400);
  }
  if (
    typeof input.requestId !== "string" ||
    input.requestId.length < 1 ||
    input.requestId.length > 128 ||
    !/\S/.test(input.requestId)
  ) {
    throw new ScoringOperationError("A valid request ID is required.", 400);
  }
  for (const field of ["matchId", "inningsId", "scorerId"]) {
    if (!isObjectId(input[field])) {
      throw new ScoringOperationError(`Invalid ${field}.`, 400);
    }
  }
  if (!Number.isInteger(input.permissionVersion) || input.permissionVersion < 1) {
    throw new ScoringOperationError("Invalid permission version.", 400);
  }
  if (typeof input.permitId !== "string" || !uuidSchema.test(input.permitId)) {
    throw new ScoringOperationError("Invalid permit ID.", 400);
  }
  if (
    typeof input.requestFingerprint !== "string" ||
    !/^[a-f\d]{64}$/i.test(input.requestFingerprint)
  ) {
    throw new ScoringOperationError("Invalid request fingerprint.", 400);
  }
}

function sameOperationIdentity(operation, input) {
  return (
    String(operation.matchId) === String(input.matchId) &&
    String(operation.inningsId) === String(input.inningsId) &&
    String(operation.scorerId) === String(input.scorerId) &&
    operation.permissionVersion === input.permissionVersion &&
    operation.permitId === input.permitId &&
    operation.requestFingerprint === input.requestFingerprint
  );
}

function validateOperationId(operationId) {
  if (typeof operationId !== "string" || !uuidSchema.test(operationId)) {
    throw new ScoringOperationError("Invalid operation ID.", 400);
  }
}

export async function createScoringOperation(input) {
  validateCreateInput(input);

  const identity = {
    ...input,
    matchId: new mongoose.Types.ObjectId(input.matchId),
    inningsId: new mongoose.Types.ObjectId(input.inningsId),
    scorerId: new mongoose.Types.ObjectId(input.scorerId),
  };
  const existing = await ScoringOperation.findOne({
    matchId: identity.matchId,
    requestId: identity.requestId,
  }).lean();
  if (existing) {
    if (!sameOperationIdentity(existing, identity)) {
      throw new ScoringOperationError(
        "Request ID is already associated with a different scoring operation.",
        409
      );
    }
    return { operation: existing, created: false };
  }

  try {
    const operation = await ScoringOperation.create({
      operationId: randomUUID(),
      ...identity,
      status: "PREPARED",
      resolvedAt: null,
    });
    return { operation: operation.toObject(), created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const duplicate = await ScoringOperation.findOne({
      matchId: identity.matchId,
      requestId: identity.requestId,
    }).lean();
    if (!duplicate) throw error;
    if (!sameOperationIdentity(duplicate, identity)) {
      throw new ScoringOperationError(
        "Request ID is already associated with a different scoring operation.",
        409
      );
    }
    return { operation: duplicate, created: false };
  }
}

export async function getScoringOperation(operationId) {
  validateOperationId(operationId);
  const operation = await ScoringOperation.findOne({ operationId }).lean();
  if (!operation) throw new ScoringOperationError("Scoring operation not found.", 404);
  return operation;
}

export async function getScoringOperationByRequest(matchId, requestId) {
  if (!isObjectId(matchId)) {
    throw new ScoringOperationError("Invalid match ID.", 400);
  }
  if (
    typeof requestId !== "string" ||
    requestId.length < 1 ||
    requestId.length > 128 ||
    !/\S/.test(requestId)
  ) {
    throw new ScoringOperationError("A valid request ID is required.", 400);
  }
  return ScoringOperation.findOne({
    matchId: new mongoose.Types.ObjectId(matchId),
    requestId,
  }).lean();
}

export async function transitionScoringOperation(
  operationId,
  nextStatus,
  { session, outcome, responseSnapshot } = {}
) {
  validateOperationId(operationId);
  if (!operationStates.includes(nextStatus)) {
    throw new ScoringOperationError("Invalid scoring operation state.", 400);
  }

  const currentQuery = ScoringOperation.findOne({ operationId });
  if (session) currentQuery.session(session);
  const current = await currentQuery.lean();
  if (!current) throw new ScoringOperationError("Scoring operation not found.", 404);
  if (current.status === nextStatus) {
    if (outcome && current.outcome !== outcome) {
      throw new ScoringOperationError(
        "Scoring operation outcome cannot be changed.",
        409
      );
    }
    return current;
  }

  if (!allowedTransitions[current.status]?.includes(nextStatus)) {
    throw new ScoringOperationError(
      `Scoring operation cannot transition from ${current.status} to ${nextStatus}.`,
      409
    );
  }
  if (
    (nextStatus === "RELEASE_PENDING" || nextStatus === "RELEASED") &&
    outcome !== current.outcome
  ) {
    throw new ScoringOperationError(
      "Scoring operation outcome cannot be changed.",
      409
    );
  }
  if (
    (nextStatus === "COMMITTED" || nextStatus === "ABORTED") &&
    outcome &&
    outcome !== nextStatus
  ) {
    throw new ScoringOperationError(
      "Scoring operation outcome cannot be changed.",
      409
    );
  }
  if (
    nextStatus === "COMMITTED" &&
    (!responseSnapshot || typeof responseSnapshot !== "object")
  ) {
    throw new ScoringOperationError(
      "A committed scoring operation requires its response snapshot.",
      400
    );
  }

  const update = { status: nextStatus };
  if (nextStatus === "COMMITTED" || nextStatus === "ABORTED") {
    update.resolvedAt = new Date();
    update.outcome = nextStatus;
  }
  if (nextStatus === "RELEASE_PENDING") {
    update.outcome = outcome;
  }
  if (nextStatus === "COMMITTED" && responseSnapshot) {
    update.responseSnapshot = responseSnapshot;
  }

  const transitionQuery = ScoringOperation.findOneAndUpdate(
    { operationId, status: current.status },
    { $set: update },
    { new: true, runValidators: true, session }
  );
  const transitioned = await transitionQuery.lean();
  if (transitioned) return transitioned;

  const latestQuery = ScoringOperation.findOne({ operationId });
  if (session) latestQuery.session(session);
  const latest = await latestQuery.lean();
  if (latest?.status === nextStatus) return latest;
  throw new ScoringOperationError(
    "Scoring operation changed concurrently; reload before retrying.",
    409
  );
}

export async function updateScoringOperationResponse(operationId, responseSnapshot) {
  validateOperationId(operationId);
  const updated = await ScoringOperation.findOneAndUpdate(
    {
      operationId,
      status: { $in: ["COMMITTED", "RELEASE_PENDING", "RELEASED"] },
      outcome: "COMMITTED",
    },
    { $set: { responseSnapshot } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    throw new ScoringOperationError(
      "Committed scoring operation was not found for response update.",
      409
    );
  }
  return updated;
}
