// Parity for page code: AutoPostBack handlers, page buttons and grid Select/Delete. The original page class runs its
// handlers (original-forms.ps1 mode "event") and the new app runs PAGE_EVENTS on the same steps; the controls
// afterwards (values, lists, panels, button texts, grid rows), the ViewState entries and the alerts are compared.
// Read-only: deletes only touch rows not yet saved, and no new variant values are typed (those write; see
// forms-write-parity). Usage: node --env-file=.env scripts/parity/events-parity.mjs <originalBinDir> [route...]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { newFormState, displayState } from '../../src/modules/forms/state.js';
import { PAGE_EVENTS, eventHelpers } from '../../src/modules/forms/pages.js';

const [bin, ...only] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
await loadSettings();

const real = (s, id) => (s.controls.find((c) => c.id === id)?.options ?? []).filter((o) => o.value !== '').map((o) => o.value);
const first = async (sql) => String(Object.values((await query(sql))[0] ?? { x: '' })[0] ?? '');
const ev = (handler, control, values = {}) => ({ handler, control, values });
const cmd = (handler, command, arg, values = {}, grid = 'GVTransData', index) => ({ handler, command, arg: String(arg), values, grid, ...(index == null ? {} : { index }) });

// ViewState keys of grids other than GVTransData ("TransData")
const GRID_VS = { '/productionsetup/routingguideform': { GVInstruction: 'InstructionGrid', GVGuide: 'GuideGrid' }, '/productionsetup/routingform': { GVInstruction: 'InstructionGrid', GVGuide: 'GuideGrid' }, '/materialsetup/materialform': { GVLedgerCode: 'LedgerData' }, '/materialsetup/billofmaterial': { GVBOMInput: 'TransData', GVOutput: 'OutputGrid', GVAltMaterial: 'ALTMAT', GVCurrentAltMaterial: 'CALTMAT' } };
// DataTables a page's first-load Page_Load keeps in ViewState (the harness does not run that load)
const DATA_TABLES = { '/production/rmreplacementform': [{ key: 'Data', columns: ['Category', 'Material', 'Process', 'Serial', 'PsNo', 'RowID', 'ProcessCode', 'matCode', 'NewSerialNo'], rows: [] }] };
// counters a case takes (e.g. a serial number) put back between the new app's run and the original's, and after
const RESTORES = [];
/** SerialBarcode rows of a business unit for this month, put back as they are now */
async function keepSerialCounter(bu) {
  const T = new Date();
  const [yy, mm] = [T.getFullYear() % 100, T.getMonth() + 1];
  const before = await query('select ID, NextSerialNo from SerialBarcode where BusinessUnit=@bu and Year=@yy and Month=@mm', { bu, yy, mm });
  RESTORES.push(async () => {
    await execute(`delete from SerialBarcode where BusinessUnit=@bu and Year=@yy and Month=@mm and ID not in (${before.map((r) => r.ID).join(',') || 0})`, { bu, yy, mm });
    for (const r of before) await execute('update SerialBarcode set NextSerialNo=@n where ID=@id', { n: r.NextSerialNo, id: r.ID });
  });
}
// pages whose events change a TextBox MaxLength
const MAXLEN = new Set(['/production/modeltomodeltransferform']);
// the BU 999 serial counter (ProductionOrderForm's TrackID) as it is before any case runs
await keepSerialCounter(999);
// [route, key|null, viewState, steps(state) -> step lists]
const PLAN = [
  ['/materialsetup/materialcategoryform', null, {}, (s) => ['False', 'True'].map((x) => [ev('DDLInspectionRequired_SelectedIndexChanged', 'DDLInspectionRequired', { DDLInspectionRequired: x, DDLInspectionType: real(s, 'DDLInspectionType')[1] })])],
  ['/settings/shiftmasterform', null, {}, () => {
    const add = (n, a, b) => ev('BtnAdd_Click', 'BtnAdd', { TBBreakName: n, TBStart: a, TBEnd: b });
    return [
      [add('Tea', '10:30', '10:45')],
      [add('Tea', '10:30', '10:45'), add('Tea', '11:00', '11:10')],
      [add('Lunch', '13:00', '13:30'), add('Tea', '8', '16:00:30'), cmd('GVTransData_RowDeleting1', 'delete', 1)],
      [add('Bad', '', '10:00')],
      [add('Bad', '25:00', '10:00')],
    ];
  }],
  ['/settings/shiftmasterform', '1223', {}, () => [[ev('BtnAdd_Click', 'BtnAdd', { TBBreakName: 'Tea', TBStart: '10:30', TBEnd: '10:45' })]]],
  ['/settings/parametervaluelistform', null, {}, () => {
    const add = (x, p) => ev('BtnAdd_Click', 'BtnAdd', { TbValue: x, DDLPass: p });
    return [[add('OK', '1'), add('NG', '0'), add('OK', '1'), cmd('GVTransData_RowDeleting1', 'delete', 'OK')]];
  }],
  ['/materialsetup/modelform', null, {}, async (s) => {
    const f = real(s, 'DdlName');
    const val = await first(`select top 1 Name from VariantFieldValue where Field=${Number(f[0]) || 0} order by Code`);
    const cat = real(s, 'DDLCategory')[0] ?? '';
    const pick = ev('DdlName_SelectedIndexChanged', 'DdlName', { DdlName: f[0] });
    return [
      [pick, ev('BtnAdd_Click', 'BtnAdd', { TbNewValue: val, DDLCategory: cat })],
      [pick, ev('BtnAdd_Click', 'BtnAdd', { TbNewValue: val, DDLCategory: '' })],
      [ev('BtnAdd_Click', 'BtnAdd', { DdlName: '', TbNewValue: '' })],
    ];
  }],
  ['/settings/parameterform', null, { btnAdd: '1' }, (s) => {
    const uom = real(s, 'DdlUom')[0] ?? '';
    const add = (vals) => ev('BtnAdd_Click', 'BtnAdd', vals);
    const base = { TbName: 'P1', TbDescription: 'Pressure', DdlInputType: 'numeric', TbMinValue: '1.5', TbMaxValue: '3', TbPassValue: '', DdlUom: uom, DdlResultDefined: 'System', UploadImage: 'data:image/png;base64,iVBORw0KGgo=' };
    return [
      ['bit', 'text', 'numeric', 'image', 'list'].map((x) => ev('DdlInputType_SelectedIndexChanged', 'DdlInputType', { DdlInputType: x })),
      [add(base), add({ ...base, TbName: 'P2', TbDescription: 'Temp', DdlInputType: 'bit' }), add(base), cmd('GVTransData_SelectedIndexChanged', 'select', 1), add({ ...base, TbName: 'P1b', TbMinValue: 'x' }), cmd('GVTransData_RowDeleting', 'delete', 2)],
    ];
  }],
  ['/materialsetup/materialbarcode', null, {}, async (s) => {
    const dept = real(s, 'DDLFromDepartment');
    const area = await first(`select top 1 a.AreaCode from Area a where exists (select 1 from StorageArea x where x.Area = a.AreaCode) or 1=1 order by a.AreaCode`);
    const mats = (await query('select top 3 MatCode from Material where Status=1 order by MatCode')).map((r) => String(r.MatCode));
    return [
      ...[...dept.slice(0, 2), ''].map((x) => [ev('DDLFromDepartment_SelectedIndexChanged', 'DDLFromDepartment', { DDLFromDepartment: x })]),
      [ev('DDLFromDepartment_SelectedIndexChanged', 'DDLFromDepartment', { DDLFromDepartment: dept[0] }), ev('DDLFromArea_SelectedIndexChanged', 'DDLFromArea', { DDLFromArea: area })],
      ...[...mats, ''].map((x) => [ev('DDLMaterial_SelectedIndexChanged', 'DDLMaterial', { DDLMaterial: x })]),
    ];
  }],
  ['/materialsetup/materialform', null, {}, async (s) => {
    const uom = real(s, 'DdlBaseUom');
    const types = real(s, 'DdlType');
    const cats = real(s, 'DdlMaterialCategory');
    const models = real(s, 'DdlModel');
    const f = real(s, 'DdlName');
    const val = await first(`select top 1 Name from VariantFieldValue where Field=${Number(f[0]) || 0} order by Code`);
    const vendor = real(s, 'ddlVendor')[0] ?? '';
    const logic = real(s, 'DDlSerialLogic')[0] ?? '';
    const pick = ev('DdlName_SelectedIndexChanged', 'DdlName', { DdlName: f[0] });
    const map = (code) => ev('btnLedgerMap_Click', 'btnLedgerMap', { ddlVendor: vendor, DDlSerialLogic: logic, tbVendorMat: code });
    return [
      ...uom.slice(0, 2).map((x) => [ev('DdlBaseUom_SelectedIndexChanged', 'DdlBaseUom', { DdlBaseUom: x })]),
      ...[...types.slice(0, 2), ''].map((x) => [ev('DdlType_SelectedIndexChanged', 'DdlType', { DdlType: x })]),
      ['False', 'True'].map((x) => ev('DDLInspectionRequired_SelectedIndexChanged', 'DDLInspectionRequired', { DDLInspectionRequired: x })),
      ...cats.slice(0, 2).map((x) => [ev('DdlMaterialCategory_SelectedIndexChanged', 'DdlMaterialCategory', { DdlMaterialCategory: x })]),
      ...models.slice(0, 1).map((x) => [ev('DdlModel_SelectedIndexChanged', 'DdlModel', { DdlModel: x })]),
      [pick, ev('BtnAdd_Click', 'BtnAdd', { TbNewValue: val, DdlModel: models[0] ?? '' })],
      [pick, ev('BtnAdd_Click', 'BtnAdd', { TbNewValue: val, DdlModel: '' }), cmd('GVTransData_RowDeleting', 'delete', 1)],
      [ev('BtnAdd_Click', 'BtnAdd', { DdlName: '', TbNewValue: '' })],
      [ev('btnLedgerMap_Click', 'btnLedgerMap', { ddlVendor: '', DDlSerialLogic: logic, tbVendorMat: 'V1' })],
      [map('ZZPV1'), map('ZZPV2'), map('ZZPV1')],
      [map('ZZPV1'), cmd('GVLedgerCode_RowDeleting', 'delete', 'ZZPV1', {}, 'GVLedgerCode', 0)],
      [pick, ev('BtnAdd_Click', 'BtnAdd', { TbNewValue: val, DdlModel: '' }), map('ZZPV1'), cmd('GVLedgerCode_RowDeleting', 'delete', 'ZZPV1', {}, 'GVLedgerCode', 0)],
    ];
  }],
  ['/materialsetup/billofmaterial', null, { BOMINAdd: '1', BOMOutAdd: '1' }, async (s) => {
    const types = real(s, 'DDLInputMaterialType');
    const mats = real(s, 'DDLInputMaterial');
    const outMats = real(s, 'DDLOutputMaterial');
    const proc = real(s, 'DdlProcess')[0] ?? '';
    const uom = real(s, 'DdlInputUom')[0] ?? '';
    const alt = real(s, 'DDlAltInputMaterial');
    const routed = await first('select top 1 h.Material from RoutingHeader h where h.Material is not null order by h.RouteCode desc');
    const serial = await first('select top 1 MatCode from Material where Serial=1 and Status=1 order by MatCode');
    const inAdd = (m, q, extra = {}) => ev('BtnInputAdd_Click', 'BtnInputAdd', { DDLInputMaterialType: types[0] ?? '', DDLInputMaterial: m, DdlProcess: proc, TbInputQuantity: q, DdlInputUom: uom, DDLInputScan: '1', DDLOutputScan: '0', ...extra });
    const outAdd = (m, q, extra = {}) => ev('BtnOutputAdd_Click', 'BtnOutputAdd', { DDLOutoutMaterialType: types[0] ?? '', DDLOutputMaterial: m, DdlProcess: proc, TBOutputQty: q, DDLOutputUom: uom, ...extra });
    return [
      ...[...real(s, 'DDLMaterial').slice(0, 2), ''].map((x) => [ev('DDLMaterial_SelectedIndexChanged', 'DDLMaterial', { DDLMaterial: x })]),
      ...[types[0], ''].map((x) => [ev('DDLInputMaterialType_SelectedIndexChanged', 'DDLInputMaterialType', { DDLInputMaterialType: x ?? '' })]),
      [ev('DDLOutoutMaterialType_SelectedIndexChanged', 'DDLOutoutMaterialType', { DDLOutoutMaterialType: types[0] ?? '' })],
      ...[mats[0], routed, serial, ''].filter((x) => x !== undefined).map((x) => [ev('DDLInputMaterial_SelectedIndexChanged', 'DDLInputMaterial', { DDLInputMaterial: x })]),
      ...[outMats[0], serial].filter(Boolean).map((x) => [ev('DDLOutputMaterial_SelectedIndexChanged', 'DDLOutputMaterial', { DDLOutputMaterial: x })]),
      [inAdd(mats[0], '2'), inAdd(mats[1] ?? mats[0], '3.5'), inAdd(mats[0], '2'), cmd('GVBOMInput_SelectedIndexChanged', 'select', 1, {}, 'GVBOMInput'), inAdd(mats[0], '4'), cmd('GVBOMInput_RowDeleting', 'delete', 2, {}, 'GVBOMInput')],
      [inAdd('', '1'), inAdd(mats[0], '1', { DDLInputMaterialType: '' }), inAdd(mats[0], ''), inAdd(mats[0], '1', { DdlProcess: '' })],
      [outAdd(outMats[0], '1'), outAdd(outMats[0], '1'), cmd('GVOutput_SelectedIndexChanged', 'select', 1, {}, 'GVOutput'), outAdd(outMats[0], '5'), cmd('GVOutput_RowDeleting', 'delete', 1, {}, 'GVOutput')],
      [outAdd(outMats[0], ''), outAdd(outMats[0], '1', { DdlProcess: '' })],
      [inAdd(mats[0], '2'), cmd('GVBOMInput_RowCommand', 'AlternativeMat', 1, {}, 'GVBOMInput', 0), ev('btnAddAltMaterial_Click', 'btnAddAltMaterial', { DDlAltInputMaterial: alt[0] ?? '' }), ev('btnAddAltMaterial_Click', 'btnAddAltMaterial', { DDlAltInputMaterial: alt[0] ?? '' }), ev('btnAddAltMaterial_Click', 'btnAddAltMaterial', { DDlAltInputMaterial: alt[1] ?? '' }), ev('btnUpdateAltMaterial_Click', 'btnUpdateAltMaterial'), cmd('GVCurrentAltMaterial_RowDeleting', 'delete', alt[0] ?? '', {}, 'GVCurrentAltMaterial', 0), ev('btnAltPanelClose_Click', 'btnAltPanelClose')],
      [ev('btnAddAltMaterial_Click', 'btnAddAltMaterial', { DDlAltInputMaterial: '' })],
    ];
  }],
  ['/productionsetup/routingform', null, { add: 'True' }, (s) => {
    const p = real(s, 'DdlProcess');
    const add = (proc, seq, extra = {}) => ev('BtnAdd_Click', 'BtnAdd', { DdlProcess: proc, TBSeq: seq, TbProcessTime: '30', TbSetupTime: '5', TbMinHoldP: '1', TbMaxHoldP: '2.5', TBDrawaingNo: 'D-1', TBAutoProcess: '0', TbNoOfCopy: '2', DDLStageLabel: '1', ...extra });
    const guide = (vals) => ev('BTNGuideAdd_Click', 'BTNGuideAdd', vals);
    return [
      [add(p[0], '10'), add(p[1], '10'), add(p[0], '20'), add(p[1], '15'), add(p[2], '22')],
      [add(p[0], '10', { TbMinHoldP: '3' }), add(p[0], '0'), add(p[0], 'x')],
      [add(p[0], '10'), add(p[1], '20'), cmd('GVTransData_SelectedIndexChanged', 'select', '10'), add(p[2], '10', { TbProcessTime: '45', DDLValidate: '0' }), cmd('GVTransData_RowDeleting', 'delete', '20')],
      [add(p[0], '10'), cmd('BTNInstruction_Click', 'Instruction', '', {}, 'GVTransData', 0), ev('BtnInstructionAdd_Click', 'BtnInstructionAdd', { TBInstruction: 'Check torque' }), ev('BtnInstructionAdd_Click', 'BtnInstructionAdd', { TBInstruction: '' }), ev('BtnInstructionAdd_Click', 'BtnInstructionAdd', { TBInstruction: 'Line 2' }), cmd('GVInstruction_RowDeleting', 'delete', 1, {}, 'GVInstruction'), ev('IMBInstructionClose_Click', 'IMBInstructionClose')],
      [add(p[0], '10'), cmd('BTNGuide_Click', 'Guide', '', {}, 'GVTransData', 0), ev('DDLGuideFileType_SelectedIndexChanged', 'DDLGuideFileType', { DDLGuideFileType: '1' }), guide({ TBGuideDesc: '' }), guide({ TBGuideDesc: 'Assembly SOP', TBGuideFilePath: '~/GuideFiles/AssemblySOP.pdf' }), guide({ TBGuideDesc: 'Video', DDLGuideFileType: '2', TBGuideFilePath: '~/GuideFiles/AssemblySOP.pdf' }), cmd('GVGuide_RowDeleting', 'delete', 1, {}, 'GVGuide'), ev('IMBGuideClose_Click', 'IMBGuideClose')],
      // (no step without a file: FileUpload.HasFile needs a real request, which the harness lacks)
      [ev('DDLGuideFileType_SelectedIndexChanged', 'DDLGuideFileType', { DDLGuideFileType: '' })],
      [ev('DDLExistingGuide_SelectedIndexChanged', 'DDLExistingGuide', { DDLExistingGuide: '' })],
      ...[...real(s, 'DDLModel').slice(0, 2), ''].map((x) => [ev('DDLModel_SelectedIndexChanged', 'DDLModel', { DDLModel: x })]),
    ];
  }],
  ['/productionsetup/routingform', await first('select top 1 RouteCode from RoutingTrans group by RouteCode having count(*) > 3 order by RouteCode desc'), { add: 'True' }, (s) => {
    const rows = s.controls.find((c) => c.id === 'GVTransData').rows;
    const seq = (i) => rows[i]?.SeqNo ?? '';
    return [
      [cmd('GVTransData_SelectedIndexChanged', 'select', seq(0))],
      [cmd('GVTransData_SelectedIndexChanged', 'select', seq(1)), ev('BtnAdd_Click', 'BtnAdd', { TbProcessTime: '99' })],
      [cmd('BTNInstruction_Click', 'Instruction', '', {}, 'GVTransData', 2), ev('BtnInstructionAdd_Click', 'BtnInstructionAdd', { TBInstruction: 'New step' })],
    ];
  }],
  ['/productionsetup/routingform', await first('select top 1 RouteCode from RoutingHeader where Model > 0 order by RouteCode desc'), { add: 'True' }, () => [[ev('DDLModel_SelectedIndexChanged', 'DDLModel', {})]]],
  ['/productionsetup/routingguideform', await first('select top 1 RouteCode from RoutingTrans group by RouteCode having count(*) > 3 order by RouteCode desc'), {}, (s) => [
    [cmd('BTNInstruction_Click', 'Instruction', '', {}, 'GVTransData', 1), ev('BtnInstructionAdd_Click', 'BtnInstructionAdd', { TBInstruction: 'Torque 5Nm' }), ev('BtnInstructionAdd_Click', 'BtnInstructionAdd', { TBInstruction: '' }), cmd('GVInstruction_RowDeleting', 'delete', 1, {}, 'GVInstruction'), ev('IMBInstructionClose_Click', 'IMBInstructionClose')],
    [cmd('BTNGuide_Click', 'Guide', '', {}, 'GVTransData', 0), ev('DDLGuideFileType_SelectedIndexChanged', 'DDLGuideFileType', { DDLGuideFileType: '3' }), ev('BTNGuideAdd_Click', 'BTNGuideAdd', { TBGuideDesc: 'Photo', TBGuideFilePath: '~/GuideFiles/Photo.png' }), ev('BTNGuideAdd_Click', 'BTNGuideAdd', { TBGuideDesc: 'Photo', TBGuideFilePath: '~/GuideFiles/Photo' }), ev('IMBGuideClose_Click', 'IMBGuideClose')],
    ...[...real(s, 'DDLModel').slice(0, 1), ''].map((x) => [ev('DDLModel_SelectedIndexChanged', 'DDLModel', { DDLModel: x })]),
  ]],
  ['/materialsetup/serialgenerationlogicform', null, {}, (s) => {
    const names = real(s, 'DdlName');
    const of = (t) => names.find((x) => x.split('-')[1] === String(t)) ?? '';
    const sep = real(s, 'DDLSeperator')[0] ?? '';
    const add = (name, seq, extra = {}) => ev('BtnAdd_Click', 'BtnAdd', { DdlName: name, tbSeqNo: seq, TbDescription: ' Part ', DDLSeperator: sep, tbStartingNo: '1001', tbSeed: '1', tbLenth: '5', tbEndingNo: '99999', tbFormat: 'yyMM', tbValue: 'WR', ...extra });
    return [
      [...names.slice(0, 4), ''].map((x) => ev('DdlName_SelectedIndexChanged', 'DdlName', { DdlName: x })),
      [add(of(1), '1'), add(of(2), '2'), add(of(3), '2'), add(of(3), '3'), cmd('GVTransData_RowDeleting', 'delete', 2)],
      [add('', '1'), add(of(1), '1', { tbFormat: ' ' }), add(of(2), '1', { tbLenth: '' }), add(of(3), '1', { tbValue: '' })],
    ];
  }],
  // QC checklist popup: area 1240001's checklist (on WRL it is empty; the run adds one item of each input type first)
  ['/quality/qualityinspectionform', null, { PendingQty: '0' }, async (s) => {
    const load = ev('Page_Load', 'TitleControl');
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const ok = await first("select top 1 mb.Serial from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus=11 and ih.InspectionType=0 and not exists (select 1 from InspectionTrans it where it.InspectionLotNo=mb.InspectionLotNo and it.SampleBarcode=mb.BarcodeNo) order by mb.BarcodeNo desc");
    const self = await first("select top 1 mb.Serial from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus in (11,13) and ih.InspectionType=300 order by mb.BarcodeNo desc");
    const under = await first("select top 1 mb.Serial from MaterialBarcode mb join InspectionTrans it on it.InspectionLotNo=mb.InspectionLotNo and it.SampleBarcode=mb.BarcodeNo join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus=13 and ih.InspectionType<>300 and it.NextAction<>0 order by mb.BarcodeNo desc");
    const done = await first('select top 1 Serial from MaterialBarcode where QCStatus=12 order by BarcodeNo desc');
    const small = await first("select top 1 mb.Serial from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus in (11,13) and mb.BarcodeNo < 2147483647 and ih.InspectionType<>300 and not exists (select 1 from InspectionTrans it where it.InspectionLotNo=mb.InspectionLotNo and it.SampleBarcode=mb.BarcodeNo and it.NextAction<>0) order by mb.BarcodeNo desc");
    const defect = real(s, 'DDLDefectCodes');
    return [
      ...[ok, ` ${ok} `, self, under, done, 'NOPE-1'].map((b) => [go(b)]),
      // a barcode number within Int32 (larger ones overflow in the history step, ending Go with that alert)
      ...(small ? [[go(small)], [go(small), ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '13' })], [load, go(small), ev('BtnUD_Click', 'BtnUD'), qcStep('IMBClose_Click')]] : []),
      [go(ok), ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '13' }), ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '12' })],
      [go(ok), ev('btnAdd_Click', 'btnAdd', { DDLDefectCodes: defect[0] }), ev('btnAdd_Click', 'btnAdd', { DDLDefectCodes: defect[0] }), ev('btnAdd_Click', 'btnAdd', { DDLDefectCodes: defect[1] }), ev('btnAdd_Click', 'btnAdd', { DDLDefectCodes: '' }), cmd('GVTransData_RowDeleting', 'delete', defect[0])],
      [load, go(ok), ev('BtnUD_Click', 'BtnUD'), qcStep('IMBClose_Click')],
      [ev('BtnUD_Click', 'BtnUD')],
    ];
  }],
  ['/quality/ncmrconfirmation', null, { PendingQty: '0', __Go: 'Go', __BarcodeEnabled: '1' }, async () => {
    const load = ev('Page_Load', 'TitleControl');
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const ncmr = (await query("select top 2 mb.Serial from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where it.Status=15 and mb.QCStatus in (11,15) order by it.ID desc")).map((r) => r.Serial);
    const done = await first('select top 1 Serial from MaterialBarcode where QCStatus=12 order by BarcodeNo desc');
    const held = await first("select top 1 mb.Serial from MaterialBarcode mb where mb.QCStatus=11 and not exists (select 1 from InspectionTrans it where it.SampleBarcode=mb.BarcodeNo and it.Status=15) order by mb.BarcodeNo desc");
    const footer = { target: 'Footer', handler: 'BtnSave_Click', control: 'Footer', values: {} };
    return [
      ...[...ncmr, done, held, 'NOPE-1'].map((b) => [go(b)]),
      [go(ncmr[0]), go(ncmr[0])],
      [go(ncmr[0]), ev('DDLApproverStatus_SelectedIndexChanged', 'DDLApproverStatus', { DDLApproverStatus: '13' }), ev('DDLApproverStatus_SelectedIndexChanged', 'DDLApproverStatus', { DDLApproverStatus: '12' })],
      [load, go(ncmr[1] ?? ncmr[0]), ev('BtnUD_Click', 'BtnUD'), qcStep('IMBClose_Click')],
      [load, footer],
    ];
  }],
  ['/quality/repairconfirmation', null, { PendingQty: '0', __Go: 'Go', __BarcodeEnabled: '1' }, async () => {
    const load = ev('Page_Load', 'TitleControl');
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const rework = (await query("select top 2 mb.Serial from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where mb.QCStatus=13 and it.Status<>12 and it.NextAction=1 order by it.ID desc")).map((r) => r.Serial);
    const done = await first('select top 1 Serial from MaterialBarcode where QCStatus=12 order by BarcodeNo desc');
    return [
      ...[...rework, done, 'NOPE-1'].map((b) => [go(b)]),
      [go(rework[0]), go(rework[0])],
      [load, go(rework[1] ?? rework[0]), ev('BtnUD_Click', 'BtnUD'), qcStep('IMBClose_Click')],
      [load, { target: 'Footer', handler: 'BtnSave_Click', control: 'Footer', values: {} }],
    ];
  }],
  ['/quality/finishingconfirmation', null, { PendingQty: '0', __Go: 'Go', __BarcodeEnabled: '1' }, async () => {
    const load = ev('Page_Load', 'TitleControl');
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const rework = (await query("select top 2 mb.Serial from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where mb.QCStatus=13 and it.Status<>12 and it.NextAction=1 order by it.ID desc")).map((r) => r.Serial);
    const done = await first('select top 1 Serial from MaterialBarcode where QCStatus=12 order by BarcodeNo desc');
    return [
      ...[...rework, done, 'NOPE-1'].map((b) => [go(b)]),
      [go(rework[0]), go(rework[0])],
      [load, go(rework[1] ?? rework[0]), ev('BtnUD_Click', 'BtnUD'), qcStep('IMBClose_Click')],
      
    ];
  }],
  ['/quality/reworkconfirmationnew', null, { Qty: '0', __Go: 'Go', __BarcodeEnabled: '1' }, async () => {
    const load = ev('Page_Load', 'TitleControl');
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const rework = (await query("select top 2 mb.Serial from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where mb.QCStatus=13 and it.Status<>12 and it.NextAction=1 order by it.ID desc")).map((r) => r.Serial);
    const done = await first('select top 1 Serial from MaterialBarcode where QCStatus=12 order by BarcodeNo desc');
    const status = (x) => ev('DDLApproverStatus_SelectedIndexChanged', 'DDLApproverStatus', { DDLApproverStatus: x });
    return [
      ...[...rework, done, 'NOPE-1'].map((b) => [go(b)]),
      [go(rework[0]), go(rework[0])],
      [load, go(rework[1] ?? rework[0]), ev('BtnUD_Click', 'BtnUD'), qcStep('IMBClose_Click')],
      [status('13')], [status('12')], [status('13'), status('12')],
    ];
  }],
  ['/production/wrlimagedisply', null, {}, async () => {
    const withImg = await first('select top 1 mb.Serial from MaterialBarcode mb join Material m on m.MatCode=mb.Material where m.MaterialImage is not null order by mb.BarcodeNo desc');
    const noImg = await first('select top 1 mb.Serial from MaterialBarcode mb join Material m on m.MatCode=mb.Material where m.MaterialImage is null order by mb.BarcodeNo desc');
    return [withImg, noImg, 'NOPE-1', ' '].filter((x) => x !== '').map((b) => [ev('BtnGo_Click', 'BtnGo', { PrimaryKey: b })]);
  }],
  ['/production/fgscrapform', null, { __Go: 'Go' }, async () => {
    const fg = await first("select top 1 mb.Serial from MaterialBarcode mb where mb.Status<>99 and exists (select 1 from ProcessInputBOMScan pb where pb.PSNo=mb.DocNo) order by mb.BarcodeNo desc");
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    return [[go(fg)], [go(` ${fg} `)], [go('NOPE-1')], [go('')], [go(fg), go('')], [ev('btnSave_Click1', 'btnSave', { TBRemark: '' })]];
  }],
  ['/production/rmreplacementform', null, { __Go: 'Go', __ExistGo: 'Go', __NewGo: 'Go' }, async () => {
    const fg = (await query("select top 1 mb.Serial, mb.DocNo from MaterialBarcode mb where mb.Status<>99 and exists (select 1 from ProcessInputBOMScan pb where pb.PSNo=mb.DocNo and pb.Serial is not null) order by mb.BarcodeNo desc"))[0];
    const comp = await first(`select top 1 Serial from ProcessInputBOMScan where PSNo=${fg.DocNo} and Serial is not null`);
    const other = await first(`select top 1 Serial from ProcessInputBOMScan where PSNo<>${fg.DocNo} and Serial is not null order by RowID desc`);
    const scrapped = await first("select top 1 mb.Serial from MaterialBarcode mb where mb.Status=99 and exists (select 1 from ProcessInputBOMScan pb where pb.PSNo=mb.DocNo) order by mb.BarcodeNo desc");
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const exist = (x) => ev('btnRxistScan_Click', 'btnexistScan', { TBExistingRM: x });
    const neu = (x) => ev('btnNewScan_Click', 'btnNewScan', { TBNewRM: x });
    return [
      [go(fg.Serial)], [go(fg.Serial), go('')], ...(scrapped ? [[go(scrapped)]] : []),
      [go(fg.Serial), exist(comp)], [go(fg.Serial), exist('NOPE')], [go(fg.Serial), exist(comp), exist('')],
      [go(fg.Serial), exist(comp), neu(comp)], [go(fg.Serial), exist(comp), neu(other)], [go(fg.Serial), exist(comp), neu('BADFORMAT')],
      [neu('X1')],
    ];
  }],
  ['/production/productionorderform', null, {}, async () => {
    const mat = (x) => ev('DDLMaterial_SelectedIndexChanged', 'DDLMaterial', { DDLMaterial: x });
    const type = (x) => ev('DDLOrderType_SelectedIndexChanged', 'DDLOrderType', { DDLOrderType: x, DDLBU: '12201' });
    const serial = await first('select top 1 m.MatCode from Material m where m.status=1 and m.Type>=100 and m.Type<200 and m.Serial=1 and (select count(*) from BOMHeader b where b.Material=m.MatCode)=1 order by m.MatCode desc');
    const plain = await first('select top 1 m.MatCode from Material m where m.status=1 and isnull(m.Serial,0)=0 and m.Type>=100 and m.Type<200 order by m.MatCode desc');
    const many = await first('select top 1 m.MatCode from Material m where m.status=1 and isnull(m.Serial,0)=0 and (select count(*) from BOMHeader b where b.Material=m.MatCode)>1');
    return [
      [mat(serial)], [mat(plain)], [mat(many)], [mat('')], [mat(serial), mat(plain)],
      [type('1')], [type('2')], [type('')], [type('1'), type('2')],
      [ev('DDLSO_SelectedIndexChanged', 'DDLSO', { DDLSO: '' })],
      [ev('BtnAdd_Click', 'BtnAdd', { DDLOrder: '' })], [type('1'), ev('BtnAdd_Click', 'BtnAdd', {})],
    ];
  }],
  ['/production/productionorderform', await first('select top 1 PRODNo from PRODHeader order by PRODNo desc'), {}, async () => {
    const many = await first('select top 1 m.MatCode from Material m where m.status=1 and isnull(m.Serial,0)=0 and (select count(*) from BOMHeader b where b.Material=m.MatCode)>1');
    return [[ev('DDLOrderType_SelectedIndexChanged', 'DDLOrderType', { DDLOrderType: '1', DDLBU: '12201' })], [ev('DDLMaterial_SelectedIndexChanged', 'DDLMaterial', { DDLMaterial: many })], [ev('DDLSO_SelectedIndexChanged', 'DDLSO', { DDLSO: '' })]];
  }],
  ['/production/modeltomodeltransferform', null, {}, async () => {
    const src = await first('select top 1 mb.Material from (select top 5000 Material, Status from MaterialBarcode order by BarcodeNo desc) mb inner join Material m on m.MatCode=mb.Material where mb.Status<>99 and m.Type=100 and exists (select 1 from SerialGenerationLogicDetail d where d.serialCode=m.TrackNoType and d.VariantCode=10)');
    const noLogic = await first('select top 1 m.MatCode from Material m where m.Type=100 and m.TrackNoType not in (select serialCode from SerialGenerationLogicDetail where VariantCode=10)');
    const len = Number(await first(`select Length from SerialGenerationLogicDetail where serialCode=(select TrackNoType from Material where MatCode=${src}) and VariantCode=10`));
    const sn = Number(await first(`select top 1 right(Serial, ${len}) from (select top 5000 Serial, Material, Status, BarcodeNo from MaterialBarcode order by BarcodeNo desc) mb where Material=${src} and Status<>99 and right(Serial, ${len}) not like '%[^0-9]%' order by BarcodeNo desc`));
    const show = (a, b, m = src) => ev('btnShow_Click', 'btnShow', { DDLSourceMaterial: m, TbStart: String(a), TbEnd: String(b) });
    const print = (vals) => ev('btnPrint_Click', 'btnPrint', vals);
    return [
      [ev('DDLSourceMaterial_SelectedIndexChanged', 'DDLSourceMaterial', { DDLSourceMaterial: src })], ...(noLogic ? [[ev('DDLSourceMaterial_SelectedIndexChanged', 'DDLSourceMaterial', { DDLSourceMaterial: noLogic })]] : []),
      [show(sn - 2, sn + 2)], [show(sn, sn)], [show('abc', '')], [show(sn, sn, '')], ...(noLogic ? [[show(1, 5, noLogic)]] : []),
      [print({ DDLSourceMaterial: '', DDLDestiMaterial: src, TbStart: '1', TbEnd: '2', DDLPrinter: '' })], [print({ DDLSourceMaterial: src, DDLDestiMaterial: src, TbStart: '5', TbEnd: '2' })], [print({ DDLSourceMaterial: src, DDLDestiMaterial: src, TbStart: '0', TbEnd: '2' })],
    ];
  }],
  ['/production/processguideform', null, { __CardGo: 'Go', __StationGo: 'Go' }, async () => {
    // a successful login writes ProcessUserLogin: put back between the sides
    const open = await query('select RowID, Status, Logout from ProcessUserLogin where Status=1');
    const floor = Number(await first('select isnull(max(RowID),0) from ProcessUserLogin'));
    RESTORES.push(async () => {
      await execute('delete from ProcessUserLogin where RowID > @f', { f: floor });
      for (const r of open) await execute('update ProcessUserLogin set Status=@s, Logout=@l where RowID=@id', { s: r.Status, l: r.Logout, id: r.RowID });
    });
    const job = (await query("select top 1 pr.PSNo, pr.ProcessCode, po.Alias from ProcessRouting pr inner join ProcessOrder po on po.PSNo=pr.PSNo where exists (select 1 from RouteInstruction i where i.RouteCode=pr.RouteCode and i.SeqNo=pr.SeqNo) and exists (select 1 from WorkCenterProcesses p inner join WorkCenter w on w.StationCode=p.StationCode where p.ProcessCode=pr.ProcessCode and w.BusinessUnit=12201) order by pr.PSNo desc"))[0];
    const st = (await query('select top 1 w.StationCode, w.Alias from WorkCenter w inner join WorkCenterProcesses p on p.StationCode=w.StationCode where p.ProcessCode=@p and w.BusinessUnit=12201 order by w.StationCode', { p: job.ProcessCode }))[0];
    const free = (await query('select top 1 w.StationCode from WorkCenter w where w.BusinessUnit=12201 and not exists (select 1 from ProcessUserLogin l where l.Station=w.StationCode and l.Status=1) order by w.StationCode desc'))[0];
    const user = (await query("select top 1 UserCode, Password from Users where isnull(Password,'')<>'' and not exists (select 1 from ProcessUserLogin l where l.UserCode=Users.UserCode and l.Status=1) order by UserCode desc"))[0];
    const ws = (x) => ev('BtnWorkStationScan_Click', 'BtnWorkStationScan', { TBWorkStation: x });
    const card = (x) => ev('BtnWorderScan_Click', 'BtnWorderScan', { TBJobCoard: x });
    const station = (x) => ev('btnStation_Click', 'btnStation', { TbUserStation: x });
    const login = (vals) => ev('btnLogin_Click', 'btnLogin', vals);
    return [
      [ws(st.Alias)], [ws(String(st.StationCode))], [ws('NOPE')], [ws('')],
      [ws(st.Alias), card(job.Alias)], [ws(st.Alias), card(String(job.PSNo))], [ws(st.Alias), card('NOPE')], [ws(st.Alias), card(job.Alias), card('')], [card(job.Alias)],
      [ev('IMBGuideClose_Click', 'IMBGuideClose')],
      [station(String(free.StationCode))], [station('1')], [station('')], [station(String(free.StationCode)), station('x')],
      [login({ DDLUserCode: String(user.UserCode), TbPass: 'x' })], [station(String(free.StationCode)), login({ DDLUserCode: '' })],
      [station(String(free.StationCode)), login({ DDLUserCode: String(user.UserCode), TbPass: 'wrong-pass' })],
      [station(String(free.StationCode)), login({ TbScanQrCode: '999999999|x' })],
      [station(String(free.StationCode)), login({ DDLUserCode: String(user.UserCode), TbPass: String(user.Password) })],
    ];
  }],
  ['/production/productionassignmentform', null, {}, async () => {
    const order = (await query("select top 1 ph.PRODNo, ph.Department from PRODHeader ph inner join BOMHeader b on b.BOMCode=ph.BOMCode where ph.Qty>isnull(ph.AssignedQty,0) and ph.Status=1 and ph.Department=1230006 order by ph.PRODNo desc"))[0];
    const dept = String(order.Department);
    const route = await first("select top 1 rt.RouteCode from RoutingTrans rt inner join RoutingHeader h on h.RouteCode=rt.RouteCode where h.[Type]=1 and h.Status=1 and rt.StageLabel=1 order by rt.RouteCode");
    const process = await first(`Select top 1 rt.ProcessCode from RoutingTrans rt where rt.RouteCode=${route} and rt.StageLabel=1 order by rt.SeqNo`);
    const station = await first(`select top 1 wc.StationCode from WorkCenter wc inner join WorkCenterProcesses wp on wc.StationCode=wp.StationCode where wp.ProcessCode=${process} and wc.Department=${dept}`);
    const d = ev('DDLDept_SelectedIndexChanged', 'DDLDepartment', { DDLDepartment: dept });
    const o = (x) => ev('DDlProdOrder_SelectedIndexChanged1', 'DDlProdOrder', { DDlProdOrder: x });
    const r = (x) => ev('DDLRouting_SelectedIndexChanged', 'DDLRouting', { DDLRouting: x });
    const p = (x) => ev('DDLProcessCode_SelectedIndexChanged', 'DDLProcessCode', { DDLProcessCode: x });
    const st = (x) => ev('DDLStationCode_SelectedIndexChanged', 'DDLStationCode', { DDLStationCode: x });
    const print = (vals = {}) => ev('btnPrint_Click', 'btnPrint', vals);
    const chain = [d, o(String(order.PRODNo)), r(route), p(process), ...(station ? [st(station)] : [])];
    return [
      [d], [ev('DDLDept_SelectedIndexChanged', 'DDLDepartment', { DDLDepartment: '' })], [d, o(String(order.PRODNo))], [d, o(String(order.PRODNo)), o('')],
      [d, o(String(order.PRODNo)), r(route)], [d, o(String(order.PRODNo)), r(route), r('')], [d, o(String(order.PRODNo)), r(route), p(process)], [d, o(String(order.PRODNo)), r(route), p('')],
      chain,
      [print({ DDLDepartment: '' })], [d, print()], [...chain, print({ TBQty: '0' })], [...chain, print({ TBQty: '999999' })], [...chain, print({ TBQty: '1', DDLPrinter: '' })],
    ];
  }],
  ['/ceat/ceatinselfinspectionform', null, { PendingQty: '0' }, async (s) => {
    const held = await first('select top 1 mb.Serial from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus=11 and ih.InspectionType=300 and not exists (select 1 from InspectionTrans it where it.Serial=mb.Serial) order by mb.BarcodeNo desc');
    const finalQ = await first('select top 1 mb.Serial from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus=11 and ih.InspectionType<>300 order by mb.BarcodeNo desc');
    const done = await first('select top 1 Serial from MaterialBarcode where QCStatus=12 order by BarcodeNo desc');
    const go = (b) => ev('Go_Click', 'Go', { TBBarcode: b });
    const defect = real(s, 'DDLDefectCodes')[0];
    const cat = real(s, 'DDLDefectCat')[0];
    const add = (vals) => ev('btnAdd_Click', 'btnAdd', vals);
    return [
      ...[held, finalQ, done, 'NOPE-1'].map((b) => [go(b)]),
      [go(held), ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '13' })], [go(held), ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '12' })],
      [add({})], [add({ DDLDefectCat: cat })], [add({ DDLDefectCat: cat, DDLDefectCodes: defect })], [add({ DDLDefectCat: cat, DDLDefectCodes: defect }), add({ DDLDefectCat: cat, DDLDefectCodes: defect })],
      [add({ DDLDefectCat: cat, DDLDefectCodes: defect }), cmd('GVTransData_RowDeleting', 'delete', defect)],
      [go(held), ev('BtnUD_Click', 'BtnUD')],
    ];
  }],
  ['/authorization/usersform', null, {}, () => [true, false].map((x) => [ev('CBAllProcess_CheckedChanged', 'CBAllProcess', { CBAllProcess: x })])],
  ['/settings/parameterform', await first('select top 1 h.ParameterCode from ParameterHeader h where exists (select 1 from ParameterTran x where x.ParameterCode = h.ParameterCode) order by h.ParameterCode'), { btnAdd: '1' }, (s) => [[cmd('GVTransData_SelectedIndexChanged', 'select', s.controls.find((c) => c.id === 'GVTransData').rows[0]?.LineCode ?? '1')]]],
];

