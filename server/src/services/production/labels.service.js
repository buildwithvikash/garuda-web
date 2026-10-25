// Label printing (Avatar.AVLabelPrint, Akaar.AIPPrint, ADriverPrint). A label is the printer-command template of a
// MaterialTag ("[COLUMN]" placeholders) filled from the record, then sent raw to the printer: to its IP (TCP 9100,
// ASCII) or, without an IP, to the Windows printer driver on the server. buildX() returns the command text; send()
// delivers it, so parity can compare the text.
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { query, queryTable, scalar, execute } from '../../db/connection.js';
import { netString, netInt } from '../../shared/utils/net.js';
import { requireDigits } from '../../shared/utils/sql.js';
import { toText } from '../../shared/utils/values.js';

const run = promisify(execFile);
const pad = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// DateTime.Now.ToString(...) on en-IN ("/" prints as the culture's "-")
const ddMMMyyyy = (d) => `${pad(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}`;
const ddMMMyyHHmm = (d) => `${pad(d.getDate())}-${MON[d.getMonth()]}-${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())} `;
const MMcommayyyy = (d) => `${pad(d.getMonth() + 1)},${d.getFullYear()}`;

/** A DataTable as the original read it: ADO column names, values as .NET ToString(). */
async function table(sql, params, tx) {
  const t = await queryTable(sql, params, { tx });
  return { columns: t.columns.map((c) => c.name), rows: t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.name, toText(r[c.name], { sqlType: c.type, scale: c.scale })]))) };
}
const upper = (s) => netString(s).toUpperCase();
const replaceAll = (s, a, b) => s.split(a).join(b);
/** prnString.Replace("[COL]", value) for every column of the first row, or "" when there is none */
function fillColumns(prn, t, value = (v) => upper(v)) {
  for (const c of t.columns) prn = replaceAll(prn, `[${c.toUpperCase()}]`, t.rows.length ? value(t.rows[0][c], c) : '');
  return prn;
}
/** AVLabelPrint.ReplaceNewLine: a MaterialTagField with a Length wraps the value (a "\n" after every Length chars) */
function replaceNewLine(fields, field, str, prn) {
  const f = fields.rows.find((r) => upper(r.FieldName) === field.toUpperCase());
  if (f && netInt(f.Length) > 0) {
    const len = netInt(f.Length);
    let out = '';
    for (let i = 0; i < str.length; i += len) out += `${str.slice(i, i + len)}\n`;
    return replaceAll(prn, `[${field}]`, out);
  }
  return replaceAll(prn, `[${field}]`, str);
}

// ---- printers ----------------------------------------------------------------------------------------------------

/** TitleControl.FillPrinter / AU.FillALLBarcodePrinterList: printers of the business unit (the only one preselected). */
export async function printerOptions(businessUnit) {
  const rows = await query('Select ROWID,Name from BarcodePrinter Where BusinessUnit=@bu', { bu: netString(businessUnit) });
  const options = [{ value: '', text: 'Select A Value' }, ...rows.map((r) => ({ value: netString(r.ROWID), text: netString(r.Name) }))];
  return { options, value: options.length === 2 ? options[1].value : '' };
}

/** AVLabelPrint.GetPrinterDetail */
export async function printerDetail(printerId) {
  const r = (await query('Select * from barcodePrinter where RowID=@id', { id: netInt(printerId) }))[0];
  return r ? { name: netString(r.Name), IP: netString(r.IP), driver: netString(r.Driver) } : { name: '', IP: '', driver: '' };
}

/** WrapperAvatar.PingHost (Ping.Send, 5 s) */
export async function pingHost(host) {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await run('ping', ['-n', '1', '-w', '5000', host], { windowsHide: true });
    return /TTL=/i.test(stdout);
  } catch {
    return false;
  }
}

/** AU.CheckPrinterStatus: a printer with an IP must answer a ping. */
export async function printerOnline(printerId) {
  const r = (await query('select * from BarcodePrinter Where ROWID=@id', { id: netInt(printerId) }))[0];
  if (!r) throw new Error('There is no row at position 0.');
  return netString(r.IP) === '' || (await pingHost(netString(r.IP)));
}

