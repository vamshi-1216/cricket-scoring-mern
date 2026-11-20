import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { requireInternalService } from "../../middleware/require-internal.service.js";
import { ServiceError } from "../../utils/service-error.js";
import { MatchProjection } from "./match-projection.model.js";
import { buildMatchProjection, objectIdPattern } from "./match-projection.js";
import { loadMatchSource } from "./match-source.js";

const router = Router();

router.post("/matches/:matchId/import", requireInternalService, async (req, res, next) => {
  try {
    const matchId = req.params.matchId.toLowerCase();
    if (!objectIdPattern.test(matchId)) {
      throw new ServiceError("Invalid match ID.", 400, "INVALID_MATCH_ID");
    }

    const previous = await MatchProjection.findById(matchId).select("revision").lean();
    const { match, inningsSources } = await loadMatchSource(matchId, env);
    const projection = buildMatchProjection(match, inningsSources);
    const fingerprint = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
    const write = { fingerprint, projection, revision: randomUUID() };

    // Compare against the version read before contacting the sources.
    const unchanged = await MatchProjection.exists({ _id: matchId, fingerprint });
    if (unchanged) {
      return res.json({ success: true, data: { outcome: "unchanged", projection } });
    }

    if (previous) {
      const result = await MatchProjection.updateOne(
        { _id: matchId, revision: previous.revision },
        { $set: write }
      );
      if (result.matchedCount) {
        return res.json({ success: true, data: { outcome: "updated", projection } });
      }
    } else {
      try {
        await MatchProjection.create({ _id: matchId, ...write });
        return res.status(201).json({ success: true, data: { outcome: "created", projection } });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }

    if (await MatchProjection.exists({ _id: matchId, fingerprint })) {
      return res.json({ success: true, data: { outcome: "unchanged", projection } });
    }
    throw new ServiceError("Another import updated this match. Retry the import.", 409, "IMPORT_CONFLICT");
  } catch (error) {
    next(error);
  }
});

export default router;
