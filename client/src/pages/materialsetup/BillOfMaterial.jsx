// Bill Of Material (sidebar: Material Setup › Bill Of Material): a product and the items it is made from and makes, or
// one open; a new one can be copied from a saved one. The input and output lines are added, changed and deleted in their
// tables by the screen's own events (shared RowFormGrid); an input line's Alternative opens its alternate materials in
// a pop-up. The weight and business unit the screen keeps hidden are not shown. Plain page on
// /api/masters/bills-of-material.
import { ClipboardList, ListTree, PackageMinus, PackagePlus, Replace, Save } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/materialsetup/billofmaterial';

const process = { f: 'process', label: 'Production Process', kind: 'select' };

const sections = [
  {
    title: 'BOM Details', icon: ClipboardList, tone: 'blue',
    fields: [
      { f: 'name', label: 'Name' },
      { f: 'version', label: 'Version' },
      { f: 'model', label: 'Model', kind: 'select' },
      { f: 'material', label: 'FG Material', kind: 'select', on: 'material' },
      { f: 'baseQty', label: 'Production Qty' },
      { f: 'baseUom', label: 'BaseUom', kind: 'select' },
      { f: 'remark', label: 'Remark' },
      { f: 'bomCode', label: 'BOM Code', kind: 'key' },
    ],
  },
  // the two side by side on wide screens: width in tenths of the row (6 + 4)
  {
    title: 'BOM Input', icon: PackageMinus, tone: 'amber', width: 6,
    fields: [
      {
        f: 'inputs', kind: 'rows', rowKey: 'RowID',
        events: { add: 'addInput', select: 'editInput', delete: 'removeInput', cancel: 'cancelInput', commands: { AlternativeMat: 'openAlternatives' } },
        columns: [
          { col: 'RowID', header: 'RowID' },
          { col: 'Material', header: 'MatCode' },
          { col: 'Type', header: 'Material Type', editor: { f: 'inputType', label: 'Input Item Type', kind: 'select', on: 'inputType' } },
          { col: 'MaterialCategory', header: 'Material Category' },
          { col: 'MaterialDesc', header: 'Material', editor: { f: 'inputMaterial', label: 'Input Item', kind: 'select', on: 'inputMaterial' } },
          { col: 'Qty', header: 'Qty', editor: { f: 'inputQty', label: 'Input Quantity' } },
          { col: 'UomDesc', header: 'Unit', editor: { f: 'inputUom', label: 'Unit', kind: 'select' } },
          { col: 'ScanReq', header: 'Scan Required', editor: { f: 'inputScan', label: 'Input Scan', kind: 'select' } },
          { col: 'OutputScan', header: 'Output Scan', editor: { f: 'outputScan', label: 'Output Scan', kind: 'select', panel: 'outputScanPanel' } },
          { col: 'ProcessDesc', header: 'Process', editor: process },
          { command: 'AlternativeMat', text: 'Alternative' },
        ],
        // a material with more than one routing: which one (the screen shows it)
        more: [{ f: 'subRouting', label: 'Routing', kind: 'select', panel: 'subRoutingPanel' }],
      },
    ],
  },
  {
    title: 'BOM Output', icon: PackagePlus, tone: 'emerald', width: 4,
    fields: [
      {
        f: 'outputs', kind: 'rows', rowKey: 'RowID',
        events: { add: 'addOutput', select: 'editOutput', delete: 'removeOutput', cancel: 'cancelOutput' },
        columns: [
          { col: 'RowID', header: 'RowID' },
          { col: 'Material', header: 'Mat Code' },
          { col: 'Type', header: 'Material Type', editor: { f: 'outputType', label: 'Output Item Type', kind: 'select', on: 'outputType' } },
          { col: 'MaterialDesc', header: 'Material', editor: { f: 'outputMaterial', label: 'Output Item', kind: 'select', on: 'outputMaterial' } },
          { col: 'Qty', header: 'Qty', editor: { f: 'outputQty', label: 'Output Quantity' } },
          { col: 'UomDesc', header: 'Unit', editor: { f: 'outputUom', label: 'Unit', kind: 'select' } },
          { col: 'ProcessDesc', header: 'Process', editor: process },
        ],
      },
    ],
  },
  // a pop-up, opened by an input line's Alternative (the screen shows its panel); closing it runs the screen's ✕
  {
    title: 'Alternate Materials', subtitle: 'Materials that can be used instead of this input line', icon: Replace, dialog: { panel: 'alternativesPanel', close: 'closeAlternatives' },
    fields: [
      {
        f: 'lineAlternatives', kind: 'rows', rowKey: 'Material',
        events: { add: 'addAlternative', delete: 'removeAlternative' },
        columns: [
          { col: 'RowID', header: 'RowID' },
          { col: 'Material', header: 'Material' },
          { col: 'Description', header: 'Description', editor: { f: 'alternative', label: 'Alternate Material', kind: 'select' } },
        ],
      },
      { kind: 'button', label: 'Update', icon: Save, event: 'updateAlternatives' },
    ],
  },
];

export default function BillOfMaterial() {
  return <MasterScreen name="bills-of-material" title="Bill Of Material" icon={ListTree} subtitle="A product and the items it is made from and makes" sections={sections} />;
}