/** AIPPrint.PrintData: ping, port check, then the bytes (Encoding.ASCII: other characters become "?"). */
export async function sendToIp(text, ip, port = 9100) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('Wrong IP Address!');
  if (!(await pingHost(ip))) return false;
  const bytes = Buffer.from([...text].map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 63)));
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port, noDelay: true });
    s.setTimeout(20000);
    s.on('connect', () => s.end(bytes, () => resolve(true)));
    s.on('error', () => resolve(false));
    s.on('timeout', () => {
      s.destroy();
      resolve(false);
    });
  });
}

/** ADriverPrint.SendStringToPrinter: RAW job "TIM_LABEL_PRINT" through the Windows spooler (ANSI code page). */
export async function sendToDriver(printerName, text) {
  if (process.platform !== 'win32') return false;
  const script = fileURLToPath(new URL('./raw-print.ps1', import.meta.url));
  await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, printerName, Buffer.from(text, 'utf8').toString('base64')], { windowsHide: true }).catch(() => {});
  return true;
}

/** The pages' "IP given -> network, else driver" step (port "0" = 9100). */
async function deliver(prn, ip, driver, { retry = false } = {}) {
  if (ip !== '' && ip !== '0') {
    if (!(await sendToIp(prn, ip)) && retry) await sendToIp(prn, ip);
  } else await sendToDriver(driver, prn);
}

// ---- labels ------------------------------------------------------------------------------------------------------

/** AVLabelPrint.PrintEmployeeQRLabel (tag type 300) */
export async function buildEmployeeQR(empCode, userId, now = new Date()) {
  const code = requireDigits(empCode);
  const head = await table(`select * from Employee e inner join Users u on e.EmpCode =u.Employee where e.EmpCode=${code}`);
  let prn = netString(await scalar('select top 1 PrnCommand from MaterialTag where TagType=300'));
  const fields = await table('Select * from MaterialTagField where TagCode=(select  top 1 Tagcode from MaterialTag where TagType=300)');
  if (prn === '') throw new Error('Print Tag is not created');
  // dtField is never null here: every column goes through ReplaceNewLine with the value as stored (not upper-cased)
  if (head.rows.length) for (const c of head.columns) prn = replaceNewLine(fields, c.toUpperCase(), head.rows[0][c], prn);
  else for (const c of head.columns) prn = replaceAll(prn, `[${c.toUpperCase()}]`, '');
  prn = replaceAll(prn, '[PRINTDATE]', ddMMMyyyy(now));
  return replaceAll(prn, '[USER]', netString(userId));
}

/** AVLabelPrint.PrintStorageAreaLabel (tag type 200) */
export async function buildStorageArea(storageCode, userId, now = new Date()) {
  const code = requireDigits(storageCode);
  const head = await table(`select sa.StorageCode,sa.Name,sa.Alias,d.Alias[Department],b.Alias[BusinessUnit],m.Alias[MatCode],m.Name[Material],m.AltName   from StorageArea sa inner join Department d on sa.Department=d.DeptCode inner join BusinessUnit b on d.BusinessUnit=b.BuCode  left join Material m on sa.Material=m.MatCode where sa.storagecode=${code}`);
  let prn = netString(await scalar('select PrnCommand from MaterialTag where TagType=200'));
  if (prn === '') throw new Error('Print Tag is not created');
  prn = fillColumns(prn, head);
  if (head.rows.length) prn = replaceAll(prn, '[BARCODELENGTH]', String(netString(head.rows[0].Name).length));
  prn = replaceAll(prn, '[PRINTDATE]', ddMMMyyyy(now));
  return replaceAll(prn, '[USER]', netString(userId));
}

/** The tag of a material: its own, its category's, else the default (TagType 1). */
async function materialTag(matCode, categoryFirst) {
  const own = () => scalar(`select PrnCommand from MaterialTag where TagCode=(select TagCode from Material where MatCode=${matCode} )`);
  const cat = () => scalar(`select PrnCommand from MaterialTag where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${matCode} )) `);
  let prn = netString(await (categoryFirst ? cat() : own()));
  if (prn === '') prn = netString(await (categoryFirst ? own() : cat()));
  if (prn === '') prn = netString(await scalar('select PrnCommand from MaterialTag where TagType=1'));
  if (prn === '') throw new Error('Print Tag or PRN is Not assigned for the Material Category');
  return prn;
}

