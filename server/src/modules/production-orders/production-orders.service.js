// Production orders as plain JSON. The rules stay where parity proved them: the original screen's own handlers
// (services/forms/pages.service.js, ProductionOrderForm) for what an option change does, and the forms writer
// (services/forms/write.service.js) for Save / Update / Delete. This service translates between the API's names
// (material, qty, orders[] ...) and the screen's controls (DDLMaterial, TBQty, GVTransData ...).
import { FORMS } from '../forms/specs.js';
import { newFormState, displayState } from '../forms/state.js';
import { collect, insert, cancel as cancelRecord } from '../forms/write.js';
import { listPage, searchColumns, distinctValues, operatorsFor, OPERATOR_TEXT } from '../forms/lists.js';
import { PAGE_EVENTS, eventHelpers } from '../forms/pages.js';
import { netString } from '../../shared/net.js';
import { AppError } from '../../shared/AppError.js';
import * as repo from './production-orders.repo.js';
import { NO_CHANGE_AFTER_CREATE, unlistedChoices, unlocked } from './production-orders.validation.js';

export const SCREEN = '/production/productionorderform';
const spec = FORMS[SCREEN];

/** API field -> the screen's control */
export const FIELDS = {
  prodNo: 'PrimaryKey',
  orderDate: 'TextBox2',
  alias: 'Alias',
  businessUnit: 'DDLBU',
  status: 'ddlStatus',
  department: 'DropDownList4',
  orderType: 'DDLOrderType',
  salesOrder: 'DDLSO',
  priority: 'DropDownList2',
  material: 'DDLMaterial',
  totalQty: 'TBTotalQty', // shown for sales orders, not saved
  totalUom: 'DdlTotalUom', // shown for sales orders, not saved
  qty: 'TBQty',
  uom: 'DDLUom',
  bom: 'DdlBOM',
  remark: 'TextBox9',
  trackId: 'TBTrackID',
  custId: 'TextBox1',
  serviceRequest: 'DDLOrder', // the service request picked for "add", not saved
};
export const GRID = 'GVTransData'; // the order's service-request lines (PRODMaterial)
const FIELD_OF = Object.fromEntries(Object.entries(FIELDS).map(([f, id]) => [id, f]));
/** panels / controls whose visibility or state the screen changes */
const UI = { salesOrder: ['SalesOrderPanel', 'visible'], orderQty: ['OrderQtyPanel', 'visible'], track: ['Track', 'visible'], qtyEditable: ['TBQty', 'enabled'] };
/** the option changes the screen reacts to, and the control that runs */
const CHANGES = { material: 'DDLMaterial', orderType: 'DDLOrderType', salesOrder: 'DDLSO' };

/** a line as the API shows it; prodNo is the line's own (0 until the order is saved, as the screen posts it) */
const lineOut = (r) => ({ prodNo: netString(r.PRODNo), seqNo: netString(r.SeqNo), orderCode: netString(r.OrderCode), orderNo: netString(r.OrderNo) });
const noPlaceholder = (opts) => (opts ?? []).filter((o) => o.value !== '');

/** the screen's state as the API returns it: { order, options, ui } */
function fromState(state) {
  const byId = new Map(state.controls.filter((c) => c.id).map((c) => [c.id, c]));
  const order = Object.fromEntries(Object.entries(FIELDS).map(([f, id]) => [f, netString(byId.get(id)?.value).trim()]));
  order.orders = (byId.get(GRID)?.rows ?? []).map(lineOut);
  const options = Object.fromEntries(Object.entries(FIELDS).filter(([, id]) => byId.get(id)?.options).map(([f, id]) => [f, noPlaceholder(byId.get(id).options)]));
  const ui = Object.fromEntries(Object.entries(UI).map(([k, [id, attr]]) => [k, byId.get(id)?.[attr] !== false]));
  return { order, options, ui };
}

/** the screen's values: the base (a fresh or a saved order, as the screen built it) with the API's fields on top */
function toValues(base, order) {
  const v = { ...base };
  for (const [f, id] of Object.entries(FIELDS)) if (order[f] !== undefined) v[id] = order[f];
  if (order.orders) v[GRID] = order.orders.map((l) => ({ PRODNo: l.prodNo ?? netString(v.PrimaryKey), SeqNo: l.seqNo, OrderCode: l.orderCode, OrderNo: l.orderNo ?? '' }));
  return v;
}
/** control -> value, as the screen posts them */
const valuesOf = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));

/** a handler's patch ({ set: { control: { value, options, index, rows, visible, enabled } }, alert }) in API terms */
function fromPatch(r, values) {
  const order = {};
  const options = {};
  const ui = {};
  for (const [id, p] of Object.entries(r.set ?? {})) {
    const f = FIELD_OF[id];
    if (f) {
      if (p.options) options[f] = noPlaceholder(p.options);
      if ('index' in p) order[f] = netString((p.options ?? [])[p.index]?.value);
      if ('value' in p) order[f] = netString(p.value);
    }
    if (id === GRID && p.rows) order.orders = p.rows.map(lineOut);
    for (const [k, [uid, attr]] of Object.entries(UI)) if (uid === id && attr in p) ui[k] = p[attr];
  }
  return { order, options, ui, message: r.alert ?? null, values };
}

