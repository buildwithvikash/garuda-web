// Functional inventory of the kept screens, from the code itself: specs (forms.json), the registries (what each
// screen's ported code-behind does), each screen file's SQL writes, the domain modules and the parity scripts.
// Usage (from server/): node --env-file=.env scripts/docs-inventory.js . ../docs/FUNCTIONAL-INVENTORY.md
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [server, outFile] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(path.join(server, p)).href);
const { FORMS } = await imp('src/modules/forms/specs.js');
const R = await imp('src/modules/forms/pages.js');
const { KEEP } = await imp('src/modules/menu/keep.js');
const menu = JSON.parse(fs.readFileSync(path.join(server, 'src/modules/menu/menu.json'), 'utf8'));

// sidebar group and caption of each route
const where = new Map();
// menu.json: top-level groups (moduleId 3 is shown as "Production Setup" in the sidebar), pages by their original url
const GROUP_NAME = { 3: 'Production Setup' };
const walk = (nodes, group) => nodes.forEach((n) => (n.url && where.set(n.url.toLowerCase(), { group, caption: n.caption }), walk(n.children ?? [], group)));
for (const g of menu) walk(g.children ?? [], GROUP_NAME[g.moduleId] ?? g.caption);
// screen file of each page
const screensDir = path.join(server, 'src/modules/forms/screens');
const files = [];
const list = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? list(path.join(d, e.name)) : e.name.endsWith('.js') && files.push(path.join(d, e.name))));
list(screensDir);
const fileOfPage = new Map();
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/'(View\/[A-Za-z]+\/[A-Za-z0-9]+\.aspx)'/g)) if (!fileOfPage.has(m[1])) fileOfPage.set(m[1], f);
}
// tables a file writes (its own SQL) and those of the services it calls are listed per screen file
const writes = (t) => [...new Set([...t.matchAll(/\b(?:insert\s+into|update)\s+\[?(\w+)\]?/gi)].map((m) => m[1]).filter((x) => /^[A-Z]/.test(x)))];
// domain APIs
const { MASTERS } = await imp('src/modules/masters/masters.routes.js');
const { QUALITY } = await imp('src/modules/quality/quality.routes.js');
const { PRODUCTION } = await imp('src/modules/production/production.routes.js');
const DOMAIN = { ...Object.fromEntries(Object.entries(MASTERS).map(([n, r]) => [r, `/api/masters/${n} (modules/masters)`])), ...Object.fromEntries(Object.entries(QUALITY).map(([n, r]) => [r, `/api/quality/${n} (modules/quality)`])), ...Object.fromEntries(Object.entries(PRODUCTION).map(([n, r]) => [r, `/api/production/${n} (modules/production)`])), '/production/productionorderform': '/api/production/orders (modules/production-orders)', '/production/productionassignmentform': '/api/production/assignments (modules/production-assignments)' };
// parity coverage: scripts that name the route or the page
const parityDir = path.join(server, 'scripts/parity');
const scripts = fs.readdirSync(parityDir).filter((f) => f.endsWith('-parity.js')).map((f) => [f.replace('-parity.js', ''), fs.readFileSync(path.join(parityDir, f), 'utf8')]);
// known gaps (README "Known gaps"), by route
const GAPS = {
  '/production/wipcaptureform': 'scan result 20 (multi-qty stage output), stage type 7 and department indicators other than 10000 not ported; output printing for serial logic > 1 not ported',
  '/quality/reworkconfirmationnew': 'confirming part of a quantity needs the ERP posting split: not ported',
  '/ceat/ceatinselfinspectionform': 'fails on this database (CEAT table/column WRL lacks), as the original does',
  '/production/productionorderform': 'order type 4 (service request) fails on TEST: no SRHeader table, as the original; material lists show the name only (owner, 26 Oct)',
};

