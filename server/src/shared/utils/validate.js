// Input checks for the domain APIs: each field a rule; the result is the cleaned values (all strings, as the forms
// writer takes them) or a field -> message map. Rules only reject malformed input; what the database accepts, they
// accept (required = a NOT NULL column without a default).

export const rules = {
  /** a code: digits only */
  code: ({ required = false } = {}) => (v) => (v === '' ? (required ? 'is required' : null) : /^\d+$/.test(v) ? null : 'must be a code (digits only)'),
  /** a number, optionally signed / decimal */
  number: ({ required = false, min } = {}) => (v) => {
    if (v === '') return required ? 'is required' : null;
    if (!/^-?\d+(\.\d+)?$/.test(v)) return 'must be a number';
    return min !== undefined && Number(v) < min ? `must be at least ${min}` : null;
  },
  /** a calendar date, YYYY-MM-DD */
  date: ({ required = false } = {}) => (v) => {
    if (v === '') return required ? 'is required' : null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? null : 'must be a date (YYYY-MM-DD)';
  },
  /** free text up to a length */
  text: ({ required = false, max } = {}) => (v) => (v.trim() === '' && required ? 'is required' : max && v.length > max ? `must be at most ${max} characters` : null),
};

const asText = (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null);

/** { value, errors }: errors is null when every field passes; unknown fields are ignored */
export function validate(input, schema, prefix = '') {
  const value = {};
  const errors = {};
  for (const [field, rule] of Object.entries(schema)) {
    const raw = input?.[field];
    // not sent: an error if required, else left out (the record keeps what it has)
    if (raw === undefined) {
      const missing = rule('');
      if (missing) errors[prefix + field] = `${field} ${missing}`;
      continue;
    }
    const v = asText(raw);
    const problem = v === null ? 'has the wrong type' : rule(v);
    if (problem) errors[prefix + field] = `${field} ${problem}`;
    else value[field] = v;
  }
  return { value, errors: Object.keys(errors).length ? errors : null };
}
