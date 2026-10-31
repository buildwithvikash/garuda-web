// AVProductionCapture as WIPCaptureForm uses it at WRL (department ControlIndicator 10000): the stage-label scan
// (ScanStageLabelNew) and what it calls. "dw" methods run in the caller's transaction (tx); the original's separate
// AU reads stay outside it. Values from the database are spliced as the original did (num); scanned text goes in as
// escaped varchar literals (lit), as its '...' concatenation did.
import { query, scalar, execute } from '../../db/pool.js';
import { transaction } from '../../db/tx.js';
import { netString, netInt, netLong, netDouble, netNum, netBool } from '../../shared/net.js';
import { pendingText } from './wip-words.js';
import { CUSTOMER, GRAPHICS, labelKind, variantValue } from './cabinet-view.js';
import { tableSchema } from '../forms/schema.js';
import { insert, generateKey } from '../forms/write.js';
import { num, lit } from '../../shared/sql.js';
import { validateVendorSerialNew, generateSerialNo } from './production.service.js';
import { printerDetail, printStageLabel, printLabel } from './labels.service.js';
import { dataTable } from '../../db/tables.js';
const parseString = (v) => (netString(v) === '&nbsp;' ? '' : netString(v));

const str = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v));
const NRE = () => new Error('Object reference not set to an instance of an object.');
const noRow = () => new Error('There is no row at position 0.');
const first = (rows) => {
  if (!rows.length) throw noRow();
  return rows[0];
};
/** DataRow[name]: column names are case-insensitive */
const ci = (row) => new Proxy(row, { get: (o, k) => (typeof k !== 'string' || k in o ? o[k] : o[Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())]) });
const q = async (sql, tx) => (await query(sql, {}, tx)).map(ci);
const sc = (sql, tx) => scalar(sql, {}, tx);
const ex = (sql, tx) => execute(sql, {}, tx);
const STATUS = { Active: 1, Closed: 10, Hold: 11, Approved: 12, Rejected: 13 };
const ACT = { Start: 1, Pause: 2, BreakDown: 3, Restart: 4, Complete: 5 };
const DOC_PROCESS_ORDER = 4001;
const ORDER_CANCELLED = 200;
/** Rule fix (owner, 21 Oct): the WIP QC remark (TBWQCRemark) is kept on the inspection; the original dropped it.
 *  None typed: no value, as before. */
const qcRemark = (r) => (netString(r).trim() === '' ? null : netString(r).trim().slice(0, 150));

/** Rule fix (owner, 21 Oct): no scan on a job card whose production order (PRODHeader) is on hold or cancelled. The
 *  original let such units through; the texts are reworded for the operator in shared/utils/messages.js. */
export async function assertOrderOpen(psNo, tx) {
  const status = netInt(await sc(`Select h.Status from ProcessOrder p inner join PRODHeader h on h.PRODNo=p.PRODNo where p.PSNo=${num(psNo)}`, tx));
  if (status === STATUS.Hold) throw new Error('Order is on hold');
  if (status === ORDER_CANCELLED) throw new Error('Order is cancelled');
}

/** a row of a table as NewRow + assignments (others DBNull) */
async function newRow(table, values) {
  const schema = await tableSchema(table);
  return { schema, prefix: '', rows: [new Map(Object.entries(values).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [schema.col(k)?.name ?? k, x]))] };
}

export const productionStageType = async (process, tx) => netInt(await sc(`Select ProdcutionStage from ProductionProcess where ProcessCode=${num(process)}`, tx));
export const isProcessStarted = async (ps, station, process, tx) => netInt(await sc(`Select Count(PSNo) from ProcessActivity where PSNo=${num(ps)} and StationCode=${num(station)} and ProcessCode=${num(process)}`, tx)) > 0;
export const inSerialMap = async (ps, process, tx) => netBool(await sc(`select Top 1 OutputScan from ProcessInputBOM where outputscan=1 and PSNo=${num(ps)} and ProcessCode=${num(process)}`, tx));
const nextProcess = async (ps, process, tx) => netLong(await sc(`Select Top 1 ProcessCode from ProcessRouting where PSNo= ${num(ps)}  and SeqNo>( Select SeqNo  from ProcessRouting where PSNo= ${num(ps)} and ProcessCode=${num(process)}) order by SeqNo asc`, tx));
/** NextProcessStageType (its own connection, outside the transaction) */
async function nextProcessStageType(ps, process) {
  const n = netInt(await sc(`Select Top 1 ProcessCode from ProcessRouting where PSNo= ${num(ps)}  and SeqNo>( Select SeqNo  from ProcessRouting where PSNo= ${num(ps)} and ProcessCode=${num(process)}) order by SeqNo asc`));
  return n > 0 ? netInt(await sc(`Select ProdcutionStage from ProductionProcess where ProcessCode=${n}`)) : 0;
}

/** ProcessStart(ps, station, process, dw): the first start (activity, routing started, next process, QC status by the
 *  routing's inspection parameter) or a restart */
async function startCommon(ps, station, process, user, tx) {
  const [p, s, c] = [num(ps), num(station), num(process)];
  if (netInt(await sc(`Select Count(PSNo) from ProcessActivity where PSNo=${p} and StationCode=${s} and ProcessCode=${c}`, tx)) === 0) {
    await sc(`select ProcessTime+MachineSetupTime[Ptime] from RoutingTrans where RouteCode=(select RouteCode from ProcessOrder where PSNo=${p}) and ProcessCode=${c}`, tx);
    return true;
  }
  await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn) values(${p},${s},${c},${user},${ACT.Restart},getdate())`, tx);
  await ex(`Update ProcessOrder set ActivityStatus=${ACT.Start} where PSNo=${p}`, tx);
  return false;
}
async function firstStart(ps, station, process, user, nextSql, tx) {
  const [p, s, c] = [num(ps), num(station), num(process)];
  await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn) values(${p},${s},${c},${user},${ACT.Start},getdate())`, tx);
  await ex(`Update ProcessRouting set Status=1, StartedOn=getdate() where PSNo=${p} and StationCode=${s} and ProcessCode=${c}`, tx);
  const next = str(await sc(await nextSql(), tx)); // read after the step is marked started
  const qcst = netInt(await sc(`Select ParameterCode from ProcessRouting where  StationCode = ${s} and  ProcessCode=${c} and PSNo=${p}`, tx)) > 0 ? STATUS.Hold : STATUS.Approved;
  await ex(`Update ProcessOrder set QCStatus=${qcst}, NextProcess=${next !== '' ? num(next) : 0},ActivityStatus=${ACT.Start} where PSNo=${p}`, tx);
}
export async function processStartDw(ps, station, process, ctx, tx) {
  const p = num(ps);
  const user = netInt(ctx.userCode);
  if (!(await startCommon(ps, station, process, user, tx))) return;
  await sc(`select RowID from WorkCenterCalander  where PSNo=${p} and StationCode=${num(station)} and ProcessCode=${num(process)}`, tx);
  const nextSql = async () => `select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=${netInt(await sc(`Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0`, tx))}`;
  await firstStart(ps, station, process, user, nextSql, tx);
}
/** AutoProcessStart: as ProcessStart, for the auto-processed step's logged-in user */
async function autoProcessStart(ps, station, process, user, tx) {
  const p = num(ps);
  if (!(await startCommon(ps, station, process, num(user), tx))) return;
  await firstStart(ps, station, process, num(user), async () => `select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0 )`, tx);
}

/** AVMM.UpdateLocation(location, barcode, StockAdd: true, dw) */
export async function updateLocationAdd(locationCode, barcode, tx) {
  const d = (await q(`Select * from MaterialBarcode where BarcodeNo = ${num(barcode)}`, tx))[0];
  if (!d) return false;
  const [m, batch, cArea, qty, uom, st] = [netInt(d.Material), netLong(d.Batch), netInt(d.Area), netDouble(d.CurrentQty), netInt(d.Uom), netInt(d.QCStatus)];
  const [hold, release, rejected] = [st === STATUS.Hold ? qty : 0, st === STATUS.Approved ? qty : 0, st === STATUS.Rejected ? qty : 0];
  const loc = num(locationCode);
  const area = netLong(loc) <= 0 ? netLong(d.Area) : netLong(await sc(`Select Area from StorageArea where StorageCode=${loc}`, tx));
  if (netDouble(await sc(`select Qty from MaterialStock where Material=${m} and StorageCode = ${loc} and Batch=${batch} and Area=${cArea}`, tx)) > 0) {
    await ex(`Update MaterialStock set Qty=qty+${netNum(qty)},HoldQty= HoldQty+${netNum(hold)},ReleasedQty=ReleasedQty+${netNum(release)} , RejectedQty=RejectedQty+${netNum(rejected)} where Material=${m}and StorageCode = ${loc} and Batch=${batch} and Area=${cArea}`, tx);
  } else {
    await ex(`insert into MaterialStock (StorageCode,Material,Batch,Qty,HoldQty,ReleasedQty,RejectedQty,Uom,Area,Department,BusinessUnit) values(${loc},${m},${batch},${netNum(qty)},${netNum(hold)},${netNum(release)},${netNum(rejected)},${uom},${area}, ${netInt(d.Department)},${netInt(d.BusinessUnit)})`, tx);
  }
  if (netLong(loc) > 0) await ex(`Update MaterialBarcode set Status=1,  StorageCode=${loc},Area=${area} where BarcodeNo = ${num(barcode)}`, tx);
  else await ex(`Update MaterialBarcode set Status=1,  StorageCode=${loc} where BarcodeNo = ${num(barcode)}`, tx);
  return true;
}

/** ScanInputMaterialBarcodeDw: a component barcode consumed (all or part) into the job card's input line */
export async function scanInputMaterialBarcode(ps, rowID, stage, station, barcodeNo, qty, machinary, serial, vmCode, ctx, tx) {
  const run = async (t) => {
    const d = (await q(`Select * from MaterialBarcode where  StorageCode>=0 and barcodeNo =${num(barcodeNo)}`, t))[0];
    if (!d) throw new Error('Barcode  is not valid');
    const barcode = str(d.BarcodeNo);
    const [m, batch, loc, cur, hu] = [netInt(d.Material), netLong(d.Batch), netInt(d.StorageCode), netDouble(d.CurrentQty), netInt(d.HUID)];
    const approved = netInt(d.QCStatus) === STATUS.Approved;
    const n = netNum(qty);
    await ex(`Update MaterialStock set Qty=qty-${n},ReleasedQty=ReleasedQty-${approved ? n : 0},RejectedQty=RejectedQty-${approved ? 0 : n} where Material=${m}  and  StorageCode=${loc}  and Batch=${batch}`, t);
    let loose = 0;
    if (cur === qty) await ex(`update Materialbarcode set HUID=0,StorageCode=-1 where CurrentQty=${n}  and BarcodeNo=${barcode}`, t);
    else {
      await ex(`update Materialbarcode set  CurrentQty=CurrentQty-${n} where  BarcodeNo=${barcode}`, t);
      loose = 1;
    }
    await ex(`Update ProcessInputBOM set ConsumedQty=ISNULL(ConsumedQty, 0 )+${n} where PSNo=${num(ps)}  and ProcessCode=${num(stage)} and RowID=${num(rowID)}`, t);
    const user = netInt(ctx.userCode);
    if (vmCode === '') await ex(`Insert into ProcessInputBOMScan (PSNo,ProcessCode,RowID,BarcodeNo,Qty,HU,Loose,Operator,ProcessingUnit,StationCode,Serial,Material) values (${num(ps)},${num(stage)},${num(rowID)},${barcode},${n},${hu},${loose},${user},${num(machinary)},${num(station)},${lit(serial)},${m})`, t);
    else await ex(`Insert into ProcessInputBOMScan (PSNo,ProcessCode,RowID,BarcodeNo,Qty,HU,Loose,Operator,ProcessingUnit,StationCode,Serial,VendorMatCode,Material) values (${num(ps)},${num(stage)},${num(rowID)},${barcode},${n},${hu},${loose},${user},${num(machinary)},${num(station)},${lit(serial)},${lit(vmCode)},${m})`, t);
    await ex(`update materialbarcode set ProcessCode=${num(ps)} ,WorkCenter =${num(station)} where barcodeNo=${barcode}`, t); // the job card number, as the original
    await ex(`update WorkCenter set Status=2 where StationCode=${num(station)} and OEE =1.00`, t);
    return true;
  };
  try {
    return tx ? await run(tx) : await transaction(run);
  } catch (e) {
    throw new Error(e.message);
  }
}

