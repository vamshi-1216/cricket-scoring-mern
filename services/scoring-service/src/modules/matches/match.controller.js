import * as inningsService from "../innings/innings.service.js";
import { calculateAwardsForMatch } from "../awards/awards.service.js";

export async function initializeInnings(req, res, next) {
  try {
    const result = await inningsService.initializeFirstInnings(
      req.params.matchId,
      req.scoringAuthorization
    );

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created
        ? "First innings initialized successfully."
        : "First innings already exists.",
      data: result.innings,
    });
  } catch (error) {
    next(error);
  }
}

export async function initializeSecondInnings(req, res, next) {
  try {
    const result = await inningsService.initializeSecondInnings(
      req.params.matchId,
      req.scoringAuthorization
    );

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created
        ? "Second innings initialized successfully."
        : "Second innings already exists.",
      data: result.innings,
    });
  } catch (error) {
    next(error);
  }
}

export async function getScorecard(req, res, next) {
  try {
    const innings = await inningsService.getMatchScorecard(req.params.matchId);

    res.status(200).json({
      success: true,
      data: innings,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMatchInnings(req, res, next) {
  try {
    const innings = await inningsService.getMatchInnings(req.params.matchId);

    res.status(200).json({
      success: true,
      data: { innings },
    });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryHistory(req, res, next) {
  try {
    const deliveries = await inningsService.getDeliveryHistory(
      req.params.matchId,
      req.params.inningsId
    );

    res.status(200).json({
      success: true,
      data: { deliveries },
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