const rows = [];
for (const route of [...KEEP].sort()) {
  const spec = FORMS[route];
  const page = spec?.file ?? '';
  const w = where.get(page.toLowerCase()) ?? { group: '', caption: spec?.title ?? route };
  const ev = Object.keys(R.PAGE_EVENTS[page] ?? {});
  const own = ['PAGE_LOAD', 'PAGE_SAVE', 'PAGE_UPDATE', 'PAGE_CANCEL', 'PAGE_PRINT', 'PAGE_DISPLAY', 'PAGE_LISTS', 'PAGE_POSTBACK', 'PAGE_INIT', 'PAGE_LIST_TAG'].filter((r) => R[r][page]);
  const tag = spec?.top?.tag ? spec.top.tag.split('|').filter(Boolean) : [];
  const grids = (spec?.controls ?? []).filter((c) => c.type === 'GridView' && c.tag?.length >= 4 && c.tag[1]?.trim()).map((c) => c.tag[1].trim());
  const file = fileOfPage.get(page);
  const own_writes = file ? writes(fs.readFileSync(file, 'utf8')) : [];
  const saves = [...new Set([...tag, ...grids, ...own_writes])];
  const covered = ['forms', ...scripts.filter(([n, t]) => n !== 'forms' && (t.includes(`'${route}'`) || t.includes(`"${route}"`) || (page && t.includes(path.basename(page))))).map(([n]) => n)];
  // forms-write-parity's own selection (no route named): declarative master pages of these folders
  const fwModules = ['/businesssetup/', '/materialsetup/', '/productionsetup/', '/settings/', '/authorization/'];
  if (!covered.includes('forms-write') && route !== '/businesssetup/companyform' && fwModules.some((m) => route.startsWith(m)) && spec && !spec.custom?.handlers && !spec.custom?.events && spec.view?.tag && !spec.controls.some((c) => ['GridView', 'TreeView', 'CheckBoxList'].includes(c.type) && c.tag?.length >= 4)) covered.push('forms-write');
  const impl = DOMAIN[route] ? `domain API ${DOMAIN[route]}` : 'screen engine /api/forms';
  rows.push({ route, group: w.group, caption: w.caption, page, impl, file: file ? path.relative(screensDir, file).split(path.sep).join('/') : '(engine only: declarative form)', ev, own, saves, covered, gap: GAPS[route] ?? '' });
}

