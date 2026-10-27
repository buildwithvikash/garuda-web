// Production Order (View/Production/ProductionOrderForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netString, netInt } from '../../../../shared/net.js';
import { newTrackId } from '../../../production/production.service.js';
import * as ordersRepo from '../../../production-orders/production-orders.repo.js';
import { NRE, alertMsg, gridDelete, guard, select, selectedText } from '../_shared.js';
import { CUSTOM_DISPLAY, PAGE_DISPLAY, PAGE_EVENTS, PAGE_LISTS } from '../registry.js';

const PROD_ORDER = 'View/Production/ProductionOrderForm.aspx';

CUSTOM_DISPLAY.add(PROD_ORDER);

// its SQL and the track ID: repositories/production/orders.repository.js, services/production/orders.service.js
/** DDLMaterial_SelectedIndexChanged: base UOM, BOM list (one BOM chosen), serial material -> Track shown with a new ID */
async function prodOrderMaterial(material, h, out) {
  if (material === '') {
    out.set.DdlBOM = { options: [] };
    return;
  }
  const { baseUom: uom, serial } = await ordersRepo.materialBasics(material);
  await select(h, out, 'DDLUom', uom);
  const boms = await ordersRepo.boms(material);
  out.set.DdlBOM = { options: boms, index: boms.length === 2 ? 1 : 0 };
  await select(h, out, 'DdlTotalUom', uom);
  if (serial) {
    out.set.Track = { visible: true };
    out.set.TBTrackID = { value: await newTrackId(h.ctx) };
  } else out.set.Track = { visible: false };
}

PAGE_LISTS[PROD_ORDER] = {
  // DDLOrder is only filled by DDLOrderType_SelectedIndexChanged
  DDLOrder: (v) => (v.DDLOrderType === '1' ? ordersRepo.salesOrders(v.DDLBU) : v.DDLOrderType === '4' ? ordersRepo.serviceRequests(v.DDLBU, v.DDLMaterial) : []),
};

Object.assign(PAGE_DISPLAY, {
  // display(key): DDLMaterial_SelectedIndexChanged on the (fresh) form's material, then AU.Display
  [PROD_ORDER]: {
    async before(controls) {
      if (netString(controls.find((c) => c.id === 'DDLMaterial').value) === '') controls.find((c) => c.id === 'DdlBOM').options = [];
    },
  },
});

Object.assign(PAGE_EVENTS, {
  [PROD_ORDER]: {
    DDLMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, () => prodOrderMaterial(netString(v.DDLMaterial), h, out));
    },
    DDLOrderType: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLOrderType === '1') {
          Object.assign(out.set, { SalesOrderPanel: { visible: true }, OrderQtyPanel: { visible: true } });
          out.set.DDLSO = { options: await ordersRepo.salesOrders(v.DDLBU), index: 0 };
          out.set.DDLOrder = { options: await ordersRepo.salesOrders(v.DDLBU), index: 0 };
          out.set.Track = { visible: true };
          out.set.DDLMaterial = { options: await ordersRepo.productionMaterials(), index: 0 };
          out.set.TBQty = { enabled: true };
        } else if (v.DDLOrderType === '4') {
          out.set.DDLMaterial = { options: await ordersRepo.serviceMaterials(), index: 0 };
          Object.assign(out.set, { SalesOrderPanel: { visible: false }, OrderQtyPanel: { visible: false } });
          out.set.DDLOrder = { options: await ordersRepo.serviceRequests(v.DDLBU, ''), index: 0 }; // the list was just refilled: nothing selected
          Object.assign(out.set, { Track: { visible: false }, TBQty: { value: '1', enabled: false } });
        } else {
          Object.assign(out.set, { SalesOrderPanel: { visible: false }, OrderQtyPanel: { visible: false }, DDLSO: { options: [] }, Track: { visible: false } });
          out.set.DDLMaterial = { options: await ordersRepo.productionMaterials(), index: 0 };
          out.set.TBQty = { enabled: true };
        }
      });
    },
    DDLSO: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLSO !== '') {
          const opts = await ordersRepo.salesOrderMaterials(v.DDLSO);
          out.set.DDLMaterial = { options: opts, index: 0 };
          if (opts.length === 2) {
            out.set.DDLMaterial.index = 1;
            await prodOrderMaterial(opts[1].value, h, out);
          }
        } else out.set.DDLMaterial = { options: await ordersRepo.activeMaterials(), index: 0 };
      });
    },
    // BtnAdd_Click: the chosen order added to the grid, TBTrackID from its SRMaterial row
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (netString(v.DDLOrder) === '') {
          out.alert = alertMsg('Kindly select a Order');
          return;
        }
        const t = await h.table('GVTransData');
        const row = t.newRow();
        t.set(row, 'PRODNo', netInt(v.PrimaryKey));
        t.set(row, 'SeqNo', t.max('SeqNo') + 1);
        t.set(row, 'OrderCode', v.DDLOrder);
        t.set(row, 'OrderNo', await selectedText(h, 'DDLOrder', v.DDLOrder));
        // ponytail: the original added the row to its ViewState table before this lookup, so it survived a failure here
        const track = await ordersRepo.serviceRequestTrackId(v.DDLOrder);
        if (track === null || track === undefined) throw NRE();
        out.set.TBTrackID = { value: netString(track) };
        out.set.GVTransData = { rows: [...t.rows, row] };
        await select(h, out, 'DDLOrder', '');
      });
    },
    'GVTransData:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVTransData = { rows: await gridDelete(h, 'GVTransData', h.arg) };
      });
    },
  },
});
