// Port of UserControl/ViewControl + Avatar.AVViewControl: the record list beside every engine form.
// Query source: ViewConfiguration.DisplayQuery for the table, else ViewPanel Tag[3], else "select * from <table>";
// Tag[2] is a <BU>/<DP> condition; Tag[1] the key (ROW_NUMBER ... DESC); Tag[5] an optional date column (last 30 days).
// The original upper-cases the whole statement before running it; kept, since it can change results.
import { query, scalar, queryTable } from '../../db/pool.js';
import { netString, netInt } from '../../shared/net.js';
import { tableSchema, engineType } from './schema.js';
import { toGrid } from '../../shared/format.js';

export const PAGE_SIZE = 10; // GridView default (ViewControl.ascx sets none)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const dMMMyyyy = (d) => `${pad(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}`;

const parts = (spec) => (spec.view?.tag ?? '').split('|');
const sub = (cond, ctx) => cond.replaceAll('<BU>', netString(ctx.businessUnit)).replaceAll('<DP>', netString(ctx.department));

async function viewConfig(table) {
  return (await query('Select DisplayQuery,NoOfRecord from ViewConfiguration where Module=@m', { m: table }))[0] ?? null;
}
async function hideColumns(table, ctx) {
  return netString(await scalar('Select HideColumns from UserViewConfig where Module=@m and UserCode=@u', { m: table, u: netString(ctx.userCode) }));
}

/** AVViewControl.Build_Query(sql, hideColumn, key): upper-cases and removes hidden columns from the select list. */
function buildQuery(sql, hide, key) {
  let q = sql.toUpperCase();
  const columns = q.split(',');
  const h = hide.toUpperCase().split(',');
  for (let j = 0; j < h.length - 1; j++) {
    if (h[j] === key.toUpperCase()) continue;
    for (const c of columns) {
      const s = c.split('.');
      if (s.length === 1) {
        if (s[0].toUpperCase() === h[j]) {
          q = q.replace(`${h[j]},`, '');
          break;
        }
      } else if (s[1].toUpperCase() === h[j]) {
        q = q.replace(`${c.toUpperCase()},`, '');
        break;
      }
    }
  }
  return q;
}

const rowNumber = (q, key) => q.toUpperCase().replace('SELECT ', ` SELECT ROW_NUMBER() over (ORDER BY ${key} DESC ) as [RecNo],`);

async function baseQuery(spec) {
  const p = parts(spec);
  const vc = await viewConfig(p[0]);
  return { vc, sql: vc ? netString(vc.DisplayQuery) : p[3] || `select * from ${p[0]}` };
}

/** Fill_Data / Fill_Data_V2 (initial): total count and the statement for a page. */
export async function listQuery(spec, ctx) {
  const p = parts(spec);
  const key = p[1];
  let { sql } = await baseQuery(spec);
  const cond = p[2] ?? '';
  if (p.length > 5) {
    // Fill_Data_V2 with the last 30 days on Tag[5]
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 30);
    if (p.length >= 6 && p[5].trim() !== '') {
      const range = `${p[5]} between '${dMMMyyyy(from)} 00:00:01' and '${dMMMyyyy(to)} 23:59:59'`;
      const l = sql.toLowerCase();
      if (l.includes(' where') && !l.includes(' order by')) sql = `${sql} and ${range}`;
      else if (l.includes(' where') && l.includes(' order by')) sql = l.replace(' order by', ` and ${range} order by `);
      else if (!l.includes(' where') && l.includes(' order by')) sql = l.replace(' order by', ` Where ${range} order by `);
      else sql = `${sql} where ${range}`;
    }
    const after = sql.toLowerCase().split(' from')[1];
    const stripped = sub(cond, ctx).replaceAll('where', '').replaceAll('Where', '').replaceAll('WHERE', '');
    const count = netInt(await scalar(sql.toLowerCase().includes(' where') ? `Select Count(1) from ${after} and ${stripped}` : `Select Count(1) from ${after} ${sub(cond, ctx)}`));
    if (cond.trim() !== '') sql = sql.toLowerCase().includes(' where') ? `${rowNumber(sql, key)} and ${stripped}` : `${rowNumber(sql, key)}${sub(cond, ctx)}`;
    sql = buildQuery(sql, await hideColumns(p[0], ctx), key);
    if (!sql.includes('ROW_NUMBER()')) sql = rowNumber(sql, key);
    return { count, sql };
  }
  const count = netInt(await scalar(`Select Count(1) from ${sql.toLowerCase().split(' from')[1]} ${sub(cond, ctx)}`));
  sql = buildQuery(`${rowNumber(sql, key)} ${sub(cond, ctx)}`, await hideColumns(p[0], ctx), key);
  if (!sql.includes('ORDER BY')) sql = `${sql} ORDER BY ${key} Desc`;
  return { count, sql };
}

