import * as inningsService from "./innings.service.js";

export async function getById(req, res, next) {
  try {
    const innings = await inningsService.getInningsById(req.params.inningsId);

    res.status(200).json({
      success: true,
      data: innings,
    });
  } catch (error) {
    next(error);
  }
}

export async function setPlayers(req, res, next) {
  try {
    const innings = await inningsService.setInningsPlayers(
      req.params.inningsId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Innings players updated successfully.",
      data: innings,
    });
  } catch (error) {
    next(error);
  }
}

export async function recordDelivery(req, res, next) {
  try {
    const scorecard = await inningsService.recordDelivery(
      req.params.inningsId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Delivery recorded successfully.",
      data: scorecard,
    });
  } catch (error) {
    next(error);
  }
}
