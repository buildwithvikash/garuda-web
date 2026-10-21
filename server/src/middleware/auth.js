import { readSession } from '../lib/session.js';
import { canOpen } from '../modules/menu/service.js';

/** Layout.Master check: no UserCode in session -> back to login. */
export function requireAuth(req, res, next) {
  const s = readSession(req);
  // Kiosk sessions (dashboard TVs opened with ?UCode=) only work for dashboard APIs.
  if (!s?.userCode || Number(s.userCode) === 0 || s.kiosk) return res.status(401).json({ message: 'Login required' });
  req.session = s;
  next();
}

/** Route guard for a module (menu ModuleID). Use after requireAuth. */
export function authorize(moduleId) {
  return async (req, res, next) => {
    try {
      if (await canOpen(req.session.userCode, moduleId)) return next();
      res.status(403).json({ message: 'You do not have access to this screen' });
    } catch (e) {
      next(e);
    }
  };
}
