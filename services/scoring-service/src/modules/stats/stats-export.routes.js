
import { Router } from "express";
import * as controller from "./stats-export.controller.js";
import { requireInternalService } from "../../middleware/require-internal-service.js";

const router = Router();

// Internal Stats Service API
router.get(
  "/matches/:matchId/export",
  requireInternalService,
  controller.getMatchStatsExport
);

router.get(
  "/matches/:matchId/innings/:inningsId/deliveries",
  requireInternalService,
  controller.getStatsDeliveryPage
);

export default router;
