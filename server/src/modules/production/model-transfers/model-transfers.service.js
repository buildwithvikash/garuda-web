// Model To Model Transfer by a list of FG serials (owner, 29 Oct 2026): the serials are checked and grouped by their
// product (source material), each group gets its destination, then each unit is moved with the original's statements
// (production.service.js moveBarcode), its label printed again (printMoved), and logged in ModelToModel one serial a
// row (StartSerial = EndSerial = the FG serial, Qty 1). Each unit's move and log are one transaction (owner, 1 Nov 2026).
// Units: live barcodes (Status != 99) of an FG material (Type 100: the screen's source and destination list).
import { execute, query } from '../../../db/pool.js';
import { transaction } from '../../../db/tx.js';
import { AppError } from '../../../shared/AppError.js';
import { netInt, netString } from '../../../shared/net.js';
import { distinctValues, listPage, operatorsFor, OPERATOR_TEXT, searchColumns } from '../../forms/lists.js';
import { FORMS } from '../../forms/specs.js';
import { printerDetail, printerOnline } from '../labels.service.js';
import { moveBarcode, printMoved } from '../production.service.js';

export const SCREEN = '/production/modeltomodeltransferform';
export const MAX_CHECK = 500;
export const MAX_MOVE = 50;
const FG_TYPE = 100;

const option = (rows, value, label) => rows.map((r) => ({ value: netString(r[value]), label: netString(r[label]) }));

/** what the screen chooses from: the FG materials and the printers */
export async function options() {
  const [materials, printers] = await Promise.all([query(`Select MatCode, Name from Material Where Type=${FG_TYPE} order by Name`), query('Select ROWID, Name from BarcodePrinter')]);
  return { materials: option(materials, 'MatCode', 'Name'), printers: option(printers, 'ROWID', 'Name') };
}

/** the transfers so far (ModelToModel), read only: a page, optionally filtered on one column */
export const history = (ctx, page, search) => listPage(FORMS[SCREEN], ctx, page, search);
export const historyColumns = async (ctx) => (await searchColumns(FORMS[SCREEN], ctx)).map((c) => ({ name: c.name, operators: operatorsFor(c.type).map((o) => [o, OPERATOR_TEXT[o]]) }));
export const historyValues = async (ctx, column) => (await distinctValues(FORMS[SCREEN], ctx, column)).map((v) => netString(v));

/** each serial's barcode row (live or not), in list order: one query (OPENJSON; Serial is unique in MaterialBarcode) */
async function rowsOf(serials) {
  const rows = await query(
    `select cast(j.[key] as int) idx, mb.BarcodeNo barcodeNo, mb.Serial serial, mb.Status status, m.MatCode materialCode,
        m.Name material, m.Alias materialAlias, m.Type materialType
      from openjson(@list) j
      join MaterialBarcode mb on mb.Serial = j.value
      left join Material m on m.MatCode = mb.Material`,
    { list: JSON.stringify(serials) },
  );
  const at = new Map(rows.map((r) => [r.idx, r]));
  return serials.map((_, i) => at.get(i) ?? null);
}

/** why a barcode row cannot be transferred, or null when it can */
const refusal = (r) => (!r ? 'No barcode has this serial.' : netInt(r.status) === 99 ? 'This unit is scrapped (status 99).' : netInt(r.materialType) !== FG_TYPE ? 'Not an FG material.' : null);

/** a list of FG serials checked and grouped by product: { groups: [{ materialCode, material, materialAlias, units:
 *  [{ serial, barcodeNo }] }] (in the order first seen), refused: [{ serial, error }] }. Blanks and repeats left out. */
export async function checkTransfer(serials) {
  if (!Array.isArray(serials)) throw AppError.badRequest('Send the serials as a list.');
  const list = [...new Set(serials.map((s) => netString(s).trim()).filter((s) => s !== ''))];
  if (!list.length) throw AppError.badRequest('Scan or paste at least one FG serial.');
  if (list.length > MAX_CHECK) throw AppError.badRequest(`Check at most ${MAX_CHECK} serials at a time (${list.length} given).`);
  if (list.some((s) => s.length > 100)) throw AppError.badRequest('A serial is longer than 100 characters.');
  const rows = await rowsOf(list);
  const groups = new Map();
  const refused = [];
  rows.forEach((r, i) => {
    const why = refusal(r);
    if (why) return void refused.push({ serial: list[i], error: why });
    const key = netString(r.materialCode);
    if (!groups.has(key)) groups.set(key, { materialCode: key, material: r.material, materialAlias: r.materialAlias, units: [] });
    groups.get(key).units.push({ serial: r.serial, barcodeNo: netString(r.barcodeNo) });
  });
  return { groups: [...groups.values()], refused };
}

