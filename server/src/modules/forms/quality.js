// AVQuality / AVHistory as used by the Quality pages. The original concatenated values into its SQL: numbers read
// from the database are checked and spliced the same way (same text, same errors); typed-in barcodes are parameters.
import { query, scalar, execute, transaction } from '../../db/index.js';
import { netString, netInt, netDouble, netNum, netBool } from '../../lib/net.js';
import { num } from '../../lib/sql.js';
import { dataTable, cell } from './qc.js';
import { collect, insert, generateKey } from './write.js';
import { tableSchema } from './schema.js';

export const STATUS = { Active: 1, Closed: 10, Hold: 11, Approved: 12, Rejected: 13 };
const SELF_INSPECTION = 300; // InspectionType.SelfInspection

const str = (v) => (v === null || v === undefined ? '' : String(v)); // WrapperAvatar.ParseString
const strZero = (v) => (str(v) === '' || str(v) === '0' ? '' : str(v)); // ParseStringZero
const blank = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']))); // grid cells
const withQcColumns = (rows) => {
  for (const r of rows) for (const c of ['qcvalue', 'remark', 'qcstatus', 'InstrumentID']) if (cell(r, c) === undefined) r[c] = null;
  return rows;
};

/** AVQuality.GetUDList(inspectionLot): the material's inspection checklist */
export const udList = async (lot) => withQcColumns(await dataTable(`select * from ParameterTran where ParameterCode=(select InspectionCheckList from Material where MatCode=(select top 1 Material from InspectionHeader where InspectionLotNo=${num(lot)}))`));
/** AVQuality.GetUDListMaterial(barcodeNo) */
export const udListMaterial = async (barcode) => withQcColumns(await dataTable(`select * from ParameterTran where ParameterCode=(select InspectionCheckList from Material where MatCode=(select Material from MaterialBarcode where BarcodeNo=${num(barcode)}))`));
/** AVQuality.SelfInspectionDetails (WRL) */
export const selfInspectionDetails = async (lot) => blank(await dataTable(`select m.Alias [MatCode],m.Name [Description], Qty,ApprovedQty,RejectedQty from InspectionHeader ih inner join Material m on ih.Material=m.MatCode where InspectionLotNo=${num(lot)}`));
export const inspectionUom = async (lot) => str(await scalar(`select Uom from InspectionHeader where InspectionLotNo=${num(lot)}`)); // GetUOM
export const isSerialLot = async (lot) => netBool(await scalar(`select  Serial from Material where MatCode=(Select Material from inspectionHeader where InspectionLotNo=${num(lot)})`));
export const inspectionType = async (lot) => netInt(await scalar(`select m.InspectionType from InspectionHeader ih inner join Material m on ih.Material=m.MatCode where InspectionLotNo=${num(lot)}`));
const pendingQty = async (lot) => netDouble(await scalar(`select sum(Qty)-(sum(ApprovedQty)+sum(RejectedQty)) from InspectionHeader  where  InspectionLotNo=${num(lot)}`));

/** AVQuality.ValidateBarcodeInspectionQC: a held / rejected barcode ready for final inspection. Returns its pack
 *  quantity, BarcodeNo~Serial, the inspection lot and department it sets on the form (set before any later throw). */
