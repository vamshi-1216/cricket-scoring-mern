import { Router } from "express";
import * as controller from "./team.controller.js";

const router = Router();

router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:teamId", controller.getById);
router.patch("/:teamId", controller.update);
router.delete("/:teamId", controller.deactivate);
router.post("/:teamId/players", controller.addPlayers);
router.delete("/:teamId/players/:playerId", controller.removePlayer);

export default router;