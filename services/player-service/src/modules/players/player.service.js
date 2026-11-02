
import mongoose from "mongoose";
import { Player } from "./player.model.js";
import { createPlayerSchema,updatePlayerSchema } from "./player.validation.js";

export async function createPlayer(input) {
  const validation = createPlayerSchema.safeParse(input);

  if (!validation.success) {
    const error = new Error("Invalid player data.");
    error.statusCode = 400;
    error.details = validation.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    throw error;
  }

  const data = validation.data;

  if (data.teamId && !mongoose.isValidObjectId(data.teamId)) {
    const error = new Error("Invalid team ID.");
    error.statusCode = 400;
    throw error;
  }

  const player = await Player.create({
    ...data,
    teamId: data.teamId ?? null,
  });

  return player;
}



export async function getAllPlayers() {
  return Player.find()
    .sort({ createdAt: -1 })
    .lean();
}


export async function getPlayerById(playerId) {
  if (!mongoose.isValidObjectId(playerId)) {
    const error = new Error("Invalid player ID.");
    error.statusCode = 400;
    throw error;
  }

  const player = await Player.findById(playerId).lean();

  if (!player) {
    const error = new Error("Player not found.");
    error.statusCode = 404;
    throw error;
  }

  return player;
}




export async function updatePlayer(playerId, input) {
  if (!mongoose.isValidObjectId(playerId)) {
    const error = new Error("Invalid player ID.");
    error.statusCode = 400;
    throw error;
  }

  const validation = updatePlayerSchema.safeParse(input);

  if (!validation.success) {
    const error = new Error("Invalid player data.");
    error.statusCode = 400;
    error.details = validation.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    throw error;
  }

  const player = await Player.findByIdAndUpdate(
    playerId,
    { $set: validation.data },
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!player) {
    const error = new Error("Player not found.");
    error.statusCode = 404;
    throw error;
  }

  return player;
}


export async function deactivatePlayer(playerId) {
  if (!mongoose.isValidObjectId(playerId)) {
    const error = new Error("Invalid player ID.");
    error.statusCode = 400;
    throw error;
  }

  const player = await Player.findByIdAndUpdate(
    playerId,
    { $set: { isActive: false } },
    { new: true, runValidators: true }
  ).lean();

  if (!player) {
    const error = new Error("Player not found.");
    error.statusCode = 404;
    throw error;
  }

  return player;
}