/** AVLabelPrint.PrintGRNLabel (text only; marks the barcode printed when asked) */
export async function buildGRN(barcodeNo, userId, now = new Date()) {
  const b = requireDigits(barcodeNo);
  const head = await table(`select g.GRNCODE[GRN], g.Alias[GrnCode], FORMAT (GRNDate, 'dd/MM/yyyy') as GRNDate ,d.Name[Department],b.Name[BusinesUnit],b.Alias[BuCode],l.Name[Vendor],g.PONo from GRAPOHeader g left join Department d on g.Department=d.DeptCode inner join BusinessUnit b on g.BusinessUnit=b.BuCode inner join Ledger l on g.Vendor=l.LedgerCode where g.GRNCode=(select Docno from MaterialBarcode where BarcodeNo=${b})`);
  const mat = await table(`select p.Name[ProjectNo],t.Name[TaskNo],mb.docLine[LineCode], mb.BarcodeNo,mb.Serial, m.MatCode,m.Alias,m.Name[ItemName],m.AltName ,mb.CurrentQty[QTY],u.Alias[Uom],ih.VendorBatch,FORMAT (ih.ExpiryDate, 'dd/MM/yyyy') as ExpiryDate,ih.Manufacturer,ih.ManufBatch,FORMAT (ih.ManufDate, 'dd/MM/yyyy') as ManufDate,mc.NAME[Category],mb.QCStatus,sa.Alias[StoragCode],m.FIFOAge from MaterialBarcode mb inner join Material m on mb.Material=m.MatCode left join MaterialCategory mc on mc.CategoryCode=m.Category left join MaterialBatch  ih on ih.BatchNo =mb.Batch inner join UnitOfMeasure u on mb.Uom=u.UomCode left join Project p on mb.Project=p.ProjectCode left join Task t on mb.Task=t.TaskCode left Join StorageArea sa on sa.storageCode=mb.StorageCode  where mb.BarcodeNo=${b}`);
  const vars = await table(`Select f.Name[VariantField],vf.Name[VariantValue]   from VariantTran vt left join VariantFieldValue vf on vt.ValueCode=vf.Code left join VariantField f on vf.Field=f.FieldCode where VariantCode= (select VariantCode from Material where matcode=(select Material from MaterialBarcode where BarcodeNo=${b}))`);
  let prn = '';
  if (mat.rows.length) prn = netString(await scalar(`select PrnCommand from MaterialTag where TagCode=(select TagCode from Material where MatCode=${mat.rows[0].MatCode} )`));
  if (prn === '') {
    if (!mat.rows.length) throw new Error('There is no row at position 0.');
    prn = netString(await scalar(`select PrnCommand from MaterialTag where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${mat.rows[0].MatCode} )) `));
    if (prn === '') {
      prn = netString(await scalar('select PrnCommand from MaterialTag where TagType=1'));
      if (prn === '') throw new Error('Print Tag or PRN is Not assigned for the Material Category');
    }
  }
  prn = fillColumns(prn, head);
  // QC status: 12 Approved, 11 Hold (blank), anything else Rejected
  prn = fillColumns(prn, mat, (v, c) => (c.toUpperCase() !== 'QCSTATUS' ? upper(v) : netInt(v) === 12 ? 'Approved' : netInt(v) === 11 ? '' : 'Rejected'));
  if (mat.rows.length) prn = replaceAll(prn, '[BARCODELENGTH]', String(netString(mat.rows[0].Serial).length));
  prn = fillColumns(prn, vars);
  try {
    try {
      const po = await table(`Select PoNo,PoLineCode  from GRAPOMaterial  where GRNCode=${head.rows[0]?.GRN ?? ''} and LineCode=${mat.rows[0]?.LineCode ?? ''}`);
      const osp = await table(`Select distinct Material.Alias[AddlDescription] from ProcessOutputBOM inner join Material on ProcessOutputBOM.Material=Material.MatCode  where PSNO=(Select PSNo  from OSPHeader where PONo=${po.rows[0].PoNo} and POLine=${po.rows[0].PoLineCode})`);
      if (osp.rows.length) prn = fillColumns(prn, osp);
    } catch {
      /* swallowed in the original */
    }
    if (!head.rows.length || !mat.rows.length) throw new Error('There is no row at position 0.');
    const addl = await table(`select AddlDescription from GRAPOMaterial where GRNCode=${head.rows[0].GRN} and Material=${mat.rows[0].MatCode}`);
    if (addl.rows.length) prn = fillColumns(prn, addl);
    const loc = await table(`select top 1 sa.Alias[StoragCode],sa.Name[StorageName],d.Alias[DeptCode],d.Name[Department],b.Alias[BuCode],b.Name[BusinessUnit] from StorageArea sa inner join Department d on sa.Department=d.DeptCode inner join BusinessUnit b on sa.BusinessUnit=b.BuCode where sa.Material=${mat.rows[0].MatCode}`);
    prn = fillColumns(prn, loc);
  } catch {
    /* swallowed in the original */
  }
  prn = replaceAll(prn, '[PRINTDATE]', ddMMMyyyy(now));
  return replaceAll(prn, '[USER]', `${netString(userId)} on ${ddMMMyyyy(now)}`);
}

