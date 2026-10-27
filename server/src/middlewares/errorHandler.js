// Errors become responses. AppError: its status and message (+ field errors). Anything else is logged and shown to
// the operator as a plain message with the request's reference.
import { log } from '../config/logger.js';
import { AppError } from '../shared/AppError.js';

/** an /api route nobody answers */
export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'Not found'));
}

/** For a module whose services run the original pages' code: what that code throws ("Invalid Work Center", "There is
 *  no row at position 0." ...) is the operator's message, answered 400 as the screen engine does, not a server fault. */
export function portedErrors(err, _req, _res, next) {
  next(err instanceof AppError || err.type?.startsWith('entity.') ? err : AppError.badRequest(err.message));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const where = `${req.id} ${req.method} ${req.originalUrl.split('?')[0]}`;
  if (err instanceof AppError) {
    if (err.statusCode >= 500) log('error', `${where} ${err.stack}`);
    return void res.status(err.statusCode).json({ message: err.message, ...(err.errors ? { errors: err.errors } : {}), ...(err.alert ? { alert: err.alert } : {}) });
  }
  // a body the client sent that is not valid JSON / too large: the client's mistake, not the server's
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    log('warn', `${where} unreadable body: ${err.message}`);
    return void res.status(err.status ?? 400).json({ message: 'The request could not be read.' });
  }
  log('error', `${where} ${err.stack ?? err}`);
  res.status(500).json({ message: `Something went wrong. Please try again or contact the administrator (reference ${req.id}).` });
}
