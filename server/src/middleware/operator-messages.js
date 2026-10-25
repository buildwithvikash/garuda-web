// What the operator reads: every JSON answer's alert / message / statusMessage in operator wording
// (shared/utils/messages.js); the original text goes to the server log.
import { friendlyBody } from '../shared/utils/messages.js';
import { log } from '../shared/utils/log.js';

export function operatorMessages(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => json(friendlyBody(body, `${req.id} ${req.method} ${req.baseUrl}${req.path}`, (line) => log('warn', line)));
  next();
}
