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
}

function sameOperationIdentity(operation, input) {
  return (
    String(operation.matchId) === String(input.matchId) &&
    String(operation.inningsId) === String(input.inningsId) &&
    String(operation.scorerId) === String(input.scorerId) &&
    operation.permissionVersion === input.permissionVersion &&
    operation.permitId === input.permitId
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

export async function transitionScoringOperation(operationId, nextStatus) {
  validateOperationId(operationId);
  if (!operationStates.includes(nextStatus)) {
    throw new ScoringOperationError("Invalid scoring operation state.", 400);
  }

  const current = await ScoringOperation.findOne({ operationId }).lean();
  if (!current) throw new ScoringOperationError("Scoring operation not found.", 404);
  if (current.status === nextStatus) return current;

  if (!allowedTransitions[current.status]?.includes(nextStatus)) {
    throw new ScoringOperationError(
      `Scoring operation cannot transition from ${current.status} to ${nextStatus}.`,
      409
    );
  }

  const update = { status: nextStatus };
  if (nextStatus === "COMMITTED" || nextStatus === "ABORTED") {
    update.resolvedAt = new Date();
  }

  const transitioned = await ScoringOperation.findOneAndUpdate(
    { operationId, status: current.status },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();
  if (transitioned) return transitioned;

  const latest = await ScoringOperation.findOne({ operationId }).lean();
  if (latest?.status === nextStatus) return latest;
  throw new ScoringOperationError(
    "Scoring operation changed concurrently; reload before retrying.",
    409
  );
}
