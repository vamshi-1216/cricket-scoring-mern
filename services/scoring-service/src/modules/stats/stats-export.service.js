
import mongoose from "mongoose";
import { Innings } from "../innings/innings.model.js";
import { Delivery } from "../deliveries/delivery.model.js";

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

class StatsExportError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "StatsExportError";
    this.statusCode = statusCode;
  }
}

function parseObjectId(value, label) {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]{24}$/i.test(value)
  ) {
    throw new StatsExportError(`Invalid ${label}.`, 400);
  }

  return new mongoose.Types.ObjectId(value);
}

function parsePageSize(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new StatsExportError(
      "Page size must be a positive integer.",
      400
    );
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor, matchId, inningsId, sourceRevision) {
  if (!cursor) return null;

  if (typeof cursor !== "string" || cursor.length > 2048) {
    throw new StatsExportError("Invalid pagination cursor.", 400);
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
  } catch {
    throw new StatsExportError("Invalid pagination cursor.", 400);
  }

  if (
    payload.matchId !== String(matchId) ||
    payload.inningsId !== String(inningsId) ||
    payload.sourceRevision !== sourceRevision ||
    !Number.isInteger(payload.sequence) ||
    payload.sequence < 1 ||
    typeof payload.deliveryId !== "string" ||
    !/^[a-f\d]{24}$/i.test(payload.deliveryId)
  ) {
    throw new StatsExportError(
      "Pagination cursor is invalid or belongs to an older source revision.",
      409
    );
  }

  return {
    sequence: payload.sequence,
    deliveryId: new mongoose.Types.ObjectId(payload.deliveryId),
  };
}

function getInningsCompleteness(innings) {
  return {
    complete:
      innings.status === "COMPLETED" &&
      innings.completedAt instanceof Date,
    status: innings.status,
    completionReason: innings.completionReason ?? null,
    completedAt: innings.completedAt ?? null,
    matchFinalizationStatus:
      innings.matchFinalizationStatus ?? null,
  };
}

/**
 * Returns all innings for a match in innings-number order.
 *
 * Match-level completion must still be verified by Match Service.
 * This method reports Scoring Service's innings-level state only.
 */
export async function getStatsMatchExport(matchIdValue) {
  const matchId = parseObjectId(matchIdValue, "match ID");

  const inningsList = await Innings.find({ matchId })
    .sort({ inningsNumber: 1, _id: 1 })
    .lean();

  if (inningsList.length === 0) {
    throw new StatsExportError(
      "No innings found for this match.",
      404
    );
  }

  return {
    matchId: String(matchId),
    sourceService: "scoring-service",
    inningsCount: inningsList.length,
    allInningsComplete: inningsList.every(
      (innings) => getInningsCompleteness(innings).complete
    ),
    innings: inningsList.map((innings) => ({
      ...innings,
      _id: String(innings._id),
      matchId: String(innings.matchId),
      battingTeamId: String(innings.battingTeamId),
      bowlingTeamId: String(innings.bowlingTeamId),
      sourceRevision: innings.version ?? 0,
      completeness: getInningsCompleteness(innings),
    })),
  };
}

/**
 * Returns one stable, cursor-paginated delivery page for an innings.
 *
 * Cursor is scoped to match, innings and source revision.
 * If the innings changes between pages, the consumer must restart
 * pagination to avoid combining different source snapshots.
 */
export async function getStatsDeliveryPage({
  matchId: matchIdValue,
  inningsId: inningsIdValue,
  pageSize: pageSizeValue,
  cursor,
}) {
  const matchId = parseObjectId(matchIdValue, "match ID");
  const inningsId = parseObjectId(inningsIdValue, "innings ID");
  const pageSize = parsePageSize(pageSizeValue);

  const innings = await Innings.findOne({
    _id: inningsId,
    matchId,
  }).lean();

  if (!innings) {
    throw new StatsExportError(
      "Innings not found for this match.",
      404
    );
  }

  const sourceRevision = innings.version ?? 0;

  const decodedCursor = decodeCursor(
    cursor,
    matchId,
    inningsId,
    sourceRevision
  );

  const deliveryQuery = {
    matchId,
    inningsId,
  };

  if (decodedCursor) {
    deliveryQuery.$or = [
      { sequence: { $gt: decodedCursor.sequence } },
      {
        sequence: decodedCursor.sequence,
        _id: { $gt: decodedCursor.deliveryId },
      },
    ];
  }

  const rows = await Delivery.find(deliveryQuery)
    .select("-createdBy -operationId")
    .sort({ sequence: 1, _id: 1 })
    .limit(pageSize + 1)
    .lean();

  const hasMore = rows.length > pageSize;
  const deliveries = hasMore ? rows.slice(0, pageSize) : rows;

  // Confirm that the innings did not change while this page was read.
  const latestInnings = await Innings.findOne({
    _id: inningsId,
    matchId,
  })
    .select("version status completedAt completionReason")
    .lean();

  if (!latestInnings) {
    throw new StatsExportError(
      "Innings no longer exists.",
      404
    );
  }

  if ((latestInnings.version ?? 0) !== sourceRevision) {
    throw new StatsExportError(
      "Innings changed while exporting. Restart pagination.",
      409
    );
  }

  const lastDelivery = deliveries[deliveries.length - 1];

  const nextCursor =
    hasMore && lastDelivery
      ? encodeCursor({
          matchId: String(matchId),
          inningsId: String(inningsId),
          sourceRevision,
          sequence: lastDelivery.sequence,
          deliveryId: String(lastDelivery._id),
        })
      : null;

  return {
    matchId: String(matchId),
    inningsId: String(inningsId),
    sourceService: "scoring-service",
    sourceRevision,
    completeness: getInningsCompleteness(innings),
    pagination: {
      pageSize,
      returnedCount: deliveries.length,
      hasMore,
      nextCursor,
    },
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      _id: String(delivery._id),
      matchId: String(delivery.matchId),
      inningsId: String(delivery.inningsId),
    })),
  };
}
