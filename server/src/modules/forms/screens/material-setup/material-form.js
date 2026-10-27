// Material (View/MaterialSetup/MaterialForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, query } from '../../../../db/pool.js';
import { netString, netInt, netLong } from '../../../../shared/net.js';
import { config } from '../../../../config/env.js';
import { setting } from '../../../settings/settings.service.js';
import { alertMsg, errorMsg, gridDelete, guard, select, selectedText } from '../_shared.js';
import { groupFields, toInt32, variantAddStart } from './_shared.js';
import { CUSTOM_DISPLAY, PAGE_EVENTS, PAGE_INIT, PAGE_LISTS } from '../registry.js';

CUSTOM_DISPLAY.add('View/MaterialSetup/MaterialForm.aspx');

const MATERIAL = 'View/MaterialSetup/MaterialForm.aspx';

Object.assign(PAGE_INIT, {
  // Page_Load: variant panel only with variant fields; advanced panels by Settings.AdvanceMaterial; sales/purchase by
  // POFinance/SOFinance; WRL always shows the variant and ledger panels
  [MATERIAL]: async (controls) => {
    const byId = (id) => controls.find((c) => c.id === id);
    const show = (id, visible) => {
      const c = byId(id);
      if (c) c.visible = visible;
    };
    if ((byId('DdlName')?.options?.length ?? 0) < 2) show('VariantPanel', false);
    if (Number(setting('AdvanceMaterial')) === 0) for (const p of ['BatchPanel', 'QCPanel', 'FifoPanel', 'packPanel', 'LedgerMaterial']) show(p, false);
    const fin = Number(setting('POFinance')) === 1 || Number(setting('SOFinance')) === 1;
    show('SalesConfigPanel', fin);
    show('PurchaseConfigPanel', fin);
    if (config.erp === 'WRL') {
      show('VariantPanel', true);
      show('LedgerMaterial', true);
    }
  },
});

PAGE_LISTS[MATERIAL] = {
  DdlName: (v, h) => (v.DDLGroup ? groupFields(h, v.DDLGroup) : h.fill('Select FieldCode ,Name from VariantField where Status=1')),
  DdlValue: (v, h) => (v.DdlName === '' || v.DdlName == null ? [] : h.fill("select Concat(Code,'~',isnull(Prefix,''))[Code],Name from VariantFieldValue where Field=@f", { f: toInt32(v.DdlName) })),
};

/** AVMM.FillModelCategory(category, model, type): categories of the type, and models whose Category = the type
 *  (as the original queried); AVMM.FillTypeSerialLogic */
async function materialTypeLists(h, type) {
  return {
    DdlMaterialCategory: { options: await h.fill("Select CategoryCode, concat(Name,' - ', Alias) [Name] from MaterialCategory where CategoryType= @t", { t: type }), index: 0 },
    DdlModel: { options: await h.fill("Select ModelCode, concat(Name,' - ', Alias) [Name] from Model where Category= @t", { t: type }), index: 0 },
    ddlTrackSerialLogic: { options: await h.fill('Select SerialCode, Name from SerialGenerationLogicHeader where Status=1 and Type= @t', { t: type }), index: 0 },
  };
}

