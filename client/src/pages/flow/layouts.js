// Dedicated layouts of the shop-floor record screens: sections of control ids (label overrides as { id, label }) and an
// optional scan box. RecordForm renders them; Save / Update / Delete and every event stay the page's own handlers.
import { Boxes, ClipboardList, Factory, History, Printer, RefreshCcw, Route, ScanLine, ShieldCheck, Tag } from 'lucide-react';

export const LAYOUTS = {
  '/production/productionorderform': {
    icon: ClipboardList,
    subtitle: 'Create a production order: product, quantity and materials',
    sections: [
      { title: 'Order', icon: ClipboardList, ids: [{ id: 'PrimaryKey', label: 'Order code' }, { id: 'TextBox2', label: 'Order date' }, 'Alias', { id: 'DropDownList4', label: 'Department' }, 'DDLOrderType', 'DDLSO', { id: 'DropDownList2', label: 'Priority' }, 'DDLOrder', { id: 'ddlStatus', label: 'Record status' }] },
      { title: 'Product and quantity', icon: Boxes, ids: ['DDLMaterial', 'DdlBOM', { id: 'TBTotalQty', label: 'Order quantity' }, { id: 'DdlTotalUom', label: 'Order unit' }, { id: 'TBQty', label: 'Production quantity' }, { id: 'DDLUom', label: 'Unit' }] },
      { title: 'Tracking', icon: Tag, ids: [{ id: 'TBTrackID', label: 'Track ID' }, { id: 'TextBox1', label: 'Customer ID' }, { id: 'TextBox9', label: 'Remark' }] },
      { title: 'Materials', icon: Boxes, ids: [{ id: 'BtnAdd', label: 'Add to list' }, 'GVTransData'] },
    ],
  },
  '/production/productionassignmentform': {
    icon: Printer,
    subtitle: 'Start a production order at its first station and print the job cards',
    sections: [
      { title: 'Order', icon: ClipboardList, ids: ['DDLDepartment', { id: 'DDlProdOrder', label: 'Production order' }, { id: 'TextBox2', label: 'Assign date' }, { id: 'ddlStatus', label: 'Record status' }] },
      { title: 'Product', icon: Boxes, ids: ['DDLMaterial', 'DDLVariant', { id: 'DDLBom', label: 'BOM' }, 'DDLRouting', { id: 'TBTotalQty', label: 'Order quantity' }, { id: 'DdlTotalUom', label: 'Order unit' }, { id: 'TBQty', label: 'Production quantity' }, { id: 'DDLUom', label: 'Unit' }] },
      { title: 'Start at', icon: Factory, ids: [{ id: 'DDLProcessCode', label: 'Process' }, { id: 'DDLStationCode', label: 'Station' }] },
      { title: 'Print job cards', icon: Printer, ids: [{ id: 'DDLPrinter', label: 'Printer' }, { id: 'btnPrint', label: 'Print job cards' }] },
      { title: 'Route and materials', icon: Route, ids: ['GVRoute', 'GVBOMInput', 'GVOutput'] },
    ],
  },
  '/quality/reworkconfirmationnew': {
    icon: RefreshCcw,
    subtitle: 'Scan a unit sent to rework, then confirm the repair',
    sections: [
      { title: 'Scan unit', icon: ScanLine, scan: { box: 'TBBarcode', go: 'Go', label: 'Unit barcode', placeholder: 'Scan the unit barcode' }, ids: [{ id: 'DDLDepartment', label: 'Sub inventory' }, { id: 'BtnProduction', label: 'Back to production' }] },
      { title: 'Unit', icon: Tag, ids: ['GVInspectionDetails', 'GVProcess'] },
      { title: 'Inspection', icon: ShieldCheck, ids: ['DDLStatus', 'DDLNextAction', { id: 'BtnUD', label: 'Quality parameters' }, 'GVSelfInspection', 'GVTransData'] },
      { title: 'Confirmation', icon: ShieldCheck, ids: ['DDLRootCause', 'SSLActionTaken', 'TBQty', { id: 'DDLUom', label: 'Unit' }, { id: 'DDLApproverStatus', label: 'Status' }, { id: 'DDLNewAction', label: 'Next action' }, { id: 'DDLPrinter', label: 'Printer' }, { id: 'TBApproverRemark', label: 'Approver remark' }] },
      { title: 'Rework history', icon: History, ids: ['GVReworkHistory'] },
    ],
  },
};
