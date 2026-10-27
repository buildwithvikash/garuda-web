// Production Assignment (View/Production/ProductionAssignmentForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, execute } from '../../../../db/pool.js';
import { transaction } from '../../../../db/tx.js';
import { netString, netInt, netLong, netDouble, netNum, exceptionAlert } from '../../../../shared/net.js';
import { digitsOrEmpty } from '../../../../shared/sql.js';
import { tableSchema } from '../../schema.js';
import { insert, collect, generateKey, logEvent } from '../../write.js';
import { fill } from '../../../../db/options.js';
import { printerDetail, printerOnline, prodStartLabelData, printProdStart } from '../../../production/labels.service.js';
import { generateSerialNo, generateSerialNoWRL } from '../../../production/production.service.js';
import * as assignRepo from '../../../production-assignments/production-assignments.repo.js';
import { NRE, errorMsg, guard, notInList, parseString, select } from '../_shared.js';
import { deptPrinters } from './_shared.js';
import { PAGE_EVENTS, PAGE_LOAD } from '../registry.js';

// ViewState: Qty (what is left to assign at the chosen stage, as text).

const PROD_ASSIGN = 'View/Production/ProductionAssignmentForm.aspx';

/** DDLDept_SelectedIndexChanged */
async function assignDept(dept, h, out) {
  if (dept !== '') {
    out.set.DDlProdOrder = { options: await assignRepo.openOrders(dept), index: 0 };
    out.set.DDLPrinter = await deptPrinters(h, dept);
  } else Object.assign(out.set, { DDlProdOrder: { options: [], value: '' }, DDLPrinter: { options: [], value: '' } });
}

// Page_Load (no try/catch there): the session department, then its orders and printers
PAGE_LOAD[PROD_ASSIGN] = async (controls, ctx) => {
  const byId = (id) => controls.find((c) => c.id === id);
  const dept = byId('DDLDepartment');
  if (!dept.options.some((o) => o.value === netString(ctx.department))) return { alert: exceptionAlert(notInList('DDLDepartment').message) };
  dept.value = netString(ctx.department);
  const out = { set: {} };
  await assignDept(dept.value, { fill: (sql, params) => fill(sql, 'Select A Value', params) }, out);
  for (const [id, p] of Object.entries(out.set)) Object.assign(byId(id), { options: p.options, value: p.options[p.index ?? 0]?.value ?? '' });
};

// GetBOM and GetRoutingWithStationLine: repositories/production/assignments.repository.js
/** DDLRouting_SelectedIndexChanged: the routing's first stage-label process (and its stations), the BOM for one */
async function assignRouting(v, h, out) {
  const route = netString(out.set.DDLRouting?.value ?? v.DDLRouting);
  if (route === '') {
    out.set.DDLProcessCode = { options: [], value: '' };
    return;
  }
  const procs = await assignRepo.firstStageProcess(route);
  out.set.DDLProcessCode = { options: procs, index: procs.length >= 2 ? 1 : 0 };
  if (procs.length >= 2) await assignProcess({ ...v, DDLRouting: route, DDLProcessCode: procs[1].value }, h, out);
  out.set.ContentPanel = { visible: true };
  const g = await assignRepo.bomLines(netString(out.set.DDLBom?.value ?? v.DDLBom), 1);
  Object.assign(out.set, { GVBOMInput: { rows: g.input }, GVOutput: { rows: g.output } });
}

/** DDLProcessCode_SelectedIndexChanged: its stations; the quantity left to assign at that stage */
async function assignProcess(v, h, out) {
  const [process, route] = [netString(v.DDLProcessCode), netString(v.DDLRouting)];
  if (process !== '' && route !== '') {
    out.set.DDLStationCode = { options: await assignRepo.stationsFor(process, v.DDLDepartment), index: 0 };
    const assigned = await assignRepo.assignedAtStage(v.DDlProdOrder, process);
    const left = netNum(netDouble(out.set.TBTotalQty?.value ?? v.TBTotalQty) - assigned);
    out.set.TBQty = { ...out.set.TBQty, value: left };
    out.viewState.Qty = left;
  } else {
    out.viewState.Qty = '0';
    out.set.DDLStationCode = { options: [], value: '' };
  }
}