/** ProcessCompleteStage(ps, station, process, dw, serial): the stage completed, the auto-processed steps after it run
 *  for their logged-in users, the job card moved on (or closed, its barcode put to stock), and an inspection lot opened
 *  for a next QC stage. Any failure surfaces as a null reference (the original's log line reads ex.InnerException). */
export async function processCompleteStage(ps, station, process, barcodeSerial, ctx, tx, rowId = '0') {
  try {
    const p = num(ps);
    const line = netString(ctx.line ?? '0');
    let st = num(station);
    const c = num(process);
    const user = netInt(ctx.userCode);
    await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn,Remark) values(${p},${st},${c} , ${user},${ACT.Complete},getdate(),${lit(line)})`, tx);
    await ex(`Update ProcessRouting set Status=2, CompletedOn=getdate() where PSNo=${p} and StationCode=${st} and ProcessCode=${c}`, tx);
    const head = await q(`Select routing,QCStatus,MainPSNo from ProcessOrder where psno=${p}`, tx);
    let auto = 0;
    let skip = 0;
    const sk = await q(`select NoOfAutoProcess from AutoProcess where LineCode =${num(line)} and Process = ${c}`, tx);
    if (sk.length) {
      auto = netInt(sk[0].NoOfAutoProcess);
      skip = 1;
    } else auto = netInt(await sc(`select AutoProcessing from RoutingTrans where ProcessCode=${c} and RouteCode=(Select top 1 RouteCode  from ProcessRouting where psno =${p})`, tx));
    let skipStation = 0;
    for (let i = 1; i <= auto; i++) {
      const minSeq = netInt(await sc(`Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0`, tx));
      if (skip === 1) skipStation = netInt(await sc(`Select StationCode from ProcessRouting where  PSNo=${p} and SeqNo=${minSeq}`, tx));
      const nextAuto = str(await sc(`select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=${minSeq}`, tx));
      const login = await q(`Select top 1 * from ProcessUserLogin where Station=(Select top 1 StationCode  from WorkCenterProcesses where ProcessCode=${num(nextAuto)}) order by ROWID desc`, tx);
      let autoUser = '0';
      if (login.length) {
        st = String(netInt(login[0].Station));
        autoUser = String(netInt(login[0].UserCode));
      } else st = skip !== 1 ? '0' : String(skipStation);
      await autoProcessStart(ps, st, nextAuto, autoUser, tx);
      await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn,Remark) values(${p},${st},${num(nextAuto)} , ${autoUser},${ACT.Complete},getdate(),${lit(line)})`, tx);
      await ex(`Update ProcessRouting set Status=2, CompletedOn=getdate() where PSNo=${p} and StationCode=${st} and ProcessCode=${num(nextAuto)}`, tx);
    }
    const next = str(await sc(`select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0 )`, tx));
    if (auto > 0) await ex(`Update InspectionHeader set Process=${num(next)} where DocNo=${p} and DocType=${DOC_PROCESS_ORDER} and Process=${c} and Status=1`, tx);
    if (next !== '') await ex(`Update ProcessOrder set PrevProcess=${c}, NextProcess=0, CurrentProcess=${num(next)},ActivityStatus=0 where PSNo=${p}`, tx);
    else {
      await ex(`Update ProcessOrder set PrevProcess=${c}, NextProcess=0, CurrentProcess=0,ActivityStatus=0 , Status=${STATUS.Closed}  where PSNo=${p}`, tx);
      const h = first(head);
      await ex(`Update ProcessOrder Set QCStatus=${num(h.QCStatus)} Where PSNo=${num(h.MainPSNo)}`, tx);
      const d = first(await q(`select Department,BarcodeNo from ProcessOrder where PSNo=${p}`, tx));
      if (netInt(await sc(`select count(PSNo) from ProcessOutputBOMBarcode where PSNo=${p} and ProcessCode=${c} and StationCode=${st}`, tx)) === 0) {
        await ex(`update MaterialBarcode set ADepartment=${num(d.Department)}, StorageCode=0 where BarcodeNo=${netInt(d.BarcodeNo)}`, tx);
        await updateLocationAdd('0', String(netInt(d.BarcodeNo)), tx);
      }
    }
    await ex(`Update WorkCenterCalander Set ActualCompletedOn=getdate(),Status=2  where PSNo=${p} and StationCode=${st}`, tx);
    if (next === '') return;
    const psType = await sc(`Select ProdcutionStage from ProductionProcess where ProcessCode=${netLong(next)}`, tx);
    if (psType === null || psType === undefined) throw NRE();
    const already = netInt(await sc(`Select count(*) from InspectionHeader Where DocNo=${p} and Process=${num(next)} and Status=1`, tx));
    if (already <= 0 && ['2', '6', '8'].includes(str(psType))) {
      let dtM = await q(rowId !== '0' ? `Select * from ProcessOutputBOM where PSNO=${p} and ProcessCode=${c} and ROWID=${num(rowId)}` : `Select * from ProcessOutputBOM where PSNO=${p} and ProcessCode=${c}`, tx);
      if (!dtM.length) dtM = await q(`Select top 1 * from ProcessOutputBOM where Qty=YieldQty and  PSNO=${p} Order by ROWID Desc`, tx);
      const b = first(await q(`Select * from ProcessOrder where PSNo=${p}`, tx));
      const { key, prefix } = await generateKey('InspectionHeader', 1, netInt(b.BusinessUnit), tx);
      const lot = String(netInt(key));
      const now = new Date();
      now.setSeconds(0, 0);
      const m = dtM[0];
      const ds = await newRow('InspectionHeader', {
        InspectionLotNo: lot, Alias: `${prefix}${lot}`, DocType: DOC_PROCESS_ORDER, DocDate: now, DocNo: ps, Process: next,
        ...(m ? { Material: m.Material, Qty: m.YieldQty, Uom: m.Uom, DocLine: m.ROWID ?? m.RowID } : {}), Department: str(b.Department), BusinessUnit: str(b.BusinessUnit), Status: 1,
      });
      await insert(null, { tables: [ds] }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
      await ex(`Update Materialbarcode Set InspectionLotNo=${lot}, QCStatus=${STATUS.Hold} where DocNo=${p} and Serial=${lit(barcodeSerial)}`, tx);
    }
  } catch {
    throw NRE();
  }
}

const shiftNow = async (tx) => {
  let shift = netInt(await sc('select ShiftCode from Shift where Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)', tx));
  if (shift === 0) shift = netInt(await sc('select ShiftCode from Shift where (starttime>Endtime) and ((Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime<=CONVERT (TIME, CURRENT_TIMESTAMP)) or (Starttime>CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)))', tx));
  return shift;
};
const addMonths = (d, n) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};
const secondsOnly = (d) => {
  const x = new Date(d);
  x.setMilliseconds(0);
  return x;
};

/** CreateBarcode(process, normal, serial, pack, weight, printer, dw): an output barcode per pack for the job card's
 *  output line (inspection lot / batch when the material or next stage needs one), its yield, plan quantity, stock
 *  and, with AutoIN, its input scan at the next process. Label printing (serial logic > 1, a printer) is not ported:
 *  the stage-label scan passes no printer. */
