// Routing (View/ProductionSetup/RoutingForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { scalar } from '../../../../db/pool.js';
import { netString, netInt, netDouble, netBool } from '../../../../shared/net.js';
import { config } from '../../../../config/env.js';
import { digitsOrEmpty } from '../../../../shared/sql.js';
import { setting, settingText } from '../../../settings/settings.service.js';
import { fill } from '../../../../db/options.js';
import { alertMsg, errorMsg, gridDelete, guard, noKey, notInList, parseString, parseStringZero, select, selectedText } from '../_shared.js';
import { CUSTOM_DISPLAY, PAGE_DISPLAY, PAGE_EVENTS, PAGE_INIT } from '../registry.js';

CUSTOM_DISPLAY.add('View/ProductionSetup/RoutingForm.aspx');

export const ROUTING = 'View/ProductionSetup/RoutingForm.aspx';

// Settings.RouteSeq (5 unless the Settings table has it); Math.DivRem by 0 throws
const routeSeq = () => (settingText('RouteSeq', null) === null ? 5 : setting('RouteSeq'));

const divRem = (i, d) => {
  if (d === 0) throw new Error('Attempted to divide by zero.');
  return i % d;
};

// Convert.ToInt32(decimal): to nearest, halves to even
const toInt32Even = (n) => {
  const f = Math.floor(n);
  return n - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(n);
};

const nextSeq = (t, trimRem) => {
  let i = toInt32Even(t.max('SeqNo')) + routeSeq();
  const rem = divRem(i, routeSeq());
  if (trimRem) i -= rem;
  return String(i);
};

// Path.GetExtension
const extensionOf = (p) => {
  const base = p.split(/[\\/]/).pop();
  const i = base.lastIndexOf('.');
  return i >= 0 && i < base.length - 1 ? base.slice(i) : '';
};

// AVMM.FillMaterialDropdown(ddl, model) / FillMaterialRouting(ddl) (operator precedence as written)
const routingMaterials = (h, model) =>
  model !== ''
    ? h.fill(`Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where(Type >= 100 and Type < 200) or(Type >= 400 and Type < 500) and Model=${digitsOrEmpty(model)}`)
    : h.fill("Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where (Type>=100 and Type<200) or (Type>=400 and Type<500) and Status=1");

Object.assign(PAGE_INIT, {
  [ROUTING]: async (controls, vs) => Object.assign(vs, { add: 'True' }),
});

Object.assign(PAGE_DISPLAY, {
  // display(key): next SeqNo after the last line, the model's materials, then AU.Display
  [ROUTING]: {
    async before(controls, row) {
      const byId = (id) => controls.find((c) => c.id === id);
      const max = await scalar('Select max(SeqNo) from RoutingTrans where RouteCode=@r', { r: row.RouteCode });
      if (max !== null && max !== undefined) {
        const i = toInt32Even(Number(max)) + routeSeq();
        divRem(i, routeSeq());
        byId('TBSeq').value = String(i);
      }
      if (netInt(row.Model) > 0) {
        const model = byId('DDLModel');
        const want = netString(row.Model);
        if (!model.options.some((o) => o.value === want)) throw notInList('DDLModel');
        model.value = want;
        byId('DDLMaterial').options = await fill(`Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where(Type >= 100 and Type < 200) or(Type >= 400 and Type < 500) and Model=${want}`);
      }
    },
  },
});

/** BTNInstruction / BTNGuide: the row's SeqNo cell into ViewState, the popup opened */
async function routingPopup(v, h, panel, seqLabel, codeLabel) {
  const out = { set: {}, viewState: { ...h.vs } };
  return guard(out, async () => {
    const t = await h.table('GVTransData');
    const row = t.rows[netInt(h.index)] ?? noKey();
    Object.assign(out.viewState, { SeqNo: t.get(row, 'SeqNo'), RouteCode: String(netInt(v.PrimaryKey)) });
    Object.assign(out.set, { [panel]: { visible: true }, [seqLabel]: { text: `Seq No. : ${out.viewState.SeqNo}` }, [codeLabel]: { text: `Routing Code :${v.PrimaryKey}` } });
  });
}

