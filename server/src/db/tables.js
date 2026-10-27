// A query's first result set as the original kept DataTables: rows of cell text (null for DBNull), formatted as
// .NET printed the values.
import { queryTable } from './pool.js';
import { toText } from '../shared/values.js';

/** A DataTable as rows of cell text (null for DBNull), as the original keeps it in ViewState. */
export async function dataTable(sql, params) {
  const { columns, rows } = await queryTable(sql, params);
  return rows.map((r) => Object.fromEntries(columns.map((c) => [c.name, r[c.name] === null || r[c.name] === undefined ? null : toText(r[c.name], { sqlType: c.type, scale: c.scale })])));
}
