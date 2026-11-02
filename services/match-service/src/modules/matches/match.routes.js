import { Router } from "express";
import * as controller from "./match.controller.js";

const router = Router();

router.post("/", controller.create);
router.get("/", controller.list);
router.post("/:matchId/finalize", controller.finalize);
router.get("/:matchId", controller.getById);
router.patch("/:matchId", controller.update);
router.delete("/:matchId", controller.cancel);

export default router;