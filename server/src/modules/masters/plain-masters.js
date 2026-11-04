// The setup screens with plain pages (Authorization, Business Setup): each record as plain JSON by the screen's own field
// names (roleName, expiryDays ...). The rules stay where parity proved them: the screen's handlers and the forms writer
// (keys from IDMaster, EventLog, child rows, cancel = status 200), run through ./forms/resource.js; this only names the
// fields, as production-orders does.
//   GET    /                          list (?page=&column=&op=&value=)
//   GET    /search-fields             filterable columns; /search-fields/:column/values their values
//   GET    /new                       a blank record: { record, options, status, statusMessage, copyFrom?, tree? }
//   GET    /:key                      a saved one; GET /:key/copy a new one filled from it (Department)
//   POST   /  PUT /:key  DELETE /:key  save, update, cancel ({ record }; DELETE { remark })
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
};

/** one screen as a plain service: its fields by name over the screen's own resource */
export function plainMaster({ route, fields, tree }) {
  const m = screenResource(route);
  const auto = Object.fromEntries(Object.entries(m.FIELDS).map(([a, id]) => [id, a])); // control -> the resource's name
  for (const [f, id] of Object.entries(fields)) if (!auto[id]) throw new Error(`${route}: no control ${id} for ${f}`);
  const NESTED = new Set(Object.keys(fields).filter((f) => m.NESTED.has(auto[fields[f]])));
  /** { field: value } -> the resource's { record } */
  const toResource = (record = {}) => ({ record: Object.fromEntries(Object.entries(record).filter(([f]) => fields[f]).map(([f, v]) => [auto[fields[f]], v])) });
  /** the resource's answer -> { record, options } by field; a list's blank "Select" item is the page's own placeholder */
  const plain = (r) => ({
    record: Object.fromEntries(Object.entries(fields).map(([f, id]) => [f, r.record[auto[id]] ?? ''])),
    options: Object.fromEntries(Object.entries(fields).filter(([, id]) => r.options[auto[id]]).map(([f, id]) => [f, r.options[auto[id]].filter((o) => o.value !== '')])),
    status: r.status,
    statusMessage: r.statusMessage,
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
      return r && withTree(plain(r));
    },
    copyOf: async (c, key) => {
      const r = await m.copyOf(c, key);
      return r && plain(r);
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
  return router;
}

/** name -> its service (the parity scripts save through these too) */
export const PLAIN_SERVICES = Object.fromEntries(Object.entries(PLAIN).map(([n, d]) => [n, plainMaster(d)]));

// each at /<name> only, so the other screens' requests pass through untouched
const router = Router();
for (const [n, s] of Object.entries(PLAIN_SERVICES)) router.use(`/${n}`, requireAuth, operatorMessages, plainRouter(s), portedErrors);
export default router;
