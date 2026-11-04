// Routing Guide (sidebar: Production Setup › Routing Guide): a routing's instructions and guide files, per process line.
// A line's Instruction or Guide opens them in a pop-up, run by the screen's own events (add, delete, the file type's
// existing files, an uploaded file saved under GuideFiles); Update saves them. Routings are made on Routing: no Add
// here, as before. Plain page on /api/masters/routing-guides.
import { BookOpen, ClipboardList, FileText, ListOrdered, MessageSquare } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/productionsetup/routingguideform';

const cols = (...names) => names.map(([col, header]) => ({ col, header }));

const sections = [
  {
    title: 'Routing', subtitle: 'The routing and what it makes', icon: ClipboardList, tone: 'blue', cols: 3,
    fields: [
      { f: 'routeCode', label: 'Route Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'model', label: 'Model', kind: 'select', on: 'model' },
      { f: 'material', label: 'Material', kind: 'select' },
    ],
  },
  {
    title: 'Process Lines', subtitle: 'Instruction or Guide on a line opens its instructions or files', icon: ListOrdered, tone: 'violet',
    fields: [
      {
        f: 'lines', kind: 'rows', rowKey: 'SeqNo',
        events: { commands: { Instruction: 'openInstructions', Guide: 'openGuides' } },
        columns: [
          ...cols(['RouteCode', 'Code'], ['SeqNo', 'SeqNo'], ['ProcessCode', 'ProcessCode'], ['Process', 'Process'], ['ProcessTime', 'ProcessTime'], ['MachineSetupTime', 'MachineSetupTime'],
            ['SetupCheckList', 'SetupCheckList'], ['InputMaterialScan', 'InputMaterial'], ['MatConsession', 'MatConsession'], ['MaterialSeq', 'MaterialSeq'], ['OutputLabel', 'OutputLabel'],
            ['YieldCapture', 'YieldCapture'], ['HandlingUnit', 'Hu'], ['MinHoldPeriod', 'MinHold'], ['MaxHoldPeriod', 'MaxHold'], ['StationScan', 'StationScan'], ['ProcessSeq', 'ProcessSeq'],
            ['ScanBarcodeType', 'BarcodeType'], ['InspectionCheckList', 'InspectionCheckList'], ['DrawingNo', 'DrawingNo']),
          { command: 'Instruction', text: 'Instruction' },
          { command: 'Guide', text: 'Guide' },
        ],
      },
    ],
  },
  // pop-ups, open while the screen shows their panel; the subtitle is the line's "Seq No." as the screen writes it
  {
    title: 'Instructions', subtitle: 'The line\'s instructions', icon: MessageSquare, dialog: { panel: 'instructionsPanel', close: 'closeInstructions', note: 'instructionLine' },
    fields: [
      {
        f: 'instructions', kind: 'rows', rowKey: 'RowID',
        events: { add: 'addInstruction', delete: 'removeInstruction' },
        columns: [...cols(['RouteCode', 'Route Code'], ['RowID', 'RowID']), { col: 'Instruction', header: 'Instruction', editor: { f: 'instruction', label: 'Instruction' } }, ...cols(['SeqNo', 'SeqNo'])],
      },
    ],
  },
  {
    title: 'Guide Files', subtitle: 'The line\'s guide files', icon: BookOpen, dialog: { panel: 'guidesPanel', close: 'closeGuides', note: 'guideLine' },
    fields: [
      {
        f: 'guides', kind: 'rows', rowKey: 'RowID',
        events: { add: 'addGuide', delete: 'removeGuide' },
        columns: [
          { col: 'Description', header: 'Description', editor: { f: 'guideDescription', label: 'Description' } },
          { col: 'GuideType', header: 'Guide Type', editor: { f: 'guideType', label: 'File Type', kind: 'select', on: 'guideType' } },
          { col: 'GuidePath', header: 'Guide Path', editor: { f: 'guidePath', label: 'Path' } },
          ...cols(['SeqNo', 'SeqNo'], ['RouteCode', 'Route Code'], ['RowID', 'RowID']),
        ],
        // a file of the type already used, or one uploaded (its extension must be the type's)
        more: [{ f: 'existingGuide', label: 'Existing File', kind: 'select', on: 'existingGuide' }, { f: 'guideFile', label: 'Upload File', kind: 'file', icon: FileText }],
      },
    ],
  },
];

export default function RoutingGuide() {
  return <MasterScreen name="routing-guides" title="Routing Guide" icon={BookOpen} subtitle="A routing's instructions and guide files, per line" sections={sections} canAdd={false} />;
}
