// Login rules from AVLogin.ValidateLogin / ValidateLoginQR, checked against a fake repository.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  DB_SERVER: 'x', DB_NAME: 'x', DB_USER: 'x', DB_PASSWORD: 'x', ERP: 'WRL',
  PASSWORD_AES_KEY: process.env.PASSWORD_AES_KEY ?? 'test-key', SESSION_SECRET: 's',
});
const { validateLogin, validateLoginQR, login, changePassword } = await import('../src/modules/auth/service.js');
const { loadSettings } = await import('../src/modules/settings/service.js');
const { netDateString, netInt } = await import('../src/lib/net.js');

const recent = new Date(Date.now() - 5 * 86400000);
const user = (o = {}) => ({
  UserID: 'op1', UserCode: 42, Password: 'pw', Status: 1, Locked: false, LastPwChOn: recent,
  SystemUser: false, Employee: 7, ...o,
});

function fakeRepo(row, { bus = [{ BusinessUnit: 281 }] } = {}) {
  const writes = [];
  return {
    writes,
    userByUserId: async () => (row ? [row] : []),
    userByUserCode: async () => (row ? [row] : []),
    userBusinessUnits: async () => bus,
    department: async () => 'D1',
    wrongPassword: async (u) => writes.push(['wrongPw', u]),
    lockIfTooMany: async (u) => writes.push(['lock', u]),
    loginOk: async (u) => writes.push(['ok', u]),
    setPassword: async (u, p) => writes.push(['setPw', u, p]),
  };
}

const settings = (o) => loadSettings(Object.entries({ PasswordEncrypt: 0, UserManagement: 1, ...o }).map(([k, v]) => ({ k, v })));
beforeEach(() => settings());
const args = { userId: 'op1', password: 'pw', businessUnit: '281' };

test('unknown user -> 0', async () => {
  assert.equal((await validateLogin(args, fakeRepo(null))).msg, 0);
});

test('correct password -> 1 with session, resets WrongPw', async () => {
  const repo = fakeRepo(user());
  const r = await validateLogin(args, repo);
  assert.equal(r.msg, 1);
  assert.deepEqual(r.session, { userId: 'op1', businessUnit: '281', userCode: '42', department: 'D1', systemUser: false });
  assert.deepEqual(repo.writes, [['ok', 'op1']]);
});

test('wrong password -> 6, increments and locks when UserManagement = 1', async () => {
  const repo = fakeRepo(user());
  const r = await validateLogin({ ...args, password: 'bad' }, repo);
  assert.equal(r.msg, 6);
  assert.equal(r.session, null);
  assert.deepEqual(repo.writes, [['wrongPw', 'op1'], ['lock', 'op1']]);
});

test('wrong password with UserManagement = 0 -> 6, no writes', async () => {
  await settings({ UserManagement: 0 });
  const repo = fakeRepo(user());
  assert.equal((await validateLogin({ ...args, password: 'bad' }, repo)).msg, 6);
  assert.deepEqual(repo.writes, []);
});

test('status order: inactive 5, locked 2, first login 7, expired 3', async () => {
  assert.equal((await validateLogin(args, fakeRepo(user({ Status: 0 })))).msg, 5);
  assert.equal((await validateLogin(args, fakeRepo(user({ Locked: true })))).msg, 2);
  assert.equal((await validateLogin(args, fakeRepo(user({ LastPwChOn: new Date(2000, 0, 1) })))).msg, 7);
  assert.equal((await validateLogin(args, fakeRepo(user({ LastPwChOn: new Date(Date.now() - 50 * 86400000) })))).msg, 3);
});

test('a bit Status column never reads as "0" (.NET prints False), so it is not "inactive"', async () => {
  assert.equal((await validateLogin(args, fakeRepo(user({ Status: false })))).msg, 1);
});

test('NULL LastPwChOn fails the login like the original DateTime.Parse (found in UAT parity run)', async () => {
  await assert.rejects(validateLogin(args, fakeRepo(user({ LastPwChOn: null }))), /String was not recognized as a valid DateTime/);
});

test('first-login and expiry rules are off when UserManagement = 0', async () => {
  await settings({ UserManagement: 0 });
  assert.equal((await validateLogin(args, fakeRepo(user({ LastPwChOn: new Date(2000, 0, 1) })))).msg, 1);
});

test('business unit not assigned -> 8, even over other results', async () => {
  assert.equal((await validateLogin(args, fakeRepo(user(), { bus: [{ BusinessUnit: 999 }] }))).msg, 8);
  assert.equal((await validateLogin({ ...args, password: 'bad' }, fakeRepo(user(), { bus: [] }))).msg, 8);
});

test('system user skips status and BU checks but still needs the password', async () => {
  const sys = user({ SystemUser: true, Locked: true });
  const ok = await validateLogin(args, fakeRepo(sys, { bus: [] }));
  assert.equal(ok.msg, 1);
  assert.equal(ok.session.systemUser, true);
  const bad = await validateLogin({ ...args, password: 'bad' }, fakeRepo(sys));
  assert.equal(bad.msg, 6);
  assert.equal(bad.session, null); // original left a session behind here; new app does not
});

test('password compared encrypted when PasswordEncrypt = 1', async () => {
  await settings({ PasswordEncrypt: 1 });
  assert.equal((await validateLogin(args, fakeRepo(user({ Password: 'pw' })))).msg, 6);
});

test('QR badge login accepts the badge without a matching password and skips status checks', async () => {
  const repo = fakeRepo(user({ Locked: true }));
  const r = await validateLoginQR({ userId: '42', password: '', businessUnit: '281' }, repo);
  assert.equal(r.msg, 1);
  assert.deepEqual(repo.writes, [['ok', '42']]);
});

test('WRL requires a production line', async () => {
  await assert.rejects(login({ ...args, line: '' }, fakeRepo(user())), /Please Select Line/);
  assert.equal((await login({ ...args, line: 'L1' }, fakeRepo(user()))).msg, 1);
});

test('change password: weak 0, wrong current 6 (no lock), success 1', async () => {
  assert.equal(await changePassword({ userId: 'op1', current: 'pw', next: 'weak' }, fakeRepo(user())), 0);
  const wrong = fakeRepo(user());
  assert.equal(await changePassword({ userId: 'op1', current: 'bad', next: 'Pass@123' }, wrong), 6);
  assert.deepEqual(wrong.writes, [['wrongPw', 'op1']]);
  const ok = fakeRepo(user());
  assert.equal(await changePassword({ userId: 'op1', current: 'pw', next: 'Pass@123' }, ok), 1);
  assert.deepEqual(ok.writes, [['setPw', 'op1', 'Pass@123']]);
});

test('.NET conversions', () => {
  assert.match(netDateString(new Date(2026, 9, 17, 15, 4, 5)), /^17-Oct-2026 03:04:05$/); // hh = 12-hour, no AM/PM
  assert.equal(netInt('1,200.7'), 1200);
  assert.equal(netInt('true'), 1);
  assert.equal(netInt(''), 0);
  assert.throws(() => netInt('INR'));
});
