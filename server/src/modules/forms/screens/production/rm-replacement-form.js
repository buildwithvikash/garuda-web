// Component Replacement (View/Production/RMReplacementForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netString, exceptionAlert } from '../../../../shared/net.js';
import { componentStatus, replaceRMScan } from '../../../production/production.service.js';
import { errorMsg } from '../_shared.js';
import { fgComponents, htmlCell } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT } from '../registry.js';

// ViewState: __Go / __ExistGo / __NewGo (the buttons' texts) and Data (the chosen grid row, as its cells' text).

const RM_REPLACE = 'View/Production/RMReplacementForm.aspx';

Object.assign(PAGE_INIT, {
  [RM_REPLACE]: async (controls, vs) => Object.assign(vs, { __Go: 'Go', __ExistGo: 'Go', __NewGo: 'Go' }),
});

// a BoundField cell's Text
/** Go_Click (no try/catch): the serial's components, unless it is scrapped */
async function rmGo(v, h, out) {
  if ((out.viewState.__Go ?? h.vs.__Go) === 'Go') {
    const barcode = netString(out.set.TBBarcode?.value ?? v.TBBarcode).trim();
    if (barcode === '') return;
    out.set.GvDetails = { rows: await fgComponents(barcode) };
    if ((await componentStatus(barcode)) === 99) {
      out.alert = errorMsg('This Serial No. is Scrapped');
      out.set.TBBarcode = { value: '', enabled: true };
    } else {
      out.set.Go = { text: 'Clr' };
      out.viewState.__Go = 'Clr';
    }
  } else {
    Object.assign(out.set, { TBBarcode: { value: '', enabled: true }, TBExistingRM: { value: '', enabled: true }, TBNewRM: { value: '', enabled: true }, btnexistScan: { text: 'Go' }, btnNewScan: { text: 'Go' }, Go: { text: 'Go' }, GvDetails: { rows: [] } });
    Object.assign(out.viewState, { __ExistGo: 'Go', __NewGo: 'Go', __Go: 'Go' });
  }
}

const RM_COLS = ['Category', 'Material', 'Process', 'Serial', 'PsNo', 'RowID', 'ProcessCode', 'matCode'];

Object.assign(PAGE_EVENTS, {
  [RM_REPLACE]: {
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      await rmGo(v, h, out);
      return out;
    },
    // btnRxistScan_Click: the grid row of the scanned existing component
    btnexistScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__ExistGo !== 'Go') {
          Object.assign(out.set, { TBExistingRM: { value: '', enabled: true }, btnexistScan: { text: 'Go' } });
          out.viewState.__ExistGo = 'Go';
          return out;
        }
        const rows = Array.isArray(v.GvDetails) ? v.GvDetails : [];
        const row = rows.find((r) => htmlCell(r.Serial) === v.TBExistingRM);
        if (!row) return { ...out, alert: errorMsg('Serial No not found') };
        out.viewState.Data = Object.fromEntries(RM_COLS.map((c) => [c, htmlCell(row[c])]));
        Object.assign(out.set, { TBNewRM: { value: '' }, btnexistScan: { text: 'Clr' }, TBExistingRM: { enabled: false } });
        out.viewState.__ExistGo = 'Clr';
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        Object.assign(out.set, { btnexistScan: { text: 'Go' }, TBExistingRM: { enabled: true } });
        out.viewState.__ExistGo = 'Go';
      }
      return out;
    },
    // btnNewScan_Click: the chosen component replaced (AVProductionCapture.ReplaceRMScanValidate), the list again
    btnNewScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__NewGo !== 'Go') {
          Object.assign(out.set, { TBNewRM: { value: '', enabled: true }, btnNewScan: { text: 'Go' } });
          out.viewState.__NewGo = 'Go';
          return out;
        }
        if (v.TBNewRM.trim() === '') return out;
        if (!h.vs.Data) throw new Error('There is no row at position 0.');
        const data = { ...h.vs.Data, NewSerialNo: v.TBNewRM.trim() };
        out.viewState.Data = data;
        await replaceRMScan(data, h.ctx);
        out.success = true;
        Object.assign(out.set, { TBExistingRM: { value: '', enabled: true }, TBNewRM: { value: '', enabled: true }, btnexistScan: { text: 'Go' }, btnNewScan: { text: 'Go' }, Go: { text: 'Go' } });
        Object.assign(out.viewState, { __ExistGo: 'Go', __NewGo: 'Go', __Go: 'Go' });
        await rmGo(v, h, out);
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        Object.assign(out.set, { TBNewRM: { value: '', enabled: true }, btnNewScan: { text: 'Go' } });
        out.viewState.__NewGo = 'Go';
      }
      return out;
    },
  },
});
