// Shift (View/Settings/ShiftMasterForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { alertMsg } from '../_shared.js';
import { PAGE_EVENTS } from '../registry.js';
import { gridRemove } from './_shared.js';

Object.assign(PAGE_EVENTS, {
  // ---- grid pages -------------------------------------------------------------------------------------------
  'View/Settings/ShiftMasterForm.aspx': {
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'Name') === v.TBBreakName)) return { alert: alertMsg('Value Already Added') };
      const row = t.newRow();
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'ShiftCode', 0);
      t.set(row, 'Name', v.TBBreakName);
      t.set(row, 'StartTime', v.TBStart);
      t.set(row, 'EndTime', v.TBEnd);
      return { set: { GVTransData: { rows: [...t.rows, row] }, TBBreakName: { value: '' }, TBStart: { value: '' }, TBEnd: { value: '' } } };
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'RowID', h.arg) } } }),
  },
});