const nowMinute = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
};

// DateTime.Now.ToString("dd-MMM-yyyy HH:mm") read back as a date
const nowSecond = () => {
  const d = new Date();
  d.setMilliseconds(0);
  return d;
};

/** a row of a table as the original's NewRow + assignments (columns not given stay DBNull) */
async function newRow(table, values) {
  const schema = await tableSchema(table);
  return { schema, row: new Map(Object.entries(values).map(([k, x]) => [schema.col(k)?.name ?? k, x])) };
}

const insertRow = (t, ctx, tx) => insert(null, { tables: [{ schema: t.schema, prefix: '', rows: [t.row] }] }, ctx, { wrl: true, tx });

Object.assign(PAGE_EVENTS, {
  [PROD_ASSIGN]: {
    DDLDepartment: async (v, h) => {
      const out = { set: {} };
      return guard(out, () => assignDept(netString(v.DDLDepartment), h, out));
    },
    DDlProdOrder: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const order = netString(v.DDlProdOrder);
        out.set.ContentPanel = { visible: false };
        if (order === '') {
          Object.assign(out.set, { DDLMaterial: { options: [], value: '' }, DDLRouting: { options: [], value: '' }, DDLBom: { options: [], value: '' } });
          return;
        }
        const dt = await assignRepo.orderHeader(order);
        const mats = await assignRepo.orderMaterials(order);
        out.set.DDLMaterial = { options: mats };
        if (!dt) throw new Error('There is no row at position 0.');
        await select(h, out, 'DDLMaterial', netString(dt.Material));
        await select(h, out, 'DDLUom', netString(dt.Uom));
        await select(h, out, 'DDLBom', netString(dt.BOMCode));
        const total = netNum(netDouble(dt.Qty));
        out.set.TBTotalQty = { value: total };
        out.viewState.Qty = total;
        out.set.TBQty = { value: '' };
        const uom = await assignRepo.baseUom(dt.Material);
        await select(h, out, 'DDLUom', uom);
        await select(h, out, 'DdlTotalUom', uom);
        out.set.DDLVariant = { options: await assignRepo.variants(dt.Material), index: 0 };
        out.set.DDLMaterial.enabled = mats.length !== 2;
        out.set.TBQty.enabled = true;
        const routes = await h.options('DDLRouting');
        if (routes.length === 2) {
          out.set.DDLRouting = { value: routes[1].value };
          await assignRouting({ ...v, DDLBom: netString(dt.BOMCode), TBTotalQty: total }, h, out);
        }
      });
    },
    DDLRouting: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => assignRouting(v, h, out));
    },
    DDLProcessCode: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => assignProcess(v, h, out));
    },
    DDLStationCode: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (netString(v.DDLStationCode) !== '') out.set.GVRoute = { rows: await assignRepo.routeWithStations(netString(v.DDLRouting), netString(v.DDLDepartment), netString(v.DDLStationCode)) };
      });
    },
    // btnPrint_Click: one job card (with its stage label row), barcode (+ inspection lot when the stage is
    // auto-processed) and label per piece, each in its own transaction. A failure ends the page with an error (the
    // original's catch block itself fails), keeping the pieces already done.
    btnPrint: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      const stop = (m) => ({ ...out, alert: errorMsg(m) });
      if (netString(v.DDLDepartment) === '') return stop(' Select A Department');
      if (netString(v.DDlProdOrder) === '') return stop(' Select A Order');
      if (netString(v.DDLRouting) === '') return stop(' Select A Routing');
      if (netString(v.DDLProcessCode) === '') return stop(' Select A Process');
      if (netString(v.DDLStationCode) === '') return stop(' Select A Station');
      if (netDouble(v.TBQty) <= 0) return stop('Enter Positive Qty');
      if (netDouble(v.TBQty) > netDouble(h.vs.Qty)) {
        if (h.vs.Qty === undefined) throw NRE();
        return stop(`Quantity Can not be greater Than ${netString(h.vs.Qty)}`);
      }
      if (netString(v.DDLPrinter) === '') return stop(' Select A Printer');
      if (!(await printerOnline(v.DDLPrinter))) return stop('Printer is Offline');
      const t = netInt(v.TBQty);
      const alerts = [];
      if (netString(v.DDLBom) === '') alerts.push(errorMsg('Select a BOM')); // CreateProcessOrder: alerts, carries on
      const [route, process, bom] = [digitsOrEmpty(v.DDLRouting), digitsOrEmpty(v.DDLProcessCode), digitsOrEmpty(v.DDLBom)];
      const bp = await printerDetail(v.DDLPrinter);
      await scalar(`Select SeqNo from RoutingTrans where RouteCode=${route} and ProcessCode=${process} and SeqNo=( Select Min(SeqNo) from RoutingTrans where RouteCode=${route} and StageLabel=1 )`); // isFirstStage (unused)
      const stageMat = parseString(await scalar(`Select top 1 Material from BOMINPUT where BOMCODE=${bom} and ProcessCode=${process}`));
      const auto = netInt(await scalar(`Select AutoProcessing from RoutingTrans where routecode=${route} and ProcessCode=${process}`));
      const copies = auto < 0 ? 1 : netInt(await scalar(`Select top 1 NoofCopy from RoutingTrans where routecode=${route} and ProcessCode=${process}`));
      const spec = { ...h.spec, top: { tag: `${h.spec.top.tag}|MaterialBarcode` } }; // AVProcess.CollectData(TopPanel, stage)
      await scalar(`Select Top 1 Material from BOMInput  where BOMCode=${bom} and ProcessCode=${process} and ScanReq=1 `);
      const bu = netString(v.DDLBU);
      let serial = '';
      let firstBarcode = '';
      let bar = null;
      let insp = null;
      let label = null;
      for (let i = 1; i <= t; i++) {
        await transaction(async (tx) => {
          const s = i === 1 ? await generateSerialNo(v.DDLMaterial, stageMat, bu, v.DDLDepartment, v.DDLProcessCode, 1, tx) : await generateSerialNoWRL(v.DDLProcessCode, stageMat, bu, serial, tx);
          serial = s.keyNo;
          // SaveStageWiseProcessOrderWRLNoBarcode: the job card for one piece with its stage label row
          const ds = await collect(spec, h.raw ?? v, h.ctx);
          const tbl = (n) => ds.tables.find((x) => x.schema.name.toLowerCase() === n.toLowerCase());
          const po = tbl('ProcessOrder');
          const col = (x, c) => x.schema.col(c)?.name ?? c;
          if (!po.rows[0]) throw new Error('There is no row at position 0.');
          po.rows[0].set(col(po, 'Qty'), 1);
          po.rows[0].set(col(po, 'MainPSNO'), netInt(v.DDLVariant));
          const psl = tbl('ProcessStageLabel');
          if (!psl.rows[0]) throw new Error('There is no row at position 0.');
          for (const [c, x] of [['PsNo', 0], ['SeqNo', 0], ['ProcessCode', v.DDLProcessCode], ['StationCode', netLong(v.DDLStationCode)], ['BarcodeNo', serial]]) psl.rows[0].set(col(psl, c), x);
          psl.prefix = 'PsNo';
          const head = po.rows[0];
          const [hBu, hDept, hUom] = ['BusinessUnit', 'Department', 'UOM'].map((c) => head.get(col(po, c)));
          const psNo = await insert(spec, ds, h.ctx, { wrl: true, tx });
          // rule fix (owner, 21 Oct): the order's assigned quantity follows each job card (the original never set it)
          await execute(`Update PRODHeader set AssignedQty=isnull(AssignedQty,0)+1 where PRODNo=${digitsOrEmpty(v.DDlProdOrder)}`, {}, tx);
          if (i === 1) {
            // SaveMaterialBarcodeWRLProdcutionPrintWithoutAllData
            if (auto < 0) {
              const { key, prefix } = await generateKey('InspectionHeader', t, netInt(hBu), tx);
              insp = await newRow('InspectionHeader', { InspectionLotNo: key, Alias: `${prefix}${key}`, DocType: 4001, DocDate: nowMinute(), DocNo: psNo, Process: 0, Material: netLong(stageMat), Qty: 1, Uom: hUom, DocLine: 0, Department: hDept, BusinessUnit: hBu, Status: 1 });
              await insertRow(insp, h.ctx, tx);
            }
            const { key, prefix } = await generateKey('MaterialBarcode', t, netInt(hBu), tx);
            firstBarcode = key;
            bar = await newRow('MaterialBarcode', {
              BarcodeNo: key, Alias: `${prefix}${key}`, DocType: 4001, DocNo: psNo, DocLine: 0, Material: netLong(stageMat), Serial: serial, PackQty: 1, CurrentQty: 1, Uom: hUom, IssuedQty: 0,
              BusinessUnit: hBu, Department: hDept, ABusinessUnit: hBu, ADepartment: hDept, Area: 0, StockID: 0, ProcessCode: v.DDLProcessCode, WorkCenter: v.DDLStationCode, CreatedOn: nowSecond(),
              PrintStatus: 1, LooseStatus: 0, Sample: 0, ...(auto < 0 ? { InspectionLotNo: insp.row.get(insp.schema.col('InspectionLotNo').name), QCStatus: 11 } : { QCStatus: 12 }), Status: 1, Project: netInt(v.DDLVariant),
            });
            await insertRow(bar, h.ctx, tx);
            label = await prodStartLabelData(psNo, firstBarcode, tx);
          } else {
            // SaveMaterialBarcodeWRLProdcutionPrintWithAllData: the first piece's rows again, numbers + 1
            const c = (x, n) => x.schema.col(n).name;
            bar.row.set(c(bar, 'DocNo'), psNo);
            if (insp) {
              insp.row.set(c(insp, 'DocNo'), psNo);
              const lot = String(BigInt(netString(insp.row.get(c(insp, 'InspectionLotNo')))) + 1n);
              insp.row.set(c(insp, 'InspectionLotNo'), lot);
              insp.row.set(c(insp, 'Alias'), lot);
              await insertRow(insp, h.ctx, tx);
            }
            const no = String(BigInt(netString(bar.row.get(c(bar, 'BarcodeNo')))) + 1n);
            bar.row.set(c(bar, 'BarcodeNo'), no);
            bar.row.set(c(bar, 'InspectionLotNo'), insp ? insp.row.get(c(insp, 'InspectionLotNo')) : 0);
            bar.row.set(c(bar, 'Alias'), no);
            bar.row.set(c(bar, 'Serial'), serial);
            await insertRow(bar, h.ctx, tx);
            // the label keeps the first piece's header and barcode number; only the serial changes
            label.mat.rows[0].BarcodeNo = firstBarcode;
            label.mat.rows[0].Serial = serial;
          }
        });
        await printProdStart(label, v.DDLPrinter, bp, copies);
        await execute(`Update MaterialBarcode set PrintStatus=1 where BarcodeNo=${digitsOrEmpty(firstBarcode)}`);
        out.viewState.Qty = netNum(netDouble(out.viewState.Qty) - 1);
      }
      Object.assign(out.set, { ContentPanel: { visible: false }, TBQty: { value: '', enabled: true } });
      if (netDouble(out.viewState.Qty) <= 0) {
        await select(h, out, 'DDlProdOrder', '');
        Object.assign(out.set, { DDLMaterial: { options: [], value: '' }, DDLRouting: { options: [], value: '' }, DDLBom: { options: [], value: '' } });
      }
      const now = new Date();
      await logEvent({ businessUnit: 12201, user: 0, module: 'Last Status', action: 1, ok: true, message: 'Event End', refId: 0, data: 'Label Printing', at: now, time: [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') }); // AVMachineIntegration.CaptureEventLog
      return { ...out, alerts, success: true, message: 'Assigned Succefully' };
    },
  },
});
