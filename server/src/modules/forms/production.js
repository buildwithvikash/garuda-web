// AVProductionCapture / AVProcess as used by the Production pages. The original concatenated values into its SQL:
// numbers read from the database are checked and spliced the same way (same text, same errors); typed-in codes are
// parameters, except where the original spliced them unquoted (then only digits pass, as numbers).
import { query, scalar, execute, transaction } from '../../db/index.js';
import { netInt, netLong, netDouble, netNum } from '../../lib/net.js';
import { dataTable } from './qc.js';
import { num, lit } from '../../lib/sql.js';
import { printerDetail, printLabel } from './labels.js';

const str = (v) => (v === null || v === undefined ? '' : String(v)); // WrapperAvatar.ParseString
const allDigits = (s) => /^\d*$/.test(s); // s.All(char.IsDigit): "" too
/** String.Substring(start, length): out of range throws (the callers turn that into "not valid") */
const sub = (s, start, length) => {
  if (start < 0 || length < 0 || start + length > s.length) throw new Error('Index and length must refer to a location within the string.');
  return s.substr(start, length);
};

/** One serial-logic segment taken off the front of the serial (null when the serial does not fit it).
 *  vendor: the vendor-mapping variant of the original's loop (no year > 0 check; week numbers removed everywhere). */
async function segment(dr, serial, material, vendor) {
  const code = str(dr.VariantCode);
  let part;
  if (code === '11') {
    const alt = str(await scalar(`Select AltName from material where matCode=${vendor ? netLong(material) : num(material)}`));
    if (serial.indexOf(alt) !== 0) return null;
    part = alt;
  } else if (code === '10') {
    if (netInt(dr.Length) > serial.length) return null;
    part = sub(serial, 0, netInt(dr.Length));
  } else if (code === '1') {
    part = str(dr.Format).toLowerCase() === 'yy' ? sub(serial, 0, 2) : sub(serial, 0, 4);
    if (!vendor && netInt(part) <= 0) return null;
  } else if (code === '2') {
    const fmt = str(dr.Format).toLowerCase();
    if (fmt === 'mm') {
      part = sub(serial, 0, 2);
      if (netInt(part) > 12 || netInt(part) < 1) return null;
    } else part = fmt.includes('alpha') ? sub(serial, 0, 1) : sub(serial, 0, 3);
  } else if (code === '3') {
    part = sub(serial, 0, 2);
    if (netInt(part) > 31 || netInt(part) < 1) return null;
  } else if (code === '4') {
    part = sub(serial, 0, 2);
    if (netInt(part) > 52 || netInt(part) < 1) return null;
    if (vendor) return serial.replaceAll(part, ''); // serial.Replace(week, "")
  } else {
    const value = str(dr.Value);
    if (value.trim() === '') return null;
    part = sub(serial, 0, value.length);
    if (part !== value) return null;
  }
  if (serial.indexOf(part) !== 0) return null;
  return serial.slice(part.length);
}
/** a row's segment and its separator; false when the serial does not fit (or did not get shorter) */
async function consume(dr, state, material, vendor) {
  const next = await segment(dr, state.serial, material, vendor);
  if (next === null || next === state.find) return false;
  state.serial = next;
  state.find = next;
  const sep = str(dr.Seperator);
  if (sep !== '') {
    const part = sub(state.serial, 0, sep.length);
    if (state.serial.indexOf(part) !== 0) return false;
    state.serial = state.serial.slice(part.length);
    if (state.serial === state.find) return false;
    state.find = state.serial;
  }
  return true;
}

/** AVProductionCapture.ValidateVendorSerialNew: does the serial fit the material's serial logic (or, without one, the
 *  first segment of a vendor mapping's logic)? { ok, vendCode }. Any error counts as "does not fit". */
export async function validateVendorSerialNew(material, serial) {
  try {
    const m = netLong(material);
    const length = netInt(await scalar(`Select SerialLength from SerialGenerationLogicHeader Where SerialCode =(Select TrackNoType  from Material where Matcode=${m} )`));
    if (length > 0 && serial.length !== length) return { ok: false, vendCode: '' };
    const rows = await query(`Select * from SerialGenerationLogicDetail where SerialCode =(Select TrackNoType  from Material where Matcode=${m} ) order by Seq `);
    const state = { serial, find: serial };
    if (!rows.length) {
      let vendCode = '';
      for (const map of await query(`Select * from MaterialLedgerMap where MatCode=${m}`)) {
        const logic = await query(`Select * from SerialGenerationLogicDetail where SerialCode =${netInt(map.SerialLogic)} order by Seq `);
        if (logic.length) vendCode = str(map.VandorMatCode);
        else continue;
        // only the logic's first segment is checked (the original returns inside its loop)
        if (!(await consume(logic[0], state, material, true))) return { ok: false, vendCode: '' };
        return state.find === state.serial ? { ok: true, vendCode } : { ok: false, vendCode: '' };
      }
      return { ok: true, vendCode };
    }
    for (const dr of rows) if (!(await consume(dr, state, material, false))) return { ok: false, vendCode: '' };
    return { ok: true, vendCode: '' };
  } catch {
    return { ok: false, vendCode: '' };
  }
}