// QC steps ({ target: 'QC', handler, qc: { child: value }, command?, index? }) -> the port's "QC:<name>" events
const QC_HANDLER = { BtnNext_Click: 'next', BtnPrevious_Click: 'prev', btnSave_Click: 'save', TBValue_TextChanged: 'value', DDLList_SelectedIndexChanged: 'list', Go_Click: 'go', IMBClose_Click: 'close' };
const qcStep = (handler, qc = {}, extra = {}) => ({ target: 'QC', handler, qc, control: 'QC', values: {}, ...extra });
function qcInputs(st, qc) {
  const f = st.f;
  for (const [k, x] of Object.entries(qc)) {
    if (k === 'DDLList' || k === 'DDLUom' || k === 'DdlQCStatus') {
      const opts = k === 'DdlQCStatus' ? [{ value: '1' }, { value: '0' }] : f[k].options;
      f[k].value = opts.some((o) => o.value === x) ? x : (opts[0]?.value ?? '');
    } else if (k === 'TBValue' || k === 'TBBarcode') f[k].text = x;
    else f[k] = x;
  }
}
/** the QC state in the harness' QcSnap shape */
function qcShape(st, visible) {
  const f = st.f;
  const cellOf = (r, n) => r[Object.keys(r).find((k) => k.toLowerCase() === n.toLowerCase())];
  const grid = (st.rows ?? []).map((r) => {
    const type = String(cellOf(r, 'InputType') ?? '').toLowerCase();
    const v = cellOf(r, 'qcvalue');
    const bit = type === 'bit';
    const txt = bit ? `CB:${v === null || v === undefined || v === '' ? true : ['1', 'true', 'y', 'yes'].includes(String(v).trim().toLowerCase())}` : type === 'image' && v != null ? 'IMG' : (v ?? '');
    // not bound again in this request: RowDataBound's text ("Yes" for 1, "No" otherwise) shows instead
    const shown = st.bound === false && bit ? (v == null ? '' : String(v) === '1' ? 'Yes' : 'No') : null;
    return [shown ?? (bit ? (txt === 'CB:true' ? 'CB:True' : 'CB:False') : txt), bit && v != null && String(v) === '1', bit && v != null && String(v) !== '1'];
  });
  return {
    visible, title: f.lblTitle, topData: f.TopDataPanel, dataPanel: f.DataPanel, desc: f.LblDescription, guide: [f.GuideImage.visible, f.GuideImage.url], maxmin: [f.LblMaxMin.visible, f.LblMaxMin.text],
    lblValue: f.LblValue, value: [f.TBValue.visible, f.TBValue.mode, f.TBValue.text], uom: [f.DDLUom.visible, f.DDLUom.value], lblList: f.LblList,
    list: [f.DDLList.visible, f.DDLList.value, f.DDLList.options.map((o) => `${o.value}=${o.text}`).join('|')], pnlImage: f.PnlImage, tbImage: f.TBImage, image: f.Image, remark: f.TBRemark,
    label2: f.Label2, status: [f.DdlQCStatus.visible, f.DdlQCStatus.value], instrument: f.InstrumentPanel, barcode: [f.TBBarcode.text, f.TBBarcode.tag], prev: [f.BtnPrevious.enabled, f.BtnPrevious.text], next: [f.BtnNext.enabled, f.BtnNext.text],
    index: st.index === null || st.index === undefined ? '' : String(st.index), rows: st.rows, grid,
  };
}

