// A scrap as the API takes it: the unit's serial, the category and the remark, trimmed. Anything else is dropped.
const MAX_SERIAL = 100;
const MAX_REMARK = 150; // FGScrap.Remark

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export const serialProblem = (s) => (s.length > MAX_SERIAL ? `A serial has at most ${MAX_SERIAL} characters` : null);

export function validateScrap(body) {
  const value = { unit: text(body?.unit), category: text(body?.category), remark: text(body?.remark) };
  const errors = {};
  const unit = value.unit === '' ? 'Scan the unit' : serialProblem(value.unit);
  if (unit) errors.unit = unit;
  if (!/^\d+$/.test(value.category)) errors.category = 'Choose a scrap category';
  if (value.remark === '') errors.remark = 'Please Enter Remark';
  else if (value.remark.length > MAX_REMARK) errors.remark = `A remark has at most ${MAX_REMARK} characters`;
  return Object.keys(errors).length ? { value, errors } : { value };
}
