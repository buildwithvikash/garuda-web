// Production assignment as plain JSON: an order started at its routing's first stage, one job card + stage label +
// barcode + printed label per piece. The rules stay the original screen's own handlers (pages.service.js,
// ProductionAssignmentForm). Print replays the user's choices through them on the server (department, order,
// routing, stage, station), so what is saved (the routing with its stations, the BOM lines, the quantity left) is
// what the server built, never what a browser sent; every choice must be one the server offered.
import { FORMS } from '../forms/specs.js';
import { openForm, formOf, runEvent } from '../forms/events.js';
import { netString } from '../../shared/net.js';
import { AppError } from '../../shared/AppError.js';

export const SCREEN = '/production/productionassignmentform';
const spec = FORMS[SCREEN];

/** API field -> the screen's control */
export const FIELDS = {
  assignDate: 'TextBox2',
  department: 'DDLDepartment',
  printer: 'DDLPrinter',
  businessUnit: 'DDLBU',
  status: 'ddlStatus',
  order: 'DDlProdOrder',
  material: 'DDLMaterial',
  bom: 'DDLBom',
  routing: 'DDLRouting',
  variant: 'DDLVariant',
  process: 'DDLProcessCode',
  station: 'DDLStationCode',
  totalQty: 'TBTotalQty',
  totalUom: 'DdlTotalUom',
  qty: 'TBQty',
  uom: 'DDLUom',
};
/** read-only lines shown under the form (what the job cards will carry) */
const GRIDS = { route: 'GVRoute', bomInput: 'GVBOMInput', bomOutput: 'GVOutput' };
const UI = { details: ['ContentPanel', 'visible'], materialEditable: ['DDLMaterial', 'enabled'], qtyEditable: ['TBQty', 'enabled'] };
/** the choices the screen reacts to, and the control that runs */
const CHANGES = { department: 'DDLDepartment', order: 'DDlProdOrder', routing: 'DDLRouting', process: 'DDLProcessCode', station: 'DDLStationCode' };
/** the order the user makes them in (Print replays them like this) */
const PATH = ['department', 'order', 'routing', 'process', 'station'];
/** chosen without a server round trip */
const PLAIN = ['material', 'bom', 'variant', 'uom', 'printer'];

const noPlaceholder = (opts) => (opts ?? []).filter((o) => o.value !== '');

/** a flag cell as the grids hold it (true / 'True' / 1) */
const flag = (v) => v === true || v === 1 || /^(true|1)$/i.test(netString(v));
/** the screen's grid rows (database column names) as the API names them; the codes stay on the server */
const LINES = {
  route: (r) => ({ seq: netString(r.SeqNo), process: netString(r.Process), station: netString(r.Station) }),
  bomInput: (r) => ({ material: netString(r.MaterialDesc), qty: netString(r.Qty), unit: netString(r.UomDesc), process: netString(r.ProcessDesc), scanRequired: flag(r.ScanReq), outputScan: flag(r.OutputScan) }),
  bomOutput: (r) => ({ material: netString(r.MaterialDesc), qty: netString(r.Qty), unit: netString(r.UomDesc), yieldQty: netString(r.YieldQty), process: netString(r.ProcessDesc) }),
};

/** the screen's form as the API returns it */
function toApi(form, message = null) {
  const assignment = Object.fromEntries(Object.entries(FIELDS).map(([f, id]) => [f, netString(form.values[id]).trim()]));
  const options = Object.fromEntries(Object.entries(FIELDS).filter(([, id]) => form.options[id]).map(([f, id]) => [f, noPlaceholder(form.options[id])]));
  const ui = Object.fromEntries(Object.entries(UI).map(([k, [id, attr]]) => [k, (attr === 'visible' ? form.visible[id] : form.enabled[id]) !== false]));
  const details = Object.fromEntries(Object.entries(GRIDS).map(([k, id]) => [k, Array.isArray(form.values[id]) ? form.values[id].map(LINES[k]) : []]));
  return { assignment, options, ui, details, left: netString(form.viewState.Qty), message };
}

async function opened(ctx) {
  const { state, alert } = await openForm(spec, ctx);
  return { form: formOf(state), alert };
}

/** the screen as it opens: the session's department, its orders and printers */
export async function blank(ctx) {
  const { form, alert } = await opened(ctx);
  return toApi(form, alert);
}

/** puts one API field on the form; a dropdown value must be one of its items */
function put(form, field, value) {
  if (value === undefined) return;
  const id = FIELDS[field];
  const items = form.options[id];
  if (value !== '' && items && !items.some((o) => o.value === value)) throw AppError.badRequest(`The ${field} chosen is not available here. Choose again.`);
  form.values[id] = value;
}

/** The choices replayed through the screen's own handlers, in the order the user makes them, each checked against
 *  the list the server built just before (another department's or business unit's order is never on it). upTo: stop
 *  before this field (it is the one being changed). { form } after the replay */
async function replay(ctx, draft, upTo = null) {
  let { form, alert } = await opened(ctx);
  if (alert) throw AppError.badRequest(alert);
  for (const field of PATH) {
    if (field === upTo) break;
    if (draft[field] === undefined || draft[field] === '') continue;
    put(form, field, draft[field]);
    const r = await runEvent(spec, ctx, CHANGES[field], form);
    if (r.result.alert) throw AppError.badRequest(r.result.alert);
    form = r.form;
    // the order's own lists, then the routing's / stage's: later choices are checked against what the server built
    if (field === 'order') {
      for (const f of PLAIN) {
        if (f === 'printer' || !draft[f]) continue; // not chosen: what the order filled stays
        if (f === 'material' && form.enabled[FIELDS.material] === false) continue; // the order's own, not changeable
        put(form, f, draft[f]);
      }
    }
  }
  return form;
}

/** What a choice (department, order, routing, process, station) fills: the whole screen after the screen's handler.
 *  The choices before it are replayed and checked first, so only what the server offered can be looked at. */
export async function change(ctx, field, draft) {
  const control = CHANGES[field];
  if (!control) throw AppError.badRequest(`Nothing depends on ${field}`);
  let form = await replay(ctx, draft, field);
  // the printer chosen stays while it is on the list (a department change brings its own printers)
  if (draft.printer && form.options[FIELDS.printer]?.some((o) => o.value === draft.printer)) form.values[FIELDS.printer] = draft.printer;
  if (draft.qty !== undefined) form.values[FIELDS.qty] = draft.qty; // the quantity as typed (a stage's handler resets it)
  put(form, field, draft[field] ?? '');
  const r = await runEvent(spec, ctx, control, form);
  form = r.form;
  return toApi(form, r.result.alert ?? null);
}

/** Prints the job cards: replays the choices, then the screen's Print (one job card, barcode and label per piece).
 *  { message, alerts, left, ...the screen after it } */
export async function print(ctx, draft) {
  const form = await replay(ctx, draft);
  if (draft.printer) put(form, 'printer', draft.printer);
  // what is assigned now: quantity typed; the order quantity and what is left come from the server's replay
  if (draft.qty !== undefined) form.values[FIELDS.qty] = draft.qty;
  const r = await runEvent(spec, ctx, 'btnPrint', form);
  if (r.result.alert) throw AppError.badRequest(r.result.alert);
  const out = toApi(r.form, r.result.message ?? null);
  return { ...out, alerts: r.result.alerts ?? [] };
}