/** AVLabelPrint.PrintInProcessLabel (WRL: not the TMEIC variant) */
export async function buildInProcess(barcodeNo, userId, now = new Date()) {
  const b = requireDigits(barcodeNo);
  let head = await table(`select ps.Material,ps.Alias[ProcessOrder],M.Name[FGMaterial],m.Alias[FGCode],po.Alias[ProductionOrder],l.Name[HCustomer],cp.Name[CurrentProcess],np.Name[NextProcess],po.CustID,po.TrackID,ps.MainPSNO,ps.Batch[BATCH1],u.Alias[U1],po.Qty[BSIZE],b.name[PLANT]  from ProcessOrder ps left join PRODHeader po on ps.PRODNo=po.PRODNo left join SOHeader so on po.SalesOrder =so.SONo left join Ledger l on so.Customer=l.LedgerCode left join ProductionProcess cp on ps.CurrentProcess=cp.ProcessCode left join ProductionProcess np on np.ProcessCode=ps.NextProcess left join Material m on m.MatCode =ps.Material left join UnitOfMeasure u on ps.Uom = u.UomCode left join BusinessUnit b on po.BusinessUnit =b.bucode  where ps.PSNo=(select Docno from MaterialBarcode where BarcodeNo=${b})`);
  if (!head.rows.length) head = await table(`select ps.Material,ps.Alias[ProcessOrder],M.Name[FGMaterial],m.Alias[FGCode],po.Alias[ProductionOrder],l.Name[HCustomer],cp.Name[CurrentProcess],np.Name[NextProcess],po.CustID,po.TrackID,ps.MainPSNO  from ProcessOrder ps left join PRODHeader po on ps.PRODNo=po.PRODNo left join SOHeader so on po.SalesOrder =so.SONo left join Ledger l on so.Customer=l.LedgerCode left join ProductionProcess cp on ps.CurrentProcess=cp.ProcessCode left join ProductionProcess np on np.ProcessCode=ps.NextProcess left join Material m on m.MatCode =ps.Material  where ps.PSNo=(Select PSNO from ProcessStageLabel where BarcodeNo=(select Serial from MaterialBarcode where BarcodeNo=${b}))`);
  const mat = await table(`select mb.WorkCenter,m.SRetailRate[MRP],mb.BarcodeNo,mb.Vserial,mb.Serial, m.MatCode,m.Alias,m.Name[ItemName],m.AltName  ,mb.CurrentQty[QTY], mb.Serial2, u.Alias[U1],ih.VendorBatch,FORMAT (ih.ExpiryDate, 'dd/MM/yyyy') as ExpiryDate,ih.Manufacturer,ih.ManufBatch,FORMAT (ih.ManufDate, 'dd/MM/yyyy') as ManufDate,ih.Batch,mb.Alias as [REFBARCODE],FORMAT (mb.CreatedOn, 'dd/MM/yyyy')[CreatedOn],FORMAT (mb.ExpiryDate, 'dd/MM/yyyy')[BAREXPIRY],mb.Serial2,mb1.Serial[MHE],mb.GrossWeight[GRWT],mb.TareWeight[TRWT],mb.NetWeigh[NETWT],U2.Alias[U2],mb.WeighingScale[WTNO] from MaterialBarcode mb inner join Material m on mb.Material=m.MatCode left join MaterialBatch  ih on ih.BatchNo =mb.Batch LEFT join MaterialBarcode mb1 on  mb1.BarcodeNo =mb.HUID  inner join UnitOfMeasure u on mb.Uom=u.UomCode left join UnitOfMeasure U2 on mb.WeightUom = U2.UomCode  where mb.BarcodeNo=${b}`);
  if (!head.rows.length) throw new Error('There is no row at position 0.'); // dtHeader.Rows[0]["MainPSNO"]
  const vq = (src, val, where) => table(`Select v.${val}[VariantValue],f.Name[VariantField] from ${src} mv inner join VariantFieldValue   v on mv.ValueCode=v.Code inner join VariantField f on v.Field=f.FieldCode ${where}`);
  const pvar = await vq('VariantTran', 'Name', ` where mv.VariantCode=${netInt(head.rows[0].MainPSNO)}`);
  const modelOf = `ModelCode=(Select Model From Material where MatCode=(select Material from MaterialBarcode where BarcodeNo=${b}))`;
  const vars = await vq('ModelVariant', 'Name', `   where ${modelOf}`);
  const matVar = await vq('MaterialVariant ', 'Name', `   where MatCode=${head.rows[0].Material}`);
  const varP = await vq('ModelVariant', 'Prefix', `   where ${modelOf}`);
  const matVarP = await vq('MaterialVariant ', 'Prefix', `   where MatCode=${head.rows[0].Material}`);
  const outBom = await table(`select us.UserName[USER],pout.StationCode,wc.Alias[STATION],pout.Remark from ProcessOutputBOMBarcode pout inner join Users us on pout.Operator = us.UserCode inner join WorkCenter wc on pout.StationCode = wc.StationCode where BarcodeNo =${b}`);
  if (!mat.rows.length) throw new Error('There is no row at position 0.'); // dtMat.Rows[0]["MatCode"]
  const fields = await table(`Select * from MaterialTagField where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${mat.rows[0].MatCode} )) `);
  let prn = await materialTag(mat.rows[0].MatCode, true);
  prn = replaceAll(prn, '[PREFIX]', '');
  // dtField is a table (never null): header and BOM values as stored, material values upper-cased, all wrapped
  for (const c of head.columns) prn = replaceNewLine(fields, c.toUpperCase(), head.rows[0][c], prn);
  for (const c of mat.columns) prn = replaceNewLine(fields, c.toUpperCase(), upper(mat.rows[0][c]), prn);
  if (outBom.rows.length) for (const c of outBom.columns) prn = replaceNewLine(fields, c.toUpperCase(), outBom.rows[0][c], prn);
  else for (const c of outBom.columns) prn = replaceAll(prn, `[${c.toUpperCase()}]`, '');
  for (const [t, pre] of [[pvar, ''], [vars, ''], [matVar, ''], [varP, 'P-'], [matVarP, 'P-']]) {
    for (const r of t.rows) prn = replaceAll(prn, `[${pre}${upper(r.VariantField)}]`, netString(r.VariantValue));
  }
  prn = replaceAll(prn, '[MDATE]', MMcommayyyy(now));
  prn = replaceAll(prn, '[PDATE]', ddMMMyyHHmm(now));
  prn = replaceAll(prn, '[PRINTDATE]', ddMMMyyyy(now));
  return replaceAll(prn, '[USER]', `${netString(userId)} On ${ddMMMyyyy(now)}`);
}

