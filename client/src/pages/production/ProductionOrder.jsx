// Production Order
// Sidebar: Production › Production Order. This file is the whole page: edit it freely.
import { Boxes, ClipboardList, Tag } from 'lucide-react';
import EngineScreen from '@/engine/EngineScreen.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/production/productionorderform';

/** Dedicated layout: sections of control ids. Save / Update / Delete and every event stay the server page's own handlers. */
export const layout = {
  icon: ClipboardList,
  subtitle: 'Create a production order: product, quantity and materials',
  sections: [
    { title: 'Order', icon: ClipboardList, ids: [{ id: 'PrimaryKey', label: 'Order code' }, { id: 'TextBox2', label: 'Order date' }, 'Alias', { id: 'DropDownList4', label: 'Department' }, 'DDLOrderType', 'DDLSO', { id: 'DropDownList2', label: 'Priority' }, 'DDLOrder', { id: 'ddlStatus', label: 'Record status' }] },
    { title: 'Product and quantity', icon: Boxes, ids: ['DDLMaterial', 'DdlBOM', { id: 'TBTotalQty', label: 'Order quantity' }, { id: 'DdlTotalUom', label: 'Order unit' }, { id: 'TBQty', label: 'Production quantity' }, { id: 'DDLUom', label: 'Unit' }] },
    { title: 'Tracking', icon: Tag, ids: [{ id: 'TBTrackID', label: 'Track ID' }, { id: 'TextBox1', label: 'Customer ID' }, { id: 'TextBox9', label: 'Remark' }] },
    { title: 'Materials', icon: Boxes, ids: [{ id: 'BtnAdd', label: 'Add to list' }, 'GVTransData'] },
  ],
};

export default function ProductionOrder() {
  return <EngineScreen path={route} layout={layout} />;
}
