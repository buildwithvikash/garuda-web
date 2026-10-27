// SQL Server access: the pool and query / queryTable / scalar / execute. Every query is parameterized; SQL text
// otherwise matches the original. Transactions: db/tx.js.
import sql from 'mssql';
import { config } from '../config/env.js';

/** the Garuda database (server, name and login from .env) */
const poolOptions = {
  ...config.db,
  requestTimeout: 0, // original DataWrapper used CommandTimeout = 0
  options: { encrypt: false, trustServerCertificate: true, useUTC: false },
};

let pool;
let connecting;
function connect() {
  pool ??= new sql.ConnectionPool(poolOptions);
  return (connecting ??= pool.connect());
}

function bind(request, params) {
  // binary as varbinary(max): an empty Buffer otherwise gets an invalid inferred length
  for (const [name, value] of Object.entries(params)) (Buffer.isBuffer(value) ? request.input(name, sql.VarBinary(sql.MAX), value) : request.input(name, value));
  return request;
}

/** Rows of the first result set. */
export async function query(text, params = {}, tx = null) {
  await connect();
  const r = await bind((tx ?? pool).request(), params).query(text);
  return r.recordset ?? [];
}

/** Rows plus column metadata (name, SQL type, scale) in result order — for generic report grids. */
export const MAX_REPORT_ROWS = Number(process.env.MAX_REPORT_ROWS ?? 100_000);

export async function queryTable(text, params = {}, { maxRows = MAX_REPORT_ROWS, tx = null } = {}) {
  await connect();
  const req = bind((tx ?? pool).request(), params);
  req.arrayRowMode = true; // positional rows: unnamed / duplicate column names stay separate
  req.stream = true; // stream so an oversized result is cancelled instead of exhausting memory
  const r = await new Promise((resolve, reject) => {
    let meta = null;
    const rows = [];
    let tooMany = false;
    let sets = 0;
    req.on('recordset', (cols) => {
      sets++;
      if (!meta) meta = Array.isArray(cols) ? cols : Object.values(cols).sort((a, b) => a.index - b.index);
    });
    req.on('row', (row) => {
      // only the first result set, as SqlDataAdapter.Fill into one DataTable
      if (tooMany || sets > 1) return;
      rows.push(row);
      if (rows.length > maxRows) {
        tooMany = true;
        req.cancel();
        reject(new Error(`This report returns more than ${maxRows.toLocaleString('en-IN')} rows. Please narrow the filters (e.g. a shorter date range).`));
      }
    });
    req.on('error', (e) => {
      if (!tooMany) reject(e);
    });
    req.on('done', () => {
      if (!tooMany) resolve({ columns: [meta ?? []], recordset: rows });
    });
    req.query(text);
  });
  const meta = r.columns?.[0] ?? [];
  // ADO.NET (SqlDataAdapter.Fill) names unnamed columns Column1, Column2, ... and suffixes duplicates.
  let unnamed = 0;
  const seen = new Set();
  const columns = meta.map((c) => {
    let name = c.name || `Column${++unnamed}`;
    for (let n = 1; seen.has(name.toLowerCase()); n++) name = `${c.name || 'Column'}${n}`;
    seen.add(name.toLowerCase());
    return { name, type: c.type?.declaration ?? '', scale: c.scale ?? 0 };
  });
  const rows = (r.recordset ?? []).map((a) => Object.fromEntries(columns.map((c, i) => [c.name, a[i]])));
  return { columns, rows };
}

/** First column of the first row, or null (DataWrapper.ExecuteScalar). */
export async function scalar(text, params = {}, tx = null) {
  const rows = await query(text, params, tx);
  return rows.length ? Object.values(rows[0])[0] : null;
}

/** Rows affected (DataWrapper.ExecuteNonQuery). */
export async function execute(text, params = {}, tx = null) {
  await connect();
  const r = await bind((tx ?? pool).request(), params).query(text);
  return r.rowsAffected.reduce((a, b) => a + b, 0);
}

/** the connected pool (db/transaction.js starts its transactions on it) */
export const getPool = async () => (await connect(), pool);

export const dbReady = () => connect();