/** Build + deliver, as the page's print step did ("None"/""/"0" printer: nothing). */
export async function printLabel(kind, key, printer, userId) {
  if (printer.name === 'None' || printer.name === '' || printer.name === '0') return;
  if (kind === 'employee') return deliver(await buildEmployeeQR(key, userId), printer.IP, printer.driver);
  if (kind === 'storage') return deliver(await buildStorageArea(key, userId), printer.IP, printer.driver);
  if (kind === 'grn') {
    const prn = await buildGRN(key, userId);
    await execute(`Update MaterialBarcode set PrintStatus=1 where BarcodeNo=${requireDigits(key)}`);
    if (printer.IP.trim() !== '' && printer.IP !== '0' && printer.IP.toLowerCase() !== 'client') return deliver(prn, printer.IP, printer.driver, { retry: true });
    if (printer.IP.toLowerCase() === 'client') throw new Error('Object reference not set to an instance of an object.'); // SourceWebPage is null
    return sendToDriver(printer.driver, prn);
  }
  if (kind === 'processcard') return deliver(await buildProcessCard(key), printer.IP, printer.driver);
  if (kind === 'inprocess') {
    const prn = await buildInProcess(key, userId);
    await deliver(prn, printer.IP, printer.driver);
    await execute(`Update MaterialBarcode set PrintStatus=1 where BarcodeNo=${requireDigits(key)}`);
  }
}

