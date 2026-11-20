
import {
  initializeFirstInnings,
  initializeSecondInnings as initializeSecondInningsService,
  getMatchScorecard,
  getMatchScoreSummaries,
  getMatchInnings as getMatchInningsService,
  getDeliveryHistory as getDeliveryHistoryService,
} from "../innings/innings.service.js";
import { getScoringOperationForPermit } from "../scoring-operations/scoring-operation.service.js";

import { calculateAwardsForMatch } from "../awards/awards.service.js";

function getErrorStatus(error) {
  return Number.isInteger(error?.statusCode)
    ? error.statusCode
    : 500;
}

export async function initializeInnings(req, res, next) {
  try {
    const result = await initializeFirstInnings(
      req.params.matchId,
      req.scoringAuthorization
    );

    res.status(201).json({
      success: true,
      message: "First innings initialized successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function initializeSecondInnings(req, res, next) {
  try {
    const result = await initializeSecondInningsService(
      req.params.matchId,
      req.scoringAuthorization
    );

    res.status(201).json({
      success: true,
      message: "Second innings initialized successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getScorecard(req, res, next) {
  try {
    const scorecard = await getMatchScorecard(req.params.matchId);

    res.status(200).json({
      success: true,
      data: scorecard,
    });
  } catch (error) {
    next(error);
  }
}

export async function getScoreSummaries(req, res, next) {
  try {
    const data = await getMatchScoreSummaries(req.query.ids);
    res.set("Cache-Control", "no-store").json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getMatchInnings(req, res, next) {
  try {
    const innings = await getMatchInningsService(req.params.matchId);

    res.status(200).json({
      success: true,
      data: innings,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryHistory(req, res, next) {
  try {
    const deliveries = await getDeliveryHistoryService(
      req.params.matchId,
      req.params.inningsId
    );

    res.status(200).json({
      success: true,
      data: deliveries,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPermitOperation(req, res, next) {
  try {
    const operation = await getScoringOperationByPermit(
      req.params.matchId,
      req.params.permitId
    );

    res.status(200).json({
      success: true,
      data: operation,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAwards(req, res, next) {
  try {
    const awards = await calculateAwardsForMatch(req.params.matchId);

    res.status(200).json({
      success: true,
      data: awards,
    });
  } catch (error) {
    next(error);
  }
}
