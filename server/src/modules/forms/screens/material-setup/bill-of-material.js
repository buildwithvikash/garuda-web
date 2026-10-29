// Bill of Material (View/MaterialSetup/BillOfMaterial.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, execute } from '../../../../db/pool.js';
import { netString, netInt, netDouble, netBool } from '../../../../shared/net.js';
import { newFormState } from '../../state.js';
import { scalarText } from '../../../production/production.service.js';
import { alertMsg, errorMsg, gridDelete, guard, noKey, notInList, parseString, select, selectedText } from '../_shared.js';
import { PAGE_EVENTS, PAGE_INIT, PAGE_LISTS } from '../registry.js';

const BOM = 'View/MaterialSetup/BillOfMaterial.aspx';

// AVMM.FillMaterial(ddl, type) / FillMaterial(ddl)
const materialsOfType = (h, type) =>
  type === '' ? h.fill("Select MatCode,CONCAT(Name, '|', Alias) from Material Where Status=1") : h.fill("Select MatCode,CONCAT(Name, '|', Alias) from Material Where InventoryFlag=1 and Type = @t and Status=1", { t: type });

const scalarString = async (sql, params) => netString(await scalar(sql, params));

// WrapperAvatar.ParseString(ExecuteScalar)

// Lists the page refilled earlier in this form: ViewState notes which fill they hold (the original kept the items).
PAGE_LISTS[BOM] = {
  DDLInputMaterial: async (v, h) => (h.vs.__inMat === undefined ? (await newFormState(h.spec, h.ctx)).controls.find((c) => c.id === 'DDLInputMaterial').options : materialsOfType(h, h.vs.__inMat)),
  DDLOutputMaterial: async (v, h) => (h.vs.__outMat === undefined ? (await newFormState(h.spec, h.ctx)).controls.find((c) => c.id === 'DDLOutputMaterial').options : materialsOfType(h, h.vs.__outMat)),
  DDLRouting: async (v, h) => (h.vs.__routing === undefined ? [] : h.fill('Select RouteCode, Name from RoutingHeader where material=@m', { m: h.vs.__routing })),
};

/** DDLInputMaterial_SelectedIndexChanged: type and UOM from the material, its sub-routings, serial -> output scan */
async function bomInputMaterial(v, h, out) {
  if (v.DDLInputMaterial === '') return;
  const m = v.DDLInputMaterial;
  const type = netString(await scalar('Select [Type] from Material where MatCode=@m', { m }));
  await select(h, out, 'DDLInputMaterialType', type === '0' ? '' : type);
  await select(h, out, 'DdlInputUom', await scalarString('select BaseUom from Material where MatCode = @m', { m }));
  const routes = await h.fill('Select RouteCode, Name from RoutingHeader where material=@m', { m });
  out.viewState.__routing = m;
  if (routes.length <= 1) Object.assign(out.set, { DDLRouting: { options: routes, index: 0 }, SubRoutingPanel: { visible: false } });
  else Object.assign(out.set, { DDLRouting: { options: routes, ...(routes.length === 2 ? { index: 1 } : {}) }, SubRoutingPanel: { visible: true } });
  const serial = netBool(await scalar('select  Serial from Material where MatCode=@m', { m }));
  out.set.OutputScanPanel = { visible: serial };
  if (serial) out.set.TbInputQuantity = { value: '1' };
}

