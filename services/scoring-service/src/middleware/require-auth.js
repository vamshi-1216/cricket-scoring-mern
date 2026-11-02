import mongoose from "mongoose";
import { Innings } from "../modules/innings/innings.model.js";
import { env } from "../config/env.js";

async function authenticate(req, res) {
  const cookie = req.headers.cookie;
  if (!cookie) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return false;
  }

  const response = await fetch(
    `${env.AUTH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/auth/me`,
    {
      headers: { Cookie: cookie, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return false;
  }
  if (!response.ok || body?.success !== true || !body.data?.user?.id) {
    res.status(503).json({
      success: false,
      message: "Unable to verify the authenticated user.",
    });
    return false;
  }

  req.user = body.data.user;
  return true;
}

export async function requireAuth(req, res, next) {
  try {
    if (await authenticate(req, res)) return next();
  } catch {
    return res.status(503).json({
      success: false,
      message: "Authentication Service is unavailable.",
    });
  }
}

export async function requireActiveScorer(req, res, next) {
  try {
    if (!(await authenticate(req, res))) return;
    let matchId = req.params.matchId;

    if (!matchId && req.params.inningsId) {
      if (!mongoose.isValidObjectId(req.params.inningsId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid innings ID.",
        });
      }
      const innings = await Innings.findById(req.params.inningsId)
        .select("matchId")
        .lean();
      if (!innings) {
        return res.status(404).json({
          success: false,
          message: "Innings not found.",
        });
      }
      matchId = innings.matchId.toString();
    }

    if (!mongoose.isValidObjectId(matchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID.",
      });
    }

    const response = await fetch(
      `${env.MATCH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/matches/${matchId}/scoring-access/authorize`,
      {
        headers: { Cookie: req.headers.cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      return res.status(403).json({
        success: false,
        message: "Only the active scorer can update this match.",
      });
    }
    if (
      !response.ok ||
      body?.success !== true ||
      !Number.isInteger(body.data?.version)
    ) {
      return res.status(503).json({
        success: false,
        message: "Unable to verify scoring permission.",
      });
    }

    req.scoringAuthorization = {
      matchId,
      version: body.data.version,
      cookie: req.headers.cookie,
    };
    return next();
  } catch {
    return res.status(503).json({
      success: false,
      message: "Unable to verify scoring permission.",
    });
  }
}
