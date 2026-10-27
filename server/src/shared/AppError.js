/**
 * Expected, user-facing error. `message` is shown to the user as-is, so write it as a sentence that says what went
 * wrong and what to do. middlewares/errorHandler.js turns it into the response: { message, errors?, alert? } with its
 * status. alert: what a ported page itself showed when it refused (kept beside the message, as the page had both).
 */
export class AppError extends Error {
  constructor(statusCode, message, { errors, alert } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.alert = alert;
  }

  static badRequest(message, opts) { return new AppError(400, message, opts); }
  static unauthorized(message = 'Please sign in to continue.') { return new AppError(401, message); }
  static forbidden(message = 'You do not have access to this screen.') { return new AppError(403, message); }
  static notFound(what = 'Record') { return new AppError(404, `${what} not found.`); }
  /** field problems: { field: 'message' } for the form to show beside each field */
  static unprocessable(message, errors) { return new AppError(422, message, { errors }); }
}
