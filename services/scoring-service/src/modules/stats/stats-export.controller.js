
import {
  getStatsMatchExport,
  getStatsDeliveryPage as getStatsDeliveryPageService,
} from "./stats-export.service.js";

export async function getMatchStatsExport(req, res, next) {
  try {
    const result = await getStatsMatchExport(req.params.matchId);

    return res.status(200).json({
      success: true,
      message: "Match statistics source data retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStatsDeliveryPage(req, res, next) {
  try {
    const result = await getStatsDeliveryPageService({
      matchId: req.params.matchId,
      inningsId: req.params.inningsId,
      pageSize: req.query.pageSize,
      cursor: req.query.cursor,
    });

    return res.status(200).json({
      success: true,
      message: "Statistics delivery page retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
