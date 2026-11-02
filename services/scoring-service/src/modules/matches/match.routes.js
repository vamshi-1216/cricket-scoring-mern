import { Router } from "express";
import * as controller from "./match.controller.js";
import { requireActiveScorer } from "../../middleware/require-auth.js";
import { requireInternalService } from "../../middleware/require-internal-service.js";

const router = Router();

router.post("/:matchId/innings", requireActiveScorer, controller.initializeInnings);
router.post("/:matchId/innings/2", requireActiveScorer, controller.initializeSecondInnings);
router.get("/:matchId/scorecard", controller.getScorecard);
router.get("/:matchId/innings", controller.getMatchInnings);
router.get("/:matchId/awards", requireInternalService, controller.getAwards);
router.get("/:matchId/innings/:inningsId/deliveries", controller.getDeliveryHistory);

export default router;
