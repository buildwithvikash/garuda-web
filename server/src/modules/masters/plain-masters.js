// The setup screens with plain pages (Authorization, Business Setup, Settings): each record as plain JSON by the screen's own field
// names (roleName, expiryDays ...). The rules stay where parity proved them: the screen's handlers and the forms writer
// (keys from IDMaster, EventLog, child rows, cancel = status 200), run through ./forms/resource.js; this only names the
// fields, as production-orders does.
//   GET    /                          list (?page=&column=&op=&value=)
//   GET    /search-fields             filterable columns; /search-fields/:column/values their values
//   GET    /new                       a blank record: { record, options, status, statusMessage, copyFrom?, tree? }
//   GET    /:key                      a saved one; GET /:key/copy a new one filled from it (Department)
//   POST   /  PUT /:key  DELETE /:key  save, update, cancel ({ record }; DELETE { remark })
//   POST   /:key/print                a saved record's label ({ printer }; Employee), { alert } when refused
//   POST   /events/:event             a row event ({ record, viewState, arg }; Check List, Check List Values, Shift)
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { portedErrors } from '../../middlewares/errorHandler.js';
import { operatorMessages } from '../../middlewares/operatorMessages.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/AppError.js';
import { created, ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { clearSession } from '../auth/sessions.js';
import { sessionContext as ctx } from '../auth/context.js';
import { screenResource } from '../forms/resource.js';
import { validateBody } from '../forms/resource.validation.js';
import { roleTree } from '../forms/children.js';
import { printerOptions } from '../production/labels.service.js';

/** API name -> { route, fields: { field: the screen's control } }; tree: the field holding the role tree */
export const PLAIN = {
  users: {
    route: '/authorization/usersform',
    fields: {
      userCode: 'PrimaryKey', status: 'ddlStatus', userId: 'TextBox1', userName: 'TextBox3', employee: 'DropDownList1', erpEmployee: 'TextBox5',
      startOn: 'TextBox4', userRole: 'DropDownList5', defaultPage: 'DDLPage', businessUnits: 'CBBusinessUnit', processes: 'CheckBoxList1', photo: 'UploadImage',
    },
  },
  'user-roles': { route: '/authorization/userroleform', fields: { roleCode: 'PrimaryKey', status: 'ddlStatus', roleName: 'TextBox3', expiryDays: 'TextBox444', pages: 'TreeView1' }, tree: 'pages' },
  'change-password': { route: '/authorization/changepasswordform', fields: { user: 'TBUser', current: 'TBCurPass', next: 'TBNewPass', retype: 'TBRetypePass' } },
  'reset-password': { route: '/authorization/resetpasswordform', fields: { user: 'DDLUser', next: 'TBNewPass', retype: 'TBRetypePass' } },
  'business-units': {
    route: '/businesssetup/businessunitform',
    fields: {
      buCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox2', alias: 'Alias', buType: 'DropDownList1', prefix: 'TextBox13', isVirtual: 'DropDownList2',
      parentBu: 'DropDownList3', controlIndicator: 'DropDownList4', address1: 'TextBox9', address2: 'TextBox7', postalCode: 'TextBox1', city: 'TextBox4',
      state: 'DropDownList6', country: 'DropDownList7', email: 'TextBox10', contactNo: 'TextBox12', webSite: 'TextBox11', taxRegNo: 'TextBox5',
      licence: 'TextBox6', gs1Prefix: 'TextBox8', completeAddress: 'TextBox3', otherDetails: 'TextBox14', logo: 'UploadImage',
    },
  },
  company: { route: '/businesssetup/companyform', fields: { code: 'PrimaryKey', companyName: 'TextBox2', licenceType: 'DropDownList1', expiryBy: 'TextBox1', uniqueId: 'TextBox4', licenceId: 'TextBox13', logo: 'UploadImage' } },
  departments: {
    route: '/businesssetup/departmentform',
    fields: { deptCode: 'PrimaryKey', businessUnit: 'DropDownList4', status: 'ddlStatus', name: 'TextBox3', alias: 'Alias', deptType: 'DropDownList1', prefix: 'TextBox1', controlIndicator: 'DropDownList5', isVirtual: 'DropDownList2' },
  },
  ledgers: {
    route: '/businesssetup/ledgerform',
    fields: { ledgerCode: 'PrimaryKey', department: 'DdlDept', businessUnit: 'DropDownList4', status: 'ddlStatus', ledgerGroup: 'DropDownList1', controlIndicator: 'DropDownList2', name: 'TextBox2', alias: 'Alias', prefix: 'TextBox1', webSite: 'TextBox11' },
  },
  // Settings
  'defect-codes': {
    route: '/settings/defectcodemasterform',
    fields: { code: 'PrimaryKey', status: 'ddlStatus', materialCategory: 'DdlMaterialCategory', defectCategory: 'DropDownList2', name: 'TextBox2', alias: 'TextBox1', process: 'DropDownList1' },
  },
  employees: {
    route: '/settings/employeeform',
    fields: {
      empCode: 'PrimaryKey', businessUnit: 'DropDownList8', status: 'ddlStatus', name: 'TextBox2', alias: 'Alias', joinDate: 'TextBox4', empType: 'DropDownList1',
      department: 'DropDownList9', designation: 'TextBox13', gender: 'DropDownList3', birthDate: 'TextBox6', married: 'DropDownList10', anniversary: 'TextBox5',
      address1: 'TextBox9', address2: 'TextBox7', postalCode: 'TextBox3', city: 'TextBox1', state: 'DropDownList6', country: 'DropDownList7', email: 'TextBox10',
      contactNo: 'TextBox12', altContactNo: 'TextBox15', accessCardNo: 'TextBox14', allowAccess: 'DropDownList2',
    },
  },
  'material-tags': { route: '/settings/materialtagform', fields: { tagCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3', tagType: 'DropDownList1', tagImage: 'UploadImage', prnCommand: 'TextBox1' } },
  printers: {
    route: '/settings/printerform',
    fields: { printerId: 'PrimaryKey', businessUnit: 'DropDownList4', status: 'ddlStatus', department: 'DDLDepartment', area: 'DDLArea', station: 'DDLStation', name: 'TextBox3', ip: 'TextBox5', driver: 'DDLDriver' },
  },
  'rework-resolutions': { route: '/settings/reworkresolutionform', fields: { code: 'PrimaryKey', status: 'ddlStatus', reason: 'TextBox2' } },
  'root-causes': { route: '/settings/rootcauseform', fields: { code: 'PrimaryKey', status: 'ddlStatus', reason: 'TextBox2' } },
  'scrap-reasons': { route: '/settings/scrapreasonform', fields: { code: 'PrimaryKey', status: 'ddlStatus', reason: 'TextBox2' } },
  // with rows added through the screen's own events: the rows' editor fields are fields too (not saved: the writer
  // takes the rows), `events` the screen's handlers, `ui` the controls whose state the page follows
  'check-lists': {
    route: '/settings/parameterform',
    fields: {
      checklistCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3', alias: 'TextBox1', type: 'DDLType', parameters: 'GVTransData',
      paramName: 'TbName', description: 'TbDescription', inputType: 'DdlInputType', minValue: 'TbMinValue', maxValue: 'TbMaxValue', passValue: 'TbPassValue',
      unit: 'DdlUom', resultDefined: 'DdlResultDefined', list: 'DdlList', instrument: 'DDLInstrument', guideImage: 'UploadImage',
    },
    events: { inputType: 'ddlInputType', add: 'btnAdd', edit: 'gvTransDataSelect', remove: 'gvTransDataDelete', cancelEdit: 'gvTransDataCancel' },
    ui: { minMax: 'MinMaxPanel', listPanel: 'ListPanel', add: 'BtnAdd' },
  },
  'value-lists': {
    route: '/settings/parametervaluelistform',
    fields: { code: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox2', values: 'GVTransData', value: 'TbValue', result: 'DDLPass' },
    events: { add: 'btnAdd', remove: 'gvTransDataDelete' },
  },
  shifts: {
    route: '/settings/shiftmasterform',
    fields: {
      shiftCode: 'PrimaryKey', businessUnit: 'DropDownList2', status: 'ddlStatus', department: 'DropDownList8', name: 'TextBox3', startTime: 'TextBox1',
      endTime: 'TextBox2', breakPeriod: 'TextBox4', breaks: 'GVTransData', breakName: 'TBBreakName', breakStart: 'TBStart', breakEnd: 'TBEnd',
    },
    events: { add: 'btnAdd', remove: 'gvTransDataDelete' },
  },
  // Material Setup. Fields the pages do not show (inspection, batch, FIFO ... settings, owner 28 Oct / 1 Nov 2026; what
  // the screen itself keeps hidden) are not named: a saved record keeps its values, a new one the screen's defaults
  'units-of-measure': { route: '/materialsetup/unitofmeasureform', fields: { uomCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3', alias: 'TextBox4', uomType: 'DropDownList1' } },
  'variant-fields': { route: '/materialsetup/variantfieldform', fields: { fieldCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3' } },
  'variant-values': { route: '/materialsetup/variantfieldvalueform', fields: { code: 'PrimaryKey', status: 'ddlStatus', field: 'Ddl', value: 'TextBox3', prefix: 'TextBox1' } },
  'material-categories': {
    route: '/materialsetup/materialcategoryform',
    fields: { categoryCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3', alias: 'TextBox4', prefix: 'TextBox1', categoryType: 'DropDownList1' },
  },
  models: {
    route: '/materialsetup/modelform',
    fields: {
      modelCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3', alias: 'Alias', category: 'DDLCategory', prefix: 'TextBox1', beeCode: 'TextBox2',
      variants: 'GVTransData', variantGroup: 'DDLGroup', variantField: 'DdlName', variantValue: 'DdlValue', newValue: 'TbNewValue',
    },
    events: { variantGroup: 'ddlGroup', variantField: 'ddlName', add: 'btnAdd', remove: 'gvTransDataDelete' },
  },
  'serial-logics': {
    route: '/materialsetup/serialgenerationlogicform',
    fields: {
      serialCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox3', alias: 'Alias', type: 'DdlType', barcodeLength: 'TextBox1', useFor: 'DDLUseFor',
      parts: 'GVTransData', sequenceField: 'DdlName', description: 'TbDescription', seqNo: 'tbSeqNo', separator: 'DDLSeperator', startingNo: 'tbStartingNo',
      seed: 'tbSeed', length: 'tbLenth', endingNo: 'tbEndingNo', format: 'tbFormat', value: 'tbValue',
    },
    events: { type: 'type', sequenceField: 'ddlName', add: 'btnAdd', edit: 'gvTransDataSelect', cancelEdit: 'gvTransDataCancel', remove: 'gvTransDataDelete' },
    ui: { serialPanel: 'Serial', datePanel: 'dateFormat', valuePanel: 'Value' },
  },
  materials: {
    route: '/materialsetup/materialform',
    fields: {
      matCode: 'PrimaryKey', status: 'ddlStatus', type: 'DdlType', ledger: 'DDLLedger', category: 'DdlMaterialCategory', model: 'DdlModel', tagDesign: 'DDLTag',
      name: 'TextBox2', itemCode: 'TextBox1', alias: 'Alias', baseUom: 'DdlBaseUom', mrp: 'TbRetailRate', routing: 'DDLRoute',
      track: 'DropDownList24', fgSerialLogic: 'ddlTrackSerialLogic', assetTagLogic: 'DropDownList6', greenTagLogic: 'DDLGreenLogic',
      purchaseTax: 'DdlPurchaseTax', purchaseRate: 'TbPurchaseRate', purchaseUom: 'DdlPurchaseUom', purchaseConvQty: 'TbPConvQty',
      salesTax: 'DdlSalesTax', wholesaleRate: 'TbWholeSaleRate', salesUom: 'DdlSalesUom', salesConvQty: 'TbSConvQty',
      variants: 'GVTransData', variantGroup: 'DDLGroup', variantField: 'DdlName', variantValue: 'DdlValue', newValue: 'TbNewValue', image: 'UploadImage',
    },
    events: { type: 'type', category: 'category', model: 'model', baseUom: 'baseUom', variantGroup: 'ddlGroup', variantField: 'ddlName', add: 'btnAdd', remove: 'gvTransDataDelete' },
    ui: { purchasePanel: 'PurchaseConfigPanel', salesPanel: 'SalesConfigPanel', variantPanel: 'VariantPanel' },
  },
  'bills-of-material': {
    route: '/materialsetup/billofmaterial',
    fields: {
      bomCode: 'PrimaryKey', status: 'ddlStatus', name: 'TextBox1', version: 'TextBox5', remark: 'TextBox2', model: 'ddlModel', material: 'DDLMaterial',
      baseQty: 'TextBox10', baseUom: 'DDLBaseUom', process: 'DdlProcess',
      inputs: 'GVBOMInput', inputType: 'DDLInputMaterialType', inputMaterial: 'DDLInputMaterial', inputQty: 'TbInputQuantity', inputUom: 'DdlInputUom',
      inputScan: 'DDLInputScan', outputScan: 'DDLOutputScan', subRouting: 'DDLRouting',
      alternatives: 'GVAltMaterial', lineAlternatives: 'GVCurrentAltMaterial', alternative: 'DDlAltInputMaterial',
      outputs: 'GVOutput', outputType: 'DDLOutoutMaterialType', outputMaterial: 'DDLOutputMaterial', outputQty: 'TBOutputQty', outputUom: 'DDLOutputUom',
    },
    events: {
      material: 'material', inputType: 'ddlInputMaterialType', inputMaterial: 'ddlInputMaterial', outputType: 'ddlOutoutMaterialType', outputMaterial: 'ddlOutputMaterial',
      addInput: 'btnInputAdd', editInput: 'gvbomInputSelect', cancelInput: 'gvbomInputCancel', removeInput: 'gvbomInputDelete',
      addOutput: 'btnOutputAdd', editOutput: 'gvOutputSelect', cancelOutput: 'gvOutputCancel', removeOutput: 'gvOutputDelete',
      openAlternatives: 'gvbomInputAlternativeMat', closeAlternatives: 'btnAltPanelClose', addAlternative: 'btnAddAltMaterial',
      updateAlternatives: 'btnUpdateAltMaterial', removeAlternative: 'gvCurrentAltMaterialDelete',
    },
    ui: { subRoutingPanel: 'SubRoutingPanel', outputScanPanel: 'OutputScanPanel', alternativesPanel: 'AltMaterialPanel' },
  },
};

/** one screen as a plain service: its fields by name over the screen's own resource */
export function plainMaster({ route, fields, tree, events = {}, ui = {} }) {
  const m = screenResource(route);
  const auto = Object.fromEntries(Object.entries(m.FIELDS).map(([a, id]) => [id, a])); // control -> the resource's name
  for (const [f, id] of Object.entries(fields)) if (!auto[id]) throw new Error(`${route}: no control ${id} for ${f}`);
  for (const [e, id] of Object.entries(events)) if (!m.EVENTS[id]) throw new Error(`${route}: no event ${id} for ${e}`);
  const fieldOf = Object.fromEntries(Object.entries(fields).map(([f, id]) => [auto[id], f])); // the resource's name -> field
  const NESTED = new Set(Object.keys(fields).filter((f) => m.NESTED.has(auto[fields[f]])));
  /** { field: value } -> the resource's { record } */
  const toResource = (record = {}) => ({ record: Object.fromEntries(Object.entries(record).filter(([f]) => fields[f]).map(([f, v]) => [auto[fields[f]], v])) });
  /** the lists of fields whose control passes `keep`, unchanged */
  const raw = (o, keep) => Object.fromEntries(Object.entries(fields).filter(([, id]) => keep(id) && o?.[auto[id]]).map(([f, id]) => [f, o[auto[id]]]));
  /** the lists the page holds ({ field: items }) -> the resource's ui ({ control: { options } }), as the engine's client posts them */
  const held = (l = {}) => Object.fromEntries(Object.entries(l).filter(([f, x]) => fields[f] && Array.isArray(x?.options)).map(([f, x]) => [fields[f], { options: x.options }]));
  const lists = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([a]) => fieldOf[a]).map(([a, x]) => [fieldOf[a], x.filter((i) => i.value !== '')]));
  /** what the screen shows or hides of the controls named in `ui` (a panel, the Add button's text) */
  const shown = (u = {}) =>
    Object.fromEntries(
      Object.entries(ui).flatMap(([n, id]) => {
        const s = u[m.NAMES[id]];
        return s ? [[n, Object.fromEntries(['visible', 'text'].filter((k) => s[k] !== undefined).map((k) => [k, s[k]]))]] : [];
      }),
    );
  /** the resource's answer -> { record, options } by field; a list's blank "Select" item is the page's own placeholder */
  const plain = (r) => ({
    record: Object.fromEntries(Object.entries(fields).map(([f, id]) => [f, r.record[auto[id]] ?? ''])),
    options: lists(r.options),
    status: r.status,
    statusMessage: r.statusMessage,
    // a screen with events: what its rows' editor shows, the screen's own state between events, and the lists its code
    // filled (as the screen has them, "Select" included), which the page sends back with each event
    ...(Object.keys(events).length && { ui: shown(r.ui), viewState: r.viewState ?? {}, lists: raw(r.options, (id) => r.ui?.[m.NAMES[id]]?.refilled) }),
  });
  const withTree = async (r) => (tree ? { ...r, tree: await roleTree() } : r);
  const answer = (r) => ({ key: netString(r.key), message: r.message, alert: r.alert ?? null, ...(r.logout && { logout: true }) });

  return {
    SCREEN: route,
    FIELDS: fields,
    NESTED,
    copy: m.copy,
    blank: async (c) => {
      const r = await m.blank(c);
      return withTree({ ...plain(r), ...(r.copyFrom && { copyFrom: r.copyFrom.filter((o) => o.value !== '') }) });
    },
    get: async (c, key) => {
      const r = await m.get(c, key);
      // a screen that prints (Employee) prints a saved record, on one of the unit's printers
      return r && withTree({ ...plain(r), ...(m.print && { printers: await printerOptions(c.businessUnit) }) });
    },
    /** TitleControl Print of a saved record; { alert } when the screen refused (no printer chosen ...) */
    print: m.print && (async (c, key, printer) => ({ alert: (await m.printRecord(c, { record: { [auto.PrimaryKey]: key }, printer })).alert })),
    copyOf: async (c, key) => {
      const r = await m.copyOf(c, key);
      return r && plain(r);
    },
    EVENTS: events,
    /** a row event (add, remove, edit a line ...) run by the screen's own handler on the record the page holds:
     *  { record (only what changed), options, ui, viewState, alert } */
    event: async (c, name, body) => {
      // ui: { field: { options } }, the lists the page holds; index: the grid line (Material's, BOM's row commands)
      const r = await m.event(c, events[name], { ...toResource(body.record), viewState: body.viewState, ui: held(body.ui), arg: body.arg, index: body.index });
      const record = Object.fromEntries(Object.entries(r.record).filter(([a]) => fieldOf[a]).map(([a, v]) => [fieldOf[a], v]));
      return { record, options: lists(r.options), lists: raw(r.options, () => true), ui: shown(r.ui), viewState: r.viewState ?? {}, alert: r.alert ?? null, ...(r.success && { success: true }) };
    },
    list: (c, q) => m.list(c, q),
    searchFields: (c) => m.searchFields(c),
    columnValues: (c, column) => m.columnValues(c, column),
    create: async (c, body) => answer(await m.create(c, toResource(body.record))),
    save: async (c, key, body) => {
      const r = await m.save(c, key, toResource(body.record));
      return r && answer(r);
    },
    cancel: async (c, key, remark) => {
      const r = await m.cancel(c, key, remark);
      return r && answer(r);
    },
  };
}

const keyOf = (req) => {
  const k = netString(req.params.key);
  if (!/^\d{1,18}$/.test(k)) throw AppError.notFound(`Record ${k}`);
  return k;
};
const found = (r, key) => {
  if (!r) throw AppError.notFound(`Record ${key}`);
  return r;
};
const search = (req) => (req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null);
/** a password changed: the user signs in again, as the original */
const signOut = (res, r) => {
  if (r?.logout) clearSession(res);
  return r;
};

function plainRouter(s) {
  const body = validate(validateBody(s.FIELDS, s.NESTED));
  const router = Router();
  router.use(authorizeScreen(s.SCREEN));
  router.get('/', async (req, res) => ok(res, await s.list(ctx(req), { page: Math.max(0, Number(req.query.page) || 0), search: search(req) })));
  router.get('/search-fields', async (req, res) => ok(res, await s.searchFields(ctx(req))));
  router.get('/search-fields/:column/values', async (req, res) => ok(res, await s.columnValues(ctx(req), netString(req.params.column))));
  router.get('/new', async (req, res) => ok(res, await s.blank(ctx(req))));
  router.get('/:key', async (req, res) => ok(res, found(await s.get(ctx(req), keyOf(req)), req.params.key)));
  router.get('/:key/copy', async (req, res) => {
    if (!s.copy) throw AppError.notFound('Copy on this screen');
    ok(res, found(await s.copyOf(ctx(req), keyOf(req)), req.params.key));
  });
  router.post('/', body, async (req, res) => created(res, signOut(res, await s.create(ctx(req), req.valid.body))));
  router.put('/:key', body, async (req, res) => ok(res, found(await s.save(ctx(req), keyOf(req), req.valid.body), req.params.key)));
  router.delete('/:key', body, async (req, res) => ok(res, found(await s.cancel(ctx(req), keyOf(req), req.valid.body.remark), req.params.key)));
  router.post('/events/:event', body, async (req, res) => {
    if (!s.EVENTS[req.params.event]) throw AppError.notFound(`Event ${req.params.event}`);
    ok(res, await s.event(ctx(req), req.params.event, req.valid.body));
  });
  if (s.print) router.post('/:key/print', async (req, res) => ok(res, await s.print(ctx(req), keyOf(req), netString(req.body?.printer))));
  return router;
}

/** name -> its service (the parity scripts save through these too) */
export const PLAIN_SERVICES = Object.fromEntries(Object.entries(PLAIN).map(([n, d]) => [n, plainMaster(d)]));

// each at /<name> only, so the other screens' requests pass through untouched
const router = Router();
for (const [n, s] of Object.entries(PLAIN_SERVICES)) router.use(`/${n}`, requireAuth, operatorMessages, plainRouter(s), portedErrors);
export default router;
