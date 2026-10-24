// Rework Confirmation
// Sidebar: Quality › Rework Confirmation. This file is the whole page: edit it freely.
import { History, Printer, RefreshCcw, ScanLine, ShieldCheck, Tag } from 'lucide-react';
import EngineScreen from '@/engine/EngineScreen.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/quality/reworkconfirmationnew';

/** Dedicated layout: sections of control ids. Save / Update / Delete and every event stay the server page's own handlers. */
export const layout = {
  icon: RefreshCcw,
  subtitle: 'Scan a unit sent to rework, then confirm the repair',
  sections: [
    { title: 'Scan unit', icon: ScanLine, scan: { box: 'TBBarcode', go: 'Go', label: 'Unit barcode', placeholder: 'Scan the unit barcode' }, ids: [{ id: 'DDLDepartment', label: 'Sub inventory' }, { id: 'BtnProduction', label: 'Back to production' }] },
    { title: 'Unit', icon: Tag, ids: ['GVInspectionDetails', 'GVProcess'] },
    { title: 'Inspection', icon: ShieldCheck, ids: ['DDLStatus', 'DDLNextAction', { id: 'BtnUD', label: 'Quality parameters' }, 'GVSelfInspection', 'GVTransData'] },
    { title: 'Confirmation', icon: ShieldCheck, ids: ['DDLRootCause', 'SSLActionTaken', 'TBQty', { id: 'DDLUom', label: 'Unit' }, { id: 'DDLApproverStatus', label: 'Status' }, { id: 'DDLNewAction', label: 'Next action' }, { id: 'DDLPrinter', label: 'Printer' }, { id: 'TBApproverRemark', label: 'Approver remark' }] },
    { title: 'Rework history', icon: History, ids: ['GVReworkHistory'] },
  ],
};

export default function ReworkConfirmation() {
  return <EngineScreen path={route} layout={layout} />;
}
