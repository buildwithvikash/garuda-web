// FG Scrap (View/Production/FGScrapForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, execute, query } from '../../../../db/pool.js';
import { netString, exceptionAlert } from '../../../../shared/net.js';
import { digitsOrEmpty } from '../../../../shared/sql.js';
import { errorMsg } from '../_shared.js';
import { fgComponents } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT } from '../registry.js';

const FG_SCRAP = 'View/Production/FGScrapForm.aspx';

/** a quoted (varchar) SQL literal as the original wrote it, its quotes escaped */
const sqlLit = (s) => `'${netString(s).replaceAll("'", "''")}'`;

Object.assign(PAGE_INIT, {
  [FG_SCRAP]: async (controls, vs, h) => {
    controls.find((c) => c.id === 'DDLScrapCategory').options = await h.fill('Select ID,Type from ScrapReasons');
    vs.__Go = 'Go';
  },
});

/** AVProductionCapture.FGScrap (no transaction: each statement stands) */
async function fgScrap(serial, remark, category, ctx) {
  const pad = (n) => String(n).padStart(2, '0');
  const rows = await query('Select * from ProcessInputBOMScan where psno=(select docno from Materialbarcode where serial=@s)', { s: serial });
  if (!rows.length) throw new Error('There is no row at position 0.');
  const station = netString(await scalar(`select top 1 StationCode from ProcessActivity where PSNo = ${digitsOrEmpty(netString(rows[0].PSNo))} order by ROWID desc`));
  await execute('Update MaterialBarcode Set Status=99 where serial=@s', { s: serial });
  for (const dr of rows) {
    if (netString(dr.Serial) === '99') throw new Error('Already Scrapped');
    const d = new Date();
    const scrapped = `${netString(dr.Serial)}-SCRAP${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}-${pad(d.getMinutes())}`;
    await execute(`Update MaterialBarcode set Serial=${sqlLit(scrapped)} where BarcodeNo=${digitsOrEmpty(netString(dr.BarcodeNo))}`);
    await execute(`Update ProcessInputBOMScan set Serial=${sqlLit(scrapped)} where Serial=${sqlLit(dr.Serial)}`);
    await execute(`INSERT INTO [FGScrap]([BarcodeNo],[Serial],[PSNo],[Remark],[SCRAPCATEGORY],[LastStation],[UserID],[ScrapDate]) VALUES (${digitsOrEmpty(netString(dr.BarcodeNo))},${sqlLit(dr.Serial)},${digitsOrEmpty(netString(dr.PSNo))},${sqlLit(remark.trim())},${sqlLit(category)},${digitsOrEmpty(station)},${sqlLit(ctx.userId)},GETDATE())`);
  }
  // (a stray ")" in the original's statement: it fails here, after the scrap, as written)
  const plan = netString(await scalar(`select top 1 Material from MaterialBarcode where serial=${sqlLit(serial)})`));
  const p2 = (n) => String(n).padStart(2, '0');
  await execute(`Update PlanOrderPrint set PlanQty=PlanQty +1 where PlanMaterial =${digitsOrEmpty(plan)} and PlanMonthYear = ${p2(new Date().getMonth() + 1)}${new Date().getFullYear()}`);
}

Object.assign(PAGE_EVENTS, {
  [FG_SCRAP]: {
    // Go_Click: the serial's components, or (Clr) a new scan
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__Go === 'Go') {
          if (v.TBBarcode.trim() === '') return out;
          out.set.GvDetails = { rows: await fgComponents(v.TBBarcode.trim()) };
          out.set.Go = { text: 'Clr' };
          out.viewState.__Go = 'Clr';
        } else {
          Object.assign(out.set, { TBBarcode: { value: '', enabled: true }, Go: { text: 'Go' }, GvDetails: { rows: [] } });
          out.viewState.__Go = 'Go';
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBBarcode = { value: '', enabled: true };
      }
      return out;
    },
    // btnSave_Click1: AVProductionCapture.FGScrap
    btnSave: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      if (v.TBRemark === '') return { alert: errorMsg('Please Enter Remark') };
      try {
        await fgScrap(v.TBBarcode.trim(), v.TBRemark.trim(), v.DDLScrapCategory, h.ctx);
        out.success = true;
        Object.assign(out.set, { TBBarcode: { value: '', enabled: true }, TBRemark: { value: '' }, Go: { text: 'Go' }, GvDetails: { rows: [] } });
        out.viewState.__Go = 'Go';
      } catch (e) {
        Object.assign(out.set, { TBBarcode: { value: '' }, TBRemark: { value: '' } });
        out.alert = exceptionAlert(e.message);
      }
      return out;
    },
  },
});
