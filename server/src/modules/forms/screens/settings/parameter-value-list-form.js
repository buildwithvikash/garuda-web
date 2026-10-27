// Parameter Value List (View/Settings/ParameterValueListForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netInt } from '../../../../shared/net.js';
import { alertMsg } from '../_shared.js';
import { PAGE_EVENTS } from '../registry.js';
import { gridRemove } from './_shared.js';

Object.assign(PAGE_EVENTS, {
  'View/Settings/ParameterValueListForm.aspx': {
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'Value') === v.TbValue)) return { alert: alertMsg('Value Already Added') };
      const row = t.newRow();
      t.set(row, 'Code', netInt(v.PrimaryKey));
      t.set(row, 'Value', v.TbValue);
      t.set(row, 'Result', netInt(v.DDLPass));
      return { set: { GVTransData: { rows: [...t.rows, row] }, TbValue: { value: '' } } };
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'Value', h.arg) } } }),
  },
});
