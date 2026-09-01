// Thrown by validators/domain code; caught by the error-handling middleware in app.ts,
// which turns it into a JSON response with the given status code.
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
