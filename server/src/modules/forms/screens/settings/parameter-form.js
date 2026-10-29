// CheckList Master (View/Settings/ParameterForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netInt, netDouble, netBool } from '../../../../shared/net.js';
import { NRE, alertMsg, guard, noKey, parseString, parseStringZero, select } from '../_shared.js';
import { PAGE_EVENTS, PAGE_INIT } from '../registry.js';
import { gridRemove } from './_shared.js';

Object.assign(PAGE_INIT, {
  'View/Settings/ParameterForm.aspx': async (controls, vs) => Object.assign(vs, { btnAdd: '1' }),
});

Object.assign(PAGE_EVENTS, {
  'View/Settings/ParameterForm.aspx': {
    DdlInputType: async (v) => parameterInputType(v.DdlInputType),
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      const fill = async (row) => {
        t.set(row, 'Name', v.TbName);
        t.set(row, 'Description', v.TbDescription);
        t.set(row, 'InputType', v.DdlInputType);
        t.set(row, 'MinValue', netDouble(v.TbMinValue));
        t.set(row, 'MaxValue', netDouble(v.TbMaxValue));
        t.set(row, 'PassValue', v.TbPassValue);
        t.set(row, 'Uom', netInt(v.DdlUom));
        t.set(row, 'ResultDefined', v.DdlResultDefined);
        t.set(row, 'Instrument', netInt(v.DDLInstrument));
        t.set(row, 'List', netInt(v.DdlList));
        t.set(row, 'GuideImage', v.UploadImage ?? '');
      };
      let rows = t.rows;
      if (netBool(h.vs.btnAdd)) {
        if (rows.some((r) => t.get(r, 'Description') === v.TbDescription)) return { alert: alertMsg('Value Already Added') };
        const row = t.newRow();
        t.set(row, 'ParameterCode', netInt(v.PrimaryKey));
        t.set(row, 'LineCode', t.max('LineCode') + 1);
        await fill(row);
        rows = [...rows, row];
      } else {
        const i = rows.findIndex((r) => t.get(r, 'LineCode').trim() === parseString(h.vs.LineCode).trim());
        if (i >= 0) {
          const row = { ...rows[i] };
          await fill(row);
          rows = rows.map((r, j) => (j === i ? row : r));
        }
      }
      const blank = { value: '' };
      return {
        set: { GVTransData: { rows }, TbName: blank, TbDescription: blank, TbMaxValue: blank, TbMinValue: blank, TbPassValue: blank, DdlUom: { value: '' }, MinMaxPanel: { visible: false }, ListPanel: { visible: false }, BtnAdd: { text: '  ADD  ' } },
        viewState: { ...h.vs, btnAdd: '1' },
      };
    },
    'GVTransData:select': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const row = t.rows.find((r) => t.get(r, 'LineCode') === h.arg) ?? noKey();
        out.set.TbName = { value: parseString(t.get(row, 'Name')) };
        out.set.TbDescription = { value: parseString(t.get(row, 'Description')) };
        await select(h, out, 'DdlInputType', parseString(t.get(row, 'InputType')));
        const p = parameterInputType(out.set.DdlInputType.value);
        for (const [k, x] of Object.entries(p.set ?? {})) out.set[k] = { ...out.set[k], ...x };
        out.set.TbMinValue = { value: parseString(t.get(row, 'MinValue')) };
        out.set.TbMaxValue = { value: parseString(t.get(row, 'MaxValue')) };
        out.set.TbPassValue = { value: parseString(t.get(row, 'PassValue')) };
        await select(h, out, 'DdlUom', parseStringZero(t.get(row, 'Uom')));
        await select(h, out, 'DdlResultDefined', parseString(t.get(row, 'ResultDefined')));
        await select(h, out, 'DDLInstrument', parseStringZero(t.get(row, 'Instrument')));
        // "DdlList.SelectedItem.Value = …": changes the value of the item that is selected, not the selection
        const lists = await h.options('DdlList');
        const at = Math.max(0, lists.findIndex((o) => o.value === v.DdlList));
        if (!lists[at]) throw NRE();
        out.set.DdlList = { options: lists.map((o, j) => (j === at ? { ...o, value: parseStringZero(t.get(row, 'List')) } : o)), index: at };
        out.viewState.btnAdd = '0';
        out.viewState.LineCode = parseString(t.get(row, 'LineCode'));
        out.set.BtnAdd = { text: '  Update  ' };
      });
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'LineCode', h.arg) } } }),
    // a line's edit given up (owner, 29 Oct 2026; the original had none: Select left the editors in Update until the
    // next Add): the editors back to Add, as after an Add, the lines unchanged
    'GVTransData:cancel': async (v, h) => {
      const blank = { value: '' };
      return {
        set: { TbName: blank, TbDescription: blank, TbMaxValue: blank, TbMinValue: blank, TbPassValue: blank, DdlUom: { value: '' }, MinMaxPanel: { visible: false }, ListPanel: { visible: false }, BtnAdd: { text: '  ADD  ' } },
        viewState: { ...h.vs, btnAdd: '1', LineCode: '' },
      };
    },
  },
});

/** ParameterForm.DdlInputType_SelectedIndexChanged */
function parameterInputType(type) {
  const map = { bit: [false, false, 'System'], text: [false, false, 'User'], numeric: [true, false, 'System'], image: [false, false, 'User'], list: [false, true, 'User'] };
  const m = map[type];
  return m ? { set: { MinMaxPanel: { visible: m[0] }, ListPanel: { visible: m[1] }, DdlResultDefined: { value: m[2] } } } : {};
}
