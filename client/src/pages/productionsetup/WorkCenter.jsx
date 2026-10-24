// Work Center
// Sidebar: Productionsetup › Work Center. This file is the whole page: edit it freely.
import EngineScreen from '@/engine/EngineScreen.jsx';

/** The sidebar route this page answers (lower case, as the server lists it in me.migrated.forms). */
export const route = '/productionsetup/workcenterform';

/** Client-side bits of this page (its code-behind runs on the server): captions the markup gives without a Tag,
 *  and TextBoxes that filter a CheckBoxList. */
export const page = {
  checkSearch: { TBCheckListSearch: 'CBProcess' },
  labels: { CBProcess: 'Process List' },
};

export default function WorkCenter() {
  return <EngineScreen path={route} page={page} />;
}