/** The new app: the same steps on the same form, patches applied as the client applies them. */
async function runNew(spec, key, viewState, steps) {
  const state = key ? await displayState(spec, ctx, key) : await newFormState(spec, ctx);
  const controls = structuredClone(state.controls);
  let vs = { ...state.viewState, ...viewState };
  const alerts = [];
  const byId = (id) => controls.find((c) => c.id === id);
  for (const step of steps) {
    for (const [id, x] of Object.entries(step.values)) {
      const c = byId(id);
      if (!c) continue;
      if (c.type === 'DropDownList') c.value = c.options.some((o) => o.value === x) ? x : (c.options[0]?.value ?? ''); // SetValues: not listed -> first item
      else if (c.type === 'ComboBox') Object.assign(c, { options: x === '' ? [] : [{ value: x, text: x }], value: x }); // the picked row
      else c.value = x;
    }
    if (step.handler === 'Page_Load') continue; // the original's handler wiring (the port needs none)
    if (step.target === 'Footer') step.control = 'Footer:save';
    let name = step.command ? `${step.grid ?? 'GVTransData'}:${step.command}` : step.control;
    if (step.target === 'QC') {
      const q = byId('QC');
      q.value = structuredClone(q.value);
      qcInputs(q.value, step.qc ?? {});
      name = `QC:${step.handler === 'GVDetails_RowCommand' ? (step.command === 'Select' ? 'select' : step.command) : QC_HANDLER[step.handler]}`;
      if (step.command === 'Select') step.arg = String(q.value.rows?.[step.index]?.LineCode ?? '');
    }
    const v = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')]));
    const ui = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]));
    const r = await PAGE_EVENTS[spec.file][name](v, eventHelpers(spec, ctx, v, { viewState: vs, arg: step.arg, index: step.index ?? -1, ui }));
    for (const [k, p] of Object.entries(r.set ?? {})) {
      const c = byId(k);
      if (!c) continue;
      if (p.options) Object.assign(c, { options: p.options, refilled: true });
      if ('index' in p) c.value = c.options[p.index]?.value ?? '';
      if ('value' in p) c.value = p.value;
      if (p.rows) c.rows = p.rows;
      if (p.calendar) c.calendar = p.calendar;
      if ('visible' in p) c.visible = p.visible;
      if ('enabled' in p) c.enabled = p.enabled;
      if ('text' in p) c.text = p.text;
      if ('maxLength' in p) c.maxLength = p.maxLength;
    }
    if (r.viewState) vs = r.viewState;
    if (r.alerts) alerts.push(...r.alerts);
    else if (r.alert) alerts.push(r.alert);
  }
  return { controls, alerts, viewState: vs };
}

