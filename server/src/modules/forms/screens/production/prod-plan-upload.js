// production/prod-plan-upload.js: the original page's code-behind, ported (registered in registry.js).
import { applyRow, importExcel, UPLOAD_COLUMNS } from '../../../production/plan-uploads/plan-uploads.service.js';
import { NRE, errorMsg, guard } from '../_shared.js';
import { PAGE_EVENTS, PAGE_LOAD } from '../registry.js';

// btnImport: the file's first sheet into the grid (AExcelWrapper.ImportExcel: row 1 the column names, then each row's
// cells in document order, as stored - numbers / dates as their raw values, shared strings as text); BtnUpdate: each
// row applied, the grid row green (done) or red (not found). The imported table is kept as ViewState["DT"].

const dtRows = (dt, colors = []) => dt.rows.map((r, i) => ({ ...Object.fromEntries(dt.columns.map((c, j) => [c, r[j] ?? ''])), ...(colors[i] ? { __color: colors[i] } : {}) }));

const UPLOADS = {
  // AVProductionCapture.UploadProdPlanWRL(MMyyyy, material alias, qty, plan type, remark): this or next month only
  'View/Production/ProdPlanUpload.aspx': {
    columns: UPLOAD_COLUMNS,
    row: applyRow,
  },
};

export { importExcel };

for (const [file, u] of Object.entries(UPLOADS)) {
  PAGE_LOAD[file] = (controls) => void (controls.find((c) => c.id === 'BtnUpdate').visible = false);
  PAGE_EVENTS[file] = {
    btnImport: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const dt = await importExcel(v.FileUpload1);
        out.set.GvDetails = { rows: dtRows(dt) };
        out.viewState.DT = dt;
        out.set.BtnUpdate = { visible: true };
      });
    },
    BtnUpdate: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      const dt = h.vs.DT;
      const colors = [];
      return guard(out, async () => {
        if (!dt?.columns) throw NRE();
        if (dt.columns.length !== u.columns) return void (out.alert = errorMsg('Invalid File'));
        try {
          for (const r of dt.rows) colors.push((await u.row(r, h.ctx)) ? 'green' : 'red');
        } finally {
          out.set.GvDetails = { rows: dtRows(dt, colors) };
        }
        out.success = true;
        out.set.BtnUpdate = { visible: false };
      });
    },
  };
}
