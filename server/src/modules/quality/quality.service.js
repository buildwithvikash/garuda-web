// AVQuality / AVHistory as used by the Quality pages. The original concatenated values into its SQL: numbers read
// from the database are checked and spliced the same way (same text, same errors); typed-in barcodes are parameters.
import { query, scalar } from '../../db/pool.js';
import { netInt } from '../../shared/net.js';
import { num } from '../../shared/sql.js';
import { cell } from '../forms/qc.js';
import { dataTable } from '../../db/tables.js';

export const STATUS = { Active: 1, Closed: 10, Hold: 11, Approved: 12, Rejected: 13 };

const str = (v) => (v === null || v === undefined ? '' : String(v)); // WrapperAvatar.ParseString
const strZero = (v) => (str(v) === '' || str(v) === '0' ? '' : str(v)); // ParseStringZero
const blank = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']))); // grid cells
const withQcColumns = (rows) => {
  for (const r of rows) for (const c of ['qcvalue', 'remark', 'qcstatus', 'InstrumentID']) if (cell(r, c) === undefined) r[c] = null;
  return rows;
};

/** AVQuality.GetUDList(inspectionLot): the material's inspection checklist */
export const udList = async (lot) => withQcColumns(await dataTable(`select * from ParameterTran where ParameterCode=(select InspectionCheckList from Material where MatCode=(select top 1 Material from InspectionHeader where InspectionLotNo=${num(lot)}))`));
/** AVQuality.SelfInspectionDetails (WRL) */
export const selfInspectionDetails = async (lot) => blank(await dataTable(`select m.Alias [MatCode],m.Name [Description], Qty,ApprovedQty,RejectedQty from InspectionHeader ih inner join Material m on ih.Material=m.MatCode where InspectionLotNo=${num(lot)}`));

/** AVHistory.VeiwComponents (WRL): the barcode's last completed process, and its self-inspection rejection */
export async function viewComponents(serial) {
  const barcode = netInt(await scalar('select BarcodeNo from materialBarcode where serial=@s', { s: serial }));
  if (barcode <= 0) throw new Error('Barcode No does not exist in database');
  const COLS = ['IDPlate', 'PSNo', 'Station', 'Operator', 'Process', 'ProcessOn', 'OrderNo', 'Material', 'Spec_Weight', 'Weight'];
  const processRows = [];
  const ps = await query("select pr.ProcessCode,pr.PSNo   from ProcessRouting pr inner join MaterialBarcode mb on pr.PSNo = mb.DocNo and mb.Serial =@s  and pr.Status =1", { s: serial });
  if (ps.length) {
    const pc = num(ps[0].ProcessCode);
    const rows = await query(`Select ph.Alias[OrderNo],wc.Name[Station],pp.Name[Process],pr.StartedOn[ProcessOn],u.UserName[Operator],mb.BarcodeNo,pr.PSNo  from MaterialBarcode mb inner join ProcessOrder po on po.PSNo = mb.DocNo inner join PRODHeader ph on po.PRODNo = ph.PRODNo  inner join ProcessRouting pr on mb.DocNo = pr.PSNo and pr.Status = 1 and pr.ProcessCode = ${pc} inner join ProcessActivity pa on pr.PSNo = pa.PSNo and pa.ActivityType = 1 and pa.ProcessCode = ${pc} inner join WorkCenter wc on wc.StationCode = pr.StationCode and pr.Status = 1 inner join ProductionProcess pp on pp.ProcessCode = pr.ProcessCode  and pr.ProcessCode = ${pc} inner join Users u on u.UserCode = pa.Operator   where mb.Serial = @s and mb.DocNo = ${num(ps[0].PSNo)}`, { s: serial });
    const p2 = (n) => String(n).padStart(2, '0');
    for (const r of rows) {
      const d = r.ProcessOn instanceof Date ? r.ProcessOn : null;
      if (!d) throw new Error('String was not recognized as a valid DateTime.');
      processRows.push({ ...Object.fromEntries(COLS.map((c) => [c, ''])), OrderNo: str(r.OrderNo), Station: str(r.Station), Process: str(r.Process), ProcessOn: `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)} ${p2(d.getHours())}:${p2(d.getMinutes())}`, Operator: str(r.Operator), PSNo: str(r.PSNo) });
    }
  }
  let qc = await dataTable(`Select u.UserName[InspectedBy],it.InspectedOn[RejectedOn],qn.Type[NextAction],nu.UserName[NCMRBy],it.NCMROn,au.UserName[ApprovedBy],it.ApprovedOn  from InspectionTrans it left join QCNextAction qn on it.NextAction=qn.ID   left join Users u on it.UserCode=u.UserCode left join Users au on it.ApprovedBy=au.UserCode and it.ApprovedBy != 0 left join Users nu on it.NCMRBy=nu.UserCode  where it.NextAction =1 and it.SampleBarcode=${barcode}`);
  if (qc.length) {
    const drop = [];
    if (strZero(qc[0].ApprovedBy) === '') drop.push('ApprovedBy', 'ApprovedOn', 'NextAction');
    if (strZero(qc[0].NCMRBy) === '') drop.push('NCMRBy', 'NCMROn');
    qc = qc.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
  }
  return { process: processRows, self: blank(qc) };
}

