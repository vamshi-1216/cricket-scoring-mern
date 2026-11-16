
import {
  initializeFirstInnings,
  initializeSecondInnings as initializeSecondInningsService,
  getMatchScorecard,
  getMatchInnings as getMatchInningsService,
  getDeliveryHistory as getDeliveryHistoryService,
} from "../innings/innings.service.js";
import { getScoringOperationForPermit } from "../scoring-operations/scoring-operation.service.js";

import { calculateMatchAwards } from "../awards/awards.calculator.js";

import { Innings } from "../innings/innings.model.js";
import { Delivery } from "../deliveries/delivery.model.js";

import { env } from "../../config/env.js";

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
    const innings = await Innings.find({
      matchId: req.params.matchId,
    })
      .sort({ inningsNumber: 1 })
      .lean();

    if (innings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No innings found for this match.",
      });
    }

    const deliveries = await Delivery.find({
      matchId: req.params.matchId,
    })
      .sort({ inningsId: 1, sequence: 1, _id: 1 })
      .lean();

    const awards = await calculateMatchAwards({
      matchId: req.params.matchId,
      innings,
      deliveries,
    });

    res.status(200).json({
      success: true,
      data: awards,
    });
  } catch (error) {
    next(error);
  }
}
