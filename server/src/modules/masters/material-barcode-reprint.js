// /api/masters/material-barcodes/reprint: the Material Barcode screen as a reprint-only page (owner, 29 Oct 2026) for
// the FG label and the foaming and assembly barcodes, found by the serial scanned. The label printed is the one the
// original page's Print sends for a job card's barcode (DocType 4001: the in-process label), and each reprint is
// logged in BarcodePrintTrail with its remark, as there.
// By the label's stage label (ProcessStageLabel: the stage it is registered at) and its serial, as TEST's data shows:
//   FG        a stage label at an FG label printing stage (ProductionProcess.ProdcutionStage 6: FG / SUS FG LABEL
//             PRINTING); its barcode row is usually at component scanning. A barcode at stage 6 with no stage label too.
//   Assembly  a stage label whose serial starts with S (printed at QC foaming as the next stage's label)
//   Foaming   a stage label whose serial starts with another letter (F foaming, L door / lid foaming)
// Any other barcode (component scans, GRN labels ...) is refused.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { execute, query, scalar } from '../../db/pool.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { sessionContext } from '../auth/context.js';
import { PAGE_SIZE } from '../forms/lists.js';
import { printLabel, printerDetail, printerOnline, printerOptions } from '../production/labels.service.js';
import { rangeOf } from '../production/production.routes.js';
import { listShape, timeWhere } from '../production/production.service.js';

const SCREEN = '/materialsetup/materialbarcode';
const FG_STAGE = 6;
export const NOT_A_LABEL = 'No FG label, assembly or foaming barcode has this serial.';

/** the label kind of a barcode row (see the top), or null when it is none of the three */
export function kindOf({ stage, labelProcess, labelStage, serial }) {
  if (labelProcess == null) return Number(stage) === FG_STAGE ? 'FG' : null;
  if (Number(labelStage) === FG_STAGE) return 'FG';
  const first = String(serial ?? '').charAt(0).toUpperCase();
  if (first === 'S') return 'Assembly';
  return /[A-Z]/.test(first) ? 'Foaming' : null;
}
/** kindOf in SQL (the history), on mb (the barcode), pp (its process), psl (its stage label) and lp (that label's process) */
const KIND_SQL = `case when psl.ProcessCode is null then case when pp.ProdcutionStage = ${FG_STAGE} then 'FG' end
    when lp.ProdcutionStage = ${FG_STAGE} then 'FG'
    when upper(left(mb.Serial, 1)) = 'S' then 'Assembly'
    when upper(left(mb.Serial, 1)) like '[A-Z]' then 'Foaming' end`;

/** labels a list may name at once (a bulk check), and print in one request (the page sends a long list in parts) */
export const MAX_CHECK = 500;
export const MAX_PRINT = 50;

/** each value of the list (by its Serial, or its BarcodeNo) with its barcode row in the business unit, in list order
 *  (Serial and BarcodeNo are each unique in MaterialBarcode). One query whatever the list's length (OPENJSON). */
async function lookup(values, by, businessUnit) {
  const col = by === 'BarcodeNo' ? 'cast(mb.BarcodeNo as nvarchar(30))' : 'mb.Serial';
  const rows = await query(
    `select cast(j.[key] as int) idx, mb.BarcodeNo barcodeNo, mb.Serial serial, mb.Alias alias, mb.CreatedOn createdOn,
        mb.ProcessCode process, isnull(lp.Name, pp.Name) processName, pp.ProdcutionStage stage, psl.ProcessCode labelProcess,
        lp.ProdcutionStage labelStage,
        m.MatCode materialCode, m.Name material, m.Alias materialAlias, ps.Alias jobCard, ph.Alias productionOrder,
        (select count(*) from BarcodePrintTrail t where t.BarcodeNo=mb.BarcodeNo) reprints,
        (select max(t.PrintedOn) from BarcodePrintTrail t where t.BarcodeNo=mb.BarcodeNo) lastReprint
      from openjson(@list) j
      join MaterialBarcode mb on ${col} = j.value and mb.DocType=4001 and mb.BusinessUnit=@bu
      left join ProductionProcess pp on pp.ProcessCode=mb.ProcessCode
      outer apply (select top 1 p.ProcessCode from ProcessStageLabel p where p.BarcodeNo=mb.Serial) psl
      left join ProductionProcess lp on lp.ProcessCode=psl.ProcessCode
      left join Material m on m.MatCode=mb.Material
      left join ProcessOrder ps on ps.PSNo=mb.DocNo
      left join PRODHeader ph on ph.PRODNo=ps.PRODNo`,
    { list: JSON.stringify(values), bu: netString(businessUnit) },
  );
  const at = new Map(rows.map((r) => [r.idx, r]));
  return values.map((_, i) => {
    const r = at.get(i);
    const kind = r ? kindOf(r) : null;
    if (!kind) return null;
    const { idx, stage, labelProcess, labelStage, process, ...label } = r;
    return { ...label, kind };
  });
}