export async function validateBarcodeInspectionQC(barcode, onLot, onDept) {
  const bar = await query(`select BarcodeNo,Serial, PackQty,InspectionLotNo,Department from MaterialBarcode where QCStatus in (${STATUS.Hold},${STATUS.Rejected}) and Serial=@s`, { s: barcode });
  if (bar.length) {
    const b = bar[0];
    if (netInt(await scalar(`select InspectionType from InspectionHeader where InspectionLotNo=${num(b.InspectionLotNo)}`)) === SELF_INSPECTION) {
      const next = str(await scalar(`Select qa.type from InspectionTrans it left join QCNextAction qa on it.NextAction=qa.id where InspectionLotNo=${num(b.InspectionLotNo)} and SampleBarcode=${num(b.BarcodeNo)}`));
      throw new Error(`Self Inspection Pending - ${next}`);
    }
    const next = await query(`select SampleBarcode,NextAction from InspectionTrans where InspectionLotNo=${num(b.InspectionLotNo)} and SampleBarcode=${num(b.BarcodeNo)}`);
    if (next.length) {
      const o = netInt(next[0].NextAction);
      if (o !== 0) throw new Error(`Already Inspected and Under ${['Nothing', 'Re-Work', 'Repair', 'Finishing', 'Scrap'][o] ?? ''}`);
    }
    await onLot(str(b.InspectionLotNo));
    const pending = await pendingQty(str(b.InspectionLotNo));
    if (strZero(b.Department) !== '') await onDept(strZero(b.Department));
    if (pending < netDouble(b.PackQty)) throw new Error('Quantity Exceeded');
    return { qty: netDouble(b.PackQty), rtn: `${str(b.BarcodeNo)}~${str(b.Serial)}` };
  }
  if ((await query('select BarcodeNo from MaterialBarcode where Serial=@s', { s: barcode })).length) throw new Error('Inspection Already Done');
  throw new Error('BarcodeNo Does Not Exist');
}

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

/** Settings.GetCurrentShift(0) */
export async function currentShift() {
  let shift = netInt(await scalar('select top 1 ShiftCode from Shift where Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)'));
  if (shift === 0) shift = netInt(await scalar('select top 1 ShiftCode from Shift where (starttime>Endtime) and ((Starttime<CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime<=CONVERT (TIME, CURRENT_TIMESTAMP)) or (Starttime>CONVERT (TIME, CURRENT_TIMESTAMP) and Endtime>=CONVERT (TIME, CURRENT_TIMESTAMP)))'));
  return shift;
}

/** AVQuality.updateStock: the lot's barcodes' quantities out of / into the stock's hold / released / rejected */
async function updateStock(lot, tx, add) {
  let [hold, release, rejected] = [0, 0, 0];
  for (const b of await query(`select BarcodeNo from MaterialBarcode where InspectionLotNo= ${num(lot)}`, {}, tx)) {
    const d = (await query(`Select * from MaterialBarcode where BarcodeNo = ${num(b.BarcodeNo)}`, {}, tx))[0];
    const qty = netDouble(d.PackQty);
    const st = netInt(d.QCStatus);
    if (st === STATUS.Hold) hold = qty;
    else if (st === STATUS.Approved) release = qty;
    else if (st === STATUS.Rejected) rejected = qty;
    const [m, loc, batch] = [netInt(d.Material), netInt(d.StorageCode), netInt(d.Batch)];
    if (!add) await execute(`Update MaterialStock set HoldQty= HoldQty-${netNum(hold)},ReleasedQty=ReleasedQty-${netNum(release)}, RejectedQty=RejectedQty-${netNum(rejected)}  where Material=${m} and  StorageCode=${loc} and Batch=${batch}`, {}, tx);
    else await execute(`Update MaterialStock set HoldQty= HoldQty+${netNum(hold)},ReleasedQty=ReleasedQty+${netNum(release)} , RejectedQty=RejectedQty+${netNum(rejected)} where Material=${m}and StorageCode = ${loc} and Batch=${batch}`, {}, tx);
  }
}