/** AVProductionCapture.ValidateWorkStation: a station by its code (digits) or alias in the business unit; with the
 *  first of its processes. { ok, rtn: "code~alias", process } */
export async function validateWorkStation(ws, bu) {
  let code;
  let rtn;
  if (allDigits(ws)) {
    code = await scalar(`select Alias from WorkCenter where stationcode=${ws} and BusinessUnit=${num(bu)}`);
    rtn = `${ws}~${str(code)}`;
  } else {
    code = await scalar(`select StationCode from WorkCenter where Alias=@a and BusinessUnit=${num(bu)}`, { a: ws });
    rtn = `${str(code)}~${ws}`;
  }
  if (str(code) === '') return { ok: false, rtn, process: '' };
  const process = str(await scalar(`select top 1 ProcessCode from WorkCenterProcesses where stationcode=${num(rtn.split('~')[0])}`));
  return { ok: true, rtn, process };
}



/** AVProcess.RMComponetStatus */
export const componentStatus = async (serial) => netInt(await scalar('Select Status from MaterialBarcode where Serial=@s', { s: serial }));

/** AVProductionCapture.ReplaceRMScanValidate(row): a scanned component replaced by a new serial that fits its material */
export async function replaceRMScan(r, ctx) {
  const existing = str(await scalar('Select Serial from ProcessInputBOMSCan where Serial=@s', { s: str(r.NewSerialNo) }));
  if (existing === str(r.Serial)) throw new Error('Already Scanned');
  if (existing !== '') throw new Error('Replace Serial No. Already Scanned');
  const v = await validateVendorSerialNew(str(r.matCode), str(r.NewSerialNo));
  if (!v.ok) return false;
  await transaction(async (tx) => {
    await execute(`insert into ProcessInputBOMScanReplace(PSNo,ProcessCode,RowID,Material,Serial,NewSerialNo,Qty,Operator,BarcodeNo) values(${num(r.PsNo)},${num(r.ProcessCode)},${num(r.RowID)},${num(r.matCode)},${lit(r.Serial)},${lit(r.NewSerialNo)},1,${netInt(ctx.userCode)},0)`, {}, tx);
    await execute(`Update ProcessInputBomScan set Serial=${lit(r.NewSerialNo)}, ScannedOn = getdate() where PsNo=${num(r.PsNo)} and ProcessCode=${num(r.ProcessCode)} and RowID=${num(r.RowID)} and Serial=${lit(r.Serial)}`, {}, tx);
    await execute(`Update MaterialBarcode set Serial=${lit(r.NewSerialNo)}, CreatedOn = getdate() where DocNo=${num(r.PsNo)} and Serial=${lit(r.Serial)}`, {}, tx);
  });
  return true;
}

/** AVMM.UpdateLocation(location, barcode, StockAdd: true, dw): the barcode's quantity into the location's stock row,
 *  the barcode active there. false when the barcode does not exist. */
export async function updateLocationAdd(locationCode, barcode) {
  const d = (await query(`Select * from MaterialBarcode where BarcodeNo = ${num(barcode)}`))[0];
  if (!d) return false;
  const [m, batch, cArea, qty, uom, st] = [netInt(d.Material), netLong(d.Batch), netInt(d.Area), netDouble(d.CurrentQty), netInt(d.Uom), netInt(d.QCStatus)];
  const [hold, release, rejected] = [st === 11 ? qty : 0, st === 12 ? qty : 0, st === 13 ? qty : 0];
  const loc = num(locationCode);
  const area = netLong(loc) <= 0 ? netLong(d.Area) : netLong(await scalar(`Select Area from StorageArea where StorageCode=${loc}`));
  if (netDouble(await scalar(`select Qty from MaterialStock where Material=${m} and StorageCode = ${loc} and Batch=${batch} and Area=${cArea}`)) > 0) {
    await execute(`Update MaterialStock set Qty=qty+${netNum(qty)},HoldQty= HoldQty+${netNum(hold)},ReleasedQty=ReleasedQty+${netNum(release)} , RejectedQty=RejectedQty+${netNum(rejected)} where Material=${m}and StorageCode = ${loc} and Batch=${batch} and Area=${cArea}`);
  } else {
    await execute(`insert into MaterialStock (StorageCode,Material,Batch,Qty,HoldQty,ReleasedQty,RejectedQty,Uom,Area,Department,BusinessUnit) values(${loc},${m},${batch},${netNum(qty)},${netNum(hold)},${netNum(release)},${netNum(rejected)},${uom},${area}, ${netInt(d.Department)},${netInt(d.BusinessUnit)})`);
  }
  if (netLong(loc) > 0) await execute(`Update MaterialBarcode set Status=1,  StorageCode=${loc},Area=${area} where BarcodeNo = ${num(barcode)}`);
  else await execute(`Update MaterialBarcode set Status=1,  StorageCode=${loc} where BarcodeNo = ${num(barcode)}`);
  return true;
}

