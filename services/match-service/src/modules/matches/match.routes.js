import { Router } from "express";
import * as controller from "./match.controller.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireInternalService } from "../../middleware/require-internal-service.js";

const router = Router();

function preventCaching(req, res, next) {
  res.set("Cache-Control", "no-store");
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  next();
}

router.post("/", requireAuth, controller.create);
router.get("/", controller.list);
router.get(
  "/:matchId/scoring-access",
  preventCaching,
  requireAuth,
  controller.scoringAccess
);
router.get(
  "/:matchId/scoring-access/authorize",
  preventCaching,
  requireAuth,
  controller.authorizeScoring
);
router.get(
  "/:matchId/scoring-access/operations/:operationId",
  requireAuth,
  controller.scoringAccessOperationStatus
);
router.get(
  "/:matchId/cancellation/operations/:operationId",
  requireAuth,
  controller.cancellationOperationStatus
);
router.post("/:matchId/cancel", requireAuth, controller.cancel);
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
router.get(
  "/:matchId/finalization/:operationId",
  requireAuth,
  controller.finalizationOperationStatus
);
router.post("/:matchId/finalize", requireInternalService, controller.finalize);
router.get("/:matchId", controller.getById);
router.patch(
  "/:matchId/playing-xi",
  requireAuth,
  controller.confirmPlayingXI
);
router.patch("/:matchId", requireAuth, controller.update);
router.delete("/:matchId", requireAuth, controller.cancel);

export default router;