/** AVQuality.MaterialBarcodeScan(barcode, lot, udID, status, dw) */
async function materialBarcodeScan(serial, udId, status, tx) {
  await execute(`Update MaterialBarcode set UDID=${num(udId)}, QCStatus=${num(status)} where Serial=@s`, { s: serial }, tx);
  const d = (await query('Select * from MaterialBarcode where Serial = @s', { s: serial }, tx))[0];
  if (!d) throw new Error('Invalid barcode');
  const qty = netDouble(d.PackQty);
  const st = netInt(d.QCStatus);
  const [hold, release, rejected] = [st === STATUS.Hold ? qty : 0, st === STATUS.Approved ? qty : 0, st === STATUS.Rejected ? qty : 0];
  const [m, loc, batch] = [netInt(d.Material), netInt(d.StorageCode), netInt(d.Batch)];
  await execute(`Update MaterialStock set Qty=qty-${netNum(qty)},HoldQty= HoldQty-${netNum(qty)}  where Material=${m} and  StorageCode=${loc} and Batch=${batch}`, {}, tx);
  if (netDouble(await scalar(`select Qty from MaterialStock where Material=${m} and StorageCode = ${loc} and Batch=${batch}`, {}, tx)) > 0) {
    await execute(`Update MaterialStock set Qty=qty+${netNum(qty)},HoldQty= HoldQty+${netNum(hold)},ReleasedQty=ReleasedQty+${netNum(release)} , RejectedQty=RejectedQty+${netNum(rejected)} where Material=${m}and StorageCode = ${loc} and Batch=${batch}`, {}, tx);
  } else {
    await execute(`insert into MaterialStock (StorageCode,Material,Batch,Qty,HoldQty,ReleasedQty,RejectedQty,Uom,Department,BusinessUnit) values(${loc},${m},${batch},${netNum(qty)},${netNum(hold)},${netNum(release)},${netNum(rejected)},${netInt(d.Uom)},${netInt(d.Department)},${netInt(d.BusinessUnit)})`, {}, tx);
  }
  await execute(`Update MaterialBarcode set StorageCode=${loc} where BarcodeNo = ${num(d.BarcodeNo)}`, {}, tx);
}

/** AVQuality.Save(form, UD, barcode): the inspection (+ its defects and checklist results), then the lot's quantities,
 *  the barcode's QC status and the stock, in one transaction */
export async function qualitySave(spec, values, ctx, ud, barcode) {
  const { s2, ds, t } = await inspectionDataSet(spec, values, ctx, ud);
  const it = t('InspectionTrans');
  const head = it.rows[0];
  const c = (n) => it.schema.col(n).name;
  head.set(c('Shift'), String(await currentShift()));
  return insert(s2, ds, ctx, {
    plain: true,
    then: async (tx, key) => {
      const lot = num(head.get(c('InspectionLotNo')));
      const user = num(ctx.userCode);
      const type = netInt(await scalar(`Select InspectionType from inspectionHeader  where  InspectionLotNo=${lot}`, {}, tx));
      const sum = async (st) => netDouble(await scalar(`select sum(Qty) from InspectionTrans where status=${st} and InspectionLotNo=${lot}`, {}, tx));
      if (type === 700) {
        const approved = await sum(STATUS.Approved);
        await execute(`Update InspectionHeader set Status=${STATUS.Closed},ApprovedBy=${user} where  InspectionLotNo=${lot}`, {}, tx);
        await execute(`Update MaterialBarcode set UDID=${key}, QCStatus=${approved > 0 ? STATUS.Approved : STATUS.Rejected} where InspectionLotNo=${netInt(lot)}`, {}, tx);
        return;
      }
      const approved = await sum(STATUS.Approved);
      const rejected = await sum(STATUS.Rejected);
      await execute(`Update InspectionHeader set ApprovedQty=${netNum(approved)}, RejectedQty=${netNum(rejected)} where InspectionLotNo=${lot}`, {}, tx);
      await execute(`Update MaterialBarcode set UDID=${key}, QCStatus=${STATUS.Approved} where BarcodeNo=${netInt(head.get(c('SampleBarcode')))}`, {}, tx);
      const total = netDouble(await scalar(`select Qty  from inspectionHeader  where  InspectionLotNo=${lot}`, {}, tx));
      for (const [qty, st] of [[approved, STATUS.Approved], [rejected, STATUS.Rejected]]) {
        if (total !== qty) continue;
        await updateStock(lot, tx, false);
        await execute(`Update MaterialBarcode set UDID=${key}, QCStatus=${st}where InspectionLotNo=${lot}`, {}, tx);
        await updateStock(lot, tx, true);
        break;
      }
      if (barcode !== '') await materialBarcodeScan(barcode, key, netInt(head.get(c('Status'))), tx);
      if (type === 400 || type === 401) await execute(`Update InspectionHeader set Status=${STATUS.Closed},ApprovedBy=${user} where  InspectionLotNo=${lot} and Qty=${netNum(approved + rejected)}`, {}, tx);
      else await execute(`Update InspectionHeader set Status=${STATUS.Hold} where  InspectionLotNo=${lot} and Qty=${netNum(approved + rejected)}`, {}, tx);
    },
  });
}

