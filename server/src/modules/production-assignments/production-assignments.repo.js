// Production assignment (an order started stage-wise: job cards, stage labels, barcodes): the lookups the screen
// uses. SQL text is the original ProductionAssignmentForm's; codes are checked digits (shared/utils/sql.js) before
// they go into it. The job cards themselves are written by the screen's print handler (services/forms/pages.service.js
// btnPrint) in one transaction per piece, as the original did.
import { query, scalar } from '../../db/pool.js';
import { fill } from '../../db/options.js';
import { netInt, netLong, netNum, netDouble, netString } from '../../shared/net.js';
import { digitsOrEmpty } from '../../shared/sql.js';
import { dataTable } from '../../db/tables.js';

const parseString = (v) => (netString(v) === '&nbsp;' ? '' : netString(v));
const blankCells = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x ?? ''])));

/** the department's production orders with quantity left to assign (by PRODHeader.AssignedQty) */
export const openOrders = (dept) => fill(`Select ph.PRODNo, CONCAT(m.Name , ' - ', ph.PRODNo) as Name from PRODHeader ph inner join Material m on ph.Material=m.MatCode where ph.Qty>isnull(ph.AssignedQty,0) and ph.Status=1 and ph.Department =${digitsOrEmpty(dept)} order by PRODNo Desc`);
/** how much of the order is started: its job cards (Print writes one ProcessOrder row per piece) */
export const startedQty = async (prodNo) => netDouble(await scalar('select isnull(sum(Qty),0) from ProcessOrder where PRODNo=@k', { k: Number(prodNo) }));
/** the department's label printers */
export const departmentPrinters = (dept) => fill(`Select ROWID,Name from BarcodePrinter Where  Department=${netInt(dept)}`);

/** the order's material, unit, quantity and BOM (undefined when there is no such order) */
export const orderHeader = async (prodNo) => (await query(`Select Material,Uom,Qty,BOMCode from PRODHeader where PRODNo = ${digitsOrEmpty(prodNo)}`))[0];
/** the order's material and the routed components of its BOM (either can be started) */
export const orderMaterials = (prodNo) => fill(`Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where Matcode in(SELECT Material FROM PRODHeader where PRODNo=${digitsOrEmpty(prodNo)} UNION SELECT Material  FROM BOMInput where BOMCode=(Select BOMCode from PRODHeader where PRODNo=${digitsOrEmpty(prodNo)} ) and RoutingCode>0)`);
export const baseUom = async (matCode) => parseString(await scalar(`select BaseUom from Material where MatCode = ${digitsOrEmpty(matCode)}`));
/** the material's active variants */
export const variants = (matCode) => fill(`Select VariantCode,Name from VariantHeader where Type=3 and Status=1 and Material=${netLong(matCode)}`);

/** the routing's first stage-label process (the one an assignment starts at) */
export const firstStageProcess = (route) => fill(`Select top 1 pp.ProcessCode,pp.Name from RoutingTrans rt inner join ProductionProcess pp on rt.ProcessCode=pp.ProcessCode  where  rt.RouteCode=${digitsOrEmpty(route)} and  rt.StageLabel=1 order by rt.SeqNo Asc`);
/** the department's stations for a process */
export const stationsFor = (process, dept) => fill(`select wc.StationCode,wc.Name   from WorkCenter wc left join WorkCenterProcesses wp on wc.StationCode =wp.StationCode  where wp.ProcessCode=${digitsOrEmpty(process)} and wc.Department =${digitsOrEmpty(dept)}`);
/** quantity of the order's job cards started at a process */
export const assignedAtStage = async (prodNo, process) => netDouble(await scalar(`Select sum(po.qty) from ProcessOrder po inner join ProcessStageLabel psl on po.PSNo=psl.PSNo where po.PRODNo=${digitsOrEmpty(prodNo)} and psl.ProcessCode=${digitsOrEmpty(process)}`));

/** AVProcess.GetBOM(bom, qty): the BOM's input / output lines for qty */
export async function bomLines(bom, qty) {
  const b = digitsOrEmpty(bom);
  const base = netDouble(await scalar(`select BaseQty from BOMHeader where BOMCode=${b}`));
  const per = `Qty*${netNum(qty)}/${netNum(base)}[Qty]`;
  return {
    input: blankCells(await dataTable(`Select '0' as PSNo, BOMCode, RowID, Material, ${per}, Uom,bi.ProcessCode,m.Name[MaterialDesc],um.Name[UomDesc],p.Name[ProcessDesc],ScanReq,OutputScan,'0' as ConsumedQty,'0' as Status,'0' as Parameters,'0' as Task from BOMInput bi left join Material m on m.MatCode = bi.Material left join UnitOfMeasure um on um.UomCode = bi.Uom left join ProductionProcess p on p.ProcessCode = bi.ProcessCode where bi.BomCode=${b}`)),
    output: blankCells(await dataTable(`Select '0' as PSNo, BOMCode, RowID, Material, ${per}, Uom,bi.ProcessCode,m.Name[MaterialDesc],um.Name[UomDesc],p.Name[ProcessDesc],'0' as YieldQty,'0' as Status  from BOMOutput bi left join Material m on m.MatCode = bi.Material left join UnitOfMeasure um on um.UomCode = bi.Uom left join ProductionProcess p on p.ProcessCode = bi.ProcessCode where bi.BomCode=${b}`)),
  };
}

/** AVProcess.GetRoutingWithStationLine: the routing with each process' station (the chosen station's line, else the
 *  department, else any) */
export async function routeWithStations(route, dept, station) {
  const line = netInt(await scalar(`Select ManfLine  from WorkCenter where StationCode=${digitsOrEmpty(station)}`));
  const rows = blankCells(await dataTable(`select '0' as PSNo, RouteCode,SeqNo,pp.ProcessCode,'0' as StationCode,'' as StartedOn,'' as CompletedOn,pp.Name as Process,'' as Station,'0' as Status,rt.InspectionCheckList as ParameterCode,rt.SetupCheckList as SetupParameter from RoutingTrans rt left join ProductionProcess pp on rt.ProcessCode=pp.ProcessCode where RouteCode=${digitsOrEmpty(route)} order by SeqNo asc`));
  const first = async (where) => netInt(await scalar(`Select top 1 wp.StationCode from WorkCenterProcesses  wp inner join WorkCenter w on wp.StationCode=w.StationCode where ${where}`));
  for (const r of rows) {
    const p = digitsOrEmpty(r.ProcessCode);
    let code = 0;
    if (line > 0) code = await first(`wp.ProcessCode=${p}   and w.ManfLine=${line}`);
    if (code === 0) code = await first(`wp.ProcessCode=${p}   and w.Department=${digitsOrEmpty(dept)}`);
    if (code === 0) code = await first(`wp.ProcessCode=${p}`);
    r.StationCode = String(code);
    r.Station = parseString(await scalar(`Select Name from WorkCenter where StationCode=${code}`));
  }
  return rows;
}