/** the serial-number length of a material's track-number logic (VariantCode 10) */
const serialLength = async (material) => netInt(await scalar(`Select Length from  SerialGenerationLogicDetail where serialCode=(select TrackNoType from Material where matcode=${num(material)}) and VariantCode=10`));
/** SUBSTRING(Serial, LEN(Serial)-(n-1), n): the serial's last n characters, as the original wrote it */
const tail = (col, n) => `SUBSTRING(${col}, LEN(${col})-${n - 1},${n})`;
const SHOW = 'Select M.MatCode,m.Name[Material],mb.Serial,mb.VSerial[Asset ID] from MaterialBarcode mb inner join Material m on mb.material=m.MatCode where ';

/** AVProductionCapture.ShowModelDetails: the material's live barcodes whose serial number is in the range */
export async function showModelDetails(srcMat, startSerial, endSerial) {
  const n = await serialLength(srcMat);
  netInt(startSerial); // ParseInt(start / end): unused, but it throws on text that is not a number
  netInt(endSerial);
  return dataTable(`${SHOW}mb.Material=${num(srcMat)} and Cast(${tail('mb.Serial', n)} as bigint) >=${netLong(startSerial)} and Cast(${tail('mb.Serial', n)}as bigint) <=${netLong(endSerial)} and mb.Status != 99`);
}

/** AVProductionCapture.ModelToModelTransferWRL (no transaction: each statement stands): every live barcode of the source
 *  material in the serial range moves to the destination material (stock row, job card), its label printed again;
 *  returns the moved barcodes. start / end are spliced as typed (the page lets only whole numbers through). */
export async function modelToModelTransfer(srcMat, desMat, startSerial, endSerial, printer, ctx) {
  const [src, des] = [num(srcMat), num(desMat)];
  const n = await serialLength(srcMat);
  const [start, end] = [netLong(startSerial), netLong(endSerial)];
  let listBar = '(';
  let i = 0;
  for (let s = start; s <= end; s++) {
    const d = (await query(`Select * from MaterialBarcode where Material=${src} and ${tail('Serial', n)}='${String(s).padStart(n, '0')}' and Status !=99`))[0];
    if (!d) continue;
    await execute(`Update MaterialStock set Qty=qty-${num(d.CurrentQty)},ReleasedQty=ReleasedQty-${num(d.CurrentQty)} where Material=${num(d.Material)}  and  StorageCode=${num(d.StorageCode)}  and Batch=${num(d.Batch)}`);
    await execute(`Update MaterialBarcode set Material=${des} where BarcodeNo=${num(d.BarcodeNo)}`);
    await execute(`Update ProcessOrder set Material=${des} where PSNo=${num(d.DocNo)}`);
    await updateLocationAdd(str(d.StorageCode), str(d.BarcodeNo));
    const copies = netInt(await scalar(`Select NoofCopy from RoutingTrans where routecode=(Select Routing from ProcessOrder where PSNO=${num(d.DocNo)}) and ProcessCode=${num(d.ProcessCode)}`));
    const bp = await printerDetail(printer);
    let j = 0;
    do {
      await printLabel('inprocess', str(d.BarcodeNo), bp, ctx.userId);
      j++;
    } while (j < copies);
    i++;
    listBar += `${str(d.BarcodeNo)}${s >= end ? ')' : ','}`;
  }
  if (i > 0) await execute(`Insert into ModelToModel(SrcMaterial,DestMaterial,StartSerial,EndSerial,qty,UserCode) Values(${src},${des},${startSerial},${endSerial},${i},${netInt(ctx.userCode)})`);
  return dataTable(`${SHOW}mb.Status !=99 and mb.BarcodeNo in ${listBar}`);
}

/** AVProductionCapture.GetPSNo: a job card by number / alias, else by its stage label ("" when none) */
export async function getPSNo(jobcard) {
  const j = lit(jobcard);
  let ps = str(await scalar(allDigits(jobcard) ? `select top 1 PSNO from ProcessOrder where PSNO=${j} or alias=${j}` : `select top 1 PSNO from ProcessOrder where alias=${j}`));
  if (ps === '') ps = str(await scalar(`select top 1 PSNO from ProcessStageLabel where BarcodeNo=${j}`));
  return ps;
}

