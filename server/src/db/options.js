// A dropdown's items from a query (ControlA.FillDropDownList): the "" placeholder first, then value = column 0,
// text = column 1 (or column 0).
import { query } from './pool.js';
import { toText } from '../shared/values.js';

async function columnCount(sql) {
  try {
    const r = await query('exec sp_describe_first_result_set @tsql', { tsql: sql });
    return r.filter((x) => !x.is_hidden).length;
  } catch {
    return 2;
  }
}

/** ControlA.FillDropDownList(query, placeholder): "" option first, then rows (value = col 0, text = col 1 or col 0). */
export async function fill(sql, placeholder = 'Select A Value', params) {
  if (sql.trim() === '') return null;
  const rows = await query(sql, params);
  const width = rows.length ? Object.keys(rows[0]).length : (await columnCount(sql));
  const opts = rows.map((r) => {
    const v = Object.values(r);
    return { value: toText(v[0]), text: toText(v.length > 1 ? v[1] : v[0]) };
  });
  // ADO.NET: with one column the placeholder row is DBNull (blank text); with more, column 1 holds the placeholder
  return [{ value: '', text: width > 1 ? placeholder : '' }, ...opts];
}
