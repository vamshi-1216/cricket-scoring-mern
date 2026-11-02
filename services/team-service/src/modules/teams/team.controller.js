import * as teamService from "./team.service.js";

export async function create(req, res, next) {
  try {
    const team = await teamService.createTeam(req.body);

    res.status(201).json({
      success: true,
      message: "Team created successfully.",
      data: team,
    });
  } catch (error) {
    next(error);
  }
}

export async function list(req, res, next) {
  try {
    const result = await teamService.listTeams(req.query);

    res.status(200).json({
      success: true,
      data: result.teams,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const team = await teamService.getTeamById(req.params.teamId);

    res.status(200).json({
      success: true,
      data: team,
    });
  } catch (error) {
    next(error);
  }
}

export async function update(req, res, next) {
  try {
    const team = await teamService.updateTeam(req.params.teamId, req.body);

    res.status(200).json({
      success: true,
      message: "Team updated successfully.",
      data: team,
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivate(req, res, next) {
  try {
    const team = await teamService.deactivateTeam(req.params.teamId);

    res.status(200).json({
      success: true,
      message: "Team deactivated successfully.",
      data: team,
    });
  } catch (error) {
    next(error);
  }
}
export async function addPlayers(req, res, next) {
  try {
    const team = await teamService.addPlayersToTeam(
      req.params.teamId,
      req.body.playerIds
    );

    return res.status(200).json({
      success: true,
      message: "Players added to team successfully.",
      data: team,
    });
  } catch (error) {
    next(error);
  }
}

export async function removePlayer(req, res, next) {
  try {
    const team = await teamService.removePlayerFromTeam(
      req.params.teamId,
      req.params.playerId
    );

    return res.status(200).json({
      success: true,
      message: "Player removed from team successfully.",
      data: team,
    });
  } catch (error) {
    next(error);
  }
}