/** BtnInputAdd / BtnOutputAdd: add (or, after Select, update) a line of the input / output grid */
async function bomAddLine(v, h, side) {
  const input = side === 'in';
  const ids = input
    ? { grid: 'GVBOMInput', type: 'DDLInputMaterialType', mat: 'DDLInputMaterial', qty: 'TbInputQuantity', uom: 'DdlInputUom', mode: 'BOMINAdd', row: 'INRowID', btn: 'BtnInputAdd' }
    : { grid: 'GVOutput', type: 'DDLOutoutMaterialType', mat: 'DDLOutputMaterial', qty: 'TBOutputQty', uom: 'DDLOutputUom', mode: 'BOMOutAdd', row: 'OutRowID', btn: 'BtnOutputAdd' };
  const out = { set: {}, viewState: { ...h.vs } };
  return guard(out, async () => {
    // the input side reports every check with ErrorAlert, the output side the last two with Alert
    if (v[ids.type] === '') return void (out.alert = errorMsg('Please Select Material Type'));
    if (v[ids.mat] === '') return void (out.alert = errorMsg('Please Select Material'));
    if (v.DdlProcess === '') return void (out.alert = input ? errorMsg('Please Select Process') : alertMsg('Please Select Process'));
    if (v[ids.qty] === '') return void (out.alert = input ? errorMsg('Please Enter Qty') : alertMsg('Please Enter Qty'));
    const t = await h.table(ids.grid);
    const text = (id) => selectedText(h, id, v[id]);
    const fill = async (row, update) => {
      if (input && update) t.set(row, 'ProcessCode', v.DdlProcess); // the update branch sets it first (and again below)
      t.set(row, 'Type', await text(ids.type));
      // the material's category, shown beside its type (specs.js GRID_COLUMNS; not a column of the table, never saved)
      t.set(row, 'MaterialCategory', await scalarString('select mc.Name from Material m inner join MaterialCategory mc on mc.CategoryCode = m.Category where m.MatCode = @m', { m: v[ids.mat] }));
      t.set(row, 'MaterialDesc', await text(ids.mat));
      t.set(row, 'Material', v[ids.mat]);
      t.set(row, 'Qty', netDouble(v[ids.qty]));
      t.set(row, 'UomDesc', await text(ids.uom));
      t.set(row, 'Uom', v[ids.uom]);
      t.set(row, 'ProcessDesc', await text('DdlProcess'));
      t.set(row, 'ProcessCode', v.DdlProcess);
      if (input) {
        t.set(row, 'ScanReq', netBool(v.DDLInputScan));
        t.set(row, 'OutputScan', netBool(v.DDLOutputScan));
        t.set(row, 'RoutingCode', netInt(v.DDLRouting));
      }
    };
    let rows = t.rows;
    if (netBool(h.vs[ids.mode])) {
      if (rows.some((r) => t.get(r, 'Material') === v[ids.mat] && t.get(r, 'Qty') === v[ids.qty] && t.get(r, 'ProcessCode') === v.DdlProcess)) {
        out.alert = input ? errorMsg('Value Already Added') : alertMsg('Value Already Added');
        return;
      }
      const row = t.newRow();
      t.set(row, 'BOMCode', netInt(v.PrimaryKey));
      t.set(row, 'RowID', t.max('RowID') + 1);
      // the new line's columns in the original order (Type … RoutingCode)
      await fill(row);
      rows = [...rows, row];
    } else {
      const i = rows.findIndex((r) => t.get(r, 'RowID').trim() === parseString(h.vs[ids.row]).trim());
      if (i >= 0) {
        const row = { ...rows[i] };
        await fill(row, true);
        rows = rows.map((r, j) => (j === i ? row : r));
      }
    }
    Object.assign(out.set, { [ids.grid]: { rows }, [ids.mat]: { index: 0 }, [ids.qty]: { value: '' }, [ids.btn]: { text: ' ADD ' } });
    if (input) out.set.DDLOutputScan = { index: 0 };
    out.viewState[ids.mode] = '1';
  });
}

