// Role checks. Use after requireAuth.
import { canOpen, userMenu } from '../services/menu/menu.service.js';
import { FORMS } from '../services/forms/specs.service.js';

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
