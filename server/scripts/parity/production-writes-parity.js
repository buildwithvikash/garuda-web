// Write parity for the Production pages' own code, on the test copy: each case runs on the original, the touched rows
// are read and put back, then the same on the new app; rows, alerts and results compared, everything restored after.
// Usage: node --env-file=.env scripts/parity/production-writes-parity.js <originalBinDir> [--api] [section name part...]
import { query, execute } from '../../src/db/pool.js';
import { loadSettings } from '../../src/modules/settings/settings.service.js';
import { PAGE_EVENTS, eventHelpers } from '../../src/modules/forms/pages.js';
import { SPECS, specOf, ctx, original as run } from './lib.js';
import { apiOf, apiEvent } from './api.js';

const [bin, ...args] = process.argv.slice(2);
const viaApi = args.includes('--api'); // the new side through the screens' APIs (/api/production/<screen>, ./api.js)
const only = args.filter((a) => a !== '--api');
await loadSettings();
const original = (cases) => run(bin, cases);
const results = [];
const sections = [];
const section = (name, fn) => sections.push([name, fn]);

// ---- FG scrap ----------------------------------------------------------------------------------------------------------
// A finished good is scanned and scrapped; its barcode, its components' barcodes and scans are restored after each run
// and the FGScrap rows deleted. Scrapped serials end in the minute: compared without it.
section('fg scrap', async () => {
  const spec = SPECS['/production/fgscrapform'];
  const fg = (await query("select top 1 mb.BarcodeNo, mb.Serial, mb.DocNo from MaterialBarcode mb where mb.Status<>99 and exists (select 1 from ProcessInputBOMScan pb where pb.PSNo=mb.DocNo and pb.BarcodeNo is not null) order by mb.BarcodeNo desc"))[0];
  if (!fg) return;
  const scans = await query('select RowID, BarcodeNo, Serial from ProcessInputBOMScan where PSNo=@p', { p: fg.DocNo });
  const ids = [fg.BarcodeNo, ...scans.map((r) => r.BarcodeNo)].filter((x) => x !== null).join(',');
  const bars = await query(`select BarcodeNo, Status, Serial from MaterialBarcode where BarcodeNo in (${ids})`);
  const restore = async () => {
    for (const b of bars) await execute('update MaterialBarcode set Status=@s, Serial=@r where BarcodeNo=@b', { s: b.Status, r: b.Serial, b: b.BarcodeNo });
    for (const r of scans) await execute('update ProcessInputBOMScan set Serial=@s where RowID=@r and PSNo=@p', { s: r.Serial, r: r.RowID, p: fg.DocNo });
    await execute(`delete from FGScrap where BarcodeNo in (${ids})`);
  };
  const cut = (x) => String(x ?? '').replace(/-SCRAP\d\d-\d\d-\d\d-\d\d/, '-SCRAP*');
  const snap = async () => ({
    bars: (await query(`select BarcodeNo, Status, Serial from MaterialBarcode where BarcodeNo in (${ids})`)).map((r) => `${r.BarcodeNo}:${r.Status}:${cut(r.Serial)}`).sort(),
    scans: (await query('select RowID, Serial from ProcessInputBOMScan where PSNo=@p', { p: fg.DocNo })).map((r) => `${r.RowID}:${cut(r.Serial)}`).sort(),
    scrap: (await query(`select BarcodeNo, Serial, PSNo, Remark, SCRAPCATEGORY, LastStation, UserID from FGScrap where BarcodeNo in (${ids})`)).map((r) => JSON.stringify({ ...r, Serial: cut(r.Serial) })).sort(),
  });
  const cat = String((await query('select top 1 ID from ScrapReasons order by ID'))[0]?.ID ?? '');
  try {
    await restore();
    const steps = [{ handler: 'Go_Click', control: 'Go', values: { TBBarcode: fg.Serial } }, { handler: 'btnSave_Click1', control: 'btnSave', values: { TBRemark: ' ZZP scrap ', DDLScrapCategory: cat } }];
    const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, steps, ctx, spec: specOf(spec) }]);
    const afterO = await snap();
    await restore();
    const v = { TBBarcode: fg.Serial, TBRemark: ' ZZP scrap ', DDLScrapCategory: cat, GvDetails: [] };
    const n = viaApi && apiOf(spec) ? await apiEvent(spec, ctx, 'btnSave', v, { viewState: { __Go: 'Clr' } }) : await PAGE_EVENTS[spec.file].btnSave(v, eventHelpers(spec, ctx, v, { viewState: { __Go: 'Clr' } }));
    const afterN = await snap();
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    const oa = (o.result?.alerts ?? []).join('|');
    if (o.ok && oa !== (n.alert ?? '')) problems.push(`alert "${oa}" vs "${n.alert ?? ''}"`);
    for (const k of Object.keys(afterO)) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} ${JSON.stringify(afterO[k]).slice(0, 300)} vs ${JSON.stringify(afterN[k]).slice(0, 300)}`);
    results.push([`FG scrap (serial ${fg.Serial}, ${scans.length} components)`, problems.length ? problems.join(' | ') : `IDENTICAL (${oa ? `alert "${oa}"` : 'scrapped'})`]);
  } finally {
    await restore();
  }
});

// ---- RM replacement ------------------------------------------------------------------------------------------------------
// a serial's component replaced by an unused serial of the same form (its number + k); scans, barcodes and the replace
// log restored after each run.
section('rm replacement', async () => {
  const spec = SPECS['/production/rmreplacementform'];
  // a component whose material has a serial logic of fixed values / year / month / serial number, and a new serial built
  // from that logic (unused), so the replacement goes through
  // (a raw material: the screen replaces only those, owner 28 Oct 2026; the original took any component)
  const comp = (await query(`select top 1 pb.PSNo, pb.RowID, pb.Serial, pb.ProcessCode, pb.Material from ProcessInputBOMScan pb join Material m on m.MatCode=pb.Material
    join MaterialCategoryType mc on mc.ID=m.Type
    where pb.Serial is not null and mc.Type='Raw Material' and exists (select 1 from SerialGenerationLogicDetail d where d.SerialCode=m.TrackNoType)
      and not exists (select 1 from SerialGenerationLogicDetail d where d.SerialCode=m.TrackNoType and d.VariantCode not in (1,2,9,10))
      and exists (select 1 from MaterialBarcode mb where mb.DocNo=pb.PSNo and mb.Status<>99) order by pb.RowID desc`))[0];
  const fg = (await query('select top 1 Serial, DocNo from MaterialBarcode where DocNo=@p and Status<>99 order by BarcodeNo desc', { p: comp.PSNo }))[0];
  const logic = await query('select d.* from SerialGenerationLogicDetail d where d.SerialCode=(select TrackNoType from Material where MatCode=@m) order by Seq', { m: comp.Material });
  const now = new Date();
  let candidate = '';
  for (let k = 1; k < 50 && !candidate; k++) {
    const part = (d) => ({ 9: d.Value ?? '', 1: String(d.Format).toLowerCase() === 'yy' ? String(now.getFullYear()).slice(-2) : String(now.getFullYear()), 2: String(now.getMonth() + 1).padStart(2, '0'), 10: String(90000 + k).slice(-Number(d.Length)).padStart(Number(d.Length), '0') })[d.VariantCode];
    const c = logic.map((d) => part(d) + (d.Seperator ?? '')).join('');
    if (!(await query('select 1 x from ProcessInputBOMScan where Serial=@s', { s: c })).length) candidate = c;
  }
  const bars = await query('select BarcodeNo, Serial from MaterialBarcode where DocNo=@p and Serial=@s', { p: fg.DocNo, s: comp.Serial });
  const restore = async () => {
    await execute('update ProcessInputBOMScan set Serial=@s where PSNo=@p and RowID=@r and ProcessCode=@c', { s: comp.Serial, p: fg.DocNo, r: comp.RowID, c: comp.ProcessCode });
    for (const b of bars) await execute('update MaterialBarcode set Serial=@s where BarcodeNo=@b', { s: b.Serial, b: b.BarcodeNo });
    await execute('delete from ProcessInputBOMScanReplace where PSNo=@p and NewSerialNo=@n', { p: fg.DocNo, n: candidate });
  };
  const snap = async () => ({
    scan: (await query('select Serial from ProcessInputBOMScan where PSNo=@p and RowID=@r and ProcessCode=@c', { p: fg.DocNo, r: comp.RowID, c: comp.ProcessCode })).map((r) => r.Serial),
    bars: (await query(`select BarcodeNo, Serial from MaterialBarcode where BarcodeNo in (${bars.map((b) => b.BarcodeNo).join(',') || 0})`)).map((r) => `${r.BarcodeNo}:${r.Serial}`).sort(),
    log: (await query('select PSNo, ProcessCode, RowID, Material, Serial, NewSerialNo, Qty, Operator, BarcodeNo from ProcessInputBOMScanReplace where PSNo=@p and NewSerialNo=@n', { p: fg.DocNo, n: candidate })).map((r) => JSON.stringify(r)),
  });
  try {
    await restore();
    const steps = [{ handler: 'Go_Click', control: 'Go', values: { TBBarcode: fg.Serial } }, { handler: 'btnRxistScan_Click', control: 'btnexistScan', values: { TBExistingRM: comp.Serial } }, { handler: 'btnNewScan_Click', control: 'btnNewScan', values: { TBNewRM: candidate } }];
    const tables = [{ key: 'Data', columns: ['Category', 'Material', 'Process', 'Serial', 'PsNo', 'RowID', 'ProcessCode', 'matCode', 'NewSerialNo'], rows: [] }];
    const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, dataTables: tables, steps, ctx, spec: specOf(spec) }]);
    const afterO = await snap();
    await restore();
    let vs = { __Go: 'Go', __ExistGo: 'Go', __NewGo: 'Go' };
    let v = { TBBarcode: fg.Serial, GvDetails: [] };
    for (const [id, patch] of [['Go', {}], ['btnexistScan', { TBExistingRM: comp.Serial }], ['btnNewScan', { TBNewRM: candidate }]]) {
      v = { ...v, ...patch };
      const r = viaApi && apiOf(spec) ? await apiEvent(spec, ctx, id, v, { viewState: vs }) : await PAGE_EVENTS[spec.file][id](v, eventHelpers(spec, ctx, v, { viewState: vs }));
      for (const [k, p] of Object.entries(r.set ?? {})) {
        if ('value' in p) v = { ...v, [k]: p.value };
        if (p.rows) v = { ...v, [k]: p.rows };
      }
      vs = r.viewState ?? vs;
    }
    const afterN = await snap();
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    for (const k of Object.keys(afterO)) if (JSON.stringify(afterO[k]) !== JSON.stringify(afterN[k])) problems.push(`${k} ${JSON.stringify(afterO[k])} vs ${JSON.stringify(afterN[k])}`);
    results.push([`RM replacement (${comp.Serial} -> ${candidate})`, problems.length ? problems.join(' | ') : `IDENTICAL (${afterN.log.length ? 'replaced' : 'not replaced'})`]);
  } finally {
    await restore();
  }
});

for (const [name, fn] of sections) {
  if (only.length && !only.some((x) => name.includes(x))) continue;
  try {
    await fn();
  } catch (e) {
    results.push([name, `ERROR ${e.message}`]);
  }
}
for (const [r, m] of results) console.log(`${m.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${r}: ${m}`.slice(0, 1500));
process.exit(0);
