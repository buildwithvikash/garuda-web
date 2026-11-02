// A replacement as the API takes it: three serials, trimmed. Anything else in the body is dropped.
const MAX = 100;
const FIELDS = { unit: 'Scan the unit', existing: 'Scan the existing component', replacement: 'Scan the new component' };

export const serialProblem = (s) => (s.length > MAX ? `A serial has at most ${MAX} characters` : null);

export function validateReplacement(body) {
  const value = {};
  const errors = {};
  for (const [field, missing] of Object.entries(FIELDS)) {
    const raw = body?.[field];
    value[field] = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
    const problem = value[field] === '' ? missing : serialProblem(value[field]);
    if (problem) errors[field] = problem;
  }
  return Object.keys(errors).length ? { value, errors } : { value };
}
