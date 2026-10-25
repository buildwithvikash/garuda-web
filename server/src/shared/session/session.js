// Signed, httpOnly session cookie holding the same per-user values the original kept in ASP.NET Session.
// No server-side store, so it survives restarts and needs no new database table.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/env.js';

const COOKIE = 'garuda_session';

function sign(data) {
  return createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
}

export function readSession(req) {
  const raw = req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [data, sig] = raw.split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  return s.exp > Date.now() ? s : null;
}

export function writeSession(res, values) {
  const maxAge = config.sessionMinutes * 60_000;
  const data = Buffer.from(JSON.stringify({ ...values, exp: Date.now() + maxAge })).toString('base64url');
  res.cookie(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
}

/** what the services need to know about the signed-in user (after requireAuth) */
export const sessionContext = (req) => ({ businessUnit: req.session.businessUnit, department: req.session.department, userCode: req.session.userCode, userId: req.session.userId, line: req.session.line ?? '0', lineName: req.session.lineName ?? '' });
