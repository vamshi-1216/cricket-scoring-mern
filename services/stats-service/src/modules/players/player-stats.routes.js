import { Router } from "express";
import { ServiceError } from "../../utils/service-error.js";
import { MatchProjection } from "../imports/match-projection.model.js";
import { objectIdPattern } from "../imports/match-projection.js";
import { summarizePlayer } from "./player-summary.js";

const router = Router();

router.get("/:playerId", async (req, res, next) => {
  try {
    const playerId = req.params.playerId.toLowerCase();
    if (!objectIdPattern.test(playerId)) {
      throw new ServiceError("Invalid player ID.", 400);
    }
    const matches = MatchProjection.find(
      { "projection.players.playerId": playerId },
      { "projection.players.$": 1, "projection.format": 1, _id: 0 }
    ).lean().cursor();

    const summary = await summarizePlayer(matches);
    res.json({ success: true, data: { playerId, ...summary } });
  } catch (error) {
    next(error);
  }
});

export default router;