// pages whose handlers show/hide panels (elsewhere panels are set by Page_Load, which the harness does not run)
const PANEL_EVENTS = new Set(['/ceat/ceatinselfinspectionform', '/quality/reworkconfirmationnew', '/production/productionassignmentform', '/production/processguideform', '/production/rmreplacementform', '/production/fgscrapform', '/quality/repairconfirmation', '/quality/finishingconfirmation', '/quality/reworkconfirmation', '/quality/ncmrconfirmation', '/quality/qualityinspectionform', '/settings/parameterform', '/businesssetup/storageareaform', '/materialsetup/billofmaterial', '/productionsetup/routingform', '/productionsetup/routingguideform', '/materialsetup/serialgenerationlogicform']);
// lists filled by a query without ORDER BY: compared as sets
const UNORDERED = {};
const setOf = (route, id, opts) => (UNORDERED[route]?.has(id) ? [...opts].sort() : opts);
function shapeNew(res, route) {
  const o = {};
  const byId = new Map(res.controls.filter((c) => c.id).map((c) => [c.id, c]));
  // Control.Visible as the original reads it: false inside a hidden panel
  const shown = (c) => { for (let x = c; x; x = x.parent ? byId.get(x.parent) : null) if (x.visible === false) return false; return true; };
  for (const c0 of res.controls) {
    const c = c0.parent ? { ...c0, visible: shown(c0) } : c0;
    if (!c.id) continue;
    if (c.type === 'DropDownList' || c.type === 'ComboBox') o[c.id] = { value: c.value ?? '', options: setOf(route, c.id, c.options.map((x) => `${x.value}=${x.text}`)) };
    else if (c.type === 'TextBox' && MAXLEN.has(route)) o[c.id] = { value: c.value ?? '', maxLength: c.maxLength ?? 0 };
    else if (c.type === 'TextBox' || c.type === 'Picture') o[c.id] = { value: c.value ?? '' };
    else if (c.type === 'Panel' && PANEL_EVENTS.has(route)) o[c.id] = { visible: !!c.visible };
    else if (c.type === 'Label' && c.page) o[c.id] = { text: c.text ?? '' };
    else if (c.type === 'CheckBoxList') o[c.id] = { checked: [...(c.value ?? [])].sort() };
    else if (c.type === 'Button') o[c.id] = { text: c.text ?? '' };
    else if (c.type === 'GridView' && c.id === 'GVCalander') o[c.id] = { calendar: c.calendar ?? null };
    else if (c.type === 'GridView' && !c.columns.length) o[c.id] = { auto: (c.rows ?? []).map((r) => Object.values(r).map((x) => String(x ?? ''))), visible: c.visible !== false };
    else if (c.type === 'QC') o[c.id] = { qc: qcShape(c.value, !!c.visible) };
    else if (c.type === 'GridView') o[c.id] = { rows: c.rows.map((r) => c.columns.filter((x) => x.kind === 'boundfield' || x.kind === 'templatefield').map((x) => r[x.dataField ?? x.header.replaceAll(' ', '')] ?? '')) };
  }
  return o;
}
function shapeOrig(snap, mine, route) {
  const o = {};
  for (const [k, m] of Object.entries(mine)) {
    const x = snap[k];
    if (!x) continue;
    if ('options' in m) o[k] = { value: x.value ?? '', options: setOf(route, k, x.options ?? []) };
    else if ('checked' in m) o[k] = { checked: [...(x.value ?? [])].map(String).sort() };
    else if ('rows' in m) o[k] = { rows: x.rows ?? [] };
    else if ('qc' in m) o[k] = { qc: x.qc };
    else if ('auto' in m) o[k] = { auto: x.autoRows ?? [], visible: !!x.visible };
    else if ('calendar' in m) o[k] = { calendar: x.days ? { days: x.days, blocks: (x.blocks ?? []).map((b) => ({ day: b.day, start: b.start, span: b.span, color: b.color, text: b.text })) } : null };
    else if ('visible' in m) o[k] = { visible: !!x.visible };
    else if ('text' in m) o[k] = { text: x.text ?? '' };
    else if ('maxLength' in m) o[k] = { value: x.value ?? '', maxLength: x.maxLength ?? 0 };
    else o[k] = { value: x.value ?? '' };
  }
  return o;
}

