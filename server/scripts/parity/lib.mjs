// Shared by the parity scripts: the original pages run through original-forms.ps1, and row snapshots as text.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toText } from '../../src/shared/utils/values.js';

export const SPECS = JSON.parse(readFileSync(new URL('../../src/data/forms/forms.json', import.meta.url), 'utf8'));
export const specOf = (spec) => ({ top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits });
export const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };

/** runs cases on the original page classes (original-forms.ps1 with the original bin folder) */
export function original(bin, cases) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 512 * 1024 * 1024,
  }).toString();
  return JSON.parse(raw.slice(raw.indexOf('[')));
}

/** rows as sorted JSON text (dates compared by presence) */
export const rowsText = (rows) => rows.map((r) => JSON.stringify(Object.entries(r).map(([k, x]) => [k, x instanceof Date ? 'DATE' : toText(x)]))).sort();
