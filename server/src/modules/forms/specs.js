// The screens this app offers: the specs extracted from the original pages (scripts/extract-forms.mjs), keep-list only.
import { readFileSync } from 'node:fs';
import { KEEP } from '../menu/keep.js';

/** controls this app adds to a ported screen, after the page's own (as extract-forms writes them: Tag = table|column|
 *  cond|list query). Each is an intended difference (docs/PARITY-REPORT.md). */
const ADDED = {
  // the material's routing (Material.Route, a RoutingHeader.RouteCode), as on LIVE (owner, 28 Oct 2026): Production
  // Assignment picks it for an order of this material, so the user no longer chooses one before printing. The list is
  // the one Production Assignment offers.
  '/materialsetup/materialform': [
    { type: 'Label', id: 'LblRoute', tag: ['Material', 'Route', '$', ''], text: 'Routing', attrs: {} },
    { type: 'DropDownList', id: 'DDLRoute', tag: ['Material', 'Route', '$', 'Select RouteCode, Name From RoutingHeader where [Type]=1 and Status=1'], attrs: {}, items: [] },
  ],
};

/** a text of an extracted query replaced (the server stops at start if the original no longer has it) */
const swap = (text, from, to, what) => {
  if (!text.includes(from)) throw new Error(`specs.js: ${what} no longer has "${from}"`);
  return text.replace(from, to);
};

/** grid columns this app adds to a ported screen: shown only (not a column of the grid's table, so never saved). Each
 *  is an intended difference (docs/PARITY-REPORT.md). */
const GRID_COLUMNS = {
  // Bill of Material: each input / output line's material category beside its material type (owner, 29 Oct 2026)
  '/materialsetup/billofmaterial': {
    GVBOMInput: { after: 'Type', field: 'MaterialCategory', header: 'Material Category', select: 'mc.Name[MaterialCategory]', join: 'left join MaterialCategory mc on mc.CategoryCode = m.Category' },
    GVOutput: { after: 'Type', field: 'MaterialCategory', header: 'Material Category', select: 'mc.Name[MaterialCategory]', join: 'left join MaterialCategory mc on mc.CategoryCode = m.Category' },
  },
};

const all = JSON.parse(readFileSync(new URL('./forms.json', import.meta.url), 'utf8'));
for (const [route, controls] of Object.entries(ADDED)) all[route].controls.push(...controls);
for (const [route, grids] of Object.entries(GRID_COLUMNS)) {
  for (const [id, g] of Object.entries(grids)) {
    const c = all[route].controls.find((x) => x.id === id);
    const what = `${route} ${id}`;
    // the column in the grid's query (Tag[0]), after the material type, and its join
    c.tag[0] = swap(swap(c.tag[0], 'mt.Type,', `mt.Type, ${g.select},`, what), 'left join MaterialCategoryType mt on m.Type=mt.ID', `left join MaterialCategoryType mt on m.Type=mt.ID ${g.join}`, what);
    const at = c.columns.findIndex((x) => x.dataField === g.after);
    if (at < 0) throw new Error(`specs.js: ${what} has no ${g.after} column`);
    c.columns.splice(at + 1, 0, { kind: 'boundfield', dataField: g.field, header: g.header, footer: '' });
  }
}

export const FORMS = Object.fromEntries(Object.entries(all).filter(([r]) => KEEP.has(r)));
