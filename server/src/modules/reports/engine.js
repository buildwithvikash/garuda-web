// Port of UserControl/ReportControl, ReportControlTime and ReportControlAdv: a report is a SQL "Tag" from the
// original page, split on "|":
//   [0] SQL  [1] BU condition with <BU>  [2] date field  [3] department field (Adv: "field~SQL for filter list")
//   [4] GROUP BY  [5] Time: ORDER BY / Adv: column to total
// Query text is composed exactly like the original Get_SqlQuery(); every user value is a parameter instead of
// being concatenated, and search columns/operators are whitelisted.
import { query } from '../../db/index.js';
import { netString } from '../../lib/net.js';

const hasWhere = (sql) => sql.toLowerCase().includes('where');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "2024-04-23T08:00" -> "23-Apr-2024 08:00:00" (DateTime.Parse(x).ToString("dd-MMM-yyyy HH:mm:ss")). */
function dmyTime(text) {
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) throw new Error('String was not recognized as a valid DateTime.');
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Original page defaults: date variant = today (yyyy-MM-dd), Time/Adv = now (DateTime.Now.ToString("s")). */
export function defaults(spec, now = new Date()) {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const s = `${day}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return spec.variant === 'date' ? { from: day, to: day } : { from: s, to: s };
}

/**
 * Builds { text, params } for Refresh (search=false) or for the inner query of Search (search=true:
 * Time drops ORDER BY, Adv cuts GROUP BY at "order by", as the original search paths do).
 */
export function compose(spec, { bu, department, filter, from, to }, { search = false } = {}) {
  const t = spec.tag;
  if (t.length < 4) throw new Error('Index was outside the bounds of the array.'); // original Split('|')[3] on a short Tag
  let sql = t[0];
  const params = {};
  const buCond = t[1];
  const dateField = t[2];
  if (buCond.includes('<BU>')) {
    sql = `${sql} ${buCond.replaceAll('<BU>', '@bu')}`;
    params.bu = netString(bu);
  }
  if (spec.variant === 'adv') {
    const filterField = t[3].split('~')[0];
    if (filterField !== '' && filter) {
      sql += hasWhere(sql) ? ` and ${filterField}=@filter` : ` where ${filterField}=@filter`;
      params.filter = netString(filter);
    }
  } else if (t[3] !== '' && department) {
    sql += hasWhere(sql) ? ` and ${t[3]}=@dept` : ` where ${t[3]}=@dept`;
    params.dept = netString(department);
  }
  if (dateField !== '') {
    if (spec.variant === 'date') {
      sql += hasWhere(sql) ? ` and Cast(${dateField} as date)  between @from and @to` : `  where Cast(${dateField} as date)  between @from and @to`;
      Object.assign(params, { from: netString(from), to: netString(to) });
    } else if (spec.variant === 'time') {
      sql += hasWhere(sql) ? ` and ${dateField}  between @from and @to` : `  where ${dateField} between @from and @to`;
      Object.assign(params, { from: dmyTime(from), to: dmyTime(to) });
    } else {
      sql += hasWhere(sql) ? ` and ${dateField} between @from and @to` : `  where ${dateField} between @from and @to`;
      Object.assign(params, { from: netString(from), to: netString(to) });
    }
  }
  let groupBy = t.length > 4 ? t[4] : '';
  if (spec.variant === 'adv' && search && t.length > 4) groupBy = t[4].toLowerCase().split('order by').filter(Boolean)[0] ?? '';
  sql = `${sql} ${groupBy}`;
  if (spec.variant === 'time' && !search) sql = `${sql} ${t.length > 5 ? ` ${t[5]}` : ''}`;
  if (spec.variant === 'adv') sql = sql.replaceAll('dd-mmm-yyyy', 'dd-MMM-yyyy');
  return { text: sql, params };
}

/** Column name/type list (DDLColumns), via SQL Server's own description of the result set. */
export async function describeColumns(spec, inputs) {
  const { text, params } = compose(spec, inputs, { search: true });
  const declared = Object.keys(params).map((k) => `@${k} nvarchar(4000)`).join(', ');
  const rows = await query('exec sp_describe_first_result_set @tsql, @params', { tsql: text, params: declared || null });
  return rows.filter((r) => !r.is_hidden).map((r) => ({ name: r.name, type: typeFamily(r.system_type_name) }));
}

/** WrapperAvatar.DataType applied to SQL types: decides which search operators a column gets. */
function typeFamily(sqlType = '') {
  const t = sqlType.toLowerCase();
  if (/int/.test(t)) return 'integer';
  if (/^bit/.test(t)) return 'boolean';
  if (/decimal|numeric|money|float|real/.test(t)) return 'decimal';
  if (/date|time/.test(t)) return 'datetime';
  return 'string';
}

export const OPERATORS = {
  integer: [['=', 'Equals'], ['<>', 'Not Equals'], ['>', 'Greater Than'], ['<', 'Less Than']],
  decimal: [['=', 'Equals'], ['<>', 'Not Equals'], ['>', 'Greater Than'], ['<', 'Less Than']],
  boolean: [['=', 'Equals'], ['<>', 'Not Equals']],
  string: [['=', 'Equals'], ['<>', 'Not Equals'], ['like', 'Contains']],
  datetime: [['=', 'Equals'], ['<>', 'Not Equals'], ['>', 'Greater Than'], ['<', 'Less Than']],
};

/** AVViewControl.Search / SearchTotal: filter the report's own result set on one column. */
export function composeSearch(spec, inputs, columns, { column, op, value }) {
  const col = columns.find((c) => c.name === column);
  if (!col) throw new Error('Unknown column');
  if (!OPERATORS[col.type].some(([o]) => o === op)) throw new Error('Unknown operator');
  const inner = compose(spec, inputs, { search: true });
  const params = { ...inner.params };
  const name = `[${col.name.replaceAll(']', ']]')}]`;
  let where;
  if (col.type === 'string') {
    where = op === 'like' ? `${name} like @v` : `${name} ${op} @v`;
    params.v = op === 'like' ? `%${value}%` : netString(value);
  } else if (col.type === 'datetime') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error('String was not recognized as a valid DateTime.');
    where = `Cast(${name} as date) ${op} @v`;
    params.v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } else {
    where = `${name} ${op} @v`;
    params.v = netString(value);
  }
  return { text: `select * from (${inner.text}) as x where ${where}`, params };
}

/** Distinct values for the search dropdown (TBSerach). */
export async function distinctValues(spec, inputs, columns, column) {
  const col = columns.find((c) => c.name === column);
  if (!col) throw new Error('Unknown column');
  const { text, params } = compose(spec, inputs, { search: true });
  const rows = await query(`SELECT distinct [${col.name.replaceAll(']', ']]')}] v from  (${text}) as X`, params);
  return rows.map((r) => r.v);
}
