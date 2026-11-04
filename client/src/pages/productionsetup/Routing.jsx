// Routing (sidebar: Production Setup › Routing): the routings and their process lines, or one open; a new one can be
// copied from a saved one. Picking a model lists its materials; the lines are added, changed and deleted in their table
// by the screen's own events (shared RowFormGrid: Add / Update, its SeqNo check, the next SeqNo). The line editors the
// page did not show before (process / setup time, hold periods, checklist, drawing no ...) stay hidden: a line keeps
// their values when it is changed. A saved routing also has its images per stage on WIP Capture (Routing/StageImages.jsx).
// Plain page on /api/masters/routings.
import { ClipboardList, ListOrdered, Route as RouteIcon } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';
import StageImages from './Routing/StageImages.jsx';

export const route = '/productionsetup/routingform';

const pick = (f, label) => ({ f, label, kind: 'select' });

const sections = [
  {
    title: 'Routing', subtitle: 'The routing and what it makes', icon: ClipboardList, tone: 'blue', cols: 3,
    fields: [
      { f: 'routeCode', label: 'Route Code', kind: 'key' },
      { f: 'name', label: 'Routing Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'type', label: 'Routing Type', kind: 'select' },
      { f: 'model', label: 'Model', kind: 'select', on: 'model' },
      { f: 'material', label: 'Material', kind: 'select' },
    ],
  },
  {
    title: 'Process Lines', subtitle: 'In sequence; add a line in the first row, ✏ changes one', icon: ListOrdered, tone: 'violet',
    fields: [
      {
        f: 'lines', kind: 'rows', rowKey: 'SeqNo',
        events: { add: 'add', select: 'edit', delete: 'remove', cancel: 'cancelEdit' },
        columns: [
          { col: 'RouteCode', header: 'Code' },
          { col: 'SeqNo', header: 'SeqNo', editor: { f: 'seqNo', label: 'Process Sequence' } },
          { col: 'ProcessCode', header: 'ProcessCode' },
          { col: 'Process', header: 'Process', editor: pick('process', 'Production Process') },
          { col: 'MatConsession', header: 'MatConsession', editor: pick('concession', 'Allow Consession') },
          { col: 'MaterialSeq', header: 'MaterialSeq', editor: pick('materialSeq', 'Validate Material Sequence') },
          { col: 'ProcessSeq', header: 'ProcessSeq' },
          { col: 'InspectionCheckList', header: 'InspectionCheckList', editor: pick('inspection', 'Inspection Checklist') },
          { col: 'StageLabel', header: 'Stage Label', editor: pick('stageLabel', 'Stage Label') },
          { col: 'StageQC', header: 'Stage QC', editor: pick('stageQc', 'Stage Quality') },
          { col: 'PrintNextStageLabel', header: 'PrintNextStage', editor: pick('nextStageLabel', 'PrintNextStageLabel') },
          { col: 'AutoProcessing', header: 'AutoProcessing', editor: { f: 'autoProcess', label: 'Auto Next Process' } },
          { col: 'NoOfCopy', header: 'NoOfCopy', editor: { f: 'copies', label: 'No Of Copy' } },
          { col: 'StationScan', header: 'Grouping', editor: pick('grouping', 'Grouping') },
        ],
        more: [pick('inputQcStatus', 'Input QC Status')],
      },
    ],
  },
];

export default function Routing() {
  return (
    <MasterScreen
      name="routings"
      title="Routing"
      icon={RouteIcon}
      subtitle="A routing and the processes it goes through"
      sections={sections}
      footer={(r, { isNew }) => !isNew && <div className="mt-2"><StageImages routeCode={r.routeCode} /></div>}
    />
  );
}