/** GVBOMInput / GVOutput SelectedIndexChanged: the line back into the editors, the Add button becomes Update */
async function bomSelectLine(v, h, side) {
  const input = side === 'in';
  const grid = input ? 'GVBOMInput' : 'GVOutput';
  const out = { set: {}, viewState: { ...h.vs } };
  return guard(out, async () => {
    const t = await h.table(grid);
    const row = t.rows.find((r) => t.get(r, 'RowID') === h.arg) ?? noKey();
    const typeId = input ? 'DDLInputMaterialType' : 'DDLOutoutMaterialType';
    // WrapperAvatar.SelectDropDown: by text, nothing when not listed
    const typeOpt = (await h.options(typeId)).find((o) => o.text === parseString(t.get(row, 'Type')));
    if (typeOpt) out.set[typeId] = { value: typeOpt.value };
    await select(h, out, 'DdlProcess', parseString(t.get(row, 'ProcessCode')));
    if (input) {
      await select(h, out, 'DDLInputMaterial', parseString(t.get(row, 'Material')));
      await bomInputMaterial({ ...v, DDLInputMaterial: parseString(t.get(row, 'Material')) }, h, out);
      out.set.TbInputQuantity = { value: parseString(t.get(row, 'Qty')) };
      await select(h, out, 'DdlInputUom', parseString(t.get(row, 'Uom')));
      await select(h, out, 'DDLInputScan', String(netInt(t.get(row, 'ScanReq'))));
      await select(h, out, 'DDLOutputScan', String(netInt(t.get(row, 'OutputScan'))));
      Object.assign(out.viewState, { BOMINAdd: '0', INRowID: parseString(t.get(row, 'RowID')) });
      out.set.BtnInputAdd = { text: '  Update  ' };
      if (out.set.SubRoutingPanel?.visible) {
        const opts = out.set.DDLRouting.options;
        const want = parseString(t.get(row, 'RoutingCode'));
        if (!opts.some((o) => o.value === want)) throw notInList('DDLRouting');
        out.set.DDLRouting = { options: opts, value: want };
      }
    } else {
      await select(h, out, 'DDLOutputMaterial', parseString(t.get(row, 'Material')));
      out.set.TBOutputQty = { value: parseString(t.get(row, 'Qty')) };
      await select(h, out, 'DDLOutputUom', parseString(t.get(row, 'Uom')));
      Object.assign(out.viewState, { BOMOutAdd: '0', OutRowID: parseString(t.get(row, 'RowID')) });
      out.set.BtnOutputAdd = { text: '  Update  ' };
    }
  });
}

Object.assign(PAGE_INIT, {
  [BOM]: async (controls, vs) => Object.assign(vs, { BOMINAdd: '1', BOMOutAdd: '1' }),
});