export async function createBarcodeDw(psObj, nObj, sObj, pObj, wObj, printer, ctx, tx) {
  const ps = num(psObj.PSNo);
  const pc = num(psObj.ProcessCode);
  const proc = await q(`Select PRODNo,BusinessUnit,Department,AssignDate from ProcessOrder  where PSNo=${ps}`, tx);
  let mat = await q(`Select pb.RowID,m.Alias,m.Name, pb.Qty,pb.YieldQty,u.Alias[Unit],pb.Uom,pb.Material,pb.AutoIn from ProcessOutputBOM pb inner join Material m on pb.Material=m.MatCode inner join UnitOfMeasure u on pb.Uom =u.UomCode where  pb.PSNo=${ps} and pb.ProcessCode=${pc} and pb.RowID=${num(psObj.RowID)}`, tx);
  const hold = await q(`select MinHoldPeriod,MaxHoldPeriod,inspectionCheckList from RoutingTrans r inner join ProcessRouting  p on r.RouteCode=p.RouteCode and r.ProcessCode=p.ProcessCode and p.PSNo=${ps} and p.ProcessCode=${pc}`, tx);
  const left = netDouble(await sc(`Select (Qty-YieldQty)[Qty] from ProcessOutputBOM where PSNo=${ps} and ProcessCode=${pc}`, tx));
  if (left < nObj.Qty) throw new Error(`Quantity Exceeded by ${netNum(nObj.Qty - left)}`);
  let autoInColumn = true;
  if (!mat.length) {
    mat = await q(`select '1' as ROWID,m.Alias,m.Name, pb.Qty,pb.YieldQty,u.Alias[Unit],pb.Uom,pb.Material from ProcessOrder pb inner join Material m on pb.Material=m.MatCode inner join UnitOfMeasure u on pb.Uom =u.UomCode where pb.PSNo=${ps}  and pb.CurrentProcess=${pc}  and pb.NextProcess=0`, tx);
    autoInColumn = false;
  }
  const m = first(mat);
  const rowIdOf = (r) => r.RowID ?? r.ROWID;
  const p = first(proc);
  const cfg = first(await q(`select Batch,SupBatch,ManDate,GrossWeight, Serial, Expiry, ExipiryMonths, isPacket,CaptureMrp,Track,IsInspectionReq,InspectionType,[PurchaseUnit],VariantCode,[type],RetestIn from Material where MatCode=${num(m.Material)}`, tx));
  const bu = netInt(p.BusinessUnit);
  const tables = {};
  for (const t of ['MaterialBarcode', 'ProcessYieldPacks', 'ProcessYieldSerial', 'MaterialBatch', 'InspectionHeader', 'ProcessOnlineRejection']) tables[t] = { schema: await tableSchema(t), prefix: '', rows: [] };
  const put = (t, values) => {
    const s = tables[t].schema;
    const row = new Map(Object.entries(values).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [s.col(k)?.name ?? k, x]));
    tables[t].rows.push(row);
    return row;
  };
  let lot = 0;
  let retest = 0;
  let batchno = 0;
  const checklist = netInt(first(hold).inspectionCheckList);
  if (netBool(cfg.IsInspectionReq) || checklist > 0 || (await nextProcessStageType(psObj.PSNo, psObj.ProcessCode)) === 2) {
    const { key, prefix } = await generateKey('InspectionHeader', 1, bu, tx);
    lot = netInt(key);
    put('InspectionHeader', {
      InspectionLotNo: String(lot), Alias: `${prefix}${lot}`, DocType: DOC_PROCESS_ORDER, DocDate: p.AssignDate, DocNo: psObj.PSNo, DocLine: psObj.RowID,
      Process: checklist > 0 || netBool(cfg.IsInspectionReq) ? psObj.ProcessCode : await nextProcess(psObj.PSNo, psObj.ProcessCode, tx),
      Material: str(m.Material), InspectionType: checklist > 0 ? 300 : cfg.InspectionType, Qty: nObj.Qty, Uom: str(m.Uom), Department: p.Department, BusinessUnit: p.BusinessUnit, Status: 1,
    });
    retest = netInt(cfg.RetestIn);
  }
  if (netBool(cfg.Batch)) {
    const { key, prefix } = await generateKey('MaterialBatch', 1, bu, tx);
    batchno = netLong(key);
    const now = new Date();
    put('MaterialBatch', { BatchNo: batchno, DocNo: psObj.PSNo, Batch: `${prefix}${batchno}`, Material: str(m.Material), ManufDate: now, RetestDate: addMonths(now, retest), ExpiryDate: addMonths(now, netInt(cfg.ExipiryMonths)), InspectionLot: lot, Status: '1' });
  }
  const packLine = netInt(await sc(`select max(PackingLineCode) from ProcessYieldPacks where PSNo=${ps} and RowID=${num(rowIdOf(m))}`, tx)) + 1;
  put('ProcessYieldPacks', { PSNo: psObj.PSNo, ProcessCode: psObj.ProcessCode, RowID: rowIdOf(m), PackingLineCode: packLine, NoOfPacks: pObj.NoOfPacks, PackQty: pObj.PackQty, Uom: pObj.Uom });
  if (netString(sObj.SerialNo) !== '') {
    const line = netInt(await sc(`select max(SerialLineCode) from ProcessYieldSerial  where PSNo=${ps} and PSLineCode=${num(rowIdOf(m))}`, tx)) + 1;
    put('ProcessYieldSerial', { PSNo: psObj.PSNo, ProcessCode: psObj.ProcessCode, SerialLineCode: line, PSLineCode: rowIdOf(m), PackingLineCode: packLine, SerialNo: sObj.SerialNo, Status: 1 });
  }
  let bNo = '0';
  const created = new Date();
  created.setMilliseconds(0);
  const holdRow = hold[0];
  for (let i = 1; i <= pObj.NoOfPacks; i++) {
    const { key, prefix } = await generateKey('MaterialBarcode', 1, bu, tx);
    const no = netInt(key);
    bNo = String(no);
    let serial;
    if (netString(sObj.SerialNo).trim() !== '') serial = sObj.SerialNo;
    else if (sObj.SerialLogic > 1) throw new Error('A generated serial (serial logic > 1) is not ported for this capture');
    else serial = no;
    put('MaterialBarcode', {
      BarcodeNo: no, Alias: `${prefix}${no}`, DocType: DOC_PROCESS_ORDER, DocNo: psObj.PSNo, DocLine: psObj.RowID, Material: m.Material, Type: cfg.type, Serial2: String(i), Serial: serial,
      VSerial: sObj.IDN ?? null, Batch: batchno, PackQty: pObj.PackQty, CurrentQty: pObj.PackQty, Uom: pObj.Uom, IssuedQty: 0, WeighingScale: wObj.WeighingScale ?? 0, GrossWeight: wObj.GrossWeight ?? 0,
      TareWeight: wObj.TareWeight ?? 0, NetWeigh: wObj.NetWeight ?? 0, WeightUom: wObj.WeightUom ?? 0, Employee: 0, BusinessUnit: p.BusinessUnit, Department: p.Department, ABusinessUnit: p.BusinessUnit,
      ADepartment: p.Department, Area: 0, StorageCode: 0, StockID: 0, InspectionLotNo: lot, CreatedOn: created, PrintStatus: 0, LooseStatus: 0, Sample: 0, ProcessCode: psObj.ProcessCode, HUID: psObj.HU,
      ...(holdRow ? { LastMaintained: secondsOnly(new Date(Date.now() + netInt(Object.values(holdRow)[0]) * 60000)), NextMaintaince: secondsOnly(new Date(Date.now() + netInt(Object.values(holdRow)[1]) * 60000)) } : {}),
      QCStatus: lot > 0 ? STATUS.Hold : sObj.QCStatus, ForDocNo: netInt(p.PRODNo), Status: STATUS.Active,
    });
  }
  if (sObj.QCStatus === STATUS.Rejected) {
    const { key } = await generateKey('ProcessOnlineRejection', 1, bu, tx);
    const b0 = tables.MaterialBarcode.rows[0];
    const sch = tables.MaterialBarcode.schema;
    put('ProcessOnlineRejection', { RefID: netInt(key), PSNo: psObj.PSNo, ProcessCode: psObj.ProcessCode, Station: psObj.StationCode, RowID: psObj.RowID, BarcodeNo: b0.get(sch.col('BarcodeNo').name), Qty: 1, Uom: b0.get(sch.col('Uom').name), Loose: false, Operator: netInt(ctx.userCode), ScannedOn: new Date(), Remark: sObj.QCRemark ?? null });
  }
  try {
    if (sObj.inSerialMap) {
      await ex(`INSERT INTO MConsumedBarcode Select * from MaterialBarcode where Serial=${lit(sObj.SerialNo)}`, tx);
      await ex(`Delete from MaterialBarcode where Serial=${lit(sObj.SerialNo)}`, tx);
    }
    const plainCtx = { ...ctx, businessUnit: 0, userCode: bu };
    await insert(null, { tables: Object.values(tables) }, plainCtx, { plain: true, tx });
    const shift = await shiftNow(tx);
    const plan = netInt(await sc(`select RefID from ProductionPlan where Format(PDate,'dd-MMM-yyyy')=FORMAT(getdate(),'dd-MMM-yyyy') and [Shift]=${shift} and WorkCenter=${num(psObj.StationCode)} and Material=${num(m.Material)}`, tx));
    if (plan > 0) await ex(`update  ProductionPlan set AchievedQty=AchievedQty+${netNum(pObj.PackQty)} where RefID=${plan}`, tx);
    else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ds = await newRow('ProductionPlan', { RefID: 0, Alias: '', BusinessUnit: p.BusinessUnit, Department: p.Department, WorkCenter: psObj.StationCode, PDate: today, Shift: shift, Material: m.Material, PlannedQty: 0, AchievedQty: pObj.PackQty, Uom: pObj.Uom });
      await insert(null, { tables: [ds] }, plainCtx, { plain: true, tx });
    }
    if (sObj.inSerialMap) await ex(`Update MaterialBarcode Set PrintStatus=1 where Serial=${lit(sObj.SerialNo)}`, tx);
    await ex(`Update ProcessOutputBOM set YieldQty=YieldQty+${netNum(nObj.Qty)} where PSNo=${ps} and ProcessCode=${pc}`, tx);
    const sch = tables.MaterialBarcode.schema;
    for (const r of tables.MaterialBarcode.rows) {
      const bar = str(r.get(sch.col('BarcodeNo').name));
      await ex(`Insert into  ProcessOutputBOMBarcode(PSNo,ProcessCode,RowID,BarcodeNo,Qty,Operator,HU,CreatedOn,StationCode,ProcessingUnit,Serial,shift) Values(${ps},${pc},${num(psObj.RowID)},${bar},${netNum(netDouble(r.get(sch.col('CurrentQty').name)))},${netInt(ctx.userCode)},${num(psObj.HU)},getdate(),${num(psObj.StationCode)},${num(nObj.machinary)},${lit(sObj.SerialNo)},${shift})`, tx);
      await ex(`update materialbarcode set ProcessCode=0 where barcodeNo=${num(nObj.machinary)}`, tx);
      await updateLocationAdd('0', bar, tx);
    }
    if (!autoInColumn) throw new Error("Column 'AutoIN' does not belong to table .");
    if (netInt(m.AutoIn) === 1) {
      const auto = await q(`select * from Processinputbom where PSno=${ps} and Material=${num(m.Material)} and ProcessCode=(select NextProcess from ProcessOrder where PsNo=${ps})`, tx);
      if (auto.length) {
        const nextStation = str(await sc(`select StationCode from ProcessRouting where ProcessCode=${num(auto[0].ProcessCode)} and PSno=${ps}`, tx));
        await scanInputMaterialBarcode(psObj.PSNo, str(auto[0].RowID), str(auto[0].ProcessCode), nextStation, bNo, 1, '0', sObj.SerialNo, '', ctx, tx);
      }
    }
  } catch (e) {
    throw new Error(e.message);
  }
  if (sObj.inSerialMap || sObj.SerialLogic <= 1 || netString(printer) === '') return;
  throw new Error('Output label printing from the capture is not ported');
}

/** MaterialConfiguration(material, dw) */
const materialConfiguration = async (material, tx) => first(await q(`select Batch,SupBatch,ManDate,GrossWeight, Serial, Expiry, ExipiryMonths, isPacket,CaptureMrp,Track,IsInspectionReq,InspectionType,[PurchaseUnit],VariantCode,[type],TrackNoType from Material where MatCode=${num(material)}`, tx));

/** Where a unit is when its scan is refused with "Pending Process- <name>" (read only): this station's stage, the unit's
 *  next pending stage, and whether this stage is already done for it, later in its route, or not in it at all.
 *  { title, text } in plain words for the operator; null when the unit or station is not known. */
export async function explainPending(barcodeStage, station) {
  const ps = await q(`Select top 1 PSNo from ProcessStageLabel where BarcodeNo=${lit(barcodeStage)}`);
  if (!ps.length || !/^\d+$/.test(str(station))) return null;
  const psNo = num(ps[0].PSNo);
  const [here] = await q(`Select top 1 wp.ProcessCode, pp.Name from WorkCenterProcesses wp left join ProductionProcess pp on pp.ProcessCode=wp.ProcessCode where wp.StationCode=${num(station)}`);
  if (!here) return null;
  const route = await q(`Select pr.ProcessCode, pr.Status, pr.SeqNo, pp.Name from ProcessRouting pr left join ProductionProcess pp on pp.ProcessCode=pr.ProcessCode where pr.PSNo=${psNo} order by pr.SeqNo`);
  return pendingText({ code: str(here.ProcessCode), name: str(here.Name) }, route.map((r) => ({ code: str(r.ProcessCode), name: str(r.Name), status: netInt(r.Status) })));
}


/** ScanStageLabelNew(barcode, station, printer): the stage-label (serial) scanned at a station. Returns { code, rows }:
 *  -1 another station's stage, 30 / 40 a QC / FG-label stage (started), 10 more inputs to scan, 11 inputs done,
 *  20 output still to capture, 21 stage completed, 1 nothing to do. rows: [{ PsNo, Process, Station, RowID }]. */
