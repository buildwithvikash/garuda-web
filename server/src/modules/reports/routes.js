import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { requireAuth } from '../../middleware/auth.js';
import { canOpen, userMenu } from '../menu/service.js';
import { query, queryTable } from '../../db/index.js';
import { netString } from '../../lib/net.js';
import { compose, composeSearch, defaults, describeColumns, distinctValues, OPERATORS } from './engine.js';
import { toGrid, enInDateTime } from './format.js';
import { sendXlsx } from './excel.js';

// Specs generated from the original pages (npm run extract-reports -w server). CEAT/TMEIC/Himile are out of scope (D2).
const ALL = JSON.parse(readFileSync(new URL('./reports.json', import.meta.url), 'utf8'));
const OUT_OF_SCOPE = /^\/(reports\/tmeicreports\/|reports\/ceat|himile\/)/;
export const REPORTS = Object.fromEntries(Object.entries(ALL).filter(([k]) => !OUT_OF_SCOPE.test(k)));

export const reportRoutes = Router();
reportRoutes.use(requireAuth);

async function load(req, res) {
  const path = netString(req.query.path ?? req.body?.path).toLowerCase();
  const spec = REPORTS[path];
  if (!spec) return void res.status(404).json({ message: 'Report not found' });
  const ok = spec.moduleId == null ? (await userMenu(req.session.userCode)).systemUser : await canOpen(req.session.userCode, spec.moduleId);
  if (!ok) return void res.status(403).json({ message: 'You do not have access to this screen' });
  return spec;
}

const inputsFrom = (req, spec) => {
  const b = req.body ?? {};
  const d = defaults(spec);
  return {
    bu: req.session.businessUnit,
    department: netString(b.department),
    filter: netString(b.filter),
    from: netString(b.from) || d.from,
    to: netString(b.to) || d.to,
  };
};

// Page_Load: title, which filters show, default dates, department / Adv filter lists, search columns.
reportRoutes.get('/spec', async (req, res, next) => {
  try {
    const spec = await load(req, res);
    if (!spec) return;
    if (spec.tag.length < 4) {
      return res.json({ title: spec.title, broken: 'This report fails to open in the existing application too (its definition is incomplete).' });
    }
    const t = spec.tag;
    const out = { title: spec.title, variant: spec.variant, showDates: t[2].trim() !== '', defaults: defaults(spec) };
    if (spec.variant === 'adv') {
      out.totalField = t.length > 5 ? t[5] : null;
      const filterSql = t[3].split('~')[1];
      if (t[3].trim() !== '' && filterSql) {
        const rows = await query(filterSql);
        out.filterOptions = rows.map((r) => ({ value: netString(Object.values(r)[0]), text: netString(Object.values(r)[1] ?? Object.values(r)[0]) }));
      }
    } else if (t[3].trim() !== '') {
      const rows = await query("Select DeptCode,CONCAT(Name, ' - ', Alias) as Name from Department where BusinessUnit =@bu", { bu: req.session.businessUnit });
      out.departments = rows.map((r) => ({ value: netString(r.DeptCode), text: netString(r.Name) }));
      const mine = netString(req.session.department);
      out.defaultDepartment = out.departments.some((d) => d.value === mine) ? mine : out.departments.length === 1 ? out.departments[0].value : '';
    }
    try {
      const cols = await describeColumns(spec, inputsFrom(req, spec));
      out.columns = cols.map((c) => ({ ...c, operators: OPERATORS[c.type] }));
    } catch {
      out.columns = [];
    }
    res.json(out);
  } catch (e) {
    next(e);
  }
});

async function runQuery(req, spec) {
  const inputs = inputsFrom(req, spec);
  const s = req.body?.search;
  if (s?.column) {
    const columns = await describeColumns(spec, inputs);
    return queryTable(...Object.values(composeSearch(spec, inputs, columns, { column: s.column, op: s.op, value: netString(s.value) })));
  }
  const { text, params } = compose(spec, inputs);
  return queryTable(text, params);
}

// Refresh (IMBRefresh) and Search (IMBSearch).
reportRoutes.post('/run', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    // ReportControlAdv only filled the grid when its Tag had a total column.
    if (spec.variant === 'adv' && spec.tag.length <= 5 && !req.body?.search?.column) return res.json({ columns: [], rows: [], total: null });
    const table = await runQuery(req, spec);
    const grid = toGrid(table);
    let total = null;
    if (spec.variant === 'adv' && spec.tag.length > 5) {
      const field = spec.tag[5];
      total = table.rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    }
    res.json({ ...grid, total });
  } catch (e) {
    // The original showed SQL errors as an alert; keep the message for the user, log details.
    console.error('report', spec.file, e.message);
    res.status(400).json({ message: e.message });
  }
});

reportRoutes.post('/distinct', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const inputs = inputsFrom(req, spec);
    const values = await distinctValues(spec, inputs, await describeColumns(spec, inputs), netString(req.body?.column));
    res.json(values.map((v) => (v instanceof Date ? enInDateTime(v) : netString(v))));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// BtnExcel_Click -> AExcelWrapper.CreateExcelDocument: header row, numbers as numbers, everything else as text.
reportRoutes.post('/xlsx', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const { columns, rows } = await runQuery(req, spec);
    await sendXlsx(res, spec.title, columns, rows.map((r) => columns.map((c) => r[c.name])));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});
