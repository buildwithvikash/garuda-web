// Work Center (sidebar: Production Setup › Work Center): the stations of a line and the processes each runs, or one open;
// a new one can be copied from a saved one. Plain page on /api/masters/work-centers. Group and Cost[Hr] were already
// hidden, the business unit by the screen: a saved station keeps them, a new one gets the screen's defaults.
import { ClipboardList, Factory, ListChecks } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/productionsetup/workcenterform';

// the work center beside the processes it runs (`width` in tenths of the row)
const sections = [
  {
    title: 'Work Center', subtitle: 'The station and its line', icon: ClipboardList, tone: 'blue', width: 5, cols: 2,
    fields: [
      { f: 'stationCode', label: 'Center Code', kind: 'key' },
      { f: 'department', label: 'Department', kind: 'select' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'line', label: 'Manf. Line', kind: 'select' },
      { f: 'jobWork', label: 'Is Job Work Center', kind: 'select' },
    ],
  },
  // the list has its own search (more than 12 processes)
  { title: 'Processes', subtitle: 'Tick the processes this station runs', icon: ListChecks, tone: 'violet', width: 5, fields: [{ f: 'processes', label: 'Process List', kind: 'checks' }] },
];

export default function WorkCenter() {
  return <MasterScreen name="work-centers" title="Work Center" icon={Factory} subtitle="A station on a line and the processes it runs" sections={sections} />;
}
