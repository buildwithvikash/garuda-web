// Production Assignment
// Sidebar: Production › Production Assignment. This file is the whole page: edit it freely.
import { Boxes, ClipboardList, Factory, Printer, Route } from 'lucide-react';
import EngineScreen from '@/engine/EngineScreen.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/production/productionassignmentform';

/** Dedicated layout: sections of control ids. Save / Update / Delete and every event stay the server page's own handlers. */
export const layout = {
  icon: Printer,
  subtitle: 'Start a production order at its first station and print the job cards',
  sections: [
    { title: 'Order', icon: ClipboardList, ids: ['DDLDepartment', { id: 'DDlProdOrder', label: 'Production order' }, { id: 'TextBox2', label: 'Assign date' }, { id: 'ddlStatus', label: 'Record status' }] },
    { title: 'Product', icon: Boxes, ids: ['DDLMaterial', 'DDLVariant', { id: 'DDLBom', label: 'BOM' }, 'DDLRouting', { id: 'TBTotalQty', label: 'Order quantity' }, { id: 'DdlTotalUom', label: 'Order unit' }, { id: 'TBQty', label: 'Production quantity' }, { id: 'DDLUom', label: 'Unit' }] },
    { title: 'Start at', icon: Factory, ids: [{ id: 'DDLProcessCode', label: 'Process' }, { id: 'DDLStationCode', label: 'Station' }] },
    { title: 'Print job cards', icon: Printer, ids: [{ id: 'DDLPrinter', label: 'Printer' }, { id: 'btnPrint', label: 'Print job cards' }] },
    { title: 'Route and materials', icon: Route, ids: ['GVRoute', 'GVBOMInput', 'GVOutput'] },
  ],
};

export default function ProductionAssignment() {
  return <EngineScreen path={route} layout={layout} />;
}
