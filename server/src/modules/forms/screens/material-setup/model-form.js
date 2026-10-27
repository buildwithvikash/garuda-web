// Model (View/MaterialSetup/ModelForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netInt } from '../../../../shared/net.js';
import { alertMsg, gridDelete, selectedText } from '../_shared.js';
import { groupFields, toInt32, variantAddStart } from './_shared.js';
import { PAGE_EVENTS, PAGE_LISTS } from '../registry.js';

Object.assign(PAGE_LISTS, {
  'View/MaterialSetup/ModelForm.aspx': {
    DdlName: (v, h) => (v.DDLGroup ? groupFields(h, v.DDLGroup) : h.fill('Select FieldCode ,Name from VariantField where Status=1')),
    DdlValue: (v, h) => (v.DdlName === '' || v.DdlName == null ? [] : h.fill("select Concat(Code,'~',Prefix)[Code],Name from VariantFieldValue where Field=@f", { f: toInt32(v.DdlName) })),
  },
});

Object.assign(PAGE_EVENTS, {
  'View/MaterialSetup/ModelForm.aspx': {
    DdlName: async (v, h) => ({ set: { DdlValue: { options: await PAGE_LISTS[h.spec.file].DdlValue(v, h), index: 0 } } }),
    DDLGroup: async (v, h) => ({ set: { DdlName: { options: await groupFields(h, v.DDLGroup), index: 0 } } }),
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      const s = await variantAddStart(v, h, out, { byText: true });
      if (s.stop) return { ...out, ...s.stop };
      const { t, name, item } = s;
      if (t.rows.some((r) => t.get(r, 'ValueCode') === item.value)) return { ...out, alert: alertMsg('Value Already Added') };
      const parts = item.value.split('~');
      if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
      const row = t.newRow();
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'RecNo', t.max('RecNo') + 1);
      t.set(row, 'ModelCode', 0);
      t.set(row, 'ValueCode', netInt(parts[0]));
      t.set(row, 'Prefix', parts[1].trim());
      t.set(row, 'Name', name);
      t.set(row, 'Value', item.text);
      const rows = [...t.rows, row];
      const cat = (await selectedText(h, 'DDLCategory', v.DDLCategory)).split('~');
      if (cat.length < 2) throw new Error('Index was outside the bounds of the array.');
      const alias = cat[1] + rows.map((r) => t.get(r, 'Prefix').trim()).join('');
      Object.assign(out.set, { GVTransData: { rows }, DdlName: { index: 0 }, DdlValue: { options: out.set.DdlValue?.options, index: 0 }, Alias: { value: alias } });
      return out;
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridDelete(h, 'GVTransData', h.arg) } } }),
  },
});
