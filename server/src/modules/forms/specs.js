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

const all = JSON.parse(readFileSync(new URL('./forms.json', import.meta.url), 'utf8'));
for (const [route, controls] of Object.entries(ADDED)) all[route].controls.push(...controls);

export const FORMS = Object.fromEntries(Object.entries(all).filter(([r]) => KEEP.has(r)));