export async function scanStageLabelNew(barcodeStage, station, printer, ctx) {
  const b = lit(barcodeStage);
  const ps = await q(`Select * from ProcessStageLabel where BarcodeNo=${b}`);
  if (!ps.length) throw new Error('Invalid barcode/Not for this Station');
  const scrap = await q(`Select Status,QCStatus from MaterialBarcode where Serial=${b}`);
  if (scrap.length) {
    if (netInt(scrap[0].Status) === 99) throw new Error('This is Scrapped');
    if (netInt(scrap[0].QCStatus) === STATUS.Rejected) throw new Error('This is Rejected');
  }
  const st = num(station);
  const pros = str(await sc(`Select top 1 ProcessCode  from WorkCenterProcesses where StationCode=${st}`));
  const p0 = ps[0];
  await assertOrderOpen(p0.PSNo);
  if (netInt(p0.StationCode) > 0 && pros === str(p0.ProcessCode) && str(p0.StationCode) !== station) return { code: -1, rows: [] };
  const rows = [{ PsNo: str(p0.PSNo), Process: pros, Station: station, RowID: '0' }];
  const psNo = num(p0.PSNo);
  const minSeq = netInt(await sc(`Select Min(SeqNo) from ProcessRouting Where (Status=0 or Status=1) and PSno=${psNo}`));
  const routing = await q(`Select * from ProcessRouting where PSno=${psNo} and StationCode=${st} and ProcessCode=${num(pros)} and SeqNo=${minSeq}`);
  if (!routing.length) {
    const pending = str(await sc(`Select top 1 pp.Name  from ProcessRouting pr inner join ProductionProcess pp on pr.processCode=pp.processCode and pr.Status in(0,1) and psno=${psNo} order by pr.SeqNo`));
    throw new Error(`Pending Process- ${pending}`);
  }
  const r = routing[0];
  const [rPs, rStation, rProc] = [str(r.PSNo), str(r.StationCode), str(r.ProcessCode)];
  // the barcode's own input line (if it is one of the stage's components), then what is left of the inputs
  const consumeSelf = async (tx, missing) => {
    const mb = await q(`Select * from materialbarcode where Serial=${b}`, tx);
    if (!mb.length) throw missing();
    const bin = await q(`Select * from ProcessInputBOM where Qty>ConsumedQty and PSno=${psNo} and ProcessCode=${num(pros)} and Material=${num(mb[0].Material)}`, tx);
    if (bin.length) await scanInputMaterialBarcode(str(bin[0].PsNo), str(bin[0].RowID), pros, rStation, str(mb[0].BarcodeNo), 1, '0', barcodeStage, '', ctx, tx);
    return netDouble(await sc(`Select (Qty-ConsumedQty) from ProcessInputBOM where Qty>ConsumedQty  and PSno=${psNo} and ProcessCode=${num(pros)}`, tx));
  };
  try {
    const code = await transaction(async (tx) => {
      const status = str(r.Status);
      if (status === '2') throw new Error('Process Already Completed');
      if (status === '0') {
        const t = await productionStageType(rProc, tx);
        if (t === 2 || t === 6 || t === 8) {
          if (!(await isProcessStarted(rPs, rStation, rProc, tx))) await processStartDw(rPs, rStation, rProc, ctx, tx);
          return t === 6 ? 40 : 30;
        }
        // ponytail: stage type 7 (re-serial + stage label print) has no process at WRL; port it if one is set up
        if (t === 7) throw new Error('Stage type 7 is not ported');
        await processStartDw(rPs, rStation, rProc, ctx, tx);
        return (await consumeSelf(tx, noRow)) > 0 ? 10 : 11;
      }
      if (status === '1') {
        const t = await productionStageType(rProc, tx);
        if (t === 2 || t === 8) return 30;
        if (t === 6) return 40;
        if ((await consumeSelf(tx, () => new Error('Incorrect Barcode'))) > 0) return 10;
        const out = await q(`Select * from ProcessOutputBOM where qty>YieldQty and PSno=${psNo} and ProcessCode=${num(pros)}`, tx);
        if (out.length) {
          const cfg = await materialConfiguration(str(out[0].Material), tx);
          const uom = netInt(out[0].Uom);
          await createBarcodeDw(
            { PSNo: netInt(p0.PSNo), RowID: netInt(out[0].RowID), ProcessCode: netInt(pros), StationCode: netInt(rStation), HU: 0 },
            { Qty: 1, Uom: uom, machinary: '0' },
            { SerialNo: barcodeStage, inSerialMap: await inSerialMap(p0.PSNo, pros, tx), QCStatus: STATUS.Approved, SerialLogic: netInt(cfg.TrackNoType), IsSerial: netBool(cfg.Serial), IDN: null },
            { NoOfPacks: 1, PackQty: 1, Uom: uom },
            {},
            printer,
            ctx,
            tx,
          );
        }
        if (netDouble(await sc(`Select (Qty-YieldQty) from ProcessOutputBOM where Qty>YieldQty  and PSno=${psNo} and ProcessCode=${num(pros)}`, tx)) > 0) return 20;
        await processCompleteStage(rPs, rStation, rProc, barcodeStage, ctx, tx);
        return 21;
      }
      return 1;
    });
    return { code, rows };
  } catch (e) {
    throw new Error(e.message);
  }
}

/** StageRMScanValidate: a component serial for the job card's stage: a barcode in stock (QC approved), or a vendor
 *  serial matching one of the stage's materials (then a barcode is created for it). */
export async function stageRMScanValidate(psNo, process, serial, ctx) {
  await assertOrderOpen(psNo);
  const s = lit(serial);
  if (str(await sc(`Select Serial from ProcessInputBOMSCan where Serial=${s} AND ProcessCode =${num(process)}`)) === serial) throw new Error('Already Scanned');
  const bar = await q(`Select BarcodeNo,Material,CurrentQty,QCStatus,StorageCode, uom ,DocNo from MaterialBarcode Where StorageCode>=0 and Serial=${s}`);
  if (bar.length) {
    const d = bar[0];
    if (netInt(d.QCStatus) !== STATUS.Approved || netInt(d.StorageCode) === -1 || !(netDouble(d.CurrentQty) > 0)) throw new Error('Material is not QC Approved');
    const bom = await q(`select RowID, (Qty-ConsumedQty) as qty from ProcessInputBOM where ProcessCode=${num(process)} and Material=${netLong(d.Material)} and PSno=${num(psNo)} and Qty>ConsumedQty order by RowID asc`);
    if (!bom.length) throw new Error('Different Barcode is already scanned for this component');
    return { qty: 1, rowID: str(bom[0].RowID), reqQty: netDouble(bom[0].qty), uom: str(d.uom), bar: `${str(d.BarcodeNo)}~${serial}`, vCode: '0', amCode: '' };
  }
  // ValidateVendorMaterialSerial
  const lines = await q(`Select pib.* from ProcessInputBOM pib inner join Material m on pib.Material=m.MatCode  where pib.Qty>pib.ConsumedQty and pib.PSNo=${num(psNo)} and pib.ProcessCode=${num(process)} order by isnull(m.TrackNoType,0) desc`);
  let found = null;
  for (const dr of lines) {
    const v = await validateVendorSerialNew(str(dr.Material), serial);
    if (v.ok) {
      found = { rowID: str(dr.ROWID ?? dr.RowID), reqQty: netDouble(dr.Qty) - netDouble(dr.ConsumedQty), uom: str(dr.UOM ?? dr.Uom) === '0' ? '' : str(dr.UOM ?? dr.Uom), vCode: v.vendCode, amCode: str(dr.Material) };
      break;
    }
  }
  if (!found) {
    outer: for (let n = 0; n < lines.length; n++) {
      for (const a of await q(`Select a.Material,pbm.Qty, pbm.ConsumedQty,pbm.UOM,pbm.ROWID from BOMInputAltMaterial a inner join ProcessInputBOM pbm on a.BOMCode=pbm.BOMCode and a.RowID=pbm.RowID  where pbm.Qty>pbm.ConsumedQty and pbm.PSNo=${num(psNo)} and pbm.ProcessCode=${num(process)}`)) {
        if ((await validateVendorSerialNew(str(a.Material), serial)).ok) {
          found = { rowID: str(a.ROWID), reqQty: netDouble(a.Qty) - netDouble(a.ConsumedQty), uom: str(a.UOM) === '0' ? '' : str(a.UOM), vCode: str(a.Material), amCode: str(a.Material) };
          break outer;
        }
      }
    }
  }
  const rowID = found?.rowID ?? '0';
  if (rowID === '0' || rowID === '') throw new Error('Invalid Barcode');
  await q(`Select * from ProcessInputBOM where PSNO=${num(psNo)} and ROWID=${num(rowID)} and ProcessCode=${num(process)} order by ROWID`);
  if (netInt(rowID) <= 0 || !(found.reqQty > 0)) throw new Error('Invalid Serial');
  const { key, prefix } = await generateKey('MaterialBarcode', 1, netInt(ctx.businessUnit));
  const no = netInt(key);
  const created = new Date();
  created.setMilliseconds(0);
  const ds = await newRow('MaterialBarcode', {
    BarcodeNo: no, Alias: `${prefix}${no}`, DocType: DOC_PROCESS_ORDER, DocNo: psNo, DocLine: rowID, Material: found.amCode, Serial: serial, PackQty: 1, CurrentQty: 1, Uom: found.uom, IssuedQty: 0,
    BusinessUnit: ctx.businessUnit, Department: ctx.department, ABusinessUnit: ctx.businessUnit, ADepartment: ctx.department, Area: 0, StorageCode: 0, StockID: 0, CreatedOn: created, PrintStatus: 0,
    LooseStatus: 0, Sample: 0, ProcessCode: process, QCStatus: STATUS.Approved, Status: STATUS.Active,
  });
  await insert(null, { tables: [ds] }, { ...ctx, businessUnit: 0, userCode: 0 }).catch(() => {}); // InsertData, failures ignored
  return { qty: 1, rowID, reqQty: found.reqQty, uom: found.uom, bar: String(no), vCode: found.vCode, amCode: found.amCode };
}

/** DisplayInputBOMNew: the stage's scanned inputs (and earlier stages' unfinished ones) with their serials and
 *  alternatives; more = an input still to scan */
export async function displayInputBOMNew(psNo, stage) {
  const p = num(psNo);
  const done = await q(`select ProcessCode from ProcessRouting where PSNo=${p} and status=2`);
  const procs = done.length ? done.map(() => str(done[0].ProcessCode)).join(',') : '0'; // the original repeats the first
  const rows = await q(`select m.Name[Material],pb.Qty,pb.ConsumedQty,u.Alias[Unit],pb.RowID,mct.Name[Type] ,m.Alias[MatCode],pb.ProcessCode,m.MatCode[Mat]  from ProcessInputBOM pb inner join Material m on pb.Material =m.MatCode inner join UnitOfMeasure u on m.BaseUom =u.UomCode left Join MaterialCategory mct on m.Category=mct.CategoryCode    where pb.ScanReq=1 and  pb.PSNo =${p} and (pb.processcode=${num(stage)} or ( pb.processcode in(${procs}) and pb.Qty>pb.ConsumedQty)) order by pb.RowID`);
  for (const r of rows) {
    const serials = await q(`select Serial from ProcessInputBOMSCAN where PSNO=${p} and ProcessCode=${num(r.ProcessCode)}and Material=${num(r.Mat)}`);
    r.Barcodes = serials.map((x) => `${str(x.Serial)} | `).join('');
    const alts = await q(`Select m.Name from BOMInputAltMaterial bm inner join Material m on bm.Material =m.MatCode where bm.RowID=${num(r.RowID)} and bm.bomcode=(select BOMCode from ProcessOrder where psNo=${p})`);
    r.AltMaterial = alts.map((x) => `${str(x.Name)} | `).join('');
  }
  const more = netDouble(await sc(`Select Qty from ProcessInputBOM where qty>ConsumedQty and ScanReq=1 and PSNo=${p} and ProcessCode=${num(stage)}`)) > 0;
  return { rows, more };
}

/** Historry(stage label, job: false): the label's job card routing so far, and its FG material name */
export async function historyByLabel(label) {
  const l = lit(label);
  const rows = (await dataTable(`Select pp.Name[Process],wc.Name[Station],pr.StartedOn,pr.CompletedOn  from ProcessRouting pr inner join ProductionProcess pp on pr.ProcessCode=pp.ProcessCode inner join WorkCenter wc on pr.StationCode=wc.StationCode where pr.Status>0 and pr.PSNo=(select top 1 PSNo  from ProcessStageLabel where BarcodeNo=${l} ) order by pr.SeqNo asc `)).map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x ?? ''])));
  const name = str(await sc(`Select m.Name  from ProcessOrder po inner join Material m on po.Material =m.MatCode where po.PSNo=(select top 1 PSNo  from ProcessStageLabel where BarcodeNo=${l} )`));
  return { rows, name: name === '0' ? '' : name };
}

/** The label's whole route for the flow screen's progress view (read only, not in the original): every stage in
 *  sequence with its status (0 waiting, 1 started, 2 completed). Same job-card lookup as historyByLabel. */
export async function routeByLabel(label) {
  const rows = await query(`Select pr.SeqNo,pp.Name[Process],wc.Name[Station],pr.Status,pr.StartedOn,pr.CompletedOn from ProcessRouting pr inner join ProductionProcess pp on pr.ProcessCode=pp.ProcessCode inner join WorkCenter wc on pr.StationCode=wc.StationCode where pr.PSNo=(select top 1 PSNo from ProcessStageLabel where BarcodeNo=@label) order by pr.SeqNo asc`, { label: netString(label) });
  return rows.map((r) => ({ seq: netInt(r.SeqNo), process: str(r.Process), station: str(r.Station), status: netInt(r.Status), startedOn: r.StartedOn ? str(r.StartedOn) : '', completedOn: r.CompletedOn ? str(r.CompletedOn) : '' }));
}