const cases = [];
const mine = new Map();
for (const [route, key, viewState, stepsOf] of PLAN) {
  if (only.length && !only.includes(route)) continue;
  const spec = SPECS[route];
  let state;
  try {
    state = key ? await displayState(spec, ctx, key) : await newFormState(spec, ctx);
  } catch (e) {
    console.log(`SKIP ${route}: the form itself fails on this database (${e.message}) - see read parity`);
    continue;
  }
  for (const steps of await stepsOf(state)) {
    const id = cases.push({ id: cases.length, route, mode: 'event', key, viewState, gridViewState: GRID_VS[route] ?? {}, dataTables: DATA_TABLES[route] ?? [], steps, ctx, spec: { top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits } }) - 1;
    try {
      const res = await runNew(spec, key, viewState, steps);
      mine.set(id, { ok: true, result: { controls: shapeNew(res, route), alerts: res.alerts, viewState: res.viewState } });
    } catch (e) {
      mine.set(id, { ok: false, error: e.message });
    }
  }
}

for (const r of RESTORES) await r();
// the original side in chunks: one run's JSON of many large lists (e.g. every material) runs out of memory
const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
const orig = new Map();
for (let i = 0; i < cases.length; i += 10) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases.slice(i, i + 10)));
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
  for (const o of JSON.parse(raw.slice(raw.indexOf('[')))) orig.set(o.id, o);
}
for (const r of RESTORES) await r();