/** a new order as the screen opens it (today's date, the session's business unit and department ...) */
export async function blank(ctx) {
  return fromState(await newFormState(spec, ctx));
}

/** the screen's state for a saved order; null when there is none */
async function saved(ctx, prodNo) {
  if (!/^\d{1,9}$/.test(prodNo) || !(await repo.exists(prodNo))) return null;
  return displayState(spec, ctx, prodNo);
}

/** a saved order; null when there is none */
export async function get(ctx, prodNo) {
  const state = await saved(ctx, prodNo);
  return state && fromState(state);
}

/** Refuses a coded value the screen would not have offered (as the original's event validation did): the lists the
 *  screen fills, for every order type and sales order, and the chosen material's BOMs. The material handler itself is
 *  not run here: for a serial material it takes a new track ID. */
async function refuseUnlisted(state, order) {
  const { order: was, options } = fromState(state);
  const material = order.material ?? was.material;
  const [salesOrders, production, service, active, boms] = await Promise.all([
    repo.salesOrders(was.businessUnit),
    repo.productionMaterials(),
    repo.serviceMaterials(),
    repo.activeMaterials(),
    material ? repo.boms(material) : [],
  ]);
  const list = (x) => x ?? [];
  const errors = unlistedChoices(order, was, {
    department: list(options.department),
    status: list(options.status),
    orderType: list(options.orderType),
    priority: list(options.priority),
    uom: list(options.uom),
    salesOrder: [...list(options.salesOrder), ...list(salesOrders)],
    material: [...list(production), ...list(service), ...list(active)],
    bom: list(boms),
  });
  if (Object.keys(errors).length) throw AppError.unprocessable('Check the highlighted fields.', errors);
}

/** one page of orders (10 a page), optionally filtered on one column */
export async function list(ctx, { page = 0, search = null } = {}) {
  const r = await listPage(spec, ctx, page, search);
  return { columns: r.columns.map((c) => c.name), rows: r.rows, keys: r.keys, total: r.count, page: r.page, pageSize: r.pageSize };
}
/** the columns a list can be filtered on, with their conditions */
export async function searchFields(ctx) {
  return (await searchColumns(spec, ctx)).map((c) => ({ name: c.name, operators: operatorsFor(c.type).map((o) => ({ value: o, text: OPERATOR_TEXT[o] })) }));
}
/** the values a column holds (the filter's picker) */
export const columnValues = async (ctx, column) => (await distinctValues(spec, ctx, column)).map((v) => netString(v));

/** What choosing a material, an order type or a sales order changes (the screen's own handler for it).
 *  Choosing a serial-tracked material takes a new track ID, as the original did. */
export async function change(ctx, field, draft) {
  const control = CHANGES[field];
  if (!control) throw AppError.badRequest(`Nothing depends on ${field}`);
  const values = toValues(valuesOf(await newFormState(spec, ctx)), draft);
  const r = await PAGE_EVENTS[spec.file][control](values, eventHelpers(spec, ctx, values));
  const { values: _, ...patch } = fromPatch(r, values);
  return patch;
}

/** Adds the picked service request (draft.serviceRequest) as a line: its track ID fills the order's */
export async function addServiceRequest(ctx, draft) {
  const values = toValues(valuesOf(await newFormState(spec, ctx)), draft);
  const r = await PAGE_EVENTS[spec.file].BtnAdd(values, eventHelpers(spec, ctx, values));
  const { values: _, ...patch } = fromPatch(r, values);
  return patch;
}

/** a new order; returns its number */
export async function create(ctx, order) {
  const state = await newFormState(spec, ctx);
  await refuseUnlisted(state, unlocked(order));
  const values = toValues(valuesOf(state), unlocked(order));
  const prodNo = await insert(spec, await collect(spec, values, ctx), ctx);
  return { prodNo: netString(prodNo), message: 'Record Created Successfully' };
}

/** A saved order is never changed (owner's rule, 31 Oct 2026): refused with 409; null when there is no such order. */
export async function save(ctx, prodNo) {
  if (!(await saved(ctx, prodNo))) return null;
  throw AppError.conflict(NO_CHANGE_AFTER_CREATE);
}

/** the order cancelled (status 200, not erased), with the reason; null when there is none */
export async function cancel(ctx, prodNo, remark) {
  const state = await saved(ctx, prodNo);
  if (!state) return null;
  await cancelRecord(spec, await collect(spec, valuesOf(state), ctx), ctx, remark);
  return { prodNo, message: 'Record Deleted Successfully' };
}
