// User Role
// Sidebar: Authorization › User Role. This file is the whole page: edit it freely.
import EngineScreen from '@/engine/EngineScreen.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/authorization/userroleform';

/** Client-side bits of this page (its code-behind runs on the server): captions the markup gives without a Tag,
 *  and TextBoxes that filter a CheckBoxList. */
export const page = {
  labels: { TreeView1: 'Detail' },
};

export default function UserRole() {
  return <EngineScreen path={route} page={page} />;
}