/** AVQuality.CEATSaveSelfInspection(form, UD, barcode): the inspection (no shift), the lot's quantities; a lot now all
 *  approved releases its barcodes (or, for a material inspected again later, moves the barcode into a new lot), all
 *  rejected rejects them; in one transaction */
export async function ceatSelfInspectionSave(spec, values, ctx, ud, barcode) {
  const { s2, ds, t } = await inspectionDataSet(spec, values, ctx, ud);
  const it = t('InspectionTrans');
  const head = it.rows[0];
  if (!head) throw new Error('There is no row at position 0.');
  const lotCell = head.get(it.schema.col('InspectionLotNo').name);
  return insert(s2, ds, ctx, {
    plain: true,
    then: async (tx, key) => {
      const lot = num(lotCell);
      const user = num(ctx.userCode);
      const type = netInt(await scalar(`Select InspectionType from inspectionHeader  where  InspectionLotNo=${lot}`, {}, tx));
      const sum = async (st) => netDouble(await scalar(`select sum(Qty) from InspectionTrans where status=${st} and InspectionLotNo=${lot}`, {}, tx));
      const approved = await sum(STATUS.Approved);
      const rejected = await sum(STATUS.Rejected);
      await execute(`Update InspectionHeader set ApprovedQty= ${netNum(approved)}, RejectedQty=${netNum(rejected)} where InspectionLotNo=${lot}`, {}, tx);
      const total = netDouble(await scalar(`select Qty  from inspectionHeader  where  InspectionLotNo=${lot}`, {}, tx));
      const release = async (st) => {
        await updateStock(lot, tx, false);
        await execute(`Update MaterialBarcode set UDID=${key}, QCStatus=${st}${st === STATUS.Approved ? '' : ' '}where InspectionLotNo=${lot}`, {}, tx);
        await updateStock(lot, tx, true);
      };
      const closeLot = () =>
        type === 400 || type === 401
          ? execute(`Update InspectionHeader set Status=${STATUS.Closed},ApprovedBy=${user} where  InspectionLotNo=${lot} and Qty=${netNum(approved + rejected)}`, {}, tx)
          : execute(`Update InspectionHeader set Status=${STATUS.Hold} where  InspectionLotNo=${lot} and Qty=${netNum(approved + rejected)}`, {}, tx);
      if (total === approved) {
        const cfg = (await query(`select BaseUom, MatCode,Batch,SupBatch,ManDate,GrossWeight, Serial, Expiry, ExipiryMonths, isPacket,CaptureMrp,Track,IsInspectionReq,InspectionType,[PurchaseUnit],VariantCode,[type],RetestIn from Material where MatCode=(select Material from InspectionHeader where InspectionLotNo=${lot})`, {}, tx))[0];
        if (!cfg) throw new Error('There is no row at position 0.');
        if (!netBool(cfg.IsInspectionReq)) {
          await release(STATUS.Approved);
          await closeLot();
        } else if (netInt(cfg.InspectionType) === 301) await release(STATUS.Approved);
        else await newInspectionLot({ DocType: 4001, DocNo: 0, DocLine: 1, Material: cfg.MatCode, InspectionType: cfg.InspectionType, Qty: approved, Uom: cfg.BaseUom }, num(barcode), ctx, tx);
      } else if (total === rejected) {
        await release(STATUS.Rejected);
        await closeLot();
      }
    },
  });
}

