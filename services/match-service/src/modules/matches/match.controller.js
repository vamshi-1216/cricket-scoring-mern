import * as matchService from "./match.service.js";

export async function create(req, res, next) {
  try {
    const match = await matchService.createMatch(req.body);

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
    const match = await matchService.updateMatch(req.params.matchId, req.body);

    res.status(200).json({
      success: true,
      message: "Match updated successfully.",
      data: match,
    });
  } catch (error) {
    next(error);
  }
}

export async function finalize(req, res, next) {
  try {
    const match = await matchService.finalizeMatch(req.params.matchId);

    res.status(200).json({
      success: true,
      message: "Match finalized successfully.",
      data: match,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancel(req, res, next) {
  try {
    const match = await matchService.cancelMatch(req.params.matchId);

    res.status(200).json({
      success: true,
      message: "Match cancelled successfully.",
      data: match,
    });
  } catch (error) {
    next(error);
  }
}