/** The label's cabinet for the flow screen's details card (read only, not in the original): its FG material (name,
 *  alias, category, model, image), the material's variant values (colour, dimension...) and the sales order's customer.
 *  Null when the label has no job card. */
export async function cabinetByLabel(label) {
  const rows = await query(`Select top 1 m.MatCode,m.Name,m.Alias,mc.Name[Category],md.Name[Model],m.MaterialImage,l.Name[Customer],ph.Alias[OrderNo],lp.ProdcutionStage[LabelStage] from ProcessStageLabel psl left join ProductionProcess lp on lp.ProcessCode=psl.ProcessCode inner join ProcessOrder po on po.PSNo=psl.PSNo inner join Material m on po.Material=m.MatCode left join MaterialCategory mc on m.Category=mc.CategoryCode left join Model md on m.Model=md.ModelCode left join PRODHeader ph on po.PRODNo=ph.PRODNo left join SOHeader so on ph.SalesOrder=so.SONo left join Ledger l on so.Customer=l.LedgerCode where psl.BarcodeNo=@label`, { label: netString(label) });
  if (!rows.length) return null;
  const r = rows[0];
  const variants = await query(`Select vf.Name,vfv.Name[Value] from MaterialVariant mv inner join VariantFieldValue vfv on mv.ValueCode=vfv.Code inner join VariantField vf on vfv.Field=vf.FieldCode where mv.MatCode=@mat order by mv.RowID`, { mat: r.MatCode });
  const img = r.MaterialImage;
  const named = variants.map((v) => ({ name: str(v.Name), value: str(v.Value) }));
  return {
    // the label the unit carries: up to the assembly label (a foaming serial) the screen shows the artwork view
    kind: labelKind(label, r.LabelStage),
    // the graphics and customer variant fields, whatever the model names them (else the sales order's customer)
    graphics: variantValue(named, GRAPHICS),
    customerName: variantValue(named, CUSTOMER) || str(r.Customer),
    name: str(r.Name),
    alias: str(r.Alias),
    category: str(r.Category),
    model: str(r.Model),
    customer: str(r.Customer),
    order: str(r.OrderNo),
    image: Buffer.isBuffer(img) && img.length ? `data:image/png;base64,${img.toString('base64')}` : typeof img === 'string' && img.startsWith('data:image/') ? img : null,
    variants: named,
  };
}

// ---- QC at a station (result 30: stage types 2 / 8) ------------------------------------------------------------------

/** AVQuality.ValidateProductionBarcodeforQC (WRL): the job card's barcode with that serial, PendingQCQty 1 when it is on
 *  hold or its inspection lot is open (then counted as on hold) */
export async function validateProductionBarcodeforQC(barcode, ps) {
  const rows = await dataTable(`Select * from MaterialBarcode where DocNo=${num(ps)} and Serial=${lit(barcode)}`);
  if (!rows.length) return rows;
  const r = ci(rows[0]);
  if (netInt(r.QCStatus) === STATUS.Hold) rows[0].PendingQCQty = '1';
  else if ((await q(`Select * from InspectionHeader where Status IN(1,10) and InspectionLotNo=${num(r.InspectionLotNo)}`)).length) {
    rows[0].PendingQCQty = '1';
    rows[0][Object.keys(rows[0]).find((k) => k.toLowerCase() === 'qcstatus')] = String(STATUS.Hold);
  }
  return rows.map(ci);
}
/** AVQuality.GetUDListInProcess: the routing step's checklist, with empty result columns */
export async function udListInProcess(ps, process) {
  const rows = await dataTable(`select * from ParameterTran where ParameterCode=(select ParameterCode from ProcessRouting where PSno=${num(ps)} and ProcessCode=${num(process)})`);
  for (const r of rows) for (const c of ['qcvalue', 'remark', 'qcstatus', 'InstrumentID']) if (!Object.keys(r).some((k) => k.toLowerCase() === c.toLowerCase())) r[c] = null;
  return rows;
}
/** AVQuality.DisplayProcessMaterial: the open inspection lot's line (and its row), returns its line code */
export async function displayProcessMaterial(ps, process) {
  const p = num(ps);
  const lineCode = netInt(await sc(`Select max(DocLine) from InspectionHeader where Docno = ${p} and Process=${num(process)} and docType = ${DOC_PROCESS_ORDER} and status = 1`));
  const rows = await dataTable(`Select top 1 ih.DocLine[LineCode], ih.Material, m.Name[Description], ih.Qty[ProducedQty], ih.SampleQty, ih.ApprovedQty + ih.RejectedQty[InspectedQty], ih.ApprovedQty, ih.RejectedQty, u.UomCode[Uom], u.Alias[UomDesc], ih.InspectionLotNo from InspectionHeader ih  inner join Material m on ih.Material = m.MatCode inner join UnitOfMeasure u on m.BaseUom = u.UomCode where ih.Docno = ${p} and Process=${num(process)} and ih.docType = ${DOC_PROCESS_ORDER} and ih.status = 1 `);
  return { lineCode, rows };
}
/** AVQuality.ComponentHistory: the components scanned into the serial's job card */
export const componentHistory = (barcode) => dataTable(`Select mc.Name[Category], m.Name[Material],w.Name[Station],pb.Serial,u.UserName[Operator],pb.ScannedOn from ProcessInputBOMScan pb inner join WorkCenter w on pb.StationCode  =w.StationCode inner join Material m on pb.Material=m.MatCode  inner join Users u on pb.Operator =u.UserCode left join MaterialCategory mc on m.Category=mc.CategoryCode where pb.PSNo=(Select DocNo from MaterialBarcode where Serial=${lit(barcode)})`);
export const isNextStageLabelPrint = async (ps, process, tx) => netBool(await sc(`Select PrintNextStageLabel  from RoutingTrans Where RouteCode=(Select Routing from ProcessOrder where PSNO=${num(ps)}) and ProcessCode=${num(process)}`, tx));
const cellOf = (row, name) => row[Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase())];

