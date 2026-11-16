export class ServiceError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);

    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.code = code;

    Error.captureStackTrace?.(this, ServiceError);
  }
}