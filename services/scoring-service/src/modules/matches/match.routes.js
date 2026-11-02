import { Router } from "express";
import * as controller from "./match.controller.js";

const router = Router();

router.post("/:matchId/innings", controller.initializeInnings);
router.post("/:matchId/innings/2", controller.initializeSecondInnings);
router.get("/:matchId/scorecard", controller.getScorecard);
router.get("/:matchId/innings", controller.getMatchInnings);
router.get("/:matchId/awards", controller.getAwards);
router.get("/:matchId/innings/:inningsId/deliveries", controller.getDeliveryHistory);

export default router;