Object.assign(PAGE_EVENTS, {
  [ROUTING]: {
    DDLModel: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.DDLMaterial = { options: await routingMaterials(h, v.DDLModel), index: 0 };
      });
    },
    BtnAdd: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const add = netBool(h.vs.add);
        if (add && t.rows.some((r) => t.get(r, 'ProcessCode') === v.DdlProcess)) return void (out.alert = alertMsg('Value Already Added'));
        if (netDouble(v.TbMaxHoldP) < netDouble(v.TbMinHoldP)) return void (out.alert = errorMsg('Minimum Hold Period cannot be greater than Maximum Hold Period'));
        if (netDouble(v.TBSeq) <= 0) return void (out.alert = errorMsg('Please Enter SeqNo'));
        const at = t.rows.findIndex((r) => t.get(r, 'SeqNo') === v.TBSeq.trim());
        if (at >= 0 && add) return void (out.alert = errorMsg('SeqNo already Exist'));
        const fields = async (row) => {
          t.set(row, 'RouteCode', netInt(v.PrimaryKey));
          if (add) t.set(row, 'SeqNo', netInt(v.TBSeq));
          t.set(row, 'ProcessCode', v.DdlProcess);
          t.set(row, 'Process', await selectedText(h, 'DdlProcess', v.DdlProcess));
          t.set(row, 'ProcessTime', netInt(v.TbProcessTime));
          t.set(row, 'MachineSetupTime', netInt(v.TbSetupTime));
          t.set(row, 'SetupCheckList', netInt(v.DDLCheckList));
          t.set(row, 'MatConsession', netBool(v.DdlConsession));
          t.set(row, 'MaterialSeq', netBool(v.DDLMaterialSeq));
          t.set(row, 'MinHoldPeriod', netDouble(v.TbMinHoldP));
          t.set(row, 'MaxHoldPeriod', netDouble(v.TbMaxHoldP));
          t.set(row, 'ProcessSeq', netBool(v.DDLValidate));
          t.set(row, 'HandlingUnit', netBool(v.DDLPallet));
          t.set(row, 'InspectionCheckList', netInt(v.DDLInspection));
          t.set(row, 'BatchNoFreq', netInt(v.ddlBatchFreq));
          t.set(row, 'DrawingNo', v.TBDrawaingNo);
          t.set(row, 'StageLabel', netBool(v.DDLStageLabel));
          t.set(row, 'StageQC', netBool(v.DDLStageQC));
          t.set(row, 'PrintNextStageLabel', netBool(v.DDLNextStageLabel));
          t.set(row, 'InputMaterialQC', netInt(v.DDLQCStatus));
          t.set(row, 'AutoProcessing', netInt(v.TBAutoProcess));
          t.set(row, 'NoOfCopy', netInt(v.TbNoOfCopy));
          t.set(row, 'StationScan', netInt(v.DDLWorkStation));
        };
        let rows = t.rows;
        if (at >= 0) {
          const row = { ...rows[at] };
          await fields(row);
          rows = rows.map((r, j) => (j === at ? row : r));
        }
        if (add) {
          const row = t.newRow();
          await fields(row);
          rows = [...rows, row];
        }
        Object.assign(out.set, { GVTransData: { rows, visible: true }, DdlProcess: { index: 0 }, TbProcessTime: { value: '' }, TbSetupTime: { value: '' }, DDLCheckList: { index: 0 }, ddlBatchFreq: { index: 0 }, TbMaxHoldP: { value: '' }, TbMinHoldP: { value: '' } });
        out.set.TBSeq = { value: nextSeq(await h.table('GVTransData', rows), true) };
        out.viewState.add = 'True';
        out.set.BtnAdd = { text: '    ADD    ' };
        out.success = true;
      });
    },
    'GVTransData:delete': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const rows = await gridDelete(h, 'GVTransData', h.arg);
        Object.assign(out.set, { GVTransData: { rows }, DdlProcess: { index: 0 }, TbProcessTime: { value: '' }, TbSetupTime: { value: '' }, DDLCheckList: { index: 0 }, TbMaxHoldP: { value: '' }, TbMinHoldP: { value: '' }, TBAutoProcess: { value: '' } });
        out.set.TBSeq = { value: nextSeq(await h.table('GVTransData', rows), false) };
        out.viewState.add = 'True';
        out.set.BtnAdd = { text: '    ADD    ' };
      });
    },
    // a line's edit given up (owner, 29 Oct 2026; the original had none: Select left the editors in Update until the
    // next Add): the editors back to Add with the next SeqNo, as after an Add, the lines unchanged
    'GVTransData:cancel': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs, add: 'True' } };
      return guard(out, async () => {
        Object.assign(out.set, { DdlProcess: { index: 0 }, TbProcessTime: { value: '' }, TbSetupTime: { value: '' }, DDLCheckList: { index: 0 }, ddlBatchFreq: { index: 0 }, TbMaxHoldP: { value: '' }, TbMinHoldP: { value: '' }, BtnAdd: { text: '    ADD    ' } });
        out.set.TBSeq = { value: nextSeq(await h.table('GVTransData'), true) };
      });
    },
    // GVTransData_SelectedIndexChanged: the line back into the editors, Add becomes Update
    'GVTransData:select': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const i = t.rows.findIndex((r) => t.get(r, 'SeqNo') === h.arg);
        const row = i >= 0 ? t.rows[i] : t.newRow(); // not found: a detached new row (all DBNull)
        const get = (c) => parseString(t.get(row, c));
        const intOf = (c) => String(netInt(t.get(row, c)));
        // a line's stored flag / code put in its list when the list has it, else the list left at its first option (owner,
        // 29 Oct 2026: on TEST e.g. BatchNoFreq and InputMaterialQC are NULL on every line, and the original failed on
        // them, so no line could be edited)
        const pick = async (id, value) => ((await h.options(id)).some((o) => o.value === value) ? select(h, out, id, value) : void (out.set[id] = { index: 0 }));
        if (i >= 0) {
          const changed = { ...row };
          t.set(changed, 'RouteCode', netInt(v.PrimaryKey));
          out.set.GVTransData = { rows: t.rows.map((r, j) => (j === i ? changed : r)) };
        }
        out.set.TBSeq = { value: get('SeqNo') };
        await select(h, out, 'DdlProcess', get('ProcessCode'));
        // DdlProcess.SelectedItem.Text = row["Process"]: the list item itself is renamed
        out.set.DdlProcess = { options: (await h.options('DdlProcess')).map((o) => (o.value === get('ProcessCode') ? { ...o, text: netString(t.get(row, 'Process')) } : o)), value: get('ProcessCode') };
        Object.assign(out.set, { TbProcessTime: { value: get('ProcessTime') }, TbSetupTime: { value: get('MachineSetupTime') } });
        const setup = parseStringZero(t.get(row, 'SetupCheckList'));
        if (setup !== '') out.set.DDLCheckList = { options: await h.fill(`Select ParameterCode, CONCAT(Name, ' - ', Alias) as Name From ParameterHeader where (Status=1 and Type =3) or ParameterCode=${digitsOrEmpty(setup)} order by Name`) };
        await select(h, out, 'DDLCheckList', setup);
        await pick('DdlConsession', intOf('MatConsession'));
        await pick('DDLMaterialSeq', intOf('MaterialSeq'));
        Object.assign(out.set, { TbMinHoldP: { value: get('MinHoldPeriod') }, TbMaxHoldP: { value: get('MaxHoldPeriod') } });
        await pick('DDLValidate', intOf('ProcessSeq'));
        await pick('DDLPallet', intOf('HandlingUnit'));
        const insp = parseStringZero(t.get(row, 'InspectionCheckList'));
        if (insp !== '') out.set.DDLInspection = { options: await h.fill(`Select ParameterCode, CONCAT(Name, ' - ', Alias) as Name From ParameterHeader where (Status=1 and Type in(6,7,8,2)) or ParameterCode=${digitsOrEmpty(insp)} order by Name`) };
        await select(h, out, 'DDLInspection', insp);
        out.set.TBDrawaingNo = { value: get('DrawingNo') };
        await pick('DDLStageLabel', intOf('StageLabel'));
        await pick('DDLStageQC', intOf('StageQC'));
        await pick('DDLNextStageLabel', intOf('PrintNextStageLabel'));
        await pick('ddlBatchFreq', intOf('BatchNoFreq'));
        await pick('DDLQCStatus', intOf('InputMaterialQC'));
        out.set.TBAutoProcess = { value: intOf('AutoProcessing') };
        out.set.TbNoOfCopy = { value: intOf('NoOfCopy') };
        await pick('DDLWorkStation', intOf('StationScan'));
        out.viewState.add = 'False';
        out.set.BtnAdd = { text: '  Update  ' };
      });
    },
    'GVTransData:Instruction': (v, h) => routingPopup(v, h, 'InsructionPanel', 'LblInstractionSeqNo', 'LBLInstructionRoutingCode'),
    'GVTransData:Guide': (v, h) => routingPopup(v, h, 'GuidePanel', 'LblGuideSeqNo', 'LblGuideRoutingCode'),
    IMBInstructionClose: async () => ({ set: { InsructionPanel: { visible: false } } }),
    IMBGuideClose: async () => ({ set: { GuidePanel: { visible: false } } }),
    // BtnInstructionAdd_Click (no try/catch in the original)
    BtnInstructionAdd: async (v, h) => {
      if (v.TBInstruction === '') return { alert: alertMsg('Kindly enter Instruction') };
      const t = await h.table('GVInstruction');
      const row = t.newRow();
      t.set(row, 'RouteCode', netInt(h.vs.RouteCode));
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'SeqNo', netDouble(h.vs.SeqNo));
      t.set(row, 'Instruction', v.TBInstruction);
      return { set: { GVInstruction: { rows: [...t.rows, row], visible: true }, TBInstruction: { value: '' } } };
    },
    'GVInstruction:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVInstruction = { rows: await gridDelete(h, 'GVInstruction', h.arg) };
      });
    },
    'GVGuide:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVGuide = { rows: await gridDelete(h, 'GVGuide', h.arg) };
      });
    },
    DDLExistingGuide: async (v) => ({ set: { TBGuideFilePath: { value: v.DDLExistingGuide } } }),
    // DDLGuideFileType_SelectedIndexChanged: "" empties the type list itself (as written)
    DDLGuideFileType: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLGuideFileType !== '') out.set.DDLExistingGuide = { options: await h.fill(`Select Distinct GuidePath,Description from RoutingGuide where guidetype=${digitsOrEmpty(v.DDLGuideFileType)}`), index: 0 };
        else out.set.DDLGuideFileType = { options: [] };
      });
    },
    // BTNGuideAdd_Click: an uploaded file is saved as ~/GuideFiles/<description><ext>, or an existing guide is reused
    BTNGuideAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.TBGuideDesc === '') return void (out.alert = alertMsg('Kindly enter description'));
        const typeText = () => selectedText(h, 'DDLGuideFileType', v.DDLGuideFileType);
        const wrongType = async (ext) => ext.toUpperCase().replace('.', '') !== (await typeText()).toUpperCase().trim();
        let path = netString(v.TBGuideFilePath);
        const file = v.FileUploadGuide;
        if (path === '' && file?.name && file.data) {
          const ext = extensionOf(file.name);
          const name = v.TBGuideDesc.replaceAll(' ', '').replaceAll('~', '').replaceAll('.', '').replaceAll(',', '').replaceAll('#', '') + ext;
          if (await wrongType(ext)) {
            out.set.TBGuideFilePath = { value: '' };
            return void (out.alert = alertMsg(`Kindly select a file with Extention as ${await typeText()}`));
          }
          const target = resolvePath(config.guideFilesDir, name);
          if (dirname(target) !== resolvePath(config.guideFilesDir)) throw new Error(`Could not find a part of the path '${target}'.`);
          await mkdir(config.guideFilesDir, { recursive: true });
          await writeFile(target, Buffer.from(file.data, 'base64'));
          path = `~/GuideFiles/${name}`;
          out.set.TBGuideFilePath = { value: path };
        }
        if (path === '') return void (out.alert = alertMsg('Please Select a File'));
        if (await wrongType(extensionOf(path))) {
          out.set.TBGuideFilePath = { value: '' };
          return void (out.alert = alertMsg(`Kindly select a file with Extention as ${await typeText()}`));
        }
        const t = await h.table('GVGuide');
        const row = t.newRow();
        t.set(row, 'RouteCode', netInt(h.vs.RouteCode));
        t.set(row, 'RowID', t.max('RowID') + 1);
        t.set(row, 'SeqNo', netDouble(h.vs.SeqNo));
        t.set(row, 'Description', v.TBGuideDesc);
        t.set(row, 'GuideType', v.DDLGuideFileType);
        t.set(row, 'GuidePath', path);
        Object.assign(out.set, { GVGuide: { rows: [...t.rows, row], visible: true }, TBGuideFilePath: { value: '' }, TBGuideDesc: { value: '' } });
      });
    },
  },
});
