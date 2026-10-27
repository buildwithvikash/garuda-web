// Serial Generation Logic (View/MaterialSetup/SerialGenerationLogicForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { execute, query } from '../../../../db/pool.js';
import { netString, netInt, netLong } from '../../../../shared/net.js';
import { update, collect } from '../../write.js';
import { toText } from '../../../../shared/values.js';
import { errorMsg, gridDelete, guard, selectedText } from '../_shared.js';
import { CUSTOM_DISPLAY, PAGE_DISPLAY, PAGE_EVENTS, PAGE_UPDATE } from '../registry.js';

const SERIAL = 'View/MaterialSetup/SerialGenerationLogicForm.aspx';

CUSTOM_DISPLAY.add(SERIAL);

/** DdlName value "<VariantCode>-<VariantType>": the type (Split('-')[1] throws without a "-") */
const variantType = (value) => {
  const parts = value.split('-');
  if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
  return netInt(parts[1]);
};

// DdlName_SelectedIndexChanged: 1 = date format, 2 = serial, 3 = fixed value
const serialPanels = (value) => {
  const type = value === '' ? 0 : variantType(value);
  return { dateFormat: { visible: type === 1 }, Serial: { visible: type === 2 }, Value: { visible: type === 3 } };
};

/** the StartingNo of the serial-number part (VariantCode 10), "" when there is none */
const serialStart = (rows, get) => netString(get(rows.find((r) => netString(get(r, 'VariantCode')) === '10') ?? null, 'StartingNo'));

Object.assign(PAGE_DISPLAY, {
  // display(key): AU.Display, then ViewState["Serial"] = the serial part's StartingNo (compared on update)
  [SERIAL]: {
    async after(controls, row, ctx, vs) {
      const rows = await query('Select VariantCode, StartingNo from SerialGenerationLogicDetail where SerialCode=@k', { k: row.SerialCode });
      vs.Serial = serialStart(rows, (r, c) => (r ? toText(r[c]) : ''));
    },
  },
});

Object.assign(PAGE_UPDATE, {
  // BTNUpdate_Click: UpdateDataWithoutTransaction; a changed serial start resets NextSerialNo of this year's serials
  // of every material using the logic
  [SERIAL]: async (v, h) => {
    try {
      const ds = await collect(h.spec, h.raw ?? v, h.ctx);
      const det = ds.tables.find((t) => t.schema.name.toLowerCase() === 'serialgenerationlogicdetail');
      const serial = det ? serialStart(det.rows, (r, c) => (r ? toText(r.get(det.schema.col(c).name)) : '')) : '';
      const key = await update(h.spec, ds, h.ctx, {
        plain: true,
        then: async (tx) => {
          const mats = await query('Select Matcode from Material where AssetTagType=@k', { k: netString(v.PrimaryKey) }, tx);
          if (netLong(h.vs.Serial) === netLong(serial)) return;
          const yy = String(new Date().getFullYear()).slice(-2);
          for (const m of mats) await execute(`update SerialBarcode set NextSerialNo=@n where  AssetId=1 and Material=@m and BusinessUnit=@bu and Year=${yy}`, { n: netLong(serial), m: m.Matcode, bu: netString(h.ctx.businessUnit) }, tx);
        },
      });
      return { ok: true, key, message: '' };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
});

Object.assign(PAGE_EVENTS, {
  [SERIAL]: {
    DdlName: async (v) => ({ set: serialPanels(v.DdlName) }),
    DdlType: async () => ({}),
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlName === '') return void (out.alert = errorMsg('Please Select a Name'));
        const type = variantType(v.DdlName);
        if (type === 1 && v.tbFormat.trim() === '') return void (out.alert = errorMsg('Please Enter a Format'));
        if (type === 2 && v.tbLenth.trim() === '') return void (out.alert = errorMsg('Please Enter a Length'));
        if (type === 3 && v.tbValue.trim() === '') return void (out.alert = errorMsg('Please Enter a Value'));
        const t = await h.table('GVTransData');
        if (t.rows.some((r) => t.get(r, 'Seq') === v.tbSeqNo)) return void (out.alert = errorMsg('Duplicate Sequance'));
        const row = t.newRow();
        t.set(row, 'SerialCode', netInt(v.PrimaryKey));
        t.set(row, 'RowID', t.max('RowID') + 1);
        t.set(row, 'VariantCode', v.DdlName.split('-')[0]);
        t.set(row, 'VariantName', await selectedText(h, 'DdlName', v.DdlName));
        t.set(row, 'Name', v.TbDescription.trim());
        t.set(row, 'Seq', netInt(v.tbSeqNo));
        t.set(row, 'Seperator', await selectedText(h, 'DDLSeperator', v.DDLSeperator));
        t.set(row, 'StartingNo', netLong(v.tbStartingNo));
        t.set(row, 'Seed', netInt(v.tbSeed));
        t.set(row, 'Length', netInt(v.tbLenth));
        t.set(row, 'EndingNo', netLong(v.tbEndingNo));
        t.set(row, 'Format', v.tbFormat.trim());
        t.set(row, 'Value', v.tbValue.trim());
        const blank = Object.fromEntries(['tbSeed', 'tbSeqNo', 'tbStartingNo', 'tbLenth', 'tbEndingNo', 'tbFormat', 'tbValue', 'TbDescription'].map((id) => [id, { value: '' }]));
        Object.assign(out.set, { GVTransData: { rows: [...t.rows, row], visible: true }, ...blank, DdlName: { index: 0 }, ...serialPanels('') });
      });
    },
    'GVTransData:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVTransData = { rows: await gridDelete(h, 'GVTransData', h.arg) };
      });
    },
  },
});
