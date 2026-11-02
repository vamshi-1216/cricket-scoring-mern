import { Router } from "express";
import * as controller from "./match.controller.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireInternalService } from "../../middleware/require-internal-service.js";

const router = Router();

router.post("/", requireAuth, controller.create);
router.get("/", controller.list);
router.get("/:matchId/scoring-access", requireAuth, controller.scoringAccess);
router.get("/:matchId/scoring-access/authorize", requireAuth, controller.authorizeScoring);
router.post("/:matchId/scoring-access/transfer", requireAuth, controller.transferScoring);
router.post("/:matchId/scoring-access/reclaim", requireAuth, controller.reclaimScoring);
router.post(
  "/:matchId/scoring-permits",
  requireInternalService,
  controller.acquireScoringPermit
);
router.post(
  "/:matchId/scoring-permits/:permitId/release",
  requireInternalService,
  controller.releaseScoringPermit
);
router.get(
  "/:matchId/scoring-permits/:permitId",
  requireInternalService,
  controller.scoringPermitStatus
);
router.post("/:matchId/finalize", requireInternalService, controller.finalize);
router.get("/:matchId", controller.getById);
router.patch("/:matchId", requireAuth, controller.update);
router.delete("/:matchId", requireAuth, controller.cancel);

export default router;