Object.assign(PAGE_EVENTS, {
  [BOM]: {
    DDLMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLMaterial === '') return;
        await select(h, out, 'DDLBaseUom', await scalarText('select BaseUom from Material where MatCode = @m', { m: v.DDLMaterial }));
      });
    },
    DDLInputMaterialType: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs, __inMat: v.DDLInputMaterialType } };
      return guard(out, async () => {
        out.set.DDLInputMaterial = { options: await materialsOfType(h, v.DDLInputMaterialType), index: 0 };
      });
    },
    DDLOutoutMaterialType: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs, __outMat: v.DDLOutoutMaterialType } };
      return guard(out, async () => {
        out.set.DDLOutputMaterial = { options: await materialsOfType(h, v.DDLOutoutMaterialType), index: 0 };
      });
    },
    DDLInputMaterial: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => bomInputMaterial(v, h, out));
    },
    DDLOutputMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLOutputMaterial === '') return;
        const m = v.DDLOutputMaterial;
        await select(h, out, 'DDLOutputUom', await scalarString('select BaseUom from Material where MatCode = @m', { m }));
        const type = netString(await scalar('Select [Type] from Material where MatCode=@m', { m }));
        await select(h, out, 'DDLOutoutMaterialType', type === '0' ? '' : type);
        if (netBool(await scalar('select  Serial from Material where MatCode=@m', { m }))) out.set.TBOutputQty = { value: '1' };
      });
    },
    // a line's edit given up (owner, 29 Oct 2026; the original had none: Select left the editors in Update until the
    // next Add): the editors back to Add, as after an Add, the line unchanged
    'GVBOMInput:cancel': async (v, h) => ({
      set: { DDLInputMaterial: { index: 0 }, TbInputQuantity: { value: '' }, DDLOutputScan: { index: 0 }, BtnInputAdd: { text: ' ADD ' } },
      viewState: { ...h.vs, BOMINAdd: '1', INRowID: '' },
    }),
    'GVOutput:cancel': async (v, h) => ({
      set: { DDLOutputMaterial: { index: 0 }, TBOutputQty: { value: '' }, BtnOutputAdd: { text: ' ADD ' } },
      viewState: { ...h.vs, BOMOutAdd: '1', OutRowID: '' },
    }),
    BtnInputAdd: (v, h) => bomAddLine(v, h, 'in'),
    BtnOutputAdd: (v, h) => bomAddLine(v, h, 'out'),
    'GVBOMInput:select': (v, h) => bomSelectLine(v, h, 'in'),
    'GVOutput:select': (v, h) => bomSelectLine(v, h, 'out'),
    'GVBOMInput:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVBOMInput = { rows: await gridDelete(h, 'GVBOMInput', h.arg) };
      });
    },
    'GVOutput:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVOutput = { rows: await gridDelete(h, 'GVOutput', h.arg) };
      });
    },
    // GVBOMInput_RowCommand "AlternativeMat": the line's alternative materials into the popup
    'GVBOMInput:AlternativeMat': async (v, h) => {
      const t = await h.table('GVBOMInput');
      const row = t.rows[netInt(h.index)];
      if (!row) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
      const key = t.get(row, 'RowID');
      const alt = await h.table('GVAltMaterial');
      const current = alt.rows.filter((r) => alt.get(r, 'ROWID') === key);
      return { set: { GVCurrentAltMaterial: { rows: current }, AltMaterialPanel: { visible: true } }, viewState: { ...h.vs, ROWID: key } };
    },
    btnAltPanelClose: async () => ({ set: { AltMaterialPanel: { visible: false } } }),
    btnAddAltMaterial: async (v, h) => {
      if (v.DDlAltInputMaterial === '') return { alert: errorMsg('Please select a Material') };
      const cur = await h.table('GVAltMaterial', Array.isArray(v.GVCurrentAltMaterial) ? v.GVCurrentAltMaterial : []);
      if (cur.rows.some((r) => cur.get(r, 'Material') === v.DDlAltInputMaterial)) return { alert: errorMsg('Already Added') };
      const row = cur.newRow();
      cur.set(row, 'BOMCode', netInt(v.PrimaryKey));
      cur.set(row, 'RowID', netInt(h.vs.ROWID));
      cur.set(row, 'Material', v.DDlAltInputMaterial);
      cur.set(row, 'Description', await selectedText(h, 'DDlAltInputMaterial', v.DDlAltInputMaterial));
      return { set: { GVCurrentAltMaterial: { rows: [...cur.rows, row] }, DDlAltInputMaterial: { index: 0 } } };
    },
    // btnUpdateAltMaterial: the line's alternatives replaced by the popup's
    btnUpdateAltMaterial: async (v, h) => {
      const alt = await h.table('GVAltMaterial');
      const cur = await h.table('GVAltMaterial', Array.isArray(v.GVCurrentAltMaterial) ? v.GVCurrentAltMaterial : []);
      const id = parseString(h.vs.ROWID);
      const rows = [...alt.rows.filter((r) => alt.get(r, 'RowID') !== id), ...cur.rows.filter((r) => cur.get(r, 'RowID') === id)];
      return { set: { GVAltMaterial: { rows } }, success: true };
    },
    // GVCurrentAltMaterial_RowDeleting: removed from the popup; the main list keeps rows that differ in RowID AND
    // BOMCode AND Material (as written) plus the popup's rows of this line; a saved BOM loses it at once
    'GVCurrentAltMaterial:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const cur = await h.table('GVAltMaterial', Array.isArray(v.GVCurrentAltMaterial) ? v.GVCurrentAltMaterial : []);
        const r0 = cur.rows[netInt(h.index)];
        if (!r0) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
        const [bomCode, rowId, material] = [cur.get(r0, 'BOMCode'), cur.get(r0, 'RowID'), cur.get(r0, 'Material')];
        const left = cur.rows.filter((r) => cur.get(r, 'Material') !== material);
        const alt = await h.table('GVAltMaterial');
        const rows = [...alt.rows.filter((r) => alt.get(r, 'RowID') !== rowId && alt.get(r, 'BomCode') !== bomCode && alt.get(r, 'Material') !== material), ...left.filter((r) => cur.get(r, 'RowID') === parseString(h.vs.ROWID))];
        Object.assign(out.set, { GVCurrentAltMaterial: { rows: left }, GVAltMaterial: { rows } });
        if (netInt(v.PrimaryKey) > 0) await execute('Delete from BOMInputAltMaterial where ROWID=@r and Material=@m and BOMCOde=@b', { r: rowId, m: material, b: bomCode });
      });
    },
  },
});