/** SaveQCChecklist: the station's checklist results replaced, an inspection activity, the job card's QC status */
export async function saveQCChecklist(rows, ps, station, process, ctx, statusUpdate = true) {
  const schema = await tableSchema('ProcessInspectionCheckList');
  const save = rows.map((r) => new Map(Object.entries({ PSNo: ps, StationCode: station, ProcessCode: process, LineCode: cellOf(r, 'LineCode'), LineValue: cellOf(r, 'qcvalue'), Remark: cellOf(r, 'remark'), Status: netInt(cellOf(r, 'qcstatus')), InstrumentID: cellOf(r, 'InstrumentID') }).filter(([, x]) => x !== null && x !== undefined && x !== '').map(([k, x]) => [schema.col(k)?.name ?? k, x])));
  const qcStatus = save.some((r) => netInt(r.get(schema.col('Status').name)) === 0) ? STATUS.Rejected : STATUS.Approved;
  await transaction(async (tx) => {
    const [p, s, c] = [num(ps), num(station), num(process)];
    await ex(`Delete from ProcessInspectionCheckList where PSNo=${p} and StationCode=${s} and ProcessCode=${c}`, tx);
    for (const r of save) {
      const cols = [...r.keys()];
      await execute(`insert into  ProcessInspectionCheckList( ${cols.join(',')} ) values ( ${cols.map((_, i) => `@p${i}`).join(',')} )`, Object.fromEntries(cols.map((k, i) => [`p${i}`, r.get(k)])), tx);
    }
    await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn) values(${p},${s},${c},${netInt(ctx.userCode)},6,getdate())`, tx);
    if (statusUpdate) await ex(`Update ProcessOrder Set QCStatus=${qcStatus} where PSNo=${p}`, tx);
  });
}

/** ProcessCompleteStageQCBarcode: the QC stage completed (auto-processed steps after it, job card moved on / closed with
 *  its barcodes' QC status); an approved barcode goes on hold for (or opens) the next QC stage's lot. Any failure
 *  surfaces as a null reference (the original's log line reads ex.InnerException). */
export async function processCompleteStageQCBarcode(ps, station, process, barcode, qc, ctx, tx, rowId = '0') {
  try {
    const p = num(ps);
    const line = netString(ctx.line ?? '0');
    let st = num(station);
    const c = num(process);
    const user = netString(ctx.userCode) === '0' ? '9999' : String(netInt(ctx.userCode));
    await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn,Remark) values(${p},${st},${c} , ${user},${ACT.Complete},getdate(),${lit(line)})`, tx);
    await ex(`Update ProcessRouting set Status=2, CompletedOn=getdate() where PSNo=${p} and StationCode=${st} and ProcessCode=${c}`, tx);
    let auto = 0;
    let skip = 0;
    const sk = await q(`select NoOfAutoProcess from AutoProcess where LineCode =${num(line)} and Process = ${c}`, tx);
    if (sk.length) {
      auto = netInt(sk[0].NoOfAutoProcess);
      skip = 1;
    } else auto = netInt(await sc(`select AutoProcessing from RoutingTrans where ProcessCode=${c} and RouteCode=(Select top 1 RouteCode  from ProcessRouting where psno =${p})`, tx));
    for (let i = 1; i <= auto; i++) {
      const nextAuto = str(await sc(`select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0)`, tx));
      const skipStation = skip === 1 ? netInt(await sc(`Select StationCode from ProcessRouting where  PSNo=${p} and ProcessCode=${num(nextAuto)}`, tx)) : 0;
      const login = await q(`Select top 1 * from ProcessUserLogin where Station=(Select top 1 StationCode  from WorkCenterProcesses where ProcessCode=${num(nextAuto)}) order by ROWID desc`, tx);
      let autoUser = '0';
      if (login.length) {
        st = String(netInt(login[0].Station));
        autoUser = String(netInt(login[0].UserCode));
      } else st = skip !== 1 ? '0' : String(skipStation);
      await autoProcessStart(ps, st, nextAuto, autoUser, tx);
      await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn,Remark) values(${p},${st},${num(nextAuto)} , ${autoUser},${ACT.Complete},getdate(),${lit(line)})`, tx);
      await ex(`Update ProcessRouting set Status=2, CompletedOn=getdate() where PSNo=${p} and StationCode=${st} and ProcessCode=${num(nextAuto)}`, tx);
    }
    const next = str(await sc(`select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0)`, tx));
    if (auto > 0) await ex(`Update InspectionHeader set Process=${num(next)} where DocNo=${p} and DocType=${DOC_PROCESS_ORDER} and Process=${c} and Status=1`, tx);
    if (next !== '') await ex(`Update ProcessOrder set PrevProcess=${c}, NextProcess=0, CurrentProcess=${num(next)},ActivityStatus=0 where PSNo=${p}`, tx);
    else {
      await ex(`Update ProcessOrder set PrevProcess=${c}, NextProcess=0, CurrentProcess=0,ActivityStatus=0 , Status=${STATUS.Closed}  where PSNo=${p}`, tx);
      await ex(`Update ProcessOrder Set QCStatus=(Select QCStatus from ProcessOrder where PSNo=${p}) Where PSNo=(Select MainPSNo from ProcessOrder where PSNo=${p})`, tx);
      const d = await q(`select Department,BarcodeNo from ProcessOrder where PSNo=${p}`, tx);
      await ex(`Update MaterialBarcode Set QCStatus=${num(qc)} where DocNo=${p}`, tx);
      if (netInt(await sc(`select count(PSNo) from ProcessOutputBOMBarcode where PSNo=${p} and ProcessCode=${c} and StationCode=${st}`, tx)) === 0) {
        const r = first(d);
        await ex(`update MaterialBarcode set ADepartment=${num(r.Department)}, StorageCode=0 where BarcodeNo=${netInt(r.BarcodeNo)}`, tx);
        await updateLocationAdd('0', String(netInt(r.BarcodeNo)), tx);
      }
    }
    if (qc !== String(STATUS.Approved) || next === '') return;
    const psType = await sc(`Select ProdcutionStage from ProductionProcess where ProcessCode=${netLong(next)}`, tx);
    if (psType === null || psType === undefined) throw NRE();
    const already = netInt(await sc(`Select count(*) from InspectionHeader Where DocNo=${p} and Process=${num(next)} and Status=1`, tx));
    if (already > 0) await ex(`Update Materialbarcode Set  QCStatus=${STATUS.Hold} where BarcodeNo=${num(barcode)}`, tx);
    else if (['2', '6', '8'].includes(str(psType))) {
      let dtM = await q(rowId !== '0' ? `Select * from ProcessOutputBOM where PSNO=${p} and ProcessCode=${c} and ROWID=${num(rowId)}` : `Select * from ProcessOutputBOM where PSNO=${p} and ProcessCode=${c}`, tx);
      if (!dtM.length) dtM = await q(`Select top 1 * from ProcessOutputBOM where Qty=YieldQty and  PSNO=${p} Order by ROWID Desc`, tx);
      const b = first(await q(`Select * from ProcessOrder where PSNo=${p}`, tx));
      const { key, prefix } = await generateKey('InspectionHeader', 1, netInt(b.BusinessUnit), tx);
      const lot = String(netInt(key));
      const now = new Date();
      now.setSeconds(0, 0);
      const m = dtM[0];
      const ds = await newRow('InspectionHeader', {
        InspectionLotNo: lot, Alias: `${prefix}${lot}`, DocType: DOC_PROCESS_ORDER, DocDate: now, DocNo: ps, Process: next,
        ...(m ? { Material: m.Material, Qty: m.YieldQty, Uom: m.Uom, DocLine: m.ROWID } : {}), Department: str(b.Department), BusinessUnit: str(b.BusinessUnit), Status: 1,
      });
      await insert(null, { tables: [ds] }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
      if ((await ex(`Update Materialbarcode Set InspectionLotNo=${lot}, QCStatus=${STATUS.Hold} where BarcodeNo=${num(barcode)}`, tx)) === 0) throw new Error(`Inspection Not Updated:${barcode}`);
    }
  } catch {
    throw NRE();
  }
}

/** SaveQCINProcess: the QC decision on the barcode (inspection result with checklist values and defects, the barcode's
 *  QC status, the lot's approved / rejected quantity). A fully approved lot closes and completes the stage; with
 *  next-stage label printing (indicator 10000) the barcode gets the next stage's serial and its label is printed.
 *  Returns "0" (lot still open / rejected), "" or the barcode number (stage completed). The checklist / remark texts
 *  are parameters. */
export async function saveQCINProcess({ ud, defects, status, nextAction, barcode, ps, rowID, process, lot, parameterCode, station, controlId, printer, bee, dept, remark }, ctx) {
  try {
    const strBEE = bee === '' ? '0' : bee;
    const tables = {};
    for (const t of ['InspectionTrans', 'InspectionUD', 'InspectionDefect']) tables[t] = { schema: await tableSchema(t), prefix: t === 'InspectionTrans' ? '' : 'ID', rows: [] };
    const put = (t, values) => tables[t].rows.push(new Map(Object.entries(values).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [tables[t].schema.col(k)?.name ?? k, x])));
    for (const r of ud ?? []) put('InspectionUD', { ID: 0, LineCode: cellOf(r, 'LineCode'), LineValue: cellOf(r, 'qcvalue'), Remark: cellOf(r, 'remark'), Status: cellOf(r, 'qcstatus'), InstrumentID: cellOf(r, 'InstrumentID') });
    for (const r of defects ?? []) put('InspectionDefect', { ID: 0, Defect: cellOf(r, 'Defect') });
    const bars = await q(`Select BarcodeNo,Serial,CurrentQty,UOM,Material from MaterialBarcode where Serial=${lit(barcode)}`);
    let printBarcode = null;
    let result;
    try {
      result = await transaction(async (tx) => {
        let sQty = 0;
        for (const b of bars) {
          const shift = await (async () => {
            let s = netInt(await sc('select top 1 ShiftCode from Shift where Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)'));
            if (s === 0) s = netInt(await sc('select top 1 ShiftCode from Shift where (starttime>Endtime) and ((Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime<=CONVERT (TIME, CURRENT_TIMESTAMP)) or (Starttime>CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)))'));
            return s;
          })();
          put('InspectionTrans', { InspectionLotNo: lot, ID: 0, QTY: b.CurrentQty, Barcode: b.BarcodeNo, SampleBarcode: b.BarcodeNo, Serial: b.Serial, UOM: b.UOM, Status: status, ParameterCode: parameterCode, NextAction: nextAction, UserCode: netInt(ctx.userCode), Shift: String(shift), Remark: qcRemark(remark) });
          sQty += netDouble(b.CurrentQty);
          await insert(null, { tables: Object.values(tables) }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
          await ex(`Update MaterialBarcode Set QCStatus=${num(status)} , ParentBarcode =${num(strBEE)} where BarCodeNo=${num(b.BarcodeNo)}`, tx);
        }
        if (!tables.InspectionTrans.rows.length) throw new Error('There is no row at position 0.');
        const l = num(lot);
        await ex(`Update InspectionHeader set ${status === String(STATUS.Approved) ? 'ApprovedQty=ApprovedQty' : 'RejectedQty=RejectedQty'}+${netNum(sQty)} where InspectionLotNo=${l}`, tx);
        const ip = await q(`select Sum(Qty)[SQty],Sum(ApprovedQty)[ApprovedQty],Sum(RejectedQty)[RejectedQty] from InspectionHeader where InspectionLotNo=${l} and DocNo = ${num(ps)} and DocLine=${num(rowID)}`, tx);
        if (!ip.length || netDouble(ip[0].SQty) !== netDouble(ip[0].ApprovedQty)) return '0';
        const material = first(bars).Material;
        const T = new Date();
        const MMyyyy = `${String(T.getMonth() + 1).padStart(2, '0')}${T.getFullYear()}`;
        const nextPrint = await isNextStageLabelPrint(ps, process, tx);
        if (nextPrint) {
          const plan = await q(`Select PlanQty,PrintLbl From PlanOrderPrint where PlanMonthYear =${MMyyyy} and PlanMaterial =${num(material)} and PlanType ='ASSEMBLY'`, tx);
          if (!plan.length) throw new Error(`No Plan is added for this Material Month :${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][T.getMonth()]}-${T.getFullYear()}`);
          const [pq, pl] = [netInt(plan[0].PlanQty), netInt(plan[0].PrintLbl)];
          if (pq !== pl + 1 && pq < pl + 1) throw new Error(`Print Qty is Greater Than Plan Quantity. Plan :${str(plan[0].PlanQty)} Print Qty :${str(plan[0].PrintLbl)}`);
        }
        await ex(`Update InspectionHeader set Status=${STATUS.Closed} where InspectionLotNo=${l}`, tx);
        await processCompleteStageQCBarcode(ps, station, process, str(first(bars).BarcodeNo), status, ctx, tx);
        if (controlId === 10000 && (await isNextStageLabelPrint(ps, process, tx))) {
          await ex(`UPDATE PlanOrderPrint set PrintLbl = PrintLbl +1 WHERE PlanMonthYear =${MMyyyy} and PlanMaterial =${num(material)} and PlanType ='ASSEMBLY'`, tx);
          const fg = str(await sc(`Select Material from processOrder where PSNo=${num(ps)}`, tx));
          const s = await generateSerialNo(fg, str(material), String(ctx.businessUnit), dept, String(await nextProcess(ps, process, tx)), 1, tx);
          await ex(`Update MaterialBarcode Set Serial=${lit(s.keyNo)},StorageCode=0 where BarCodeNo=${num(first(bars).BarcodeNo)}`, tx);
          await ex(`insert into ProcessStageLabel(PSNO,SeqNo,ProcessCode,StationCode,BarcodeNo) values(${num(ps)},0,${num(process)},${num(station)},${lit(s.keyNo)})`, tx);
          printBarcode = str(first(bars).BarcodeNo);
        }
        return printBarcode ?? '';
      });
    } catch (e) {
      throw new Error(e.message);
    }
    if (printBarcode !== null) {
      // after the commit: a failure here surfaces as a null reference (the rollback finds no transaction)
      try {
        const copies = netInt(await sc(`Select NoofCopy from RoutingTrans where routecode=(Select Routing from ProcessOrder where PSNO=${num(ps)}) and ProcessCode=${num(process)}`));
        const bp = await printerDetail(printer);
        let i = 0;
        do {
          await printStageLabel(printBarcode, bp);
          i++;
        } while (i < copies);
      } catch {
        throw NRE();
      }
    }
    return result;
  } catch (e) {
    throw new Error(e.message);
  }
}

// ---- ReworkConfirmationNew (AVQuality.SaveNewRRFConfirmation, AVProductionCapture.ProcessCompleteStageQC) ---------------

/** ProcessCompleteStageQC(ps, station, process, dw, qc, serial): the QC stage completed (auto-processed steps run for
 *  their logged-in users), the job card moved on or closed; an approved serial opens the next QC stage's lot. Any
 *  failure surfaces as a null reference (the original's log line reads ex.InnerException). */
export async function processCompleteStageQC(ps, station, process, qc, serial, ctx, tx, rowId = '0') {
  try {
    const p = num(ps);
    let st = num(station);
    const c = num(process);
    const head = await q(`select Department,BarcodeNo from ProcessOrder where PSNo=${p}`, tx);
    const user = netString(ctx.userCode) === '0' ? '9999' : String(netInt(ctx.userCode));
    await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn) values(${p},${st},${c} , ${user},${ACT.Complete},getdate())`, tx);
    await ex(`Update ProcessRouting set Status=2, CompletedOn=getdate() where PSNo=${p} and StationCode=${st} and ProcessCode=${c}`, tx);
    const auto = netInt(await sc(`select AutoProcessing from RoutingTrans where ProcessCode=${c} and RouteCode=(Select top 1 RouteCode  from ProcessRouting where psno =${p})`, tx));
    for (let i = 1; i <= auto; i++) {
      const nextAuto = str(await sc(`select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0)`, tx));
      const login = await q(`Select top 1 * from ProcessUserLogin where Station=(Select top 1 StationCode  from WorkCenterProcesses where ProcessCode=${num(nextAuto)}) order by ROWID desc`, tx);
      let autoUser = '0';
      if (login.length) {
        st = String(netInt(login[0].Station));
        autoUser = String(netInt(login[0].UserCode));
      } else st = '0';
      await autoProcessStart(ps, st, nextAuto, autoUser, tx);
      await ex(`Insert Into ProcessActivity (PSNo,StationCode,ProcessCode,Operator,ActivityType,ActivityOn) values(${p},${st},${num(nextAuto)} , ${autoUser},${ACT.Complete},getdate())`, tx);
      await ex(`Update ProcessRouting set Status=2, CompletedOn=getdate() where PSNo=${p} and StationCode=${st} and ProcessCode=${num(nextAuto)}`, tx);
    }
    const next = str(await sc(`select ProcessCode from ProcessRouting where PSNo=${p} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${p} and Status=0 )`, tx));
    if (auto > 0) await ex(`Update InspectionHeader set Process=${num(next)} where DocNo=${p} and DocType=${DOC_PROCESS_ORDER} and Process=${c} and Status=1`, tx);
    if (next !== '') await ex(`Update ProcessOrder set PrevProcess=${c}, NextProcess=0, CurrentProcess=${num(next)},ActivityStatus=0 where PSNo=${p}`, tx);
    else {
      await ex(`Update ProcessOrder set PrevProcess=${c}, NextProcess=0, CurrentProcess=0,ActivityStatus=0 , Status=${STATUS.Closed}  where PSNo=${p}`, tx);
      await ex(`Update ProcessOrder Set QCStatus=(Select QCStatus from ProcessOrder where PSNo=${p}) Where PSNo=(Select MainPSNo from ProcessOrder where PSNo=${p})`, tx);
      await ex(`Update MaterialBarcode Set QCStatus=${num(qc)} where DocNo=${p}`, tx);
      if (netInt(await sc(`select count(PSNo) from ProcessOutputBOMBarcode where PSNo=${p} and ProcessCode=${c} and StationCode=${st}`, tx)) === 0) {
        const r = first(head);
        await ex(`update MaterialBarcode set ADepartment=${num(r.Department)}, StorageCode=0 where BarcodeNo=${netInt(r.BarcodeNo)}`, tx);
        await updateLocationAdd('0', String(netInt(r.BarcodeNo)), tx);
      }
    }
    if (qc !== String(STATUS.Approved) || next === '') return;
    const psType = await sc(`Select ProdcutionStage from ProductionProcess where ProcessCode=${netLong(next)}`, tx);
    if (psType === null || psType === undefined) throw NRE();
    const already = netInt(await sc(`Select count(*) from InspectionHeader Where DocNo=${p} and Process=${num(next)} and Status=1`, tx));
    if (already <= 0 && ['2', '6', '8'].includes(str(psType))) {
      let dtM = await q(rowId !== '0' ? `Select * from ProcessOutputBOM where PSNO=${p} and ProcessCode=${c} and ROWID=${num(rowId)}` : `Select * from ProcessOutputBOM where PSNO=${p} and ProcessCode=${c}`, tx);
      if (!dtM.length) dtM = await q(`Select top 1 * from ProcessOutputBOM where Qty=YieldQty and  PSNO=${p} Order by ROWID Desc`, tx);
      const b = first(await q(`Select * from ProcessOrder where PSNo=${p}`, tx));
      const { key, prefix } = await generateKey('InspectionHeader', 1, netInt(b.BusinessUnit), tx);
      const lot = String(netInt(key));
      const now = new Date();
      now.setSeconds(0, 0);
      const m = dtM[0];
      const ds = await newRow('InspectionHeader', {
        InspectionLotNo: lot, Alias: `${prefix}${lot}`, DocType: DOC_PROCESS_ORDER, DocDate: now, DocNo: ps, Process: next,
        ...(m ? { Material: m.Material, Qty: m.YieldQty, Uom: m.Uom, DocLine: m.ROWID } : {}), Department: str(b.Department), BusinessUnit: str(b.BusinessUnit), Status: 1,
      });
      await insert(null, { tables: [ds] }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
      await ex(`Update Materialbarcode Set InspectionLotNo=${lot}, QCStatus=${STATUS.Hold} where  Serial=${lit(serial)}`, tx);
    }
  } catch {
    throw NRE();
  }
}

