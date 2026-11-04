// Shift Master (sidebar: Settings › Shift): the shifts and their breaks, or one open. The breaks are added and deleted
// in their table by the screen's own events. Plain page on /api/masters/shifts.
import { Clock, Coffee } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/shiftmasterform';

const sections = [
  {
    title: 'Shift', subtitle: 'When the shift runs, and where', icon: Clock,
    fields: [
      { f: 'shiftCode', label: 'Shift Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'department', label: 'Department', kind: 'select' },
      { f: 'breakPeriod', label: 'No. of Breaks' },
      { f: 'startTime', label: 'Shift start time', type: 'time' },
      { f: 'endTime', label: 'Shift end time', type: 'time' },
    ],
  },
  {
    title: 'Shift breaks', subtitle: 'Add a break, 🗑 to remove one', icon: Coffee,
    fields: [
      {
        f: 'breaks', kind: 'rows', rowKey: 'RowID',
        events: { add: 'add', delete: 'remove' },
        columns: [
          { col: 'Name', header: 'Break Name', editor: { f: 'breakName', label: 'Break Name' } },
          { col: 'StartTime', header: 'Start Time', editor: { f: 'breakStart', label: 'Break start Time', type: 'time' } },
          { col: 'EndTime', header: 'End Time', editor: { f: 'breakEnd', label: 'Break end Time', type: 'time' } },
          { col: 'ShiftCode', header: 'Shift Code' },
          { col: 'RowID', header: 'Row ID' },
        ],
      },
    ],
  },
];

export default function Shift() {
  return <MasterScreen name="shifts" title="Shift Master" icon={Clock} subtitle="A shift's hours and its breaks" sections={sections} />;
}
