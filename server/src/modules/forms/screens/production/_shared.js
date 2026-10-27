// Helpers used by several screens of production (ported from the original pages' shared code).
import { scalar } from '../../../../db/pool.js';
import { netString, netInt } from '../../../../shared/net.js';
import { digitsOrEmpty, lit } from '../../../../shared/sql.js';
import { settingText } from '../../../settings/settings.service.js';
import { dataTable } from '../../../../db/tables.js';
import { validateWorkStation } from '../../../production/production.service.js';
import * as assignRepo from '../../../production-assignments/production-assignments.repo.js';
import { parseString, select } from '../_shared.js';

/** AVProcess.RMComponetDetails: the components scanned into the serial's job card */
export async function fgComponents(serial) {
  const rows = await dataTable("Select mc.Type[Category]  , m.Name[Material],w.Name[Process],pb.Serial, pb.PsNo,pb.RowID,pb.ProcessCode ,m.matCode  from ProcessInputBOMScan pb inner join ProductionProcess w on pb.processCode  =w.ProcessCode  inner join Material m on pb.Material=m.MatCode  left join MaterialCategoryType mc on m.Type =mc.ID where pb.PSNo=(Select DocNo from MaterialBarcode where Serial=@s)", { s: serial });
  if (!rows.length) throw new Error('Invaild Barcode Scanned');
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x ?? ''])));
}

export const htmlCell = (x) => (netString(x) === '' ? '&nbsp;' : netString(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'));

export const blankCells = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x ?? ''])));

/** LBGuideFiles_SelectedIndexChanged: the file shown in GuideFileDisplayPanel (pdf / dwg viewer / png) */
export function guideFile(value) {
  const url = value.startsWith('~/') ? value.slice(1) : /^([a-z]+:|\/)/i.test(value) ? value : `/View/Production/${value}`; // Page.ResolveUrl
  const kind = value.toLowerCase().includes('.pdf') ? 'pdf' : value.includes('.dwg') ? 'dwg' : value.toLowerCase().includes('.png') ? 'png' : null;
  return { guide: kind ? { kind, url } : null };
}

/** AVProductionCapture.ValidateWorkStation(ws, DDLDepartment, ...): WorkStationScan 1 finds the station in the BU
 *  (and selects its department), otherwise in the chosen department */
export async function guideStation(ws, v, h, out) {
  const bu = digitsOrEmpty(h.ctx.businessUnit);
  if (netInt(settingText('WorkStationScan', '1')) === 1) {
    const r = await validateWorkStation(ws, h.ctx.businessUnit);
    if (r.ok) await select(h, out, 'DDLDepartment', parseString(await scalar(`select Department from WorkCenter where stationcode=${digitsOrEmpty(r.rtn.split('~')[0])}`)));
    return r;
  }
  const dept = digitsOrEmpty(v.DDLDepartment);
  const digits = /^\d*$/.test(ws);
  const code = digits
    ? await scalar(`select Alias from WorkCenter where stationcode=${ws} and Department=${dept} and BusinessUnit=${bu}`)
    : await scalar(`select StationCode from WorkCenter where Alias=${lit(ws)} and Department=${dept} and BusinessUnit=${bu}`);
  if (parseString(code) === '') return { ok: false };
  const rtn = digits ? `${ws}~${parseString(code)}` : `${parseString(code)}~${ws}`;
  return { ok: true, rtn, process: parseString(await scalar(`select ProcessCode from WorkCenterProcesses where stationcode=${digitsOrEmpty(rtn.split('~')[0])}`)) };
}

/** AU.FillBarcodePrinterList(ddl, dept): the department's printers (the only one chosen) */
export async function deptPrinters(h, dept) {
  const options = await assignRepo.departmentPrinters(dept);
  return { options, index: options.length === 2 ? 1 : 0 };
}
