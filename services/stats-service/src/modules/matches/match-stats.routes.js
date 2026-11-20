import { Router } from "express";
import { ServiceError } from "../../utils/service-error.js";
import { MatchProjection } from "../imports/match-projection.model.js";
import { objectIdPattern } from "../imports/match-projection.js";

const router = Router();
const pageSize = 20;

router.get("/", async (req, res, next) => {
  try {
    const { cursor } = req.query;
    if (cursor !== undefined && (typeof cursor !== "string" || !objectIdPattern.test(cursor))) {
      throw new ServiceError("Invalid match stats cursor.", 400);
    }
    const matches = await MatchProjection.find(cursor ? { _id: { $lt: cursor } } : {})
      .sort({ _id: -1 })
      .limit(pageSize + 1)
      .select("projection.title projection.format projection.result")
      .lean();
    const page = matches.slice(0, pageSize);
    res.json({
      success: true,
      data: page.map(({ _id, projection }) => ({
        matchId: String(_id),
        title: projection.title ?? null,
        format: projection.format,
        finalizedAt: projection.result.finalizedAt,
      })),
      nextCursor: matches.length > pageSize ? String(page[page.length - 1]._id) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:matchId", async (req, res, next) => {
  try {
    const { matchId } = req.params;
    if (!objectIdPattern.test(matchId)) {
      throw new ServiceError("Invalid match ID.", 400);
    }
    const match = await MatchProjection.findById(matchId).select("projection").lean();
    if (!match) {
      throw new ServiceError("Stats haven’t been imported for this match yet.", 404, "STATS_NOT_IMPORTED");
    }
    res.json({ success: true, data: match.projection });
  } catch (error) {
    next(error);
  }
});

export default router;
