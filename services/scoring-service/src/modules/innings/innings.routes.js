import { Router } from "express";
import * as controller from "./innings.controller.js";

const router = Router();

router.patch("/:inningsId/players", controller.setPlayers);
router.post("/:inningsId/deliveries", controller.recordDelivery);
router.get("/:inningsId", controller.getById);

export default router;