/** AVQuality.SaveNewRRFConfirmation for the whole quantity: the rework approved (root cause, resolution, remark), then
 *  the job card's current QC stage completed or a new lot opened for it (self inspection / no self approval), else
 *  the next QC stage's lot opened or the barcode approved. The remark is a parameter (the original spliced it). */
export async function saveNewRRFConfirmation({ id, barcode, qty, aqty, rootCause, actionTaken, remark, selfApproval }, ctx) {
  try {
    const b = num(barcode);
    const bar = await q(`Select * from materialbarcode where barcodeno=${b}`);
    // ponytail: a part quantity splits the barcode and posts it to the ERP (AVErp.PostInspection), not ported
    if (qty !== aqty) throw new Error('Confirming part of the quantity needs the ERP posting, which is not available in the new app');
    const d = first(bar);
    const cfg = first(await q(`select BaseUom, IsInspectionReq,InspectionType,RetestIn from Material where MatCode=${num(d.material)}`));
    const i = num(id);
    await transaction(async (tx) => {
      await execute(`Update InspectionTrans set RootCause=${netInt(rootCause)}, ReworkResolution= ${netInt(actionTaken)}, ApprovedBy =${num(ctx.userCode)}, ApproverRemark=@r,ApprovedOn=getdate() where ID=${i}`, { r: remark }, tx);
      const type = await q(`Select top 1 InspectionType,Process,DocLine from InspectionHeader where InspectionLotNo=(select inspectionLotNo from InspectionTrans where ID=${i})`, tx);
      const doc = num(d.DocNo);
      const currentSql = `select ProcessCode from ProcessRouting where PSNo=${doc} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${doc} and (Status=0 or Status=1) )`;
      const stageOf = async (pc) => {
        const t = await sc(`Select ProdcutionStage from ProductionProcess where ProcessCode=${netLong(pc)}`, tx);
        if (t === null || t === undefined) throw NRE();
        return str(t);
      };
      if ((netBool(cfg.IsInspectionReq) && netInt(first(type).InspectionType) === 300) || selfApproval === 0) {
        const current = str(await sc(currentSql, tx));
        if (current === '') return;
        const t = await stageOf(current);
        if (t === '2') {
          await ex(`Update InspectionHeader set Status=${STATUS.Closed} where InspectionLotNo=(select inspectionLotNo from InspectionTrans where ID=${i})`, tx);
          const pr = first(await q(`select * from ProcessRouting where PSNo=${doc} and SeqNo=(Select Min(SeqNo) from ProcessRouting where  PSNo=${doc} and (Status=0 or Status=1) )`, tx));
          await processCompleteStageQC(str(pr.PSNO), str(pr.StationCode), str(pr.ProcessCode), String(STATUS.Approved), str(d.Serial), ctx, tx);
        } else if (t === '8' || t === '6') {
          await ex(`Update InspectionHeader set Status=${STATUS.Closed} where InspectionLotNo=(select inspectionLotNo from InspectionTrans where ID=${i})`, tx);
          const { key, prefix } = await generateKey('InspectionHeader', 1, netInt(ctx.businessUnit), tx);
          const lot = String(netInt(key));
          const now = new Date();
          now.setMilliseconds(0);
          const ty = first(type);
          const ds = await newRow('InspectionHeader', {
            InspectionLotNo: lot, Alias: `${prefix}${lot}`, DocType: d.DocType, DocDate: now, DocNo: d.DocNo, DocLine: ty.DocLine, Process: ty.Process, Material: d.Material,
            InspectionType: cfg.InspectionType, Qty: d.CurrentQty, Uom: d.Uom, Department: ctx.department, BusinessUnit: ctx.businessUnit, Status: 1,
          });
          await ex(`Update MaterialBarcode set QCStatus=${STATUS.Hold},InspectionLotNo=${lot} where BarcodeNo =${b}`, tx);
          await ex(`Update InspectionTrans set ERPStatus=1 where ID=${i}`, tx);
          await insert(null, { tables: [ds] }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
        }
        return;
      }
      const next = str(await sc(currentSql, tx));
      if (next !== '' && ['2', '6'].includes(await stageOf(next))) {
        const dtM = await q(`Select top 1 * from ProcessOutputBOM where Qty=YieldQty and  PSNO=${doc} Order by ROWID Desc`, tx);
        const pob = first(await q(`Select * from ProcessOrder where PSNo=${doc}`, tx));
        const { key } = await generateKey('InspectionHeader', 1, netInt(pob.BusinessUnit), tx);
        const now = new Date();
        now.setSeconds(0, 0);
        const m = dtM[0];
        // the original keeps the new lot's number out of the alias and the barcodes (its variable stays 0)
        const ds = await newRow('InspectionHeader', {
          InspectionLotNo: String(netInt(key)), Alias: '0', DocType: DOC_PROCESS_ORDER, DocDate: now, DocNo: str(d.DocNo), Material: m ? m.Material : d.Material, Uom: m ? m.Uom : d.Uom, Qty: m ? m.YieldQty : d.CurrentQty,
          Process: next, ...(m ? { DocLine: m.ROWID } : {}), Department: str(pob.Department), BusinessUnit: str(pob.BusinessUnit), Status: 1,
        });
        await insert(null, { tables: [ds] }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
        await ex(`Update Materialbarcode Set InspectionLotNo=0, QCStatus=${STATUS.Hold} where DocNo=${doc} and DOCLine=0`, tx);
      } else await ex(`Update MaterialBarcode set  QCStatus=${STATUS.Approved} where BarcodeNo=${b}`, tx);
    });
    return true;
  } catch (e) {
    throw new Error(e.message);
  }
}

// ---- FG label stage (scan result 40: stage type 6) -----------------------------------------------------------------

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
/** DateTime.Now.ToString(format) for the serial logics' formats (en-IN: "" is the general date/time) */
function dotnetDate(fmt, d = new Date()) {
  if (fmt === 'yy') return String(d.getFullYear()).slice(-2);
  if (fmt === 'yyyy') return String(d.getFullYear());
  if (fmt === 'MM') return p2(d.getMonth() + 1);
  if (fmt === '') {
    const h = d.getHours() % 12 || 12;
    return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(h)}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }
  throw new Error(`Date format "${fmt}" is not supported`);
}
/** Calendar.GetWeekOfYear(now, FirstDay, Sunday) (en-IN) */
const weekOfYear = (d = new Date()) => {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - jan1) / 86400000);
  return Math.floor((day + jan1.getDay()) / 7) + 1;
};
/** the date / week / fixed / AltName segments of an asset logic row (the sequence is the caller's) */
export async function assetSegment(dr, material, tx) {
  const c = str(dr.VariantCode);
  if (c === '1' || c === '2' || c === '3') {
    if (c === '2') {
      const f = str(dr.Format);
      if (f.includes('ALPHA-')) {
        const al = f.split('-')[1];
        if (al.length !== 1) throw new Error('String must be exactly one character long.');
        return String.fromCharCode(al.charCodeAt(0) + new Date().getMonth());
      }
      return dotnetDate(f.toUpperCase());
    }
    if (c === '1') return dotnetDate(str(dr.Format).toLowerCase());
    return ''; // the day: nothing (the original has no branch for it)
  }
  if (c === '4') return p2(weekOfYear());
  if (c === '11') {
    const r = await q(`Select AltName from material where matCode=${num(material)}`, tx);
    if (!r.length) throw NRE();
    return str(Object.values(r[0])[0]);
  }
  return str(dr.Value).trim();
}
const assetLogicRows = (logic, tx) => q(`select sd.*,sv.VariantType from SerialGenerationLogicDetail sd inner join SequenceVariant sv on sd.variantCode=sv.VariantCode where SerialCode =${num(logic)} order by Seq`, tx);
const yyNow = () => String(new Date().getFullYear()).slice(-2);