/** AVQuality.GetUDData(id, inspectionLot): the checklist with an inspection's recorded results */
export async function udData(id, lot) {
  const rows = await udList(lot);
  for (const d of await dataTable(`Select * from InspectionUD where ID=${num(id)}`)) {
    const r = rows.find((x) => str(cell(x, 'LineCode')) === str(cell(d, 'LineCode')));
    if (r) for (const [to, from] of [['qcvalue', 'LineValue'], ['remark', 'Remark'], ['qcstatus', 'Status'], ['InstrumentID', 'InstrumentID']]) r[Object.keys(r).find((k) => k.toLowerCase() === to.toLowerCase()) ?? to] = cell(d, from) ?? null;
  }
  return rows;
}

/** AVQuality.ValidateBarcodeRRF: a rejected barcode's open inspection for this action (1 rework, 2 repair, 3 finishing) */
export async function validateBarcodeRRF(serial, action) {
  const bar = await query(`select BarcodeNo,Serial, PackQty,InspectionLotNo,UDID,Department,QCStatus from MaterialBarcode where Serial=@s and QCStatus=${STATUS.Rejected}`, { s: serial });
  if (!bar.length) throw new Error('BarcodeNo Does Not Exist');
  // Rule fix (owner, 1 Nov): the newest unconfirmed inspection. The original took the first row, so a unit failed twice
  // had its older inspection confirmed again, which released it with the new failure still open.
  const id = str(await scalar(`Select top 1 ID from InspectionTrans where not Status=${STATUS.Approved} and NextAction=${action} and SampleBarcode=${num(bar[0].BarcodeNo)} order by case when ApprovedOn is null then 0 else 1 end, ID desc`));
  if (id === '') throw new Error('This is not for action');
  return { id, rtn: `${str(bar[0].BarcodeNo)}~${str(bar[0].Serial)}` };
}

/** AVQuality.ReworkHistory: the job card's earlier inspections with their defects and resolutions */
export const reworkHistory = async (serial) => blank(await dataTable("Select pp.Name[Process],dc.Name[Defect],rc.Type[RootCause],rr.Type[Resolution],it.ApprovedOn[ResolutionDate],us.UserName[User]  from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo =it.InspectionLotNo inner join InspectionDefect id on it.ID =id.ID inner join DefectCodeMaster dc on id.Defect=dc.Code inner join ProductionProcess pp on pp.ProcessCode =ih.Process left join RootCause rc on it.RootCause=rc.ID left join ReworkResolution rr on it.ReworkResolution =rr.ID left join Users us on  it.UserCode=us.UserCode    where ih.DocNo=(Select DocNo from MaterialBarcode where Serial=@s) ", { s: serial }));