/** AVQuality.GetUDListBarcode(barcodeNo): the checklist of the barcode's job card routing */
export const udListBarcode = async (barcode) => withQcColumns(await dataTable(`select * from ParameterTran where ParameterCode=(select top 1 ParameterCode from Processrouting where PSNO=(select DocNo from MaterialBarcode where BarcodeNo=${num(barcode)}))`));

/** AVQuality.ValidateBarcodeSelfInspection (CEAT): a held barcode of a self-inspection lot not already sent on.
 *  Returns its pack quantity and BarcodeNo~Serial (a barcode not on hold: 0 and no text). */
export async function validateBarcodeSelfInspection(barcode, onLot, onDept) {
  const bar = await query(`select BarcodeNo,Serial, PackQty,InspectionLotNo,Department,QCStatus from MaterialBarcode where Serial=@s and QCStatus=${STATUS.Hold}`, { s: barcode });
  if (bar.length) {
    const b = bar[0];
    // ValidateNextCEATAcitionforSelfInspection: an action already given on the barcode's current lot
    const lotNow = netInt(await scalar('select InspectionLotNo from MaterialBarcode WHERE Serial=@s', { s: barcode }));
    const o = netInt(await scalar(`select top 1 NextAction from InspectionTrans it inner join InspectionHeader ih on it.InspectionLotNo=ih.InspectionLotNo and ih.InspectionType=300 where it.Serial=@s AND it.InspectionLotNo =${lotNow}`, { s: barcode }));
    if (o > 0) throw new Error(`It is under ${['', 'HOLD-NCMR, Next Action : Re-Work', 'HOLD-NCMR, Next Action : Repair', 'HOLD-NCMR, Next Action : Finishing', 'Scrap'][o] ?? 'Nothing'}`);
    if (netInt(await scalar(`select InspectionType from InspectionHeader where InspectionLotNo=${num(b.InspectionLotNo)}`)) !== SELF_INSPECTION) throw new Error('It is under final quality');
    const pending = await pendingQty(str(b.InspectionLotNo));
    await onLot(str(b.InspectionLotNo));
    if (strZero(b.Department) !== '') await onDept(strZero(b.Department));
    if (pending < netDouble(b.PackQty)) throw new Error('Quantity Exceeded');
    return { qty: netDouble(b.PackQty), rtn: `${str(b.BarcodeNo)}~${str(b.Serial)}` };
  }
  const bar2 = await query('select BarcodeNo,Serial, PackQty,InspectionLotNo,Department,QCStatus from MaterialBarcode where Serial=@s', { s: barcode });
  if (!bar2.length) throw new Error('BarcodeNo Does Not Exist');
  const b = bar2[0];
  if (netInt(b.QCStatus) === STATUS.Hold) {
    // ValidateNextAcitionforSelfInspection: its action text never reaches the message (passed by value)
    if (netInt(await scalar('select top 1 NextAction from InspectionTrans it inner join InspectionHeader ih on it.InspectionLotNo=ih.InspectionLotNo and ih.InspectionType=300 where it.Serial=@s', { s: barcode })) > 0) throw new Error('It is under ');
  } else if (netInt(await scalar(`select InspectionType from InspectionHeader where InspectionLotNo=${num(b.InspectionLotNo)}`)) !== SELF_INSPECTION) throw new Error('This is not under Self Inspection');
  return { qty: 0, rtn: '' };
}

/** AVQuality.CheckCEATSCADACuringBarcode: false when the tyre's curing record has a parameter out (CEAT's
 *  SCADACuringDetails; on WRL the table does not exist and this fails) */
export async function scadaCuringOk(serial) {
  const rows = await dataTable("SELECT DISTINCT t.* FROM [SCADACuringDetails] t CROSS APPLY STRING_SPLIT(t.gt_barcode, ',') s WHERE s.value = @s", { s: serial });
  if (!rows.length) return true;
  return !['HSP_P_avg', 'HSP_T_avg', 'HWS_P_avg', 'HWS_T_avg', 'CWS_P_avg', 'CWS_T_avg', 'dome_T_avg'].some((c) => str(cell(rows[0], c)) === '1');
}

