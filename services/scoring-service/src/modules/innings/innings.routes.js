import { Router } from "express";
import * as controller from "./innings.controller.js";
import { requireActiveScorer } from "../../middleware/require-auth.js";

const router = Router();

router.patch("/:inningsId/players", requireActiveScorer, controller.setPlayers);
router.post("/:inningsId/deliveries", requireActiveScorer, controller.recordDelivery);
router.get("/:inningsId", controller.getById);

export default router;
