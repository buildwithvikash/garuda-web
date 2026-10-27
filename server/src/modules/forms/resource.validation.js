// The body of a screen's REST call (forms/resource.routes.js): { record, viewState, ui, arg, index, printer, remark }. Only the
// screen's own fields are taken; values are what its controls hold (text, a list's checked values, a grid's rows).
// Fields in `nested` (the QC panel, the approval footer, a picked file, an image) hold the screen's own structure.
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const scalar = (x) => x === null || ['string', 'number', 'boolean'].includes(typeof x);
const MAX = 20000; // characters of one text value (images and files are nested fields)

/** (fields, nested field names) -> validator for middlewares/validate.js */
export const validateBody = (fields, nested = new Set()) => (b) => {
  const errors = {};
  const body = isObj(b) ? b : {};
  const record = {};
  if (body.record !== undefined && !isObj(body.record)) errors.record = 'record must be an object';
  for (const [f, x] of Object.entries(isObj(body.record) ? body.record : {})) {
    if (!fields[f]) errors[`record.${f}`] = `${f} is not a field of this screen`;
    else if (nested.has(f)) record[f] = x ?? '';
    else if (typeof x === 'string' && x.length > MAX) errors[`record.${f}`] = `${f} is too long`;
    else if (scalar(x)) record[f] = x ?? '';
    else if (Array.isArray(x) && x.length <= 5000 && x.every((r) => scalar(r) || (isObj(r) && Object.values(r).every(scalar)))) record[f] = x;
    else errors[`record.${f}`] = `${f} must be text, a list of values or a list of rows`;
  }
  for (const k of ['viewState', 'ui']) if (body[k] !== undefined && !isObj(body[k])) errors[k] = `${k} must be an object`;
  if (body.index !== undefined && !Number.isInteger(body.index)) errors.index = 'index must be a whole number';
  if (body.arg !== undefined && !scalar(body.arg)) errors.arg = 'arg must be text';
  if (body.printer !== undefined && typeof body.printer !== 'string') errors.printer = 'printer must be text';
  if (body.remark !== undefined && typeof body.remark !== 'string') errors.remark = 'remark must be text';
  if (Object.keys(errors).length) return { value: {}, errors };
  return { value: { record, viewState: body.viewState ?? {}, ui: body.ui ?? {}, arg: body.arg, index: body.index ?? -1, printer: body.printer ?? '', remark: (body.remark ?? '').slice(0, 250) }, errors: null };
};
