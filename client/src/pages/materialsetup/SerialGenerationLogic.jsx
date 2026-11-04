// Serial Generation Logic (sidebar: Material Setup › Serial Generation Logic): how a serial number is built, part by
// part, or one open; a new one can be copied from a saved one. The parts are added, changed and deleted in their table by
// the screen's own events (shared RowFormGrid); the date / serial / value editors show as the Sequence Field asks. The
// preview beside the logic shows what it makes. Plain page on /api/masters/serial-logics.
import { ClipboardList, Eye, Hash, ListOrdered } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';
import SerialPreview from './SerialGenerationLogic/SerialPreview.jsx';

export const route = '/materialsetup/serialgenerationlogicform';

const num = (f, label, panel) => ({ f, label, type: 'number', panel });

// the logic beside its preview, then its parts (`width` in tenths of the row)
const sections = [
  {
    title: 'Logic', icon: ClipboardList, tone: 'blue', width: 5, cols: 2,
    fields: [
      { f: 'serialCode', label: 'Value Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'type', label: 'Type', kind: 'select' },
      { f: 'barcodeLength', label: 'Barcode Length' },
      { f: 'useFor', label: 'Use for', kind: 'select' },
    ],
  },
  {
    title: 'Serial Preview', subtitle: 'What this logic makes', icon: Eye, tone: 'emerald', width: 5, cols: 1,
    fields: [{ f: 'preview', kind: 'custom', span: 'full', render: (r) => <SerialPreview values={{ GVTransData: r.parts, TextBox1: r.barcodeLength, PrimaryKey: r.serialCode }} /> }],
  },
  {
    title: 'Serial Parts', subtitle: 'In sequence order; add a part in the first row, ✏ changes one', icon: ListOrdered, tone: 'violet',
    fields: [
      {
        f: 'parts', kind: 'rows', rowKey: 'RowID',
        events: { add: 'add', select: 'edit', delete: 'remove', cancel: 'cancelEdit' },
        columns: [
          { col: 'Seq', header: 'Sequence No', editor: num('seqNo', 'Sequence No') },
          { col: 'VariantName', header: 'VariantName', editor: { f: 'sequenceField', label: 'Sequence Field', kind: 'select', on: 'sequenceField' } },
          { col: 'Name', header: 'Description', editor: { f: 'description', label: 'Field Desc' } },
          { col: 'Seperator', header: 'Seperator', editor: { f: 'separator', label: 'Seperator', kind: 'select' } },
          { col: 'StartingNo', header: 'Starting No', editor: num('startingNo', 'Starting No', 'serialPanel') },
          { col: 'Seed', header: 'Serial No Seed', editor: num('seed', 'Seed NO', 'serialPanel') },
          { col: 'Length', header: 'Length', editor: num('length', 'Length', 'serialPanel') },
          { col: 'EndingNo', header: 'Ending No', editor: num('endingNo', 'Ending No', 'serialPanel') },
          { col: 'Format', header: 'Format', editor: { f: 'format', label: 'Format', panel: 'datePanel' } },
          { col: 'Value', header: 'Value', editor: { f: 'value', label: 'Value', panel: 'valuePanel' } },
          { col: 'RowID', header: 'Row ID' },
        ],
      },
    ],
  },
];

export default function SerialGenerationLogic() {
  return <MasterScreen name="serial-logics" title="Serial Generation Logic" icon={Hash} subtitle="How a serial number is built, part by part" sections={sections} />;
}
