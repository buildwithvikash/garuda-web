// Last handler: log the details, show the operator a plain message with the request's reference.
import { log } from '../shared/utils/log.js';

export function errorHandler(err, req, res, _next) {
  // a body the client sent that is not valid JSON / too large: the client's mistake, not the server's
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    log('warn', `${req.id} ${req.method} ${req.originalUrl.split('?')[0]} unreadable body: ${err.message}`);
    return void res.status(err.status ?? 400).json({ message: 'The request could not be read.' });
  }
  log('error', `${req.id} ${req.method} ${req.originalUrl.split('?')[0]} ${err.stack ?? err}`);
  res.status(500).json({ message: `Something went wrong. Please try again or contact the administrator (reference ${req.id}).` });
}