/** AVLabelPrint.PrintProcessCardLabel's text (tag type 10): the job card's header; "" when there is no template */
export async function buildProcessCard(psNo) {
  const head = await table(`select ps.Alias[ProcessOrder],M.Name[FGMaterial],m.Alias[FGCode],po.Alias[ProductionOrder],l.Name[Customer],po.CustID,po.TrackID  from ProcessOrder ps left join PRODHeader po on ps.PRODNo=po.PRODNo left join SOHeader so on po.SalesOrder =so.SONo left join Ledger l on so.Customer=l.LedgerCode left join Material m on m.MatCode =ps.Material  where ps.PSNo=${requireDigits(psNo)}`);
  let prn = netString(await scalar('select Top 1 PrnCommand from MaterialTag where TagType=10'));
  if (head.rows.length) {
    prn = fillColumns(prn, head);
    prn = replaceAll(prn, '[BARCODELENGTH]', String(netString(head.rows[0].ProcessOrder).length));
  }
  return prn;
}

// ---- production start (ProductionAssignment)----------------------------------------------------------------------

const PS_HEAD = 'select ps.Material,ps.Alias[ProcessOrder],M.Name[FGMaterial],m.Alias[FGCode],po.Alias[ProductionOrder],l.Name[HCustomer],cp.Name[CurrentProcess],np.Name[NextProcess],po.CustID,po.TrackID,ps.MainPSNO  from ProcessOrder ps left join PRODHeader po on ps.PRODNo=po.PRODNo left join SOHeader so on po.SalesOrder =so.SONo left join Ledger l on so.Customer=l.LedgerCode left join ProductionProcess cp on ps.CurrentProcess=cp.ProcessCode left join ProductionProcess np on np.ProcessCode=ps.NextProcess left join Material m on m.MatCode =ps.Material  where ps.PSNo=';
const PS_MAT = "select mb.WorkCenter,m.SRetailRate[MRP],mb.BarcodeNo,mb.Vserial,mb.Serial, m.MatCode,m.Alias,m.Name[ItemName],m.AltName  ,mb.CurrentQty[QTY], mb.Serial2, u.Alias[Uom],ih.VendorBatch,FORMAT (ih.ExpiryDate, 'dd/MM/yyyy') as ExpiryDate,ih.Manufacturer,ih.ManufBatch,FORMAT (ih.ManufDate, 'dd/MM/yyyy') as ManufDate from MaterialBarcode mb inner join Material m on mb.Material=m.MatCode left join MaterialBatch  ih on ih.BatchNo =mb.Batch inner join UnitOfMeasure u on mb.Uom=u.UomCode where mb.BarcodeNo=";
const prnOf = async (sql, tx) => netString(await scalar(sql, {}, tx));

/** ProductionAssignment btnPrint_Click's label data, read once for the first job card (in its transaction): header,
 *  barcode, variants, tag fields and the PRN with [PREFIX] = the station alias' first letter. */
