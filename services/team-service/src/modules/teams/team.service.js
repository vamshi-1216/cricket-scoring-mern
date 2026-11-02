import mongoose from "mongoose";
import { Team } from "./team.model.js";
import {
  createTeamSchema,
  updateTeamSchema,
  teamIdSchema,
} from "./team.validation.js";
import { env } from "../../config/env.js";

export class TeamServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "TeamServiceError";
    this.statusCode = statusCode;
  }
}

function validateTeamId(id) {
  const result = teamIdSchema.safeParse(id);

  if (!result.success) {
    throw new TeamServiceError("Invalid team ID.", 400);
  }

  return result.data;
}

function handleDuplicateKey(error) {
  if (error?.code === 11000) {
    const field = error.keyPattern?.shortName ? "short name" : "team name";
    throw new TeamServiceError(`A team with that ${field} already exists.`, 409);
  }

  throw error;
}

export async function createTeam(payload) {
  const result = createTeamSchema.safeParse(payload);

  if (!result.success) {
    throw new TeamServiceError(result.error.issues[0].message, 400);
  }

  try {
    return await Team.create(result.data);
  } catch (error) {
    handleDuplicateKey(error);
  }
}

export async function listTeams(query = {}) {
  const filter = {};

  if (query.includeInactive !== "true") {
    filter.isActive = true;
  }

  if (query.search) {
    const search = String(query.search).trim().slice(0, 100);
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { shortName: { $regex: escaped, $options: "i" } },
    ];
  }

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));

  const [teams, total] = await Promise.all([
    Team.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Team.countDocuments(filter),
  ]);

  return {
    teams,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTeamById(id) {
  const teamId = validateTeamId(id);

  const team = await Team.findOne({
    _id: teamId,
    isActive: true,
  }).lean();

  if (!team) {
    throw new TeamServiceError("Active team not found.", 404);
  }

  return team;
}

export async function updateTeam(id, payload) {
  const teamId = validateTeamId(id);
  const result = updateTeamSchema.safeParse(payload);

  if (!result.success) {
    throw new TeamServiceError(result.error.issues[0].message, 400);
  }

  const team = await Team.findOne({ _id: teamId, isActive: true });

  if (!team) {
    throw new TeamServiceError("Active team not found.", 404);
  }

  Object.assign(team, result.data);

  try {
    await team.save();
    return team.toObject();
  } catch (error) {
    handleDuplicateKey(error);
  }
}

export async function deactivateTeam(id) {
  const teamId = validateTeamId(id);

  const team = await Team.findOneAndUpdate(
    { _id: teamId, isActive: true },
    { $set: { isActive: false } },
    { new: true, runValidators: true }
  ).lean();

  if (!team) {
    throw new TeamServiceError("Active team not found.", 404);
  }

  return team;
}

export async function addPlayersToTeam(id, playerIds) {
  const teamId = validateTeamId(id);

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    throw new TeamServiceError("Provide at least one player ID.", 400);
  }

  if (playerIds.some((playerId) => !mongoose.isValidObjectId(playerId))) {
    throw new TeamServiceError("One or more player IDs are invalid.", 400);
  }

  const uniqueIds = [...new Set(playerIds.map(String))];

  if (uniqueIds.length !== playerIds.length) {
    throw new TeamServiceError("Duplicate player IDs were provided.", 400);
  }

  const team = await Team.findOne({ _id: teamId, isActive: true });

  if (!team) {
    throw new TeamServiceError("Active team not found.", 404);
  }

  // Validate players against the Player Service.
  let response;

  try {
    response = await fetch(
      `${env.PLAYER_SERVICE_URL.replace(/\/+$/, "")}/api/v1/players`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );
  } catch {
    throw new TeamServiceError(
      "Player Service is unavailable. Please try again.",
      503
    );
  }

  if (!response.ok) {
    throw new TeamServiceError(
      "Unable to validate players with Player Service.",
      502
    );
  }

  let body;

  try {
    body = await response.json();
  } catch {
    throw new TeamServiceError(
      "Player Service returned an invalid response.",
      502
    );
  }

  // Support common list response shapes.
  const players =
    Array.isArray(body) ? body :
    Array.isArray(body?.data?.players) ? body.data.players :
    Array.isArray(body?.players) ? body.players :
    Array.isArray(body?.data) ? body.data :
    null;

  if (!players) {
    throw new TeamServiceError(
      "Unexpected Player Service response format.",
      502
    );
  }

  const availableIds = new Set(
    players
      .filter((player) => player && player.isActive !== false)
      .map((player) => String(player._id ?? player.id))
      .filter((playerId) => playerId !== "undefined")
  );

  const missingIds = uniqueIds.filter(
    (playerId) => !availableIds.has(playerId)
  );

  if (missingIds.length > 0) {
    throw new TeamServiceError(
      "One or more players do not exist or are inactive.",
      400
    );
  }

  // Players may belong to other teams; only prevent duplicates here.
  const existingIds = new Set(team.playerIds.map(String));
  const newIds = uniqueIds.filter((playerId) => !existingIds.has(playerId));

  if (newIds.length === 0) {
    throw new TeamServiceError(
      "All selected players already belong to this team.",
      409
    );
  }

  team.playerIds.push(...newIds);
  await team.save();

  return team.toObject();
}

export async function removePlayerFromTeam(id, playerId) {
  const teamId = validateTeamId(id);

  if (!mongoose.isValidObjectId(playerId)) {
    throw new TeamServiceError("Invalid player ID.", 400);
  }

  const team = await Team.findOne({ _id: teamId, isActive: true });

  if (!team) {
    throw new TeamServiceError("Active team not found.", 404);
  }

  const playerIndex = team.playerIds.findIndex(
    (assignedPlayerId) => assignedPlayerId.toString() === String(playerId)
  );

  if (playerIndex === -1) {
    throw new TeamServiceError("Player is not assigned to this team.", 404);
  }

  team.playerIds.splice(playerIndex, 1);

  if (team.captainId?.toString() === String(playerId)) {
    team.captainId = null;
  }
  if (team.viceCaptainId?.toString() === String(playerId)) {
    team.viceCaptainId = null;
  }

  await team.save();

  return team.toObject();
}