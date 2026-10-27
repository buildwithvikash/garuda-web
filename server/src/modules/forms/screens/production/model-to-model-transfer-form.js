// Model Transfer (View/Production/ModelToModelTransferForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar } from '../../../../db/pool.js';
import { netString, netInt, netLong } from '../../../../shared/net.js';
import { digitsOrEmpty } from '../../../../shared/sql.js';
import { showModelDetails, modelToModelTransfer } from '../../../production/production.service.js';
import { errorMsg, guard } from '../_shared.js';
import { blankCells } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT } from '../registry.js';

const MODEL_TO_MODEL = 'View/Production/ModelToModelTransferForm.aspx';

// Page_Load: AU.FillBarcodePrinterList (every printer; the only one chosen)
PAGE_INIT[MODEL_TO_MODEL] = async (controls, vs, h) => {
  const ddl = controls.find((c) => c.id === 'DDLPrinter');
  ddl.options = await h.fill('Select ROWID,Name from BarcodePrinter');
  if (ddl.options.length === 2) ddl.value = ddl.options[1].value;
};

const wholeTyped = (s) => /^\s*[+-]?\d+\s*$/.test(netString(s));

// long.TryParse would take it
Object.assign(PAGE_EVENTS, {
  [MODEL_TO_MODEL]: {
    // DDLSourceMaterial_SelectedIndexChanged (no try/catch): the serial-number length limits the range boxes
    DDLSourceMaterial: async (v) => {
      const n = netInt(await scalar(`Select Length from  SerialGenerationLogicDetail where serialCode=(select TrackNoType from Material where matcode=${digitsOrEmpty(v.DDLSourceMaterial)}) and VariantCode=10`));
      return { set: { TbStart: { maxLength: n }, TbEnd: { maxLength: n } } };
    },
    btnShow: async (v) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GvDetails = { rows: blankCells(await showModelDetails(netString(v.DDLSourceMaterial), netString(v.TbStart), netString(v.TbEnd))) };
      });
    },
    btnPrint: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const [start, end] = [netLong(v.TbStart), netLong(v.TbEnd)];
        if (netString(v.DDLSourceMaterial) === '' || netString(v.DDLDestiMaterial) === '' || !(start > 0) || !(start <= end) || netString(v.DDLPrinter) === '' || !wholeTyped(v.TbStart) || !wholeTyped(v.TbEnd)) {
          out.alert = errorMsg('Wrong data. Please check all data');
          return;
        }
        out.set.GVPrint = { rows: blankCells(await modelToModelTransfer(netString(v.DDLSourceMaterial), netString(v.DDLDestiMaterial), netString(v.TbStart), netString(v.TbEnd), netString(v.DDLPrinter), h.ctx)) };
      });
    },
  },
});
