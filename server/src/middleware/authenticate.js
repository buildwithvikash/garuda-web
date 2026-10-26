import { readSession } from '../shared/session/session.js';

/** Layout.Master check: no UserCode in session -> back to login. */
export function requireAuth(req, res, next) {
  const s = readSession(req);
  // Kiosk sessions (dashboard TVs opened with ?UCode=) only work for dashboard APIs.
  if (!s?.userCode || Number(s.userCode) === 0 || s.kiosk) return res.status(401).json({ message: 'Login required' });
  req.session = s;
  next();
}
