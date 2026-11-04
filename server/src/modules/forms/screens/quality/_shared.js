// Helpers used by several screens of quality (ported from the original pages' shared code).
import { setting, settingText } from '../../../settings/settings.service.js';
import { displayState } from '../../state.js';

/** The page's own AU.Display(TopPanel, Get_DisplayData(...)) during an event: the record's values into the form's
 *  engine controls (lists refilled as Display does), as patches */
export async function displayPatch(spec, ctx, key) {
  const st = await displayState(spec, ctx, key);
  const set = {};
  for (const c of st.controls) {
    if (!c.id || c.page) continue;
    if (c.type === 'GridView') {
      if (c.table || c.childTable) set[c.id] = { rows: c.rows };
    } else if (c.type === 'Panel') {
      if (c.cond.trim() === '0') set[c.id] = { visible: true }; // AssignData shows the panels ClearForm hid
    } else if (c.table.trim() !== '') set[c.id] = c.type === 'DropDownList' ? { options: c.options, value: c.value } : { value: c.value };
  }
  return set;
}

export const settingOr = (name, fallback) => (settingText(name, null) === null ? fallback : setting(name));