/** the inspection's DataSet (the form's tables + InspectionUD) with the checklist results as InspectionUD rows */
async function inspectionDataSet(spec, values, ctx, ud) {
  const s2 = { ...spec, top: { ...spec.top, tag: `${spec.top.tag}|InspectionUD` } };
  const ds = await collect(s2, values, ctx);
  const t = (n) => ds.tables.find((x) => x.schema.name.toLowerCase() === n.toLowerCase());
  const udT = t('InspectionUD');
  if (!Array.isArray(ud)) throw new Error('Object reference not set to an instance of an object.');
  const col = (n) => udT.schema.col(n)?.name ?? n;
  for (const dr of ud) {
    const r = new Map([[col('ID'), 0]]);
    for (const [to, from] of [['LineCode', 'LineCode'], ['LineValue', 'qcvalue'], ['Remark', 'remark'], ['Status', 'qcstatus'], ['InstrumentID', 'InstrumentID']]) {
      const x = cell(dr, from);
      if (x !== null && x !== undefined) r.set(col(to), x);
    }
    udT.rows.push(r);
  }
  udT.prefix = 'ID';
  return { s2, ds, t };
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

/** AVQuality.ValidateBarcodeNCMR: the NCMR inspection of a held / NCMR barcode; rtn = BarcodeNo~Serial */
export async function validateBarcodeNCMR(serial) {
  const bar = await query('select BarcodeNo,Serial, PackQty,InspectionLotNo,UDID,Department,QCStatus from MaterialBarcode where Serial=@s', { s: serial });
  if (!bar.length) throw new Error('BarcodeNo Does Not Exist');
  const st = netInt(bar[0].QCStatus);
  if (st !== STATUS.Hold && st !== 15) throw new Error('It is not under NCMR');
  const id = str(await scalar(`Select ID from InspectionTrans where Status=15 and SampleBarcode=${num(bar[0].BarcodeNo)}`));
  if (id === '') throw new Error('It is not under NCMR');
  return { id, rtn: `${str(bar[0].BarcodeNo)}~${str(bar[0].Serial)}` };
}

const ddMMMyyyyHHmmss = (d) => {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};

/** AVQuality.updateStockAction: one barcode's current quantity out of / into its stock row (into: by area too) */
async function updateStockAction(barcode, tx, add) {
  const d = (await query(`Select * from MaterialBarcode where BarcodeNo = ${num(barcode)}`, {}, tx))[0];
  if (!d) throw new Error('There is no row at position 0.');
  const qty = netDouble(d.CurrentQty);
  const st = netInt(d.QCStatus);
  const [hold, release, rejected] = [st === STATUS.Hold ? qty : 0, st === STATUS.Approved ? qty : 0, st === STATUS.Rejected ? qty : 0];
  const [m, loc, batch, area] = [netInt(d.Material), netInt(d.StorageCode), netInt(d.Batch), netInt(d.Area)];
  if (!add) return execute(`Update MaterialStock set HoldQty= HoldQty-${netNum(hold)},ReleasedQty=ReleasedQty-${netNum(release)}, RejectedQty=RejectedQty-${netNum(rejected)}  where Material=${m} and  StorageCode=${loc} and Batch=${batch}`, {}, tx);
  if (netDouble(await scalar(`select Qty from MaterialStock where Material=${m} and StorageCode = ${loc} and Batch=${batch} and Area=${area}`, {}, tx)) > 0) {
    return execute(`Update MaterialStock set HoldQty= HoldQty+${netNum(hold)},ReleasedQty=ReleasedQty+${netNum(release)} , RejectedQty=RejectedQty+${netNum(rejected)} where Material=${m} and StorageCode = ${loc} and Batch=${batch} and Area=${area}`, {}, tx);
  }
  return execute(`insert into MaterialStock (StorageCode,Material,Batch,Qty,HoldQty,ReleasedQty,RejectedQty,Uom,Area,Department,BusinessUnit) values(${loc},${m},${batch},${netNum(qty)},${netNum(hold)},${netNum(release)},${netNum(rejected)},${netInt(d.Uom)},${area},${netInt(d.Department)},${netInt(d.BusinessUnit)})`, {}, tx);
}

/** AVQuality.SaveNCMRConfirmation: the NCMR decision on the inspection; an approval releases the barcode (or holds
 *  it for a new inspection lot when its material needs inspection), otherwise the barcode takes the status.
 *  (The remark is a parameter here; the original spliced it into the SQL.) */
export async function saveNCMRConfirmation(id, barcode, status, nextAction, remark, ctx) {
  const [i, b, st, next, user] = [num(id), num(barcode), num(status), num(nextAction), num(ctx.userCode)];
  await transaction(async (tx) => {
    await execute(`Update InspectionTrans set NextAction=${next}, NCMRBy=${user}, NCMRRemark=@r, NCMROn=getdate() where ID=${i}`, { r: remark }, tx);
    if (status === String(STATUS.Approved)) {
      await execute(`Update InspectionTrans set NextAction=${next}, NCMRBy=${user}, NCMRRemark=@r, NCMROn=getdate(),ApprovedOn=getdate() ,ApprovedBy=${user} where ID=${i}`, { r: remark }, tx);
      const bar = (await query(`Select Material,Uom,CurrentQty from materialbarcode where barcodeno=${b}`, {}, tx))[0];
      if (!bar) throw new Error('There is no row at position 0.');
      const cfg = (await query(`select BaseUom, IsInspectionReq,InspectionType,RetestIn from Material where MatCode=${num(bar.Material)}`, {}, tx))[0];
      if (!cfg) throw new Error('There is no row at position 0.');
      if (netBool(cfg.IsInspectionReq)) {
        await newInspectionLot({ DocType: 4001, DocNo: 0, DocLine: bar.CurrentQty, Material: bar.Material, InspectionType: cfg.InspectionType, Qty: 1, Uom: bar.Uom }, b, ctx, tx);
      } else {
        await updateStockAction(b, tx, false);
        await execute(`Update MaterialBarcode set QCStatus=${STATUS.Approved}, LastMaintained ='${ddMMMyyyyHHmmss(new Date())}' where BarcodeNo=${b}`, {}, tx);
        await updateStockAction(b, tx, true);
      }
    } else {
      await execute(`Update MaterialBarcode set QCStatus=${st} , LastMaintained ='${ddMMMyyyyHHmmss(new Date())}' where BarcodeNo=${b}`, {}, tx);
    }
  });
}

/** A new inspection lot for a barcode (key from IDMaster for the session's business unit, int.Parse'd): the barcode is
 *  put on hold in it, then the header is inserted (InsertDataWithoutTransaction) */
async function newInspectionLot(fields, barcode, ctx, tx) {
  const schema = await tableSchema('InspectionHeader');
  const { key, prefix } = await generateKey(schema.name, 1, netInt(ctx.businessUnit), tx);
  const lot = netInt(key);
  const col = (n) => schema.col(n)?.name ?? n;
  const row = new Map(Object.entries({ InspectionLotNo: String(lot), Alias: `${prefix}${lot}`, DocDate: new Date(new Date().setMilliseconds(0)), ...fields, Department: netString(ctx.department), BusinessUnit: netString(ctx.businessUnit), Status: 1 })
    .filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [col(k), v]));
  await execute(`Update MaterialBarcode set QCStatus=${STATUS.Hold},InspectionLotNo=${lot} where BarcodeNo =${barcode}`, {}, tx);
  await insert(null, { tables: [{ schema, prefix: '', rows: [row] }] }, ctx, { plain: true, tx });
}