/** AVProductionCapture.FillGuide's data: the job card's instructions and guide files (a blank first item) at the process */
export async function guideData(psNo, process) {
  const where = `ri.RouteCode=pr.RouteCode and ri.SeqNo=pr.SeqNo and pr.ProcessCode=${num(process)} and pr.PSNo=${num(psNo)}`;
  const instructions = await dataTable(`select RI.Instruction from RouteInstruction RI inner join ProcessRouting pr on ${where}`);
  const files = (await query(`select Description,RI.GuidePath from Routingguide RI inner join ProcessRouting pr on ${where}`)).map((r) => ({ value: str(r.GuidePath), text: str(r.Description) }));
  return { instructions, files: [{ value: '', text: '' }, ...files] };
}

/** AVProductionCapture.FillOrderMaterial */
export const orderMaterial = (psNo) => dataTable(`select md.Name[Model],m.Name[Material]  from ProcessOrder po inner join Material m on po.Material =m.MatCode inner join Model md on m.Model=md.ModelCode where po.psno= ${num(psNo)}`);

const yyOf = (d) => String(d.getFullYear()).slice(-2);
const mmOf = (d) => String(d.getMonth() + 1).padStart(2, '0');
/** scalar().ToString() of a row that must exist (no row: null reference) */
const mustText = async (sql, tx) => {
  const rows = await query(sql, {}, tx);
  if (!rows.length) throw new Error('Object reference not set to an instance of an object.');
  return str(Object.values(rows[0])[0]); // a NULL value is DBNull: ""
};

/** DataWrapper.GenerateSerialNo(FGMat, material, bu, dept, process, n) inside the page's transaction: process prefix +
 *  BU prefix + the FG material's AltName + yy + MM + the year's next number for (material, station = process, BU)
 *  (5 digits); the counter row is created or bumped. Returns { keyNo, serial }. */
export async function generateSerialNo(fgMat, material, bu, dept, process, noOfKeys, tx, now = new Date()) {
  const [m, b, d, p] = [material, bu, dept, process].map(num);
  const yy = yyOf(now);
  const buPrefix = b !== '0' ? await mustText(`select Prefix from BusinessUnit where BUCode=${b}`, tx) : '';
  if (d !== '0') await mustText(`select Prefix from Department where DeptCode=${d}`, tx); // read, not used
  const stationPrefix = p !== '0' ? str(await scalar(`select Prefix from ProductionProcess where ProcessCode=${p}`, {}, tx)) : '';
  const materialPrefix = await mustText(`select AltName from Material where Matcode=${num(fgMat)}`, tx);
  let key = str(await scalar(`Select Max(NextSerialNo) from SerialBarcode where isnull(AssetID,0)=0 and Material=${m} and Station=${p} and BusinessUnit=${b} and Year=${yy}`, {}, tx));
  if (key === '') {
    key = '1';
    await execute(`Insert into SerialBarcode(Material,Month,Year,NextSerialNo,BusinessUnit,Department,Station,AssetID) values(${m},${mmOf(now)},${yy},${noOfKeys + 1},${b},${d},${p},0)`, {}, tx);
  } else {
    await execute(`Update SerialBarcode set  NextSerialNo=NextSerialNo+${noOfKeys} where isnull(AssetID,0)=0 and Station=${p} and Material=${m}  and BusinessUnit=${b} and Year=${yy}`, {}, tx);
  }
  return { keyNo: `${stationPrefix}${buPrefix}${materialPrefix}${yy}${mmOf(now)}${key.padStart(5, '0')}`.replaceAll(' ', ''), serial: Number(key) };
}

/** DataWrapper.GenerateSerialNoWRL: the next serial after lastSerial (its last 5 digits + 1), the counter bumped */
export async function generateSerialNoWRL(process, material, bu, lastSerial, tx, now = new Date()) {
  const n = lastSerial.length;
  const lastFive = n > 5 ? lastSerial.slice(n - 5) : lastSerial;
  if (!/^\s*[+-]?\d+\s*$/.test(lastFive)) throw new Error('Input string was not in a correct format.'); // long.Parse
  const serial = Number(lastFive) + 1;
  await execute(`Update SerialBarcode set  NextSerialNo= NextSerialNo + 1 where isnull(AssetID,0)=0 and Station=${num(process)} and Material=${num(material)}  and BusinessUnit=${num(bu)} and Year=${yyOf(now)}`, {}, tx);
  return { keyNo: `${n > 5 ? lastSerial.slice(0, n - 5) : ''}${String(serial).padStart(5, '0')}`, serial };
}
