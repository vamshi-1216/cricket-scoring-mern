import * as matchService from "./match.service.js";

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
    const match = await matchService.cancelMatch(
      req.params.matchId,
      req.user.id,
      req.headers.cookie
    );

    res.status(200).json({
      success: true,
      message: "Match cancelled successfully.",
      data: match,
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
    res.status(200).json({
      success: true,
      message: "Scoring access transferred successfully.",
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
    res.status(200).json({
      success: true,
      message: "Scoring access reclaimed successfully.",
      data: access,
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
      data: result.permit,
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