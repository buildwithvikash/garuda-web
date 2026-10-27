// Material Barcode (View/MaterialSetup/MaterialBarcode.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, execute } from '../../../../db/pool.js';
import { netString, netInt } from '../../../../shared/net.js';
import { insert, collect } from '../../write.js';
import { fill } from '../../../../db/options.js';
import { printLabel, printerDetail, printerOnline } from '../../../production/labels.service.js';
import { scalarText, generateMaterialSerialNo } from '../../../production/production.service.js';
import { errorMsg, notInList, select } from '../_shared.js';
import { CUSTOM_DISPLAY, PAGE_DISPLAY, PAGE_EVENTS, PAGE_PRINT, PAGE_SAVE } from '../registry.js';

CUSTOM_DISPLAY.add('View/MaterialSetup/MaterialBarcode.aspx');

Object.assign(PAGE_DISPLAY, {
  // display(key): department (+ its areas and locations), area (+ its locations, errors ignored), AU.Display,
  // then the reprint count
  'View/MaterialSetup/MaterialBarcode.aspx': {
    async before(controls, row) {
      const byId = (id) => controls.find((c) => c.id === id);
      const dept = byId('DDLFromDepartment');
      const want = netString(row.Department);
      if (!dept.options.some((o) => o.value === want)) throw notInList('DDLFromDepartment');
      dept.value = want;
      if (want !== '') {
        byId('DDLFromArea').options = await fill("select AreaCode,CONCAT(Name, ' - ', Alias) as Name from Area where Department =@d", 'Select A Value', { d: netInt(want) });
        byId('DDLLocation').options = await fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Department =@d", 'Select A Value', { d: netInt(want) });
      }
      if (netInt(row.Area) > 0) {
        const area = netString(row.Area);
        if (byId('DDLFromArea').options.some((o) => o.value === area)) {
          byId('DDLFromArea').value = area;
          byId('DDLLocation').options = await fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Area =@a", 'Select A Value', { a: netInt(area) });
        }
      }
    },
    async after(controls, row) {
      controls.find((c) => c.id === 'TbReprint').value = String(netInt(await scalar('Select Count(*) from BarcodePrintTrail where BarcodeNo=@b', { b: netString(row.BarcodeNo) })));
    },
  },
});

Object.assign(PAGE_SAVE, {
  // BTNSave_Click: Serial "1" when blank, AVMaterial.SaveData (serial number generated), then display(new key)
  'View/MaterialSetup/MaterialBarcode.aspx': async (v, h) => {
    try {
      const raw = { ...(h.raw ?? v) };
      if (netString(raw.SerialID) === '') raw.SerialID = '1';
      const ds = await collect(h.spec, raw, h.ctx);
      const t0 = ds.tables[0];
      const row = t0.rows[0];
      if (row) {
        const get = (k) => netString(row.get(t0.schema.col(k)?.name ?? k));
        row.set(t0.schema.col('Serial').name, (await generateMaterialSerialNo(get('Material'), get('BusinessUnit'), get('Department')))[0]);
      }
      const key = await insert(h.spec, ds, h.ctx);
      return { ok: true, key, message: 'Record Created Successfully', display: key };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
});

Object.assign(PAGE_PRINT, {
  // print(): remark, printer chosen and online, the label for the document type, then the reprint trail
  'View/MaterialSetup/MaterialBarcode.aspx': async (v, h) => {
    if (v.TbRemark.trim() === '') return { alert: errorMsg('Enter Remark') };
    if (netString(h.printer) === '') return { alert: errorMsg(' Select A Printer') };
    if (!(await printerOnline(h.printer))) return { alert: errorMsg('Printer is Offline') };
    const bp = await printerDetail(h.printer);
    const docType = netInt(await scalar('Select DocType from Materialbarcode where barcodeNo=@b', { b: netString(v.PrimaryKey) }));
    // DocType 4001 (process order) -> in-process label (WRL); 3001 (GRAPO) and anything else -> GRN label
    await printLabel(docType === 4001 ? 'inprocess' : 'grn', v.PrimaryKey, bp, h.ctx.userId);
    await execute('Insert into BarcodePrintTrail(BarcodeNo,PrintedBy,Remark)Values(@b,@u,@r)', { b: netString(v.PrimaryKey), u: netString(h.ctx.userCode), r: v.TbRemark });
    return { success: true };
  },
});

Object.assign(PAGE_EVENTS, {
  'View/MaterialSetup/MaterialBarcode.aspx': {
    DDLFromDepartment: async (v, h) => {
      if (v.DDLFromDepartment === '') return {};
      const d = netInt(v.DDLFromDepartment);
      return {
        set: {
          DDLFromArea: { options: await h.fill("select AreaCode,CONCAT(Name, ' - ', Alias) as Name from Area where Department =@d", { d }), index: 0 },
          DDLLocation: { options: await h.fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Department =@d", { d }), index: 0 },
        },
      };
    },
    DDLFromArea: async (v, h) => (v.DDLFromArea === '' ? {} : { set: { DDLLocation: { options: await h.fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Area =@a", { a: netInt(v.DDLFromArea) }), index: 0 } } }),
    // ComboBox onIndexChangeHandler: the material's base UOM selected
    DDLMaterial: async (v, h) => {
      const mat = netString(v.DDLMaterial) === '0' ? '' : netString(v.DDLMaterial); // SelectedValue(): ParseStringZero
      if (mat === '') return {};
      const out = { set: {} };
      await select(h, out, 'DdlUom', await scalarText('select BaseUom from Material where MatCode = @m', { m: mat }));
      return out;
    },
  },
});