/** One page of the list (RecNo between page*10+1 and page*10+10). The grid hides its last column (RowDataBound). */
export async function listPage(spec, ctx, page = 0, search = null) {
  let count;
  let sql;
  let params = {};
  if (search?.column) ({ count, sql, params } = await searchQuery(spec, ctx, search));
  else ({ count, sql } = await listQuery(spec, ctx));
  const from = page * PAGE_SIZE + 1;
  const t = await queryTable(`select * from ( ${sql}) as X where RecNo between @from and @to`, { ...params, from, to: from + PAGE_SIZE - 1 });
  const g = toGrid(t);
  const key = parts(spec)[1].split('.').at(-1).toUpperCase();
  const keyIdx = g.columns.findIndex((c) => c.name.toUpperCase() === key);
  const keys = g.rows.map((r) => (keyIdx >= 0 ? String(r[keyIdx]) : null));
  if (g.columns.length > 1) {
    g.columns.pop();
    g.rows.forEach((r) => r.pop());
  }
  return { ...g, keys, count, page, pageSize: PAGE_SIZE };
}

/** DDLColumns: table columns minus the user's hidden columns, with the engine type deciding the operators. */
export async function searchColumns(spec, ctx) {
  const p = parts(spec);
  const t = await tableSchema(p[0]);
  const hidden = (await hideColumns(p[0], ctx)).split(',').map((x) => x.toLowerCase());
  return t.columns.filter((c) => !hidden.includes(c.name.toLowerCase())).map((c) => ({ name: c.name, type: engineType(c.dotnet) || 'string' }));
}

const OPS = {
  integer: ['=', '<>', '>', '<'], decimal: ['=', '<>', '>', '<'], boolean: ['=', '<>'], string: ['=', '<>', 'like'], datetime: ['=', '<>', '>', '<'], date: ['=', '<>', '>', '<'], byte: [], '': [],
};
export const OPERATOR_TEXT = { '=': 'Equals', '<>': 'Not Equals', '>': 'Greater Than', '<': 'Less Than', like: 'Contains' };
export const operatorsFor = (type) => OPS[type] ?? [];

/** AVViewControl.Search (with viewPanel): ROW_NUMBER over the key, filtered on one column; value parameterized. */
async function searchQuery(spec, ctx, { column, op, value }) {
  const cols = await searchColumns(spec, ctx);
  const col = cols.find((c) => c.name.toLowerCase() === String(column).toLowerCase());
  if (!col) throw new Error('Unknown column');
  if (!operatorsFor(col.type).includes(op)) throw new Error('Unknown operator');
  const p = parts(spec);
  const { sql: base } = await baseQuery(spec);
  const inner = buildQuery(`${base} ${sub(p[2] ?? '', ctx)}`, await hideColumns(p[0], ctx), p[1]);
  const name = `[${col.name.replaceAll(']', ']]')}]`;
  let where;
  let v = netString(value);
  if (col.type === 'string') {
    where = op === 'like' ? `${name} like @v` : `${name} ${op} @v`;
    if (op === 'like') v = `%${v}%`;
  } else if (col.type.includes('date')) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error('String was not recognized as a valid DateTime.');
    where = `Cast(${name} as date) ${op} @v`;
    v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } else where = `${name} ${op} @v`;
  const sql = `select ROW_NUMBER() over (ORDER BY ${p[1]} DESC ) as [RecNo],* from (${inner}) as x where ${where}`;
  const count = netInt(await scalar(`Select count(*) from (${inner}) as x where ${where}`, { v })); // GetTotalCountSearch
  return { count, sql, params: { v } };
}

/** FillColumn_Data: distinct values of a column for the search dropdown. */
export async function distinctValues(spec, ctx, column) {
  const cols = await searchColumns(spec, ctx);
  const col = cols.find((c) => c.name.toLowerCase() === String(column).toLowerCase());
  if (!col) throw new Error('Unknown column');
  const p = parts(spec);
  const { sql } = await baseQuery(spec);
  const rows = await query(`SELECT  distinct [${col.name.replaceAll(']', ']]')}] v from  (${`${sql} ${sub(p[2] ?? '', ctx)}`.toUpperCase()}) as X`);
  return rows.map((r) => r.v);
}
