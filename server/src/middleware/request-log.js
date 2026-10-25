// X-Request-Id on every response and one log line per API call.
import { randomUUID } from 'node:crypto';
import { log } from '../shared/utils/log.js';

/** X-Request-Id on every response; one line per /api call: id, method, path (no query), status, time, user */
export function requestLog(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  // the full path now: routers rewrite req.path while they handle the request
  const path = req.path;
  if (!path.startsWith('/api/')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const user = req.session?.userId ? ` user=${req.session.userId}` : '';
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', `${req.id} ${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms${user}`);
  });
  next();
}
