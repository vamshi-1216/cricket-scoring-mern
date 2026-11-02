import {
  createPlayer,
  getAllPlayers,
  getPlayerById,
  updatePlayer,
  deactivatePlayer,
} from "./player.service.js";

export async function createPlayerHandler(req, res, next) {
  try {
    const player = await createPlayer(req.body);

    return res.status(201).json({
      success: true,
      message: "Player created successfully.",
      data: { player },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllPlayersHandler(req, res, next) {
  try {
    const players = await getAllPlayers();

    return res.status(200).json({
      success: true,
      count: players.length,
      data: { players },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlayerByIdHandler(req, res, next) {
  try {
    const player = await getPlayerById(req.params.playerId);

    return res.status(200).json({
      success: true,
      data: { player },
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlayerHandler(req, res, next) {
  try {
    const player = await updatePlayer(
      req.params.playerId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Player updated successfully.",
      data: { player },
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivatePlayerHandler(req, res, next) {
  try {
    const player = await deactivatePlayer(req.params.playerId);

    return res.status(200).json({
      success: true,
      message: "Player deactivated successfully.",
      data: { player },
    });
  } catch (error) {
    next(error);
  }
}
