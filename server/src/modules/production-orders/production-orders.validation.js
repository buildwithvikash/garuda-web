// A production order as the API takes it. Required = PRODHeader's NOT NULL columns without a default; lengths = the
// column sizes. Nothing the original screen saved is refused.
import { validate, rules } from '../../shared/validate.js';

const header = {
  orderDate: rules.date({ required: true }),
  alias: rules.text({ max: 50 }),
  businessUnit: rules.code({ required: true }),
  status: rules.code({ required: true }),
  department: rules.code({ required: true }),
  orderType: rules.code(),
  salesOrder: rules.code(),
  priority: rules.code(),
  material: rules.code(),
  qty: rules.number({ required: true }),
  uom: rules.code(),
  bom: rules.code(),
  remark: rules.text({ max: 250 }),
  trackId: rules.text({ max: 50 }),
  custId: rules.text({ max: 50 }),
  // on the screen only, never saved
  totalQty: rules.number(),
  totalUom: rules.code(),
  serviceRequest: rules.code(),
};
// the same rules with nothing required
const optional = Object.fromEntries(Object.entries(header).map(([k, rule]) => [k, (v) => (rule(v) === 'is required' ? null : rule(v))]));
const line = { prodNo: rules.code(), seqNo: rules.number(), orderCode: rules.code({ required: true }), orderNo: rules.text({ max: 50 }) };

/** { value, errors } for an order: header fields + its service-request lines (orders). A draft (an option change on
 *  a half-filled form) skips the required checks. */
export function validateOrder(body, { draft = false } = {}) {
  const { value, errors } = validate(body, draft ? optional : header);
  const all = { ...errors };
  // not sent: the order keeps its lines
  if (body?.orders !== undefined) {
    if (!Array.isArray(body.orders)) all.orders = 'orders must be a list';
    else
      value.orders = body.orders.map((l, i) => {
        const r = validate(l, line, `orders[${i}].`);
        Object.assign(all, r.errors);
        return r.value;
      });
  }
  return { value, errors: Object.keys(all).length ? all : null };
}

/** Fields the screen locks (read-only, or set from the session / today): the server keeps the values it built, whatever
 *  a request sends. On a new order that is today's date and the session's business unit; on a saved one, its own. */
export const LOCKED = ['prodNo', 'alias', 'businessUnit', 'orderDate'];
export const unlocked = (order) => Object.fromEntries(Object.entries(order ?? {}).filter(([f]) => !LOCKED.includes(f)));

export const validateDraft = (body) => validateOrder(body, { draft: true });

/** { field: message } for the coded fields whose value is not one the screen offers (allowed: { field: [{ value }] }).
 *  Empty is left to the required checks; the value the order already has stays allowed (a list may have changed). */
export function unlistedChoices(order, was, allowed) {
  const errors = {};
  for (const [field, list] of Object.entries(allowed)) {
    const v = order[field];
    if (v === undefined || v === '' || v === was[field]) continue;
    if (!list.some((o) => String(o.value) === v)) errors[field] = `${field} is not one of the choices offered`;
  }
  return errors;
}

/** Owner's rule (31 Oct 2026): a production order cannot be changed once it is created (no update, by any route). */
export const NO_CHANGE_AFTER_CREATE = 'A production order cannot be changed once it is created.';