/** DataWrapper.GetNextAssetIDWRL (no transaction): the next asset tag, without taking it */
export async function getNextAssetIDWRL(material, bu, process, assetID, logic) {
  let s = '';
  for (const dr of await assetLogicRows(logic)) {
    if (str(dr.VariantCode) === '10') {
      let key = str(await sc(`Select Max(NextSerialNo) from SerialBarcode where  isnull(AssetID,0)=${assetID} and Material=${num(material)} and Station=${num(process)} and BusinessUnit=${num(bu)} and Year=${yyNow()} and AssetLogic =${num(logic)} and Status =0 `));
      const start = await sc(`select StartingNo from SerialGenerationLogicDetail where VariantCode=10 and SerialCode =${num(logic)}`);
      if ((start === null || start === undefined) && key === '') key = '1';
      if (start !== null && start !== undefined && key === '') key = str(start);
      s += String(Number(key)).padStart(netInt(dr.Length), '0');
      const end = await sc(`select EndingNo from SerialGenerationLogicDetail where VariantCode=10 and SerialCode =${num(logic)}`);
      if (end === null || end === undefined) throw NRE();
      if (netInt(end) > 0 && Number(end) < Number(key)) throw new Error('Asset Tag Serise is Completed');
    } else s += await assetSegment(dr, material);
    if (dr.Seperator !== null && dr.Seperator !== undefined) s += str(dr.Seperator).toLowerCase() === 'spc' ? ' ' : str(dr.Seperator);
  }
  return s;
}
/** DataWrapper.GenAssetIDWRL in the caller's transaction: the asset tag taken (its counter row created or bumped) */
export async function genAssetIDWRL(material, bu, dept, process, assetID, logic, tx) {
  const rows = await assetLogicRows(logic, tx);
  if (!rows.length) return '';
  let s = '';
  const where = `isnull(AssetID,0)=${assetID} and Material=${num(material)} and Station=${num(process)} and BusinessUnit=${num(bu)} and Year=${yyNow()} and AssetLogic =${num(logic)}`;
  for (const dr of rows) {
    if (str(dr.VariantCode) === '10') {
      let key = str(await sc(`Select Max(NextSerialNo) from SerialBarcode where  ${where}`, tx));
      if (key === '') {
        const start = await sc(`select StartingNo from SerialGenerationLogicDetail where VariantCode=10 and SerialCode =${num(logic)}`, tx);
        const next = start !== null && start !== undefined ? 1 + Number(start) : 2;
        key = start !== null && start !== undefined ? str(start) : '';
        await ex(`Insert into SerialBarcode(Material,Month,Year,NextSerialNo,BusinessUnit,Department,Station,AssetID,AssetLogic) values(${num(material)},${p2(new Date().getMonth() + 1)},${yyNow()},${next},${num(bu)},${num(dept)},${num(process)},${assetID},${num(logic)})`, tx);
      } else {
        const end = await sc(`select EndingNo from SerialGenerationLogicDetail where VariantCode=10 and SerialCode =${num(logic)}`, tx);
        if (end !== null && end !== undefined && netInt(end) > 0 && netInt(end) < netInt(key)) throw new Error('Ending No Can not be less than the serial No');
        await ex(`Update SerialBarcode set  NextSerialNo=${Number(key) + 1} where isnull(AssetID,0)=${assetID} and Station=${num(process)} and Material=${num(material)}  and BusinessUnit=${num(bu)} and Year=${yyNow()} and AssetLogic=${num(logic)}`, tx);
      }
      if (key === '') key = '1';
      s += String(Number(key)).padStart(netInt(dr.Length), '0');
    } else s += await assetSegment(dr, material, tx);
    if (dr.Seperator !== null && dr.Seperator !== undefined) s += str(dr.Seperator);
  }
  return s;
}
/** DataWrapper.GetNextSerialNo (no transaction): the next serial (a serial already on a barcode moves the counter on) */
export async function getNextSerialNo(fgMat, material, bu, dept, process) {
  const yy = yyNow();
  const mm = p2(new Date().getMonth() + 1);
  for (;;) {
    const [m, b, d, p] = [material, bu, dept, process].map(num);
    const must = async (sql) => {
      const r = await q(sql);
      if (!r.length) throw NRE();
      return str(Object.values(r[0])[0]);
    };
    const buPrefix = b !== '0' && b !== '999' ? await must(`select Prefix from BusinessUnit where BUCode=${b}`) : '';
    if (d !== '0') await must(`select Prefix from Department where DeptCode=${d}`);
    const stationPrefix = p !== '0' ? str(await sc(`select Prefix from ProductionProcess where ProcessCode=${p}`)) : '';
    const matPrefix = await must(`select AltName from Material where Matcode=${num(fgMat)}`);
    let key = str(await sc(`Select Max(NextSerialNo) from SerialBarcode where  isnull(AssetID,0)<>1 and Material=${m} and Station=${p} and BusinessUnit=${b} and Year=${yy}`));
    if (key === '') key = '1';
    const keyNo = `${stationPrefix}${buPrefix}${matPrefix}${yy}${mm}${key.padStart(5, '0')}`.replaceAll(' ', '');
    if (str(await sc(`select Serial from MaterialBarcode where Serial=${lit(keyNo)}`)) !== keyNo) return keyNo;
    await ex(`Update SerialBarcode set  NextSerialNo=NextSerialNo+1 where isnull(AssetID,0)<>1 and Station=${p} and Material=${m}  and BusinessUnit=${b} and Year=${yy}`);
  }
}

/** AVProductionCapture.SaveQCFInalProcess: the FG stage's QC decision; an approval gives the barcode its FG serial,
 *  asset tag and green tag (and the plan's printed count), and a fully inspected lot completes the stage (with the
 *  next stage's label printed at indicator 10000). Returns "0", "1" or the printed barcode number. */
export async function saveQCFinalProcess({ ud, defects, status, nextAction, barcode, ps, process, lot, parameterCode, station, controlId, printer, serial, assetTag, greenTag, otherPlant, dept, remark }, ctx) {
  // the other plant's (Sanjan) database: its connection string is not configured at WRL
  if (otherPlant === 1) throw NRE();
  const tables = {};
  for (const t of ['InspectionTrans', 'InspectionUD', 'InspectionDefect']) tables[t] = { schema: await tableSchema(t), prefix: t === 'InspectionTrans' ? '' : 'ID', rows: [] };
  const put = (t, values) => tables[t].rows.push(new Map(Object.entries(values).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [tables[t].schema.col(k)?.name ?? k, x])));
  for (const r of ud ?? []) put('InspectionUD', { ID: 0, LineCode: cellOf(r, 'LineCode'), LineValue: cellOf(r, 'qcvalue'), Remark: cellOf(r, 'remark'), Status: cellOf(r, 'qcstatus'), InstrumentID: cellOf(r, 'InstrumentID') });
  for (const r of defects ?? []) put('InspectionDefect', { ID: 0, Defect: cellOf(r, 'Defect') });
  const bars = await q(`Select BarcodeNo,Serial,CurrentQty,UOM,Material from MaterialBarcode where Serial=${lit(barcode)}`);
  const fg = str(await sc(`Select Material from processOrder where PSNo=${num(ps)}`));
  const T = new Date();
  const MMyyyy = `${p2(T.getMonth() + 1)}${T.getFullYear()}`;
  const plan = await q(`Select PlanQty,PrintLbl From PlanOrderPrint where PlanMonthYear =${MMyyyy} and PlanMaterial =${num(fg)} and PlanType ='FG'`);
  if (!plan.length) throw new Error(`No Plan is added for this Material Month :${MON3[T.getMonth()]}-${T.getFullYear()}`);
  const [pq, pl] = [netInt(plan[0].PlanQty), netInt(plan[0].PrintLbl)];
  if (pq !== pl + 1 && pq < pl + 1) throw new Error("Column 'FGPlanQty' does not belong to table .");
  let printBarcode = null;
  const approved = status === String(STATUS.Approved);
  let result;
  try {
    result = await transaction(async (tx) => {
      let sQty = 0;
      for (const b of bars) {
        const shift = await (async () => {
          let s = netInt(await sc('select top 1 ShiftCode from Shift where Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)'));
          if (s === 0) s = netInt(await sc('select top 1 ShiftCode from Shift where (starttime>Endtime) and ((Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime<=CONVERT (TIME, CURRENT_TIMESTAMP)) or (Starttime>CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)))'));
          return s;
        })();
        put('InspectionTrans', { InspectionLotNo: lot, ID: 0, QTY: b.CurrentQty, Barcode: b.BarcodeNo, SampleBarcode: b.BarcodeNo, Serial: b.Serial, UOM: b.UOM, Status: status, ParameterCode: parameterCode, NextAction: nextAction, UserCode: netInt(ctx.userCode), Shift: String(shift), Remark: qcRemark(remark) });
        sQty += netDouble(b.CurrentQty);
        await insert(null, { tables: Object.values(tables) }, { ...ctx, businessUnit: 0, userCode: 0 }, { plain: true, tx });
        const tSerial = str(tables.InspectionTrans.rows[0].get(tables.InspectionTrans.schema.col('Serial').name));
        const cond = `where BarCodeNo=${num(b.BarcodeNo)} and CurrentQty<=(Select sum(Qty) from InspectionTrans where Serial=${lit(tSerial)} and Status=${num(status)})`;
        if (approved) {
          const logic = parseString(await sc(`select AssetTagType from Material where matcode=${num(first(bars).Material)}`, tx));
          let tag = await genAssetIDWRL(str(first(bars).Material), String(ctx.businessUnit), dept, process, 1, logic, tx);
          if (tag === '') tag = assetTag;
          const dup = str(await sc(`Select Vserial from MaterialBarcode where Vserial=${lit(assetTag)}`, tx));
          const dupRows = await q(`select mb.VSerial,m.Alias,mb.CreatedOn from MaterialBarcode mb inner join Material m on mb.Material = m.MatCode where mb.VSerial  = ${lit(assetTag)}`, tx);
          if (dupRows.length && (assetTag !== '' || dup !== '')) {
            const r = dupRows[0];
            throw new Error(`Duplicate Asset Tag :${str(Object.values(r)[0])} Material :${str(Object.values(r)[1])} Printed On :${dotnetDate('', Object.values(r)[2] instanceof Date ? Object.values(r)[2] : new Date(Object.values(r)[2]))}`);
          }
          await ex(`Update MaterialBarcode Set Alias=${lit(b.Serial)}, Serial= ${lit(serial)},Vserial=${lit(tag)},Serial2=${lit(greenTag)}, QCStatus=${num(status)}  ${cond}`, tx);
        } else await ex(`Update MaterialBarcode Set  QCStatus=${num(status)} ${cond}`, tx);
      }
      if (!tables.InspectionTrans.rows.length) throw new Error('There is no row at position 0.');
      const l = num(lot);
      await ex(`Update InspectionHeader set ${approved ? 'ApprovedQty=ApprovedQty' : 'RejectedQty=RejectedQty'}+${netNum(sQty)} where InspectionLotNo=${l}`, tx);
      if (!approved) return '0';
      await ex(`UPDATE PlanOrderPrint set PrintLbl = PrintLbl +1 WHERE PlanMonthYear =${MMyyyy} and PlanMaterial =${num(fg)} and PlanType ='FG'`, tx);
      const ip = await q(`select Sum(Qty)[SQty],Sum(ApprovedQty)[ApprovedQty],Sum(RejectedQty)[RejectedQty] from InspectionHeader where DocNo=${num(ps)} and InspectionLotNo=${l}`, tx);
      if (!ip.length || netDouble(ip[0].SQty) !== netDouble(ip[0].ApprovedQty) + netDouble(ip[0].RejectedQty)) return '0';
      await processCompleteStage(ps, station, process, barcode, ctx, tx);
      if (controlId === 10000 && (await isNextStageLabelPrint(ps, process, tx))) {
        let s = await generateSerialNo(fg, str(first(bars).Material), String(ctx.businessUnit), dept, process, 1, tx);
        if (s.keyNo === '') s = await generateSerialNo(fg, str(first(bars).Material), String(ctx.businessUnit), dept, process, 1, tx);
        await ex(`Update MaterialBarcode Set Serial=${lit(s.keyNo)},StorageCode=0,ProcessCode =${num(process)} where BarCodeNo=${num(first(bars).BarcodeNo)}`, tx);
        await ex(`insert into ProcessStageLabel(PSNO,SeqNo,ProcessCode,StationCode,BarcodeNo) values(${num(ps)},0,${num(process)},${num(station)},${lit(s.keyNo)})`, tx);
        printBarcode = str(first(bars).BarcodeNo);
        return printBarcode;
      }
      return '1';
    });
  } catch (e) {
    throw new Error(e.message);
  }
  if (printBarcode !== null) {
    const copies = netInt(await sc(`Select NoofCopy from RoutingTrans where routecode=(Select Routing from ProcessOrder where PSNO=${num(ps)}) and ProcessCode=${num(process)}`));
    const bp = await printerDetail(printer);
    let i = 0;
    do {
      await printLabel('inprocess', printBarcode, bp, ctx.userId);
      i++;
    } while (i < copies);
  }
  return result;
}
