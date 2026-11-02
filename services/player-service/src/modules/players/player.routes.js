
import { Router } from "express";
import {
  createPlayerHandler,
  getAllPlayersHandler,
  getPlayerByIdHandler,
  updatePlayerHandler,
  deactivatePlayerHandler,
} from "./player.controller.js";

const router = Router();

router.post("/", createPlayerHandler);
router.get("/", getAllPlayersHandler);
router.get("/:playerId", getPlayerByIdHandler);
router.patch("/:playerId", updatePlayerHandler);
router.delete("/:playerId", deactivatePlayerHandler);

export default router;
