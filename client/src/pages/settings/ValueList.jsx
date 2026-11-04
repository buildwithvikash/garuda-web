// Check List Values (sidebar: Settings › Value List): the value lists a checklist's List parameter offers, or one open.
// The values are added and deleted in their table by the screen's own events. Plain page on /api/masters/value-lists.
import { ListOrdered } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/parametervaluelistform';

const sections = [
  {
    title: 'Value list', subtitle: 'The list a checklist parameter picks from', icon: ListOrdered, cols: 3,
    fields: [
      { f: 'code', label: 'Code', kind: 'key' },
      { f: 'name', label: 'Name', span: 2 },
    ],
  },
  {
    title: 'Values', subtitle: 'Add a value with its result, 🗑 to remove one', icon: ListOrdered,
    fields: [
      {
        f: 'values', kind: 'rows', rowKey: 'Value',
        events: { add: 'add', delete: 'remove' },
        columns: [
          { col: 'Code', header: 'Code' },
          { col: 'Value', header: 'Value', editor: { f: 'value', label: 'Value' } },
        ],
        more: [{ f: 'result', label: 'Pass/Fail', kind: 'select' }],
      },
    ],
  },
];

export default function ValueList() {
  return <MasterScreen name="value-lists" title="Check List Values" icon={ListOrdered} subtitle="A list of values and whether each passes" sections={sections} />;
}