/** the FG / foaming / assembly label with this serial (or barcode number), in the user's business unit */
export async function findLabel(scanned, businessUnit) {
  const s = netString(scanned).trim();
  if (s === '' || s.length > 100) throw AppError.badRequest('Scan or type the serial of the label.');
  let [hit] = await lookup([s], 'Serial', businessUnit);
  if (!hit && /^\d{1,18}$/.test(s)) [hit] = await lookup([s], 'BarcodeNo', businessUnit);
  if (!hit) throw new AppError(404, NOT_A_LABEL);
  return hit;
}

/** a list of serials (a bulk reprint): each one found (the label) or not ({ serial, error }), in list order, blanks and
 *  repeats left out */
export async function findLabels(serials, businessUnit) {
  if (!Array.isArray(serials)) throw AppError.badRequest('Send the serials as a list.');
  const list = [...new Set(serials.map((s) => netString(s).trim()).filter((s) => s !== ''))];
  if (!list.length) throw AppError.badRequest('Scan or paste at least one serial.');
  if (list.length > MAX_CHECK) throw AppError.badRequest(`Check at most ${MAX_CHECK} serials at a time (${list.length} given).`);
  if (list.some((s) => s.length > 100)) throw AppError.badRequest('A serial is longer than 100 characters.');
  const found = await lookup(list, 'Serial', businessUnit);
  return list.map((serial, i) => found[i] ?? { serial, error: NOT_A_LABEL });
}

/** the reason and printer every reprint needs, checked once: { why, bp } */
async function printSetup({ printer, remark }, ctx) {
  const why = netString(remark).trim();
  if (why === '') throw AppError.badRequest('Enter the reason for the reprint.');
  if (why.length > 500) throw AppError.badRequest('The reason is longer than 500 characters.');
  if (netString(printer) === '') throw AppError.badRequest('Select a printer.');
  if (!(await printerOptions(ctx.businessUnit)).options.some((o) => o.value !== '' && o.value === netString(printer))) throw AppError.badRequest('Select a printer of your business unit.');
  if (!(await printerOnline(printer))) throw AppError.badRequest('The printer is offline.');
  return { why, bp: await printerDetail(printer) };
}

/** one label printed again and logged in BarcodePrintTrail */
async function printOne(label, { why, bp }, ctx) {
  await printLabel('inprocess', label.barcodeNo, bp, ctx.userId);
  await execute('Insert into BarcodePrintTrail(BarcodeNo,PrintedBy,Remark)Values(@b,@u,@r)', { b: netString(label.barcodeNo), u: netString(ctx.userCode), r: why });
}

/** the label printed again on the printer chosen, with the reason */
export async function reprint({ barcodeNo, printer, remark }, ctx) {
  const setup = await printSetup({ printer, remark }, ctx);
  const [label] = await lookup([netString(barcodeNo)], 'BarcodeNo', ctx.businessUnit); // still one of the three, in this unit
  if (!label) throw new AppError(404, NOT_A_LABEL);
  await printOne(label, setup, ctx);
  return { ...label, reprints: Number(label.reprints) + 1 };
}

/** part of a bulk reprint: up to MAX_PRINT labels (by barcode number), printed in order, one reason for all; a label
 *  that fails (not one of the three, or its print) is reported and the rest go on. [{ barcodeNo, ok, error? }] */
