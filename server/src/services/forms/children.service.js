// Child-table controls of the engine: GridView (Tag "select…|ChildTable|FK|…", DataKeyNames = row key),
// TreeView (role → modules, Tag "UserRoleForm|…|RoleCode|…") and CheckBoxList (Tag "Table|Column|FK|options SQL").
import { query, queryTable } from '../../db/connection.js';
import { netString, netNum } from '../../shared/utils/net.js';
import { toText } from '../../shared/utils/values.js';

// Cell text as the BoundField showed it: value.ToString() by column type (time -> hh:mm:ss, decimal keeps scale).
// Keys follow the grid's DataField spelling: a BoundField finds its column case-insensitively (DataRow lookup).
async function textRows(sql, params, c) {
  const t = await queryTable(sql, params);
  const fields = (c?.columns ?? []).map((x) => x.dataField).filter(Boolean);
  const name = (n) => fields.find((f) => f.toLowerCase() === n.toLowerCase()) ?? n;
  return t.rows.map((r) => Object.fromEntries(t.columns.map((col) => [name(col.name), toText(r[col.name], { sqlType: col.type, scale: col.scale })])));
}

/** ControlA.SetGridView: "query where FK=-1" (normally no rows); ClearForm with "CLEAR" empties it. A failing
 *  query fails the page, as in the original. */
export async function gridInitial(c) {
  const [q, , cond] = c.tag;
  if (q.trim() === '' || cond.trim() === '') return [];
  return textRows(`${q} where ${cond}=-1 `, undefined, c);
}

/** AssignData: "query where FK= <pk> [order by <DataKey> asc]" (text as the GridView's BoundFields showed it). */
export async function gridRows(c, pkValue) {
  const [q, , cond] = c.tag;
  const key = (c.attrs.datakeynames ?? '').split(',')[0].trim();
  const sql = key ? `${q} where ${cond}= ${'@pk'} order by ${key} asc` : `${q} where ${cond}= @pk`;
  return textRows(sql, { pk: netString(pkValue) }, c);
}

/** ControlA.SetUserRoleTreeView: three levels of Modules. */
export async function roleTree() {
  // one query instead of the original's query per node; same order ("where ParentId=@p order by ModuleId,ParentId")
  const byParent = new Map();
  for (const r of await query('Select ModuleId,Caption,ParentId from Modules order by ModuleId,ParentId')) {
    const p = netString(r.ParentId);
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(r);
  }
  const level = (parent, depth) =>
    (byParent.get(netString(parent)) ?? []).map((r) => ({ value: netString(r.ModuleId), text: netString(r.Caption), children: depth < 2 ? level(r.ModuleId, depth + 1) : [] }));
  return level(0, 0);
}

// ---- The grid's DataTable (ViewState "TransData") as page code changes it -----------------------------------------
// Rows are kept as the text the BoundFields show; a value page code stores goes through the column's .NET type
// (DataRow[col] = value), so the grid then shows what the original showed (e.g. "10:30" -> "10:30:00").

const schemas = new Map();
/** Column types of a grid's query (DataTable filled by SqlDataAdapter). */
export async function gridSchema(c) {
  const [q, , cond] = c.tag;
  const sql = `${q} where ${cond}=-1 `;
  if (!schemas.has(sql)) schemas.set(sql, (await queryTable(sql)).columns.map((x) => ({ name: x.name, sqlType: x.type, scale: x.scale })));
  return schemas.get(sql);
}

const NET_TYPE = { int: 'Int32', bigint: 'Int64', smallint: 'Int16', tinyint: 'Byte', bit: 'Boolean', decimal: 'Decimal', numeric: 'Decimal', money: 'Decimal', smallmoney: 'Decimal', float: 'Double', real: 'Single', date: 'DateTime', datetime: 'DateTime', datetime2: 'DateTime', smalldatetime: 'DateTime', time: 'TimeSpan' };
const pad2 = (n) => String(n).padStart(2, '0');

