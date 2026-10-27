// Helpers used by several screens of material-setup (ported from the original pages' shared code).
import { tableSchema } from '../../schema.js';
import { insert } from '../../write.js';
import { NRE, alertMsg, notInList, selectedText } from '../_shared.js';
import { PAGE_LISTS } from '../registry.js';

/** AVMaterial.AddVarintFieldValue: new VariantFieldValue (key from IDMaster), returns its code. */
async function addVariantFieldValue(field, value, ctx) {
  const schema = await tableSchema('VariantFieldValue');
  const row = new Map([['Code', 0], ['Name', value], ['Field', field], ['Status', 1]].map(([k, v]) => [schema.col(k)?.name ?? k, v]));
  return insert(null, { tables: [{ schema, prefix: '', rows: [row] }] }, ctx);
}

const VARIANT_FIELDS = 'select FieldCode,Name from VariantField';

export const groupFields = (h, group) => (group === '' ? h.fill(VARIANT_FIELDS) : h.fill('select f.FieldCode,f.Name   from VariantFGroupTrans g inner join VariantField f on g.FieldCode =f.FieldCode   where g.GroupCode=@g', { g: group }));

/** Convert.ToInt32(DdlName.SelectedItem.Value) */
export const toInt32 = (s) => {
  if (!/^\s*[+-]?\d+\s*$/.test(s)) throw new Error('Input string was not in a correct format.');
  return Number(s);
};

/** Variant / Model "Add": shared start (field chosen, not yet in the grid, new value typed -> found or created). */
export async function variantAddStart(v, h, out, { byText }) {
  if (v.DdlName === '') return { stop: { alert: alertMsg('Select a Variant Field') } };
  const t = await h.table('GVTransData');
  const name = await selectedText(h, 'DdlName', v.DdlName);
  if (t.rows.some((r) => t.get(r, 'Name') === name)) return { stop: { alert: alertMsg('The Field is Already Added') } };
  let opts = await h.options('DdlValue');
  let value = v.DdlValue;
  if (v.TbNewValue.trim() !== '') {
    const hit = opts.find((l) => l.text === v.TbNewValue && l.value !== '');
    if (hit) {
      value = byText ? opts.find((l) => l.text === hit.text).value : hit.value;
    } else {
      const code = await addVariantFieldValue(v.DdlName, v.TbNewValue, h.ctx);
      opts = await PAGE_LISTS[h.spec.file].DdlValue(v, h); // DdlName_SelectedIndexChanged
      out.set.DdlValue = { options: opts };
      if (byText) value = opts.find((l) => l.text === v.TbNewValue)?.value ?? opts[0]?.value ?? ''; // SelectDropDown(DdlValue, text)
      else if (opts.some((l) => l.value === code)) value = code;
      else throw notInList('DdlValue');
    }
    out.set.DdlValue = { ...out.set.DdlValue, value };
    out.set.TbNewValue = { value: '' };
  }
  const item = opts.find((l) => l.value === value) ?? opts[0];
  if (!item) throw NRE();
  return { t, name, item };
}
