// API for the WRLReports pages that had their own code-behind (see wrlPages.js).
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { requireAuth } from '../../middleware/auth.js';
import { canOpen, userMenu } from '../menu/service.js';
import { query } from '../../db/index.js';
import { netString, netInt } from '../../lib/net.js';
import { WRL_REPORTS } from './wrlPages.js';
import { grid } from './table.js';
import { sendXlsx } from './excel.js';

export const wrlReportRoutes = Router();
wrlReportRoutes.use(requireAuth);

const moduleIds = new Map();
(function walk(ns) {
  for (const n of ns) {
    const m = /^View\/Reports\/WRLReports\/(\w+)\.aspx$/i.exec(n.url ?? '');
    if (m) moduleIds.set(m[1].toLowerCase(), n.moduleId);
    walk(n.children);
  }
})(JSON.parse(readFileSync(new URL('../menu/menu.json', import.meta.url), 'utf8')));

async function load(req, res) {
  const slug = netString(req.params.slug).toLowerCase();
  const page = WRL_REPORTS[slug];
  if (!page) return void res.status(404).json({ message: 'Report not found' });
  const moduleId = moduleIds.get(slug) ?? null;
  const ok = moduleId == null ? (await userMenu(req.session.userCode)).systemUser : await canOpen(req.session.userCode, moduleId);
  if (!ok) return void res.status(403).json({ message: 'You do not have access to this screen' });
  return page;
}

const options = (rows) => rows.map((r) => ({ value: netString(Object.values(r)[0]), text: netString(Object.values(r)[1] ?? Object.values(r)[0]) }));
const pad = (n) => String(n).padStart(2, '0');
const nowS = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Page_Load: filters and their lists.
wrlReportRoutes.get('/:slug/spec', async (req, res, next) => {
  try {
    const page = await load(req, res);
    if (!page) return;
    const out = { title: page.title, filters: page.filters, defaults: { from: nowS(), to: nowS() } };
    if (page.filters.includes('department')) {
      out.departments = options(await query("Select DeptCode,CONCAT(Name, ' - ', Alias) as Name from Department where BusinessUnit =@bu", { bu: netInt(req.session.businessUnit) }));
    }
    if (page.filters.includes('stage')) out.stages = options(await query('Select ProcessCode,Name from ProductionProcess where ProdcutionStage =2'));
    if (page.filters.includes('area')) out.areas = options(await query('select distinct Location from EMGMaster'));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

// ddlDepartment_SelectedIndexChanged -> AU.FillWorkCenter
wrlReportRoutes.get('/:slug/stations', async (req, res, next) => {
  try {
    if (!(await load(req, res))) return;
    const dept = netInt(req.query.department);
    const rows = dept === 0
      ? await query("Select StationCode, Concat (Name,' - ', Alias) as name  from WorkCenter where BusinessUnit=@bu", { bu: '0' })
      : await query("Select StationCode, Concat (Name,' - ', Alias) as name  from WorkCenter where Department=@dept", { dept });
    res.json(options(rows));
  } catch (e) {
    next(e);
  }
});

const inputs = (b = {}) => ({
  from: netString(b.from),
  to: netString(b.to),
  department: netString(b.department),
  station: netString(b.station),
  stage: netString(b.stage),
  area: netString(b.area),
  serial: netString(b.serial),
});

// BtnRefresh_Click
wrlReportRoutes.post('/:slug/run', async (req, res) => {
  const page = await load(req, res);
  if (!page) return;
  try {
    const out = await page.run(inputs(req.body));
    res.json({ tables: out.tables.map(grid), model: out.model ?? null });
  } catch (e) {
    console.error('report', req.params.slug, e.message);
    res.status(400).json({ message: e.message });
  }
});

// Excel(): the table kept in ViewState["DT"]
wrlReportRoutes.post('/:slug/xlsx', async (req, res) => {
  const page = await load(req, res);
  if (!page) return;
  try {
    const out = await page.run(inputs(req.body));
    const t = out.excel ?? out.tables[0];
    await sendXlsx(res, page.title, t.columns, t.rows);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});
