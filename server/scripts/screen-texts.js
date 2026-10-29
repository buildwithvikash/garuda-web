// A screen's texts as its page shows them today (for a page's `texts` block, client/scripts/page-texts.mjs): its title,
// every control with the label the form gives it (the paired Label's text, else its caption, a button its text), each
// grid's columns with their headers, and the list's columns. Read only.
// Usage (from server/): node --env-file=.env scripts/screen-texts.js <route>   -> JSON on stdout
import { loadSettings } from '../src/modules/settings/settings.service.js';
import { FORMS } from '../src/modules/forms/specs.js';
import { specPayload } from '../src/modules/forms/resource.js';
import { listPage } from '../src/modules/forms/lists.js';

const route = process.argv[2];
const spec = FORMS[route];
if (!spec) {
  console.error(`No screen ${route}`);
  process.exit(1);
}
await loadSettings();
// a parity user's context (the screen's lists are filled as for a signed-in user)
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003', line: '12201', lineName: 'FOW Foaming' };
const s = await specPayload(spec, ctx);
const labels = s.controls.filter((c) => c.type === 'Label');
const paired = (c) => (c.table?.trim() || c.column?.trim() ? labels.find((l) => l.table === c.table && l.column === c.column && l.visible !== false)?.text : null);
const clean = (t) => String(t ?? '').replace(/\s*:\s*$/, '').trim();

const fields = s.controls
  .filter((c) => c.id && c.type !== 'Label')
  .map((c) => {
    const label = clean(paired(c)) || clean(c.caption) || (c.type === 'Button' || c.type === 'ImageButton' ? clean(c.text) : '') || clean(c.column);
    return { id: c.id, type: c.type, label, screenHidden: c.visible === false, where: c.table?.trim() && c.column?.trim() && c.type !== 'GridView' ? `${c.table.trim()}.${c.column.trim()}` : '' };
  });
const grids = Object.fromEntries(
  s.controls.filter((c) => c.id && c.type === 'GridView').map((c) => [c.id, c.columns.filter((x) => x.kind === 'boundfield' && x.dataField).map((x) => ({ field: x.dataField, header: clean(x.header) || x.dataField }))]),
);
let list = [];
if (s.hasList) {
  try {
    list = (await listPage(spec, ctx, 0)).columns.map((c) => c.name);
  } catch {
    list = [];
  }
}
console.log(JSON.stringify({ route, title: s.title ?? '', fields, grids, list }));
process.exit(0);