/** AVQuality.ValidateBarcodeRRF: a rejected barcode's open inspection for this action (1 rework, 2 repair, 3 finishing) */
export async function validateBarcodeRRF(serial, action) {
  const bar = await query(`select BarcodeNo,Serial, PackQty,InspectionLotNo,UDID,Department,QCStatus from MaterialBarcode where Serial=@s and QCStatus=${STATUS.Rejected}`, { s: serial });
  if (!bar.length) throw new Error('BarcodeNo Does Not Exist');
  const id = str(await scalar(`Select ID from InspectionTrans where not Status=${STATUS.Approved} and NextAction=${action} and SampleBarcode=${num(bar[0].BarcodeNo)}`));
  if (id === '') throw new Error('This is not for action');
  return { id, rtn: `${str(bar[0].BarcodeNo)}~${str(bar[0].Serial)}` };
}

/** AVQuality.ReworkHistory: the job card's earlier inspections with their defects and resolutions */
export const reworkHistory = async (serial) => blank(await dataTable("Select pp.Name[Process],dc.Name[Defect],rc.Type[RootCause],rr.Type[Resolution],it.ApprovedOn[ResolutionDate],us.UserName[User]  from InspectionHeader ih inner join InspectionTrans it on ih.InspectionLotNo =it.InspectionLotNo inner join InspectionDefect id on it.ID =id.ID inner join DefectCodeMaster dc on id.Defect=dc.Code inner join ProductionProcess pp on pp.ProcessCode =ih.Process left join RootCause rc on it.RootCause=rc.ID left join ReworkResolution rr on it.ReworkResolution =rr.ID left join Users us on  it.UserCode=us.UserCode    where ih.DocNo=(Select DocNo from MaterialBarcode where Serial=@s) ", { s: serial }));