// "now" stamped by each side a moment apart (e.g. a start time defaulted to now): today's times compared as NOW
const T = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOWS = [new RegExp(`${T.getFullYear()}-${p2(T.getMonth() + 1)}-${p2(T.getDate())}T\\d\\d:\\d\\d:\\d\\d`, 'g'), new RegExp(`${p2(T.getDate())}-${MON[T.getMonth()]}-${T.getFullYear()} \\d\\d:\\d\\d`, 'g'), new RegExp(`${p2(T.getDate())}-${p2(T.getMonth() + 1)}-${T.getFullYear()} \\d\\d:\\d\\d:\\d\\d [AP]M`, 'g')];
const nowish = (x) => NOWS.reduce((a, r) => a.replace(r, 'NOW'), x);
let same = 0;
let bothFail = 0;
for (const c of cases) {
  const o = orig.get(c.id);
  const m = mine.get(c.id);
  const label = `${c.route}${c.key ? ` #${c.key}` : ''} [${c.steps.map((s) => s.command ?? s.control).join(',')}]`;
  if (!o.ok || !m.ok) {
    if (!o.ok && !m.ok && o.error === m.error) {
      bothFail++;
      continue;
    }
    console.log(`DIFF ${label}: original ${o.ok ? 'ok' : `ERROR ${o.error}`} / new ${m.ok ? 'ok' : `ERROR ${m.error}`}`.slice(0, 600));
    continue;
  }
  const oc = shapeOrig(o.result.controls, m.result.controls, c.route);
  // alerts as the user saw them (the script string shows "\\" as "\")
  const oa = (o.result.alerts ?? []).map((a) => a.replaceAll('\\\\', '\\'));
  const ov = o.result.viewState ?? {};
  const bad = Object.keys(m.result.controls).filter((k) => k in oc && nowish(JSON.stringify(oc[k])) !== nowish(JSON.stringify(m.result.controls[k])));
  // "__…" keys are the new app's own note of which list a dropdown holds (the original kept the items themselves)
  const vsBad = Object.keys({ ...ov, ...m.result.viewState }).filter((k) => !k.startsWith('__') && typeof m.result.viewState[k] !== 'object' && nowish(String(ov[k] ?? '')) !== nowish(String(m.result.viewState[k] ?? '')));
  if (bad.length || vsBad.length || JSON.stringify(oa) !== JSON.stringify(m.result.alerts)) {
    console.log(`DIFF ${label}: ${bad.map((k) => (oc[k]?.qc ? `${k}: ${Object.keys(oc[k].qc).filter((q) => JSON.stringify(oc[k].qc[q]) !== JSON.stringify(m.result.controls[k].qc?.[q])).map((q) => `${q} ${JSON.stringify(oc[k].qc[q]).slice(0, 300)} vs ${JSON.stringify(m.result.controls[k].qc?.[q]).slice(0, 300)}`).join(', ')}` : `${k}: ${JSON.stringify(oc[k]).slice(0, 160)} vs ${JSON.stringify(m.result.controls[k]).slice(0, 160)}`)).join('; ')} ${vsBad.length ? `viewState ${JSON.stringify(ov)} vs ${JSON.stringify(m.result.viewState)}` : ''} alerts ${JSON.stringify(oa)} vs ${JSON.stringify(m.result.alerts)}`.slice(0, 900));
  } else same++;
}
console.log(`event cases: ${cases.length}, identical: ${same}, both fail alike: ${bothFail}, different: ${cases.length - same - bothFail}`);
process.exit(0);
