// Port of AVLogin.ValidateLogin / ValidateLoginQR / ChangePassword for the WRL configuration
// (no LDAP: LDAPDomain/LDAPPath are not set for WRL). Result codes are the original ones:
// 0 no user · 1 ok · 2 locked · 3 expired · 5 inactive · 6 wrong password · 7 must change password · 8 wrong organization
import { authRepo } from './auth.repo.js';
import { setting } from '../settings/settings.service.js';
import { encryptPassword, isStrongPassword } from './password.js';
import { netString, netBool, netInt, netDateString, netDaysBetween } from '../../shared/net.js';
import { config } from '../../config/env.js';

export const LOGIN_MESSAGES = {
  0: 'User does not exist',
  2: 'User is locked, contact administrator',
  3: 'User password expired, contact administrator',
  5: 'User is de-active, contact administrator',
  6: 'Wrong password',
  8: 'Wrong Organization',
};

const isDefaultPwDate = (d) => d instanceof Date && d.getFullYear() === 2000 && d.getMonth() === 0 && d.getDate() === 1;

function enc(pw) {
  return setting('PasswordEncrypt') === 1 ? encryptPassword(pw, config.passwordKey) : pw;
}

/**
 * Shared tail of both validators: status checks, then SystemUser override or business-unit check.
 * Returns { msg, session } — session is only issued when msg === 1.
 */
async function finish(repo, row, { userId, businessUnit, passwordMatches, qrCode, statusChecked }) {
  let msg = statusChecked.msg;
  let user = statusChecked.user;
  let department = '';

  if (netBool(row.SystemUser)) {
    // Original: system users skip status/lock/BU checks; QR login always succeeds, password login needs a match.
    user = { userId, businessUnit: String(businessUnit), userCode: netString(row.UserCode) };
    msg = qrCode !== 0 ? 1 : passwordMatches ? 1 : 6;
  } else {
    const bus = await repo.userBusinessUnits(netString(row.UserCode));
    const found = bus.some((b) => netString(b.BusinessUnit) === String(businessUnit));
    if (!found) return { msg: 8, session: null };
    department = netString(await repo.department(netInt(row.Employee)));
  }
  // Original set Session.UserCode even when a system user then got "Wrong password"; here a session exists only for msg 1.
  if (msg !== 1 || !user) return { msg, session: null };
  return { msg, session: { ...user, department, systemUser: netBool(row.SystemUser) } };
}

async function statusChecks(repo, row, userId, businessUnit) {
  const um = setting('UserManagement');
  // Original: DateTime.Parse(row["LastPwChOn"].ToString()) runs before any rule, so a NULL date fails the login.
  const pwChanged = row.LastPwChOn instanceof Date ? row.LastPwChOn : new Date(row.LastPwChOn ?? NaN);
  if (Number.isNaN(pwChanged.getTime())) throw new Error('String was not recognized as a valid DateTime.');
  if (netString(row.Status) === '0') return { msg: 5 };
  if (netBool(row.Locked)) return { msg: 2 };
  if (isDefaultPwDate(pwChanged) && um === 1) return { msg: 7 };
  if (netDaysBetween(new Date(), pwChanged) > 45 && um === 1) return { msg: 3 };
  await repo.loginOk(userId, netDateString());
  return { msg: 1, user: { userId, businessUnit: String(businessUnit), userCode: netString(row.UserCode) } };
}

async function wrongPassword(repo, userId) {
  if (setting('UserManagement') === 1) {
    await repo.wrongPassword(userId);
    await repo.lockIfTooMany(userId);
  }
  return { msg: 6 };
}

/** AVLogin.ValidateLogin with qrCode = 0 (user + password). */
export async function validateLogin({ userId, password, businessUnit }, repo = authRepo) {
  const rows = await repo.userByUserId(userId);
  if (!rows.length) return { msg: 0, session: null };
  const row = rows[0];
  const matches = netString(row.Password) === enc(password);
  const statusChecked = matches ? await statusChecks(repo, row, userId, businessUnit) : await wrongPassword(repo, userId);
  return finish(repo, row, { userId, businessUnit, passwordMatches: matches, qrCode: 0, statusChecked });
}

/** AVLogin.ValidateLoginQR for ERP = WRL: the scanned value is a UserCode; the password may be empty. */
export async function validateLoginQR({ userId, password, businessUnit }, repo = authRepo) {
  const rows = await repo.userByUserCode(userId);
  if (!rows.length) return { msg: 0, session: null };
  const row = rows[0];
  const matches = netString(row.Password) === enc(password ?? '');
  let statusChecked;
  if (matches) {
    statusChecked = await statusChecks(repo, row, userId, businessUnit);
  } else {
    // Badge scan without matching password: accepted as in the original (no status checks).
    await repo.loginOk(userId, netDateString());
    statusChecked = { msg: 1, user: { userId, businessUnit: String(businessUnit), userCode: netString(row.UserCode) } };
  }
  return finish(repo, row, { userId, businessUnit, passwordMatches: matches, qrCode: 1, statusChecked });
}

/**
 * LoginForm.BtnLogin_Click input handling for WRL: scan mode, QRSpecial split, line required.
 * Returns the validator result plus the selected line.
 */
export async function login({ userId, password, businessUnit, qr, scanned, line }, repo = authRepo) {
  if (qr) {
    if (config.qrSpecial) {
      userId = String(scanned ?? '').replace(config.qrSpecial, '');
      const parts = String(scanned ?? '').trim().split('|');
      if (parts.length > 1) [userId, password] = parts;
    } else {
      userId = String(scanned ?? '');
    }
  }
  if (config.erp === 'WRL' && !line) throw new Error('Please Select Line');
  return qr ? validateLoginQR({ userId, password, businessUnit }, repo) : validateLogin({ userId, password, businessUnit }, repo);
}

/** AVLogin.ChangePassword(userID, new) (ResetPasswordForm). 0 weak password or no such UserID · 1 changed. */
export async function resetPassword({ userId, next }, repo = authRepo) {
  if (!isStrongPassword(next, setting('UserManagement'))) return 0;
  if (!(await repo.userByUserId(userId)).length) return 0;
  await repo.setPassword(userId, enc(next));
  return 1;
}

/** AVLogin.ChangePassword(userID, cur, new). 0 weak password · 1 changed · 6 current password wrong. */
export async function changePassword({ userId, current, next }, repo = authRepo) {
  if (!isStrongPassword(next, setting('UserManagement'))) return 0;
  const rows = await repo.userByUserId(userId);
  if (!rows.length) return 0;
  if (netString(rows[0].Password) !== enc(current)) {
    // Original also ran "set Locked=true", which is invalid T-SQL and failed silently; that lock never happened.
    if (setting('UserManagement') === 1) await repo.wrongPassword(userId);
    return 6;
  }
  await repo.setPassword(userId, enc(next));
  return 1;
}
