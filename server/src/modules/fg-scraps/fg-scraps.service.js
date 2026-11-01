// FG Scrap: a unit taken out of production. The browser sends the serial, the category and the remark; the job card and
// components come from the server's own lookup. AVProductionCapture.FGScrap, with four changes (owner, 1 Nov 2026;
// docs/PARITY-REPORT.md): all of it in one transaction, a unit already scrapped refused, the category checked against the
// list, and no last statement: the original's had a stray ")", so it always failed after the scrap and the plan
// quantity it meant to raise never moved. The plan stays as it is.
import { query, scalar, execute } from '../../db/pool.js';
import { transaction } from '../../db/tx.js';
import { AppError } from '../../shared/AppError.js';
import { netString } from '../../shared/net.js';
import { componentStatus, fgComponents } from '../production/production.service.js';

export const SCREEN = '/production/fgscrapform';

const SCRAPPED = 99;
const ALREADY = 'This unit is already scrapped';

const pad = (n) => String(n).padStart(2, '0');

/** a scrapped component's serial, as the original marks it (the minutes, not the seconds) */
export const scrappedSerial = (serial, d = new Date()) => `${netString(serial)}-SCRAP${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}-${pad(d.getMinutes())}`;

/** a component as the screen shows it: never its job card, row or process codes */
export const componentView = (row) => ({ category: netString(row.Category), material: netString(row.Material), process: netString(row.Process), serial: netString(row.Serial) });

export const categories = async () => (await query('Select ID, Type from ScrapReasons')).map((r) => ({ value: netString(r.ID), label: netString(r.Type).trim() }));

export async function unit(serial) {
  const rows = await fgComponents(serial);
  if ((await componentStatus(serial)) === SCRAPPED) throw AppError.badRequest(ALREADY);
  return { serial, components: rows.map(componentView) };
}

/** { unit, category, remark }: the unit scrapped, or nothing changed */
export async function scrap({ unit: serial, category, remark }, ctx) {
  if ((await componentStatus(serial)) === SCRAPPED) throw AppError.badRequest(ALREADY);
  if (!(await categories()).some((c) => c.value === category)) throw AppError.badRequest('Choose a scrap category from the list');
  const rows = await query('Select PSNo, BarcodeNo, Serial from ProcessInputBOMScan where PSNo=(select DocNo from MaterialBarcode where Serial=@s)', { s: serial });
  if (!rows.length) throw AppError.badRequest('This barcode is not known, or it has no scanned components');
  await transaction(async (tx) => {
    const station = await scalar('select top 1 StationCode from ProcessActivity where PSNo=@p order by ROWID desc', { p: rows[0].PSNo }, tx);
    await execute('Update MaterialBarcode set Status=@status where Serial=@s', { status: SCRAPPED, s: serial }, tx);
    const now = new Date();
    for (const r of rows) {
      const marked = scrappedSerial(r.Serial, now);
      await execute('Update MaterialBarcode set Serial=@marked where BarcodeNo=@b', { marked, b: r.BarcodeNo }, tx);
      await execute('Update ProcessInputBOMScan set Serial=@marked where Serial=@old', { marked, old: r.Serial }, tx);
      await execute(
        'insert into FGScrap (BarcodeNo, Serial, PSNo, Remark, SCRAPCATEGORY, LastStation, UserID, ScrapDate) values (@b, @old, @p, @remark, @category, @station, @user, getdate())',
        { b: r.BarcodeNo, old: r.Serial, p: r.PSNo, remark, category: Number(category), station, user: netString(ctx.userId) },
        tx,
      );
    }
  });
  return { message: 'Unit scrapped', serial };
}