const md = [];
md.push('# Functional inventory: the 47 Garuda WRL screens');
md.push('');
md.push(`Generated from the code on ${new Date().toLocaleDateString('sv')} (forms.json specs, the screens' registries, each screen file's SQL, the parity scripts). Original application: \`source/Garuda\` (ASP.NET Web Forms) + its business DLLs in \`build/Publish WRL/bin\`, both untouched.`);
md.push('');
md.push('**Scope.** The original has 437 pages; the owner limited the new app to these 47 (keep-list, `server/src/modules/menu/keep.js`, 21 Oct). Reports, dashboards and the other 390 pages are out of scope by that decision. The original has no web services, background jobs or API controllers: its business logic runs in its pages and DLLs. External dependencies of the 47: SQL Server (same database and schema), label printers (raw TCP 9100 or a Windows driver), the station guide files folder, the sharecad.org drawing viewer; one ERP posting step (partial rework confirmation) is not ported.');
md.push('');
md.push('**How to read it.** *New implementation*: the screen engine (`/api/forms`, the screen\'s ported page code in `modules/forms/screens/...`) or a domain API of its own. *Ported behaviour*: the page events (AutoPostBack handlers, buttons) and own handlers (load / save / update / delete / print ...) the original page had beyond the generic form. *Saves to*: the tables its form saves through the writer plus tables its own code writes (the shared production / quality services write more, see each service). *Parity*: the suites that run the original page and the new code on the same inputs for this screen (`forms`: open, list, display a record, for all 47).');
md.push('');
const groups = [...new Set(rows.map((r) => r.group))];
let n = 0;
for (const g of groups) {
  md.push(`## ${g || '(not in the menu)'}`);
  md.push('');
  md.push('| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.filter((x) => x.group === g)) {
    n++;
    const beh = [r.ev.length ? `${r.ev.length} event${r.ev.length > 1 ? 's' : ''}` : '', r.own.map((x) => x.replace('PAGE_', '').toLowerCase()).join(', ')].filter(Boolean).join('; ') || 'generic form only';
    md.push(`| ${n} | ${r.caption} | \`${r.route}\` | ${path.basename(r.page)} | ${r.impl}${r.file.startsWith('(') ? '' : `; \`screens/${r.file}\``} | ${beh} | ${r.saves.join(', ') || '—'} | ${r.covered.join(', ')} | ${r.gap} |`);
  }
  md.push('');
}
md.push('## Backend features outside the screens (old → new)');
md.push('');
md.push('| Feature | Original (.NET) | New | Parity |');
md.push('|---|---|---|---|');
for (const r of [
  ['Sign-in (result codes 0 no user, 1 ok, 2 locked, 3 expired, 5 inactive, 6 wrong password, 7 must change, 8 wrong organization); QR sign-in', 'Login.aspx → AVLogin.ValidateLogin / ValidateLoginQR', '`modules/auth/auth.service.js`, `POST /api/auth/login`', 'login (834 cases, 0 mismatches)'],
  ['Change password', 'AVLogin.ChangePassword', '`auth.service.js`, `POST /api/auth/change-password`', 'login'],
  ['Password encryption (stored values must match byte for byte)', 'WrapperAvatar.encrypt (PBKDF2-SHA1 + AES-CBC)', '`modules/auth/password.js`', 'tests/password'],
  ['Session (user, business unit, role values)', 'ASP.NET Session', 'signed httpOnly cookie, `modules/auth/sessions.js`', 'tests/login'],
  ['Failed sign-in throttle', '— (new; security)', '`modules/auth/throttle.js`', 'tests/throttle'],
  ['Menu and role filtering, caption overrides, default form', 'Layout.Master + AVLogin.GetUserForms / GetDefaultForm', '`modules/menu/menu.service.js` (menu.json) + keep-list', 'tests/keep-list'],
  ['Screen permission check', 'page-level role check', '`middlewares/auth.js` authorize / authorizeScreen', 'smoke (401/403)'],
  ['Settings table', 'Avatar.Settings', '`modules/settings/settings.service.js`', 'login'],
  ['Label printing (MaterialTag template → TCP 9100 or Windows driver)', 'Avatar.AVLabelPrint, Akaar.AIPPrint, ADriverPrint', '`modules/production/labels.service.js`, `raw-print.ps1`', 'print'],
  ['WIP / production writes (stage output, QC, FG, rework)', 'business DLLs called from the production pages', '`modules/production/*.service.js`, `modules/quality/quality.service.js`', 'wip, rework, production-writes'],
  ['Excel upload into masters', 'page upload handlers', '`importExcel` in the screen engine', 'upload'],
  ['Operator messages (friendly error text)', 'page alert scripts', '`middlewares/operatorMessages.js`', 'tests/messages'],
  ['Security headers, request log', '— (IIS defaults)', '`middlewares/securityHeaders.js`, `requestLog.js`', '—'],
]) md.push(`| ${r.join(' | ')} |`);
md.push('');
const thin = rows.filter((r) => r.covered.length === 1 && (r.ev.length || r.own.length));
md.push('## Parity coverage gaps');
md.push('');
md.push(`${thin.length} screens have page code but are only checked by \`forms\` (open / list / display), not by an event or write suite: ${thin.map((r) => r.caption).join(', ') || 'none'}.`);
md.push('');
fs.writeFileSync(outFile, md.join('\n'));
console.log(`${rows.length} screens; domain APIs ${rows.filter((r) => r.impl.startsWith('domain')).length}; thin coverage ${thin.length}: ${thin.map((r) => r.route).join(' ')}`);