Object.assign(PAGE_EVENTS, {
  [MATERIAL]: {
    DdlBaseUom: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const text = await selectedText(h, 'DdlBaseUom', v.DdlBaseUom);
        await select(h, out, 'DdlPurchaseUom', v.DdlBaseUom);
        Object.assign(out.set, { TbPConvQty: { value: '1' }, LblPconvUom: { text } });
        await select(h, out, 'DdlSalesUom', v.DdlBaseUom);
        Object.assign(out.set, { TbSConvQty: { value: '1' }, LblSConvUom: { text }, LblReorderUom: { text }, lblReorderQtyUOM: { text } });
      });
    },
    DdlType: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlType !== '') Object.assign(out.set, await materialTypeLists(h, v.DdlType));
        else Object.assign(out.set, { DdlModel: { options: [] }, DdlMaterialCategory: { options: [] } }); // Items.Clear()
      });
    },
    DDLInspectionRequired: async (v) => (v.DDLInspectionRequired === 'False' ? { set: { DDLInspectionType: { index: 0 }, DDLInspectionCheckList: { index: 0 }, TBResetIn: { value: '' } } } : {}),
    DdlMaterialCategory: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlMaterialCategory === '') return;
        out.set.DdlModel = { options: await h.fill("Select ModelCode, concat(Name,' - ', Alias) [Name] from Model where Category= @c", { c: v.DdlMaterialCategory }), index: 0 };
        const tag = netString(await scalar('Select TagCode from MaterialCategory where CategoryCode= @c', { c: v.DdlMaterialCategory }));
        await select(h, out, 'DDLTag', tag === '0' ? '' : tag);
      });
    },
    // AVMM.GetModeilDetails: read and not used (an error still shows)
    DdlModel: async (v) => {
      const out = {};
      return guard(out, async () => {
        if (v.DdlModel !== '') await query('Select * from Model where ModelCode=@m', { m: v.DdlModel });
      });
    },
    DdlName: async (v, h) => ({ set: { DdlValue: { options: await PAGE_LISTS[MATERIAL].DdlValue(v, h), index: 0 } } }),
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
      t.set(row, 'RecNo', t.max('RecNo') + 1);
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'MatCode', netLong(v.PrimaryKey));
      t.set(row, 'ValueCode', netInt(parts[0]));
      t.set(row, 'Prefix', parts[1].trim());
      t.set(row, 'Name', name);
      t.set(row, 'Value', item.text);
      const rows = [...t.rows, row];
      let alias = '';
      if (v.DdlModel !== '') {
        const m = (await selectedText(h, 'DdlModel', v.DdlModel)).split('~');
        if (m.length < 2) throw new Error('Index was outside the bounds of the array.');
        alias = `${m[1].trim()}A`;
      }
      alias += rows.map((r) => t.get(r, 'Prefix').trim()).join('');
      Object.assign(out.set, { GVTransData: { rows }, DdlName: { index: 0 }, DdlValue: { options: out.set.DdlValue?.options, index: 0 }, Alias: { value: alias } });
      return out;
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridDelete(h, 'GVTransData', h.arg) } } }),
    // btnLedgerMap_Click
    btnLedgerMap: async (v, h) => {
      if (v.ddlVendor === '' || v.DDlSerialLogic === '' || v.tbVendorMat.trim() === '') return { alert: errorMsg('Please fill all Value') };
      const t = await h.table('GVLedgerCode');
      if (t.rows.some((r) => t.get(r, 'VandorMatCode') === v.tbVendorMat.trim())) return { alert: alertMsg('Vandor Material Already Added') };
      const row = t.newRow();
      t.set(row, 'RecNo', t.max('RecNo') + 1);
      t.set(row, 'Ledger', v.ddlVendor);
      t.set(row, 'LedgerName', await selectedText(h, 'ddlVendor', v.ddlVendor));
      t.set(row, 'VandorMatCode', v.tbVendorMat);
      t.set(row, 'SerialLogic', v.DDlSerialLogic);
      t.set(row, 'SerialLogicName', await selectedText(h, 'DDlSerialLogic', v.DDlSerialLogic));
      t.set(row, 'MatCode', netLong(v.PrimaryKey));
      return { set: { GVLedgerCode: { rows: [...t.rows, row] }, tbVendorMat: { value: '' }, DDlSerialLogic: { index: 0 } } };
    },
    // GVLedgerCode_RowDeleting passes GVTransData: the variant grid's key at the ledger row's index, looked up in the
    // ledger table by the variant grid's key column (RowID), which it does not have
    'GVLedgerCode:delete': async (v, h) => {
      const variants = Array.isArray(v.GVTransData) ? v.GVTransData : [];
      const i = netInt(h.index);
      if (i < 0 || i >= variants.length) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
      throw new Error("Column 'RowID' does not belong to table .");
    },
  },
});
