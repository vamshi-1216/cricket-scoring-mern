import { ServiceError } from "../utils/service-error.js";

export function errorHandler(error, req, res, next) {
  if (error instanceof ServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Database validation failed.",
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid resource identifier.",
    });
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body.",
    });
  }

  console.error("Unexpected Stats Service error:", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
}