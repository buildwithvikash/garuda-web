// Check List (sidebar: Settings › Check List): the checklists and their parameters, or one open; a new one can be copied
// from a saved one. The parameters are added, edited and deleted in their table by the screen's own events. Plain page
// on /api/masters/check-lists.
import { ClipboardList, ListChecks } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/parameterform';

const sections = [
  {
    title: 'Check list', subtitle: 'What the checklist is', icon: ClipboardList,
    fields: [
      { f: 'checklistCode', label: 'Checklist Code', kind: 'key' },
      { f: 'name', label: 'Checklist Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'type', label: 'Type', kind: 'select' },
    ],
  },
  {
    title: 'Parameters', subtitle: 'What is checked: add a line, ✏ to change one, 🗑 to remove it', icon: ListChecks,
    fields: [
      {
        f: 'parameters', kind: 'rows', rowKey: 'LineCode',
        events: { add: 'add', select: 'edit', delete: 'remove', cancel: 'cancelEdit' },
        columns: [
          { col: 'LineCode', header: 'LineCode' },
          { col: 'Name', header: 'Name', editor: { f: 'paramName', label: 'Parameter Name' } },
          { col: 'Description', header: 'Description', editor: { f: 'description', label: 'Description' } },
          { col: 'InputType', header: 'InputType', editor: { f: 'inputType', label: 'Input Type', kind: 'select', on: 'inputType' } },
        ],
        // under the line's editors; Min / Max / Pass / Unit / Result for a numeric input, the list for a list input
        more: [
          { f: 'minValue', label: 'Min', panel: 'minMax' },
          { f: 'maxValue', label: 'Max', panel: 'minMax' },
          { f: 'passValue', label: 'Pass Value', panel: 'minMax' },
          { f: 'unit', label: 'Unit', kind: 'select', panel: 'minMax' },
          { f: 'resultDefined', label: 'Result Defined By', kind: 'select', panel: 'minMax' },
          { f: 'list', label: 'List Items', kind: 'select', panel: 'listPanel' },
          { f: 'instrument', label: 'Instrument', kind: 'select' },
          { f: 'guideImage', label: 'Guide Image', kind: 'image' },
        ],
      },
    ],
  },
];

export default function CheckListMaster() {
  return <MasterScreen name="check-lists" title="Check List" icon={ClipboardList} subtitle="A checklist and the parameters it checks" sections={sections} />;
}
