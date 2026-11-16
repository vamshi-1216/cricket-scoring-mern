import * as matchService from "./match.service.js";
import { randomUUID } from "node:crypto";

export async function create(req, res, next) {
  try {
    const match = await matchService.createMatch(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: "Match created successfully.",
      data: match,
    });
  } catch (error) {
    next(error);
  }
}

export async function list(req, res, next) {
  try {
    const result = await matchService.listMatches(req.query);

    res.status(200).json({
      success: true,
      data: result.matches,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const match = await matchService.getMatchById(req.params.matchId);

    res.status(200).json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
}

export async function update(req, res, next) {
  try {
    const match = await matchService.updateMatch(
      req.params.matchId,
      req.body,
      req.user.id,
      req.headers.cookie
    );

    res.status(200).json({
      success: true,
      message: "Match updated successfully.",
      data: match,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmPlayingXI(req, res, next) {
  try {
    const playingXI = await matchService.confirmPlayingXI(
      req.params.matchId,
      req.body,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: "Playing XI confirmed successfully.",
      data: playingXI,
    });
  } catch (error) {
    next(error);
  }
}

export async function finalize(req, res, next) {
  try {
    const operation = await matchService.finalizeMatch(
      req.params.matchId,
      req.get("Idempotency-Key")
    );
    const completed = operation.operationStatus === "COMPLETED";
    const cancelled = operation.operationStatus === "CANCELLED";
    res.status(completed ? 200 : cancelled ? 409 : 202).json({
      success: !cancelled,
      message: completed
        ? "Match finalized successfully."
        : cancelled
          ? "Match finalization was cancelled because the match is no longer eligible."
          : operation.failureReason
            ? "Match finalization is blocked pending reconciliation."
            : "Match finalization is waiting for scoring operations to drain.",
      data: operation,
    });
  } catch (error) {
    next(error);
  }
}

export async function finalizationOperationStatus(req, res, next) {
  try {
    const operation = await matchService.getFinalizationOperationStatus(
      req.params.matchId,
      req.params.operationId,
      req.user.id
    );
    const completed = operation.operationStatus === "COMPLETED";
    const cancelled = operation.operationStatus === "CANCELLED";
    res.status(completed || cancelled ? 200 : 202).json({
      success: true,
      message: completed
        ? "Match finalization completed."
        : cancelled
          ? "Match finalization was cancelled."
          : operation.failureReason
            ? "Match finalization requires reconciliation."
            : "Match finalization is pending.",
      data: operation,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancel(req, res, next) {
  try {
    const operation = await matchService.cancelMatch(
      req.params.matchId,
      req.user.id,
      req.get("Idempotency-Key") || randomUUID(),
      req.body?.reason
    );
    const cancelled = operation.operationStatus === "CANCELLED";
    res.status(cancelled ? 200 : 202).json({
      success: true,
      message: cancelled
        ? "Match cancelled successfully."
        : operation.failureReason
          ? "Match cancellation is waiting for scoring permit reconciliation."
          : "Match cancellation is waiting for active scoring operations to drain.",
      data: operation,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancellationOperationStatus(req, res, next) {
  try {
    const operation = await matchService.getMatchCancellationOperationStatus(
      req.params.matchId,
      req.params.operationId,
      req.user.id
    );
    const cancelled = operation.operationStatus === "CANCELLED";
    res.status(cancelled ? 200 : 202).json({
      success: true,
      message: cancelled
        ? "Match cancellation completed."
        : operation.failureReason
          ? "Match cancellation requires permit reconciliation."
          : "Match cancellation is waiting for active scoring operations to drain.",
      data: operation,
    });
  } catch (error) {
    next(error);
  }
}

export async function scoringAccess(req, res, next) {
  try {
    const access = await matchService.getScoringAccess(
      req.params.matchId,
      req.user.id
    );
    res.status(200).json({ success: true, data: access });
  } catch (error) {
    next(error);
  }
}

export async function authorizeScoring(req, res, next) {
  try {
    const access = await matchService.authorizeScoringAccess(
      req.params.matchId,
      req.user.id
    );
    res.status(200).json({ success: true, data: access });
  } catch (error) {
    next(error);
  }
}

export async function transferScoring(req, res, next) {
  try {
    const access = await matchService.transferScoringAccess(
      req.params.matchId,
      req.body?.targetUserId,
      req.user.id,
      req.headers.cookie
    );
    const pending = access.operationStatus === "DRAINING";
    const cancelled = access.operationStatus?.startsWith("CANCELLED_");
    res.status(cancelled ? 409 : pending ? 202 : 200).json({
      success: !cancelled,
      message: cancelled
        ? access.operationStatus === "CANCELLED_TARGET_INELIGIBLE"
          ? "Scoring access transfer was cancelled because the target is no longer active."
          : "Scoring access change was cancelled because the match is no longer eligible."
        : pending
          ? "Scoring access change is waiting for active scoring operations to drain."
          : "Scoring access change completed.",
      data: access,
    });
  } catch (error) {
    next(error);
  }
}

export async function reclaimScoring(req, res, next) {
  try {
    const access = await matchService.reclaimScoringAccess(
      req.params.matchId,
      req.user.id
    );
    const pending = access.operationStatus === "DRAINING";
    const cancelled = access.operationStatus?.startsWith("CANCELLED_");
    res.status(cancelled ? 409 : pending ? 202 : 200).json({
      success: !cancelled,
      message: cancelled
        ? access.operationStatus === "CANCELLED_TARGET_INELIGIBLE"
          ? "Scoring access reclaim was cancelled because the owner account is no longer active."
          : "Scoring access reclaim was cancelled because the match is no longer eligible."
        : pending
          ? "Scoring access reclaim is waiting for active scoring operations to drain."
          : "Scoring access reclaim completed.",
      data: access,
    });
  } catch (error) {
    next(error);
  }
}

export async function scoringAccessOperationStatus(req, res, next) {
  try {
    const result = await matchService.getScoringAccessOperationStatus(
      req.params.matchId,
      req.params.operationId,
      req.user.id
    );
    const pending = result.operationStatus === "DRAINING";
    res.status(pending ? 202 : 200).json({
      success: true,
      message: pending
        ? "Scoring access change is still draining active operations."
        : "Scoring access operation status retrieved.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function acquireScoringPermit(req, res, next) {
  try {
    const result = await matchService.acquireScoringPermit(
      req.params.matchId,
      req.body
    );
    res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        ...result.permit,
        created: result.created,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function releaseScoringPermit(req, res, next) {
  try {
    const permit = await matchService.releaseScoringPermit(
      req.params.matchId,
      req.params.permitId,
      req.body
    );
    res.status(200).json({ success: true, data: permit });
  } catch (error) {
    next(error);
  }
}

export async function scoringPermitStatus(req, res, next) {
  try {
    const permit = await matchService.getScoringPermitStatus(
      req.params.matchId,
      req.params.permitId
    );
    res.status(200).json({ success: true, data: permit });
  } catch (error) {
    next(error);
  }
}