export async function prodStartLabelData(psNo, barcode, tx) {
  const t = (sql) => table(sql, {}, tx);
  const head = await t(`${PS_HEAD}${requireDigits(psNo)}`);
  const mat = await t(`${PS_MAT}${requireDigits(barcode)}`);
  if (!head.rows.length) throw new Error('There is no row at position 0.'); // dtHeader.Rows[0]["MainPSNO"]
  const vq = (src, val, where) => t(`Select v.${val}[VariantValue],f.Name[VariantField] from ${src} mv inner join VariantFieldValue   v on mv.ValueCode=v.Code inner join VariantField f on v.Field=f.FieldCode ${where}`);
  const pvar = await vq('VariantTran', 'Name', ` where mv.VariantCode=${netInt(head.rows[0].MainPSNO)}`);
  if (!mat.rows.length) throw new Error('There is no row at position 0.'); // dtMat.Rows[0]["MatCode"]
  const m = mat.rows[0].MatCode;
  const model = `ModelCode=(Select Model From Material where MatCode=${m})`;
  const vars = await vq('ModelVariant', 'Name', `   where ${model}`);
  const matVar = await vq('MaterialVariant ', 'Name', `   where MatCode=${head.rows[0].Material}`);
  const varP = await vq('ModelVariant', 'Prefix', `   where ${model}`);
  const matVarP = await vq('MaterialVariant ', 'Prefix', `   where MatCode=${head.rows[0].Material}`);
  const alias = netString(await scalar(`Select Alias  from WorkCenter where StationCode=${mat.rows[0].WorkCenter}`, {}, tx));
  if (alias.length < 1) throw new Error('Index and length must refer to a location within the string.\r\nParameter name: length'); // Substring(0, 1)
  const stationPrefix = alias.slice(0, 1);
  const fields = await t(`Select * from MaterialTagField where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${m} )) `);
  let prn = await prnOf(`select PrnCommand from MaterialTag where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${m} )) `, tx);
  if (prn === '') prn = await prnOf(`select PrnCommand from MaterialTag where TagCode=(select TagCode from Material where MatCode=${m} )`, tx);
  if (prn === '') prn = await prnOf('select PrnCommand from MaterialTag where TagType=1', tx);
  if (prn === '') throw new Error('Print Tag or PRN is Not assigned for the Material Category');
  return { head, mat, vars: [[pvar, ''], [vars, ''], [matVar, ''], [varP, 'P-'], [matVarP, 'P-']], fields, prn: replaceAll(prn, '[PREFIX]', stationPrefix) };
}

/** AVLabelPrint.PrintInProcessLabelProdStartWRL: the PRN filled (header and barcode values wrapped per tag field),
 *  sent noOfCopy times (at least once); any failure is ignored. printer: the printer row's id. */
export async function printProdStart(data, printerId, bp, noOfCopy, now = new Date()) {
  try {
    if (['None', '', '0'].includes(netString(printerId))) return;
    let prn = data.prn;
    for (const c of data.head.columns) prn = replaceNewLine(data.fields, c.toUpperCase(), netString(data.head.rows[0][c]), prn);
    if (data.mat.rows.length) for (const c of data.mat.columns) prn = replaceNewLine(data.fields, c.toUpperCase(), netString(data.mat.rows[0][c]), prn);
    else for (const c of data.mat.columns) prn = replaceAll(prn, `[${c.toUpperCase()}]`, '');
    for (const [t, pre] of data.vars) for (const r of t.rows) prn = replaceAll(prn, `[${pre}${upper(r.VariantField)}]`, netString(r.VariantValue));
    prn = replaceAll(prn, '[MDATE]', MMcommayyyy(now));
    prn = replaceAll(prn, '[PDATE]', ddMMMyyHHmm(now));
    let i = 0;
    do {
      await deliver(prn, bp.IP, bp.driver);
      i++;
    } while (i < noOfCopy);
  } catch {
    // swallowed, as the original
  }
}

// ---- stage label (WIPCapture QC: the next stage's serial) -------------------------------------------------------------

const SL_HEAD = 'select ps.Alias[ProcessOrder],M.Name[FGMaterial],m.Alias[FGCode],po.Alias[ProductionOrder],l.Name[Customer],cp.Name[CurrentProcess],np.Name[NextProcess],po.CustID,po.TrackID,ps.Material,ps.MainPSNO from ProcessOrder ps left join PRODHeader po on ps.PRODNo=po.PRODNo left join SOHeader so on po.SalesOrder =so.SONo left join Ledger l on so.Customer=l.LedgerCode left join ProductionProcess cp on ps.CurrentProcess=cp.ProcessCode left join ProductionProcess np on np.ProcessCode=ps.NextProcess left join Material m on m.MatCode =ps.Material  where ps.PSNo=';
const SL_HEAD2 = 'select ps.Material,ps.Alias[ProcessOrder],M.Name[FGMaterial],m.Alias[FGCode],po.Alias[ProductionOrder],l.Name[Customer],cp.Name[CurrentProcess],np.Name[NextProcess],po.CustID,po.TrackID,ps.MainPSNO  from ProcessOrder ps left join PRODHeader po on ps.PRODNo=po.PRODNo left join SOHeader so on po.SalesOrder =so.SONo left join Ledger l on so.Customer=l.LedgerCode left join ProductionProcess cp on ps.CurrentProcess=cp.ProcessCode left join ProductionProcess np on np.ProcessCode=ps.NextProcess left join Material m on m.MatCode =ps.Material  where ps.PSNo=';
/** AVLabelPrint.PrintStageLabel(barcode, printer...): the barcode's stage label (header, barcode, variants), sent,
 *  then PrintStatus=1. bp: the printer row ({ name, IP, driver }). */
