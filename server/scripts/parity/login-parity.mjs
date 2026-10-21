// Login parity: same cases through the original AVLogin (original DLLs, via Windows PowerShell) and the new service.
// Uses only cases that need no real password (unknown user, wrong password, wrong organization, badge scan).
// Users rows are snapshotted first and restored afterwards, so UAT data ends up unchanged.
// Usage: node --env-file=.env scripts/parity/login-parity.mjs <originalBinDir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { validateLogin, validateLoginQR } from '../../src/modules/auth/service.js';

const bin = process.argv[2];
const WRONG = '__parity_wrong_password__';
const users = await query('select UserCode, UserID from Users');
const goodBu = String((await query('select top 1 BUCode from BusinessUnit where Status=1'))[0].BUCode);
const badBu = '99999';

const cases = [
  { userId: '__parity_no_user__', password: WRONG, businessUnit: goodBu, qr: false },
  { userId: '-1', password: '', businessUnit: goodBu, qr: true },
];
for (const u of users) {
  for (const bu of [goodBu, badBu]) {
    cases.push({ userId: String(u.UserID), password: WRONG, businessUnit: bu, qr: false });
    cases.push({ userId: String(u.UserCode), password: '', businessUnit: bu, qr: true });
  }
}
cases.forEach((c, i) => (c.id = i));

const snapshot = await query('select UserCode, WrongPw, Locked, LastActivityOn from Users');
let restored = 0;
try {
  // New implementation
  await loadSettings();
  const mine = [];
  for (const c of cases) {
    try {
      const r = await (c.qr ? validateLoginQR : validateLogin)(c);
      mine.push({ id: c.id, msg: r.msg, userCode: r.session?.userCode ?? '', businessUnit: r.session?.businessUnit ?? '', department: r.session?.department ?? '' });
    } catch (e) {
      mine.push({ id: c.id, msg: `EX: ${e.message}`, userCode: '', businessUnit: '', department: '' });
    }
  }

  // Original implementation
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const casesFile = join(dir, 'cases.json');
  writeFileSync(casesFile, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-login.ps1', import.meta.url)), bin, casesFile],
    {
      env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
      maxBuffer: 64 * 1024 * 1024,
    },
  ).toString();
  const orig = JSON.parse(out.slice(out.indexOf('[')));

  // Compare. Original only has session values when msg = 1 matters; the new app issues a session only for msg 1.
  const byId = new Map(orig.map((o) => [o.id, o]));
  const diffs = [];
  const tally = {};
  for (const m of mine) {
    const o = byId.get(m.id);
    const c = cases[m.id];
    const key = `${c.qr ? 'badge' : 'password'} ${c.businessUnit === badBu ? 'wrong-BU' : 'BU'} -> ${o?.msg}`;
    tally[key] = (tally[key] ?? 0) + 1;
    const sameMsg = String(o?.msg) === String(m.msg);
    const sameSession = m.msg !== 1 || (o.userCode === m.userCode && o.businessUnit === m.businessUnit && o.department === m.department);
    if (!sameMsg || !sameSession) diffs.push({ case: { ...c, password: c.password ? '(set)' : '' }, original: o, new: m });
  }
  console.log(`cases: ${cases.length}, users: ${users.length}, mismatches: ${diffs.length}`);
  console.log('outcomes (original):', tally);
  for (const d of diffs.slice(0, 15)) console.log(JSON.stringify(d));
} finally {
  // Restore login bookkeeping columns exactly as they were.
  const now = await query('select UserCode, WrongPw, Locked, LastActivityOn from Users');
  const before = new Map(snapshot.map((r) => [r.UserCode, r]));
  for (const r of now) {
    const b = before.get(r.UserCode);
    const same = b && b.WrongPw === r.WrongPw && b.Locked === r.Locked && +b.LastActivityOn === +r.LastActivityOn;
    if (b && !same) {
      await execute('update Users set WrongPw=@w, Locked=@l, LastActivityOn=@a where UserCode=@u', { w: b.WrongPw, l: b.Locked, a: b.LastActivityOn, u: r.UserCode });
      restored++;
    }
  }
  console.log(`Users rows restored to snapshot: ${restored}`);
  process.exit(0);
}