/** DateTime.Parse on en-IN for the shapes these pages send (date inputs, dd-MM-yyyy with optional time). */
export function parseDate(s) {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) return new Date(+m[1], m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp][Mm]))?)?$/.exec(t);
  if (m) {
    let h = +(m[4] ?? 0);
    if (m[7]) h = (h % 12) + (/p/i.test(m[7]) ? 12 : 0);
    const d = new Date(+m[3], m[2] - 1, +m[1], h, +(m[5] ?? 0), +(m[6] ?? 0));
    if (d.getMonth() === m[2] - 1) return d;
  }
  // a time alone: today at that time
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([AaPp][Mm]))?$/.exec(t);
  if (m) {
    let h = +m[1];
    if (m[4]) h = (h % 12) + (/p/i.test(m[4]) ? 12 : 0);
    const n = new Date();
    if (h < 24 && +m[2] < 60 && +(m[3] ?? 0) < 60) return new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, +m[2], +(m[3] ?? 0));
  }
  throw new Error('String was not recognized as a valid DateTime.');
}

/** TimeSpan.Parse + TimeSpan.ToString() ("[-][d.]hh:mm:ss[.fffffff]"). */
function timeSpanText(s) {
  const t = s.trim();
  const m = /^(-)?(?:(\d+)|(?:(\d+)\.)?(\d+):(\d+)(?::(\d+)(?:\.(\d{1,7}))?)?)$/.exec(t);
  if (!m) throw new Error('String was not recognized as a valid TimeSpan.');
  if (m[2] !== undefined) return `${m[1] ?? ''}${Number(m[2])}.00:00:00`;
  const [d, h, mi, se] = [m[3], m[4], m[5], m[6] ?? '0'].map((x) => Number(x ?? 0));
  if (h > 23 || mi > 59 || se > 59) throw new Error('The TimeSpan could not be parsed because at least one of the numeric components is out of range or contains too many digits.');
  const frac = m[7] ? `.${m[7].padEnd(7, '0')}` : '';
  return `${m[1] ?? ''}${d ? `${d}.` : ''}${pad2(h)}:${pad2(mi)}:${pad2(se)}${frac}`;
}

/** Decimal.Parse (NumberStyles.Number) keeping the digits as written: "05.50" -> "5.50". */
function decimalText(s) {
  const t = s.trim().replace(/(\d),(?=\d)/g, '$1');
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (m[2] === '' && !m[3])) throw new Error('Input string was not in a correct format.');
  const int = m[2].replace(/^0+(?=\d)/, '') || '0';
  const out = m[3] !== undefined && m[3] !== '' ? `${int}.${m[3]}` : int;
  return m[1] === '-' && /[1-9]/.test(out) ? `-${out}` : out;
}

/** Text a cell shows after DataRow[col] = value; throws the ArgumentException DataColumn raises. */
export function cellText(col, value) {
  if (value === null || value === undefined) return ''; // DBNull
  const type = NET_TYPE[col.sqlType] ?? 'String';
  if (type === 'String') return typeof value === 'number' ? netNum(value) : netString(value);
  try {
    if (type === 'Boolean') {
      if (typeof value === 'boolean') return value ? 'True' : 'False';
      if (typeof value === 'number') return value !== 0 ? 'True' : 'False';
      const b = value.trim().toLowerCase();
      if (b === 'true' || b === 'false') return b === 'true' ? 'True' : 'False';
      throw new Error('String was not recognized as a valid Boolean.');
    }
    if (type === 'DateTime') return toText(value instanceof Date ? value : parseDate(String(value)), col);
    if (type === 'TimeSpan') return timeSpanText(String(value));
    if (typeof value === 'number') return type === 'Decimal' || type === 'Double' || type === 'Single' ? netNum(value) : String(Math.trunc(value));
    if (type === 'Decimal') return decimalText(value);
    if (type === 'Double' || type === 'Single') {
      const n = Number(decimalText(value));
      return netNum(n);
    }
    if (!/^\s*[+-]?\d+\s*$/.test(value)) throw new Error('Input string was not in a correct format.');
    return String(Number(value.trim()));
  } catch (e) {
    throw new Error(`${e.message}Couldn't store <${netString(value)}> in ${col.name} Column.  Expected type is ${type}.`);
  }
}