/** part of a bulk transfer: up to MAX_MOVE units of one source material moved to the destination, in order, each label
 *  printed again and the move logged; a unit that is no longer of the source (or not live) is reported and the rest go
 *  on. [{ barcodeNo, serial, ok, printed, error? }]: printed false when the unit moved but its label failed (reprint it
 *  on Material Barcode). */
export async function transferMany({ source, destination, barcodeNos, printer }, ctx) {
  const lost = (status) => (netInt(status) === 99 ? 'This unit is scrapped (status 99).' : 'This unit is no longer of the source material.');
  const [src, des] = [netString(source).trim(), netString(destination).trim()];
  if (!/^\d{1,18}$/.test(src) || !/^\d{1,18}$/.test(des)) throw AppError.badRequest('Choose the source and the destination material.');
  if (src === des) throw AppError.badRequest('The destination is the same material as the source.');
  if (!Array.isArray(barcodeNos) || !barcodeNos.length) throw AppError.badRequest('Send the units to transfer as a list.');
  if (barcodeNos.length > MAX_MOVE) throw AppError.badRequest(`Transfer at most ${MAX_MOVE} units in one request.`);
  const list = barcodeNos.map((b) => netString(b).trim());
  if (list.some((b) => !/^\d{1,18}$/.test(b))) throw AppError.badRequest('A barcode number is not valid.');
  if (netString(printer) === '') throw AppError.badRequest('Select a printer.');
  const types = await query('select MatCode, Type from Material where MatCode in (@s, @d)', { s: src, d: des });
  if (!types.some((t) => netString(t.MatCode) === des && netInt(t.Type) === FG_TYPE)) throw AppError.badRequest('The destination is not an FG material.');
  const bp = await printerDetail(printer);
  if (bp.name === '') throw AppError.badRequest('Select a printer.');
  if (!(await printerOnline(printer))) throw AppError.badRequest('The printer is offline.');
  const rows = await query('select mb.* from openjson(@list) j join MaterialBarcode mb on cast(mb.BarcodeNo as nvarchar(30)) = j.value', { list: JSON.stringify(list) });
  const byNo = new Map(rows.map((r) => [netString(r.BarcodeNo), r]));
  const out = [];
  for (const b of list) {
    const d = byNo.get(b);
    if (!d || netString(d.Material) !== src || netInt(d.Status) === 99) {
      out.push({ barcodeNo: b, serial: d?.Serial ?? null, ok: false, printed: false, error: !d ? 'No such barcode.' : lost(d.Status) });
      continue;
    }
    try {
      await transaction(async (tx) => {
        // locked and checked again: a second request for this unit waits here, and finds it already moved
        const [now] = await query('select Material, Status from MaterialBarcode with (updlock, rowlock) where BarcodeNo=@b', { b }, tx);
        if (netString(now?.Material) !== src || netInt(now?.Status) === 99) throw new Error(lost(now?.Status));
        await moveBarcode(d, des, tx);
        await execute('Insert into ModelToModel(SrcMaterial,DestMaterial,StartSerial,EndSerial,qty,UserCode) Values(@s,@d,@n,@n,1,@u)', { s: src, d: des, n: netString(d.Serial), u: netInt(ctx.userCode) }, tx);
      });
    } catch (e) {
      out.push({ barcodeNo: b, serial: d.Serial, ok: false, printed: false, error: e.message });
      continue;
    }
    try {
      await printMoved(d, bp, ctx);
      out.push({ barcodeNo: b, serial: d.Serial, ok: true, printed: true });
    } catch (e) {
      out.push({ barcodeNo: b, serial: d.Serial, ok: true, printed: false, error: `Moved, but the label did not print: ${e.message}` });
    }
  }
  return out;
}
