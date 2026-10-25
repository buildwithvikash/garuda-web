// Sign-in page data, sign-in (with the failed-attempt lockout), change password, sign-out, who is signed in.
// Wired in routes/auth/auth.routes.js.
import { authRepo } from '../../repositories/auth/auth.repository.js';
import { login, changePassword, LOGIN_MESSAGES } from '../../services/auth/auth.service.js';
import { loadSettings } from '../../services/settings/settings.service.js';
import { loadUserMenu, userMenu } from '../../services/menu/menu.service.js';
import { writeSession, clearSession } from '../../shared/session/session.js';
import { netString, alertText } from '../../shared/utils/net.js';
import { config } from '../../config/env.js';
import { FORMS } from '../../services/forms/specs.service.js';
import { throttle } from '../../shared/utils/throttle.js';
import { friendly } from '../../shared/utils/messages.js';
import { log } from '../../shared/utils/log.js';

const text = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

// failed sign-ins / wrong current passwords: per user ID, and per client address (several user IDs from one device)
const windowMs = config.loginWindowMinutes * 60_000;
const byUser = throttle({ max: config.loginMaxFailures, windowMs });
const byClient = throttle({ max: config.loginMaxFailures * 5, windowMs });
const keysOf = (req, userId) => [`u:${userId.trim().toLowerCase()}`, `ip:${req.ip}`];
/** a 429 answer when either key is locked out, else null */
function locked(req, res, userId) {
  const [u, ip] = keysOf(req, userId);
  const wait = Math.max(byUser.retryIn(u), byClient.retryIn(ip));
  if (!wait) return false;
  log('warn', `[auth] sign-in locked for ${u} from ${req.ip} (${Math.ceil(wait / 1000)} s)`);
  res.status(429).json({ ok: false, message: `Too many failed attempts. Try again in ${Math.ceil(wait / 60_000)} minute(s).` });
  return true;
}
const failed = (req, userId) => {
  const [u, ip] = keysOf(req, userId);
  byUser.fail(u);
  byClient.fail(ip);
};

// LoginForm Page_Load: dropdowns, company name/logo, defaults from config.
export async function getLoginPage(_req, res) {
  const [bus, lines, company] = await Promise.all([authRepo.businessUnits(), authRepo.productionLines(), authRepo.company()]);
  const logo = company[0]?.Logo;
  res.json({
    erp: config.erp,
    companyName: netString(company[0]?.Companyname ?? company[0]?.CompanyName),
    logo: Buffer.isBuffer(logo) && logo.length ? `data:image/png;base64,${logo.toString('base64')}` : null,
    businessUnits: bus.map((b) => ({ value: netString(b.BUCode), text: netString(b.Name) })),
    lines: lines.map((l) => ({ value: netString(l.LineCode), text: netString(l.Name) })),
    // Original selects the first unit, then DBU from config if it exists in the list.
    defaultBusinessUnit: bus.some((b) => netString(b.BUCode) === config.defaultBusinessUnit)
      ? config.defaultBusinessUnit
      : netString(bus[0]?.BUCode),
    lineRequired: config.erp === 'WRL',
    server: config.showDbOnLogin ? `${config.db.server} ${config.db.database}` : '', // original lblServer
  });
}

// LoginForm.AssignBusinessUnit: a user with exactly one unit gets it preselected and locked.
export async function getBusinessUnits(req, res) {
  const rows = await authRepo.businessUnitsForUserId(text(req.query.userId).trim());
  res.json({ locked: rows.length === 1, businessUnit: rows.length === 1 ? netString(rows[0].BusinessUnit) : null });
}

export async function postLogin(req, res) {
  const b = req.body ?? {};
  if (locked(req, res, text(b.userId))) return;
  try {
    const { msg, session } = await login({
      userId: text(b.userId),
      password: text(b.password),
      businessUnit: text(b.businessUnit, 20),
      qr: b.qr === true,
      scanned: text(b.scanned),
      line: text(b.line, 50),
    });
    if (msg === 1) {
      byUser.clear(keysOf(req, text(b.userId))[0]);
      await loadSettings(); // Settings.SetSettings() after a successful login
      const menu = await loadUserMenu(session.userCode);
      writeSession(res, { ...session, line: text(b.line, 50), lineName: text(b.lineName) });
      return res.json({ ok: true, redirect: menu.defaultRoute ?? '/start' });
    }
    if (msg === 7 || msg === 4) return res.json({ ok: false, changePassword: true, userId: text(b.userId) });
    failed(req, text(b.userId));
    res.json({ ok: false, message: LOGIN_MESSAGES[msg] ?? 'Login failed' });
  } catch (e) {
    log('error', `${req.id} login failed: ${e.stack ?? e}`);
    res.json({ ok: false, message: friendly(alertText(e.message)) });
  }
}

// LoginChangePasswordForm.BtnChangePassword_Click
export async function postChangePassword(req, res) {
  const b = req.body ?? {};
  const [userId, current, next, retype] = [text(b.userId), text(b.current), text(b.next), text(b.retype)];
  if (locked(req, res, userId)) return;
  if (current === '' || next !== retype) {
    return res.json({ ok: false, message: 'Make sure that current password is not blank and retype password is correct' });
  }
  const r = await changePassword({ userId, current, next });
  if (r === 0) return res.json({ ok: false, field: 'next', message: 'Pasword must be 8 character long, Includes  number and special character' });
  if (r === 6) {
    failed(req, userId);
    return res.json({ ok: false, field: 'current', message: 'Current Password is wrong!!' });
  }
  res.json({ ok: true, message: 'Password Changed!!' });
}

export async function postLogout(_req, res) {
  clearSession(res);
  res.json({ ok: true });
}

// Data Layout.Master needs: who is logged in, their menu, default page.
export async function getMe(req, res) {
  const m = await userMenu(req.session.userCode);
  const { userId, userCode, businessUnit, department, line, lineName, systemUser } = req.session;
  res.json({
    user: { userId, userCode, businessUnit, department, line, lineName, systemUser, ...m.user },
    menu: m.menu,
    search: m.search,
    defaultRoute: m.defaultRoute,
    // Screens already rebuilt in this app; everything else links to the existing application.
    migrated: { forms: Object.keys(FORMS) },
  });
}
