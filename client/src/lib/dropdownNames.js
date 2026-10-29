// A list's coded columns shown by their names (owner, 29 Oct 2026): a column the form has as a dropdown on the record's
// table (by its column name, e.g. Status, Type) shows the dropdown's text for the stored value (Status 1 -> Active,
// Type 400 -> In-Process Material). A value the dropdown does not list stays as it is.

/** { column (lower case): { value: name } } from a screen's spec (its form controls) */
export function dropdownNames(spec) {
  const controls = spec?.controls ?? [];
  // the record's table: the key's (a grid's editors or other tables' lists keep their codes)
  const table = String(controls.find((c) => c.id === 'PrimaryKey')?.table ?? '').trim().toLowerCase();
  const out = {};
  for (const c of controls) {
    if (c.type !== 'DropDownList' || !String(c.column ?? '').trim() || !c.options?.length) continue;
    if (table && String(c.table ?? '').trim().toLowerCase() !== table) continue;
    const col = String(c.column).trim().toLowerCase();
    out[col] = { ...Object.fromEntries(c.options.filter((o) => o.value !== '').map((o) => [String(o.value), String(o.text ?? '').trim()])), ...out[col] };
  }
  return out;
}

/** a cell's name: the dropdown's text for its column's stored value, else the value */
export const nameIn = (names, column, value) => names[String(column ?? '').toLowerCase()]?.[String(value ?? '')] ?? value;
