// The client switch's form check (docs/CLIENT-SWITCH-PLAN.md): for each screen, the form a page draws through the
// screen's REST API (GET /layout, and GET /:key or /:key/copy laid over it by the client's own
// client/src/lib/screenApiCore.js) must equal the form /api/forms gives (spec / record / copy), control by control,
// every property. Also the list page. Read only: nothing is written.
// Usage: node --env-file=.env scripts/parity/client-switch-parity.js [route...]   (default: every screen with an API)
import { loadSettings } from '../../src/modules/settings/settings.service.js';
import { displayState, copyState } from '../../src/modules/forms/state.js';
import { listPage } from '../../src/modules/forms/lists.js';
import { CUSTOM_DISPLAY, PAGE_LIST_TAG } from '../../src/modules/forms/pages.js';
import { FORMS } from '../../src/modules/forms/specs.js';
import { specPayload, screenResource } from '../../src/modules/forms/resource.js';
import { MASTERS } from '../../src/modules/masters/masters.routes.js';
import { QUALITY } from '../../src/modules/quality/quality.routes.js';
import { PRODUCTION } from '../../src/modules/production/production.routes.js';
import { listShape, mapsOf, overlay } from '../../../client/src/lib/screenApiCore.js';

const only = process.argv.slice(2);
const ROUTES = only.length ? only : [...Object.values(MASTERS), ...Object.values(QUALITY), ...Object.values(PRODUCTION)];
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003', line: '12201', lineName: 'FOW Foaming' };
const RECORDS = 3; // records of the list's first page checked per screen
await loadSettings();

/** JSON with sorted keys (property order is not a difference) */
const canon = (x) => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
/** the engine's form state as /api/forms sends it (publicState of forms.routes.js) */
const pub = (s) => ({ title: s.title, controls: s.controls, viewState: s.viewState ?? {}, recordStatus: s.recordStatus ?? null, statusMessage: s.statusMessage ?? null });
/** the first differences between two form states, control by control */
function differences(a, b) {
  const out = [];
  for (const k of ['title', 'viewState', 'recordStatus', 'statusMessage']) if (canon(a[k]) !== canon(b[k])) out.push(`${k}: ${canon(a[k]).slice(0, 120)} vs ${canon(b[k]).slice(0, 120)}`);
  const byId = new Map(b.controls.map((c, i) => [c.id ?? `#${i}`, c]));
  a.controls.forEach((c, i) => {
    const d = byId.get(c.id ?? `#${i}`);
    if (!d) return void out.push(`${c.id}: missing`);
    for (const p of new Set([...Object.keys(c), ...Object.keys(d)])) if (canon(c[p]) !== canon(d[p])) out.push(`${c.id}.${p}: ${canon(c[p])?.slice(0, 100)} vs ${canon(d[p])?.slice(0, 100)}`);
  });
  if (a.controls.length !== b.controls.length) out.push(`controls: ${a.controls.length} vs ${b.controls.length}`);
  return out;
}
const attempt = (p) => p.then((value) => ({ value }), (e) => ({ error: e.message }));

const results = [];
for (const route of ROUTES) {
  const spec = FORMS[route];
  const m = screenResource(route);
  const report = [];
  let checked = 0;
  try {
    // the blank form: the layout is the engine's spec plus the API's names
    const engineSpec = await attempt(specPayload(spec, ctx));
    const layout = await attempt(m.layout(ctx));
    if (engineSpec.error || layout.error) {
      results.push([route, engineSpec.error === layout.error ? `both fail alike: ${engineSpec.error}` : `spec: engine ${engineSpec.error ?? 'ok'} / api ${layout.error ?? 'ok'}`]);
      continue;
    }
    const { api, ...rest } = layout.value;
    if (canon(rest) !== canon(engineSpec.value)) report.push(`layout differs from spec: ${differences(engineSpec.value, rest).slice(0, 3).join('; ')}`);
    const maps = mapsOf(layout.value);
    // the list's first page, and its records
    let keys = [];
    if (spec.view?.tag) {
      const tag = PAGE_LIST_TAG[spec.file]?.({}, ctx);
      const e = await attempt(listPage(tag ? { ...spec, view: { ...spec.view, tag } } : spec, ctx, 0, null));
      const a = await attempt(m.list(ctx, { page: 0 }));
      if (e.error || a.error) {
        if (e.error !== a.error) report.push(`list: engine ${e.error ?? 'ok'} / api ${a.error ?? 'ok'}`);
      } else {
        const shaped = listShape(a.value);
        const eng = { ...e.value, columns: e.value.columns.map((c) => ({ name: c.name })) }; // the page reads a column's name only
        if (canon(shaped) !== canon(eng)) report.push(`list: ${canon(eng).slice(0, 150)} vs ${canon(shaped).slice(0, 150)}`);
        keys = (e.value.keys ?? []).slice(0, RECORDS);
      }
    }
    for (const key of keys) {
      const e = await attempt(displayState(spec, ctx, key).then((s) => pub(CUSTOM_DISPLAY.has(spec.file) ? { ...s, recordStatus: null, statusMessage: null } : s)));
      const a = await attempt(m.get(ctx, key).then((r) => overlay(layout.value, r, maps)));
      checked++;
      if (e.error || a.error) {
        if (e.error !== a.error) report.push(`record ${key}: engine ${e.error ?? 'ok'} / api ${a.error ?? 'ok'}`);
        continue;
      }
      const d = differences(e.value, a.value);
      if (d.length) report.push(`record ${key}: ${d.slice(0, 4).join('; ')}${d.length > 4 ? ` (+${d.length - 4})` : ''}`);
      if (m.copy) {
        const ec = await attempt(copyState(spec, ctx, key).then(pub));
        const ac = await attempt(m.copyOf(ctx, key).then((r) => overlay(layout.value, r, maps)));
        if (ec.error || ac.error) {
          if (ec.error !== ac.error) report.push(`copy ${key}: engine ${ec.error ?? 'ok'} / api ${ac.error ?? 'ok'}`);
        } else {
          const dc = differences(ec.value, ac.value);
          if (dc.length) report.push(`copy ${key}: ${dc.slice(0, 4).join('; ')}`);
        }
      }
    }
    results.push([route, report.length ? report.join(' | ') : `IDENTICAL (blank form${spec.view?.tag ? `, list, ${checked} record(s)${m.copy ? ' + copy' : ''}` : ''})`]);
  } catch (e) {
    results.push([route, `harness error: ${e.message}`]);
  }
}
for (const [r, s] of results) console.log(`${s.startsWith('IDENTICAL') || s.startsWith('both fail') ? 'OK  ' : 'DIFF'} ${r}: ${s}`);
console.log(`screens: ${results.length}, identical: ${results.filter(([, s]) => s.startsWith('IDENTICAL')).length}, fail alike: ${results.filter(([, s]) => s.startsWith('both fail')).length}`);
process.exit(0);