export async function reprintMany({ barcodeNos, printer, remark }, ctx) {
  if (!Array.isArray(barcodeNos) || !barcodeNos.length) throw AppError.badRequest('Send the labels to print as a list.');
  if (barcodeNos.length > MAX_PRINT) throw AppError.badRequest(`Print at most ${MAX_PRINT} labels in one request.`);
  const list = barcodeNos.map((b) => netString(b).trim());
  if (list.some((b) => !/^\d{1,18}$/.test(b))) throw AppError.badRequest('A barcode number is not valid.');
  const setup = await printSetup({ printer, remark }, ctx);
  const labels = await lookup(list, 'BarcodeNo', ctx.businessUnit);
  const out = [];
  for (const [i, label] of labels.entries()) {
    if (!label) {
      out.push({ barcodeNo: list[i], ok: false, error: NOT_A_LABEL });
      continue;
    }
    try {
      await printOne(label, setup, ctx);
      out.push({ barcodeNo: list[i], serial: label.serial, ok: true });
    } catch (e) {
      out.push({ barcodeNo: list[i], serial: label.serial, ok: false, error: e.message });
    }
  }
  return out;
}

/** the reprints of FG labels and assembly / foaming barcodes in the business unit (BarcodePrintTrail), newest first, a
 *  page at a time, in the screen engine's list shape (as RM Replacement's history). The kind as kindOf decides it. */
export async function reprintHistory(businessUnit, page = 0, range = {}) {
  const from = Math.max(0, Math.floor(Number(page) || 0)) * PAGE_SIZE;
  const params = { bu: netString(businessUnit), from, size: PAGE_SIZE, ...range };
  const kind = KIND_SQL;
  const base = `from BarcodePrintTrail t
      join MaterialBarcode mb on mb.BarcodeNo = t.BarcodeNo and mb.DocType = 4001 and mb.BusinessUnit = @bu
      left join ProductionProcess pp on pp.ProcessCode = mb.ProcessCode
      outer apply (select top 1 p.ProcessCode from ProcessStageLabel p where p.BarcodeNo = mb.Serial) psl
      left join ProductionProcess lp on lp.ProcessCode = psl.ProcessCode
      where ${kind} is not null${timeWhere('t.PrintedOn', range)}`;
  const [rows, total] = await Promise.all([
    query(
      `select format(t.PrintedOn, 'dd-MM-yyyy hh:mm:ss tt') [Reprinted On], ${kind} [Label], mb.Serial [Serial], m.Name [Material],
          ps.Alias [Job Card], t.Remark [Reason], isnull(u.UserName, cast(t.PrintedBy as nvarchar(20))) [Reprinted By]
        ${base.replace('left join ProductionProcess', 'left join Material m on m.MatCode = mb.Material\n      left join ProcessOrder ps on ps.PSNo = mb.DocNo\n      left join Users u on u.UserCode = t.PrintedBy\n      left join ProductionProcess')}
        order by t.PrintedOn desc offset @from rows fetch next @size rows only`,
      params,
    ),
    scalar(`select count(*) ${base}`, params),
  ]);
  return listShape(rows, ['Reprinted On', 'Label', 'Serial', 'Material', 'Job Card', 'Reason', 'Reprinted By'], total, from);
}

const router = Router();
const guard = [requireAuth, authorizeScreen(SCREEN)];

// the reprints so far (?page=&start=&end=, as RM Replacement's history)
router.get('/material-barcodes/reprint/history', ...guard, async (req, res) =>
  ok(res, await reprintHistory(sessionContext(req).businessUnit, Math.max(0, Number(req.query.page) || 0), rangeOf(req.query))),
);

router.get('/material-barcodes/reprint/printers', ...guard, async (req, res) => ok(res, await printerOptions(sessionContext(req).businessUnit)));
// a bulk reprint: { serials } checked (each found or not), then printed MAX_PRINT at a time with { barcodeNos, printer, remark }
router.post('/material-barcodes/reprint/check', ...guard, async (req, res) => ok(res, await findLabels(req.body?.serials, sessionContext(req).businessUnit)));
router.post('/material-barcodes/reprint/many', ...guard, async (req, res) => ok(res, await reprintMany(req.body ?? {}, sessionContext(req))));
router.get('/material-barcodes/reprint/:serial', ...guard, async (req, res) => ok(res, await findLabel(req.params.serial, sessionContext(req).businessUnit)));
router.post('/material-barcodes/reprint', ...guard, async (req, res) => ok(res, await reprint(req.body ?? {}, sessionContext(req))));

export default router;
