// Who may call what: requireAuth (signed in), authorize(ModuleID) / authorizeScreen(route) (the user's roles).
import { readSession } from '../modules/auth/sessions.js';
import { canOpen, userMenu } from '../modules/menu/menu.service.js';
import { FORMS } from '../modules/forms/specs.js';

/** Layout.Master check: no UserCode in session -> back to login. */
export function requireAuth(req, res, next) {
  const s = readSession(req);
  // Kiosk sessions (dashboard TVs opened with ?UCode=) only work for dashboard APIs.
  if (!s?.userCode || Number(s.userCode) === 0 || s.kiosk) return res.status(401).json({ message: 'Login required' });
  req.session = s;
  next();
}

/** Route guard for a module (menu ModuleID). */
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

/** Route guard for a screen's API, as the screen engine checks it: its menu module, or a system user for a screen
 *  outside the menu. */
export function authorizeScreen(route) {
  const spec = FORMS[route];
  if (!spec) throw new Error(`No screen ${route}`);
  if (spec.menuModuleId != null) return authorize(spec.menuModuleId);
  return async (req, res, next) => {
    try {
      if ((await userMenu(req.session.userCode)).systemUser) return next();
      res.status(403).json({ message: 'You do not have access to this screen' });
    } catch (e) {
      next(e);
    }
  };
}