/** AVQuality.SaveRRFConfirmation: the action confirmed on the inspection; the barcode then goes to a new inspection
 *  lot (its material needs self inspection, or Settings.ReworkSelfApproval = 0) or is released.
 *  (The remark is a parameter here; the original spliced it into the SQL.) */
export async function saveRRFConfirmation(id, barcode, remark, rootCause, actionTaken, selfApproval, ctx) {
  const [i, b, user] = [num(id), num(barcode), num(ctx.userCode)];
  const bar = (await query(`Select Material,Uom,CurrentQty,DocType,DocNo,DocLine from materialbarcode where barcodeno=${b}`))[0];
  if (!bar) throw new Error('There is no row at position 0.');
  const cfg = (await query(`select BaseUom, IsInspectionReq,InspectionType,RetestIn from Material where MatCode=${num(bar.Material)}`))[0];
  if (!cfg) throw new Error('There is no row at position 0.');
  await transaction(async (tx) => {
    await execute(`Update InspectionTrans set RootCause=${netInt(rootCause)}, ReworkResolution= ${netInt(actionTaken)}, ApprovedBy =${user}, ApproverRemark=@r,ApprovedOn=getdate() where ID=${i}`, { r: remark }, tx);
    const type = await query(`Select top 1 InspectionType,Process,DocLine from InspectionHeader where InspectionLotNo=(select inspectionLotNo from InspectionTrans where ID=${i})`, {}, tx);
    const selfLot = netBool(cfg.IsInspectionReq) && (type[0] ?? (() => { throw new Error('There is no row at position 0.'); })()) && netInt(type[0].InspectionType) === SELF_INSPECTION;
    if (selfLot || selfApproval === 0) {
      await execute(`Update InspectionHeader set Status=${STATUS.Closed} where InspectionLotNo=(select inspectionLotNo from InspectionTrans where ID=${i})`, {}, tx);
      if (!type[0]) throw new Error('There is no row at position 0.');
      await newInspectionLot({ DocType: bar.DocType, DocNo: bar.DocNo, DocLine: type[0].DocLine, Process: type[0].Process, Material: bar.Material, InspectionType: cfg.InspectionType, Qty: bar.CurrentQty, Uom: bar.Uom }, b, ctx, tx);
    } else {
      await updateStockAction(b, tx, false);
      await execute(`Update MaterialBarcode set QCStatus=${STATUS.Approved}where BarcodeNo=${b}`, {}, tx);
      await updateStockAction(b, tx, true);
    }
  });
}