export async function printStageLabel(barcodeNo, bp, now = new Date()) {
  if (['None', '', '0'].includes(bp.name)) return;
  const b = requireDigits(barcodeNo);
  let head = await table(`${SL_HEAD}(select Docno from MaterialBarcode where BarcodeNo=${b})`);
  if (!head.rows.length) head = await table(`${SL_HEAD2}(Select PSNO from ProcessStageLabel where BarcodeNo=(select Serial from MaterialBarcode where BarcodeNo=${b}))`);
  const mat = await table(`select m.SRetailRate[MRP], mb.BarcodeNo,mb.Serial, m.MatCode,m.Alias,m.Name[ItemName],m.AltName  ,mb.CurrentQty[QTY], mb.Serial2, u.Alias[Uom],ih.VendorBatch,FORMAT (ih.ExpiryDate, 'dd/MM/yyyy') as ExpiryDate,ih.Manufacturer,ih.ManufBatch,FORMAT (ih.ManufDate, 'dd/MM/yyyy') as ManufDate from MaterialBarcode mb inner join Material m on mb.Material=m.MatCode left join MaterialBatch  ih on ih.BatchNo =mb.Batch inner join UnitOfMeasure u on mb.Uom=u.UomCode where mb.BarcodeNo=${b}`);
  if (!head.rows.length) throw new Error('There is no row at position 0.'); // dtHeader.Rows[0]["MainPSNO"]
  const vq = (src, where) => table(`Select v.Name[VariantValue],f.Name[VariantField] from ${src} mv inner join VariantFieldValue   v on mv.ValueCode=v.Code inner join VariantField f on v.Field=f.FieldCode ${where}`);
  const vars = [
    await vq('VariantTran', ` where mv.VariantCode=${netInt(head.rows[0].MainPSNO)}`),
    await vq('ModelVariant', ` where ModelCode=(Select Model From Material where MatCode=(select Material from MaterialBarcode where BarcodeNo=${b}))`),
    await vq('MaterialVariant ', `where MatCode=${head.rows[0].Material}`),
  ];
  if (!mat.rows.length) throw new Error('There is no row at position 0.'); // dtMat.Rows[0]["MatCode"]
  const m = mat.rows[0].MatCode;
  const fields = await table(`Select * from MaterialTagField where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${m} )) `);
  let prn = netString(await scalar(`select PrnCommand from MaterialTag where TagCode=(select TagCode from MaterialCategory where CategoryCode=(select Category from Material where MatCode=${m} )) `));
  if (prn === '') prn = netString(await scalar(`select PrnCommand from MaterialTag where TagCode=(select TagCode from Material where MatCode=${m} )`));
  if (prn === '') prn = netString(await scalar('select PrnCommand from MaterialTag where TagType=1'));
  if (prn === '') throw new Error('Print Tag or PRN is Not assigned for the Material Category');
  for (const c of head.columns) prn = replaceNewLine(fields, c.toUpperCase(), netString(head.rows[0][c]), prn);
  for (const c of mat.columns) prn = replaceNewLine(fields, c.toUpperCase(), netString(mat.rows[0][c]), prn);
  for (const t of vars) for (const r of t.rows) prn = replaceAll(prn, `[${upper(r.VariantField)}]`, netString(r.VariantValue));
  prn = replaceAll(prn, '[PDATE]', ddMMMyyHHmm(now));
  await deliver(prn, bp.IP, bp.driver);
  await execute(`Update MaterialBarcode set PrintStatus=1 where BarcodeNo=${b}`);
}