/** The grid's DataTable for page code: typed stores, Max over a column, rows kept as cell text. */
export async function gridTable(c, rows) {
  const cols = await gridSchema(c);
  const col = (name) => cols.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? { name, sqlType: 'nvarchar' };
  const key = (name) => Object.keys(rows[0] ?? {}).find((k) => k.toLowerCase() === name.toLowerCase()) ?? (c.columns.find((x) => x.dataField?.toLowerCase() === name.toLowerCase())?.dataField ?? col(name).name);
  return {
    rows,
    /** a new row: every column DBNull until set */
    newRow: () => Object.fromEntries(cols.map((x) => [key(x.name), ''])),
    set(row, name, value) {
      row[key(name)] = cellText(col(name), value);
    },
    get: (row, name) => row[key(name)] ?? '',
    /** Convert.ToInt32(dt.AsEnumerable().Max(r => r[name])): 0 for an empty table */
    max(name) {
      const v = rows.map((r) => r[key(name)]).filter((x) => x !== '' && x !== undefined).map(Number);
      return v.length ? Math.max(...v) : 0;
    },
  };
}

/** CollectUserRoleTreeView: checked nodes -> rows (note: a third-level node gets its own ID as ParentId, as in the original). */
export function treeRows(tree, checked) {
  const on = new Set((checked ?? []).map(String));
  const rows = [];
  for (const n of tree) {
    if (on.has(n.value)) rows.push({ RoleCode: 0, ModuleId: n.value, Caption: n.text, ParentId: 0 });
    for (const c of n.children) {
      if (on.has(c.value)) rows.push({ RoleCode: 0, ModuleId: c.value, Caption: c.text, ParentId: n.value });
      for (const g of c.children) if (on.has(g.value)) rows.push({ RoleCode: 0, ModuleId: g.value, Caption: g.text, ParentId: g.value });
    }
  }
  return rows;
}

/**
 * ComboBoxControl's picker. Opening (search null): the Tag query lower-cased with every "select " turned into
 * "Select top 2000 " plus the Tag condition (<BU> filled). Searching: the query as written plus "<field 1> like
 * '%text%'" (and "or <field 3> like …" when it has four fields); the condition is not applied, as in the original.
 * The text is a parameter here (the original concatenated it). Returns the grid's columns and cell text.
 */
export async function comboRows(c, businessUnit, search) {
  let sql;
  const params = {};
  if (search == null) {
    const lq = c.query.toLowerCase();
    sql = lq.includes('distinct') ? lq.replaceAll('select distinct', 'Select distinct top 2000 ') : lq.replaceAll('select ', 'Select top 2000 ');
    let cond = c.cond.replaceAll('$', '');
    if (cond.toLowerCase().includes('where') && cond.toUpperCase().includes('BU')) {
      cond = cond.replaceAll('<BUC>', '<BU>').replaceAll('<BUR>', '<BU>');
      sql = `${sql} ${cond.replaceAll('<BU>', netString(businessUnit))}`;
    } else if (cond.toLowerCase().includes('where')) sql = `${sql} ${cond}`;
  } else {
    const q = c.query;
    const field = q.toLowerCase().split('from')[0].split(',');
    const f1 = (field[1] ?? '').replaceAll('concat', '').replaceAll('(', '').trim();
    const f3 = (field[3] ?? '').replaceAll('concat', '').replaceAll(')', '').trim();
    const where = q.toLowerCase().includes('where');
    params.q = `%${search}%`;
    if (field.length === 4) sql = where ? `${q} and (${f1} like @q or ${f3} like @q)` : `${q} where ${f1} like @q or ${f3} like @q`;
    else sql = where ? `${q} and ${f1} like @q` : `${q} where ${f1} like @q`;
  }
  const t = await queryTable(sql, params);
  return { columns: t.columns.map((x) => x.name), rows: t.rows.map((r) => t.columns.map((x) => toText(r[x.name], { sqlType: x.type, scale: x.scale }))) };
}
