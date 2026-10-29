// ════════════════════════════════════════════════════════════════════════════════
//  Bill Of Material
//  Sidebar: Materialsetup › Bill Of Material
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    BillOfMaterial.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                              6. PAGE       loads the screen and switches between list and form
//    BillOfMaterial/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    BillOfMaterial/Form.jsx   2. STATE      how the form's state is read and patched
//                              3. ENGINE     sends events to the server and applies its reply
//                              5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { ClipboardList, ListTree, PackageMinus, PackagePlus, Plus, Replace, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './BillOfMaterial/List.jsx';
import RecordForm from './BillOfMaterial/Form.jsx';


// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/materialsetup/billofmaterial';

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
const layout = {
  icon: ListTree,
  subtitle: 'A product and the items it is made from and makes',
  header: ['ddlStatus'],
  sections: [
    { title: 'BOM Details', icon: ClipboardList, tone: 'blue', cols: 4,
      ids: ['TextBox1', 'TextBox5', 'ddlModel', 'DDLMaterial', 'TextBox10', 'DDLBaseUom', 'TextBox12', 'DropDownList6', 'TextBox2', 'PrimaryKey', 'DropDownList4'] },
    // the two side by side on wide screens: width is in tenths of the row (5 + 5). Their lines are added and edited in
    // the tables (page.rowForms below); the editors (and the process) are in the tables' cells, hidden from the steps
    { title: 'BOM Input', icon: PackageMinus, tone: 'amber', width: 6, ids: ['GVBOMInput', 'GVAltMaterial'] },
    { title: 'BOM Output', icon: PackagePlus, tone: 'emerald', width: 4, ids: ['GVOutput'] },
    // shown only while the screen opens it (Alternative material on an input row)
    // a pop-up, opened by a BOM Input line's Alternative button (the screen shows its panel); closing it runs ✕
    { title: 'Alternate Materials', subtitle: 'Materials that can be used instead of this input line', icon: Replace, tone: 'slate', dialog: { close: 'btnAltPanelClose' },
      // the material picker and ✔ are in the table's add row (page.rowForms.GVCurrentAltMaterial)
      ids: ['GVCurrentAltMaterial', 'btnUpdateAltMaterial'] },
  ],
};

// the BOM's lines added and edited in their tables: each column's editor (the screen's control), what the screen
// shows besides (`more`), the Add / Update button and the Cancel event (shared RowFormGrid)
const page = {
  rowForms: {
    GVBOMInput: {
      fields: { Type: 'DDLInputMaterialType', MaterialDesc: 'DDLInputMaterial', Qty: 'TbInputQuantity', UomDesc: 'DdlInputUom', ProcessDesc: 'DdlProcess', ScanReq: 'DDLInputScan', OutputScan: 'DDLOutputScan' },
      more: ['DDLRouting'],
      add: 'BtnInputAdd',
      cancel: 'GVBOMInput:cancel',
    },
    GVOutput: {
      fields: { Type: 'DDLOutoutMaterialType', MaterialDesc: 'DDLOutputMaterial', Qty: 'TBOutputQty', UomDesc: 'DDLOutputUom', ProcessDesc: 'DdlProcess' },
      add: 'BtnOutputAdd',
      cancel: 'GVOutput:cancel',
    },
    // the pop-up's alternates of one input line: the material picked in the add row, ✔ adds it, 🗑 removes one
    GVCurrentAltMaterial: {
      fields: { Description: 'DDlAltInputMaterial' },
      add: 'btnAddAltMaterial',
    },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// TEXTS
// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).
// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.
// ────────────────────────────────────────────────────────────────────────────
const texts = {
  title: 'Bill Of Material',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'BOM Code', hidden: false }, // TextBox · BOMHeader.BOMCode · hidden by the screen until its logic shows it
    DropDownList4: { label: 'Business Unit', hidden: false }, // DropDownList · BOMHeader.BusinessUnit · hidden by the screen until its logic shows it
    ddlStatus: { label: 'Record Status', hidden: false }, // DropDownList · BOMHeader.Status
    TextBox1: { label: 'Name', hidden: false }, // TextBox · BOMHeader.Alias
    TextBox5: { label: 'Version', hidden: false }, // TextBox · BOMHeader.Version
    TextBox2: { label: 'Remark', hidden: false }, // TextBox · BOMHeader.Remark
    ddlModel: { label: 'Model', hidden: false }, // DropDownList · BOMHeader.Model
    DDLMaterial: { label: 'FG Material', hidden: false }, // DropDownList · BOMHeader.Material
    TextBox10: { label: 'Production Qty', hidden: false }, // TextBox · BOMHeader.BaseQty
    DDLBaseUom: { label: 'BaseUom', hidden: false }, // DropDownList · BOMHeader.BaseUom
    TextBox12: { label: 'Weight', hidden: false }, // TextBox · BOMHeader.Weight
    DropDownList6: { label: 'WeightUom', hidden: false }, // DropDownList · BOMHeader.WeightUom
    DdlProcess: { label: 'Production Process', hidden: true }, // DropDownList · in the table's cells
    DDLInputMaterialType: { label: 'Input Item Type', hidden: true }, // DropDownList · in the table's cells
    DDLInputMaterial: { label: 'Input Item', hidden: true }, // DropDownList · in the table's cells
    DdlInputUom: { label: '', hidden: true }, // DropDownList · in the table's cells
    DDLRouting: { label: 'Routing', hidden: true }, // DropDownList · in the table's cells
    GVBOMInput: { label: 'BOM Input', hidden: false }, // GridView
    GVAltMaterial: { label: 'BOM Input Alt Material', hidden: true }, // GridView · every line's alternates: the pop-up shows a line's
    DDlAltInputMaterial: { label: 'Alternate Material', hidden: true }, // DropDownList · in the pop-up table's add row
    GVCurrentAltMaterial: { label: '', hidden: false }, // GridView
    DDLOutoutMaterialType: { label: 'Output Item Type', hidden: true }, // DropDownList · in the table's cells
    DDLOutputMaterial: { label: 'Output Item', hidden: true }, // DropDownList · in the table's cells
    DDLOutputUom: { label: '', hidden: true }, // DropDownList · in the table's cells
    GVOutput: { label: 'BOM Output', hidden: false }, // GridView
    WeightPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    Panel3: { label: '', hidden: false }, // Panel
    Panel1: { label: '', hidden: false }, // Panel
    TbInputQuantity: { label: 'Input Quantity', hidden: true }, // TextBox · in the table's cells
    DDLInputScan: { label: 'Input Scan', hidden: true }, // DropDownList · in the table's cells
    OutputScanPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    DDLOutputScan: { label: 'Output Scan', hidden: true }, // DropDownList · in the table's cells
    SubRoutingPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    BtnInputAdd: { label: 'ADD', hidden: true }, // Button · in the table's cells
    AltMaterialPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    btnAltPanelClose: { label: 'X', hidden: true }, // Button · the pop-up's own close runs it
    PNLShipmentAdd: { label: '', hidden: false }, // Panel
    btnAddAltMaterial: { label: '✔', hidden: true }, // Button · the pop-up table's Add
    btnUpdateAltMaterial: { label: 'Update', hidden: false }, // Button
    Panel2: { label: '', hidden: false }, // Panel
    TBOutputQty: { label: 'Output Quantity', hidden: true }, // TextBox · in the table's cells
    BtnOutputAdd: { label: 'ADD', hidden: true }, // Button · in the table's cells
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVBOMInput: {
      RowID: { header: 'RowID', hidden: false },
      Material: { header: 'MatCode', hidden: false },
      Type: { header: 'Material Type', hidden: false },
      MaterialCategory: { header: 'Material Category', hidden: false },
      MaterialDesc: { header: 'Material', hidden: false },
      Qty: { header: 'Qty', hidden: false },
      UomDesc: { header: 'Unit', hidden: false },
      ScanReq: { header: 'Scan Required', hidden: false },
      OutputScan: { header: 'Output Scan', hidden: false },
      ProcessDesc: { header: 'Process', hidden: false },
      ProcessCode: { header: 'Process Code', hidden: true },
      BOMCode: { header: 'BOM Code', hidden: true },
      AltMaterial: { header: 'AltMaterial', hidden: true },
      RoutingCode: { header: 'Routing', hidden: true },
      Uom: { header: 'Uom Code', hidden: true },
    },
    GVAltMaterial: {
      BOMCode: { header: 'BOMCode', hidden: true },
      RowID: { header: 'RowID', hidden: false },
      Material: { header: 'Material', hidden: false },
      Description: { header: 'Description', hidden: false },
    },
    GVCurrentAltMaterial: {
      BOMCode: { header: 'BOMCode', hidden: true },
      RowID: { header: 'RowID', hidden: false },
      Material: { header: 'Material', hidden: false },
      Description: { header: 'Description', hidden: false },
    },
    GVOutput: {
      RowID: { header: 'RowID', hidden: false },
      Material: { header: 'Mat Code', hidden: false },
      Type: { header: 'Material Type', hidden: false },
      MaterialCategory: { header: 'Material Category', hidden: true },
      MaterialDesc: { header: 'Material', hidden: false },
      Qty: { header: 'Qty', hidden: false },
      UomDesc: { header: 'Unit', hidden: false },
      ProcessDesc: { header: 'Process', hidden: false },
      ProcessCode: { header: 'Process Code', hidden: true },
      BOMCode: { header: 'BOM Code', hidden: true },
      Uom: { header: 'Uom Code', hidden: true },
    },
  },
  // the list of saved records: its columns { header, hidden } (RECNO is the # column)
  list: {
    RECNO: { header: 'Rec No', hidden: false },
    NAME: { header: 'Name', hidden: false },
    MATERIAL: { header: 'Material', hidden: false },
    USAGE: { header: 'Usage', hidden: false },
    VERSION: { header: 'Version', hidden: false },
    BASEQTY: { header: 'Base Qty', hidden: false },
    UNIT: { header: 'Unit', hidden: false },
    STATUS: { header: 'Status', hidden: false },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function BillOfMaterial() {
  const me = useMe();
  const { pathname } = useLocation();
  const path = route;
  const screen = me ? screenOf(me.menu, pathname) : null;
  const [spec, setSpec] = useState(null);
  const [view, setView] = useState(() => (openedRecord() ? { kind: 'opening' } : { kind: 'list' })); // opening: the record the URL names, loading
  const [error, setErrorState] = useState('');
  const setError = (message) => {
    setErrorState(message);
    if (message) toast.error(message, { id: message, duration: 6000 });
  };
  const [seq, setSeq] = useState(0);
  const remember = useRememberView();
  const [listFilter, setListFilter] = useState({});
  const show = (v) => {
    setError('');
    setSeq((n) => n + 1); // a fresh form each time, never on unrelated re-renders
    setView(v);
    remember(v); // ?record=<key> | new: a refresh reopens this form
  };

  useEffect(() => {
    setSpec(null);
    screenApi(path).spec()
      .then((s) => {
        setSpec(s);
        // the form the URL names (a refresh), else where the screen starts
        const want = openedRecord();
        if (want === 'new') show({ kind: 'form', mode: 'new', state: s });
        else if (want) open(want).finally(() => setView((v) => (v.kind === 'opening' ? { kind: 'list' } : v))); // not found: the list
        else show(s.startOnList ? { kind: 'list' } : { kind: 'form', mode: 'new', state: s });
      })
      .catch((e) => setError(e.message));
  }, [path]);

  const run = (p) => p.catch((e) => setError(e.message));
  const open = (key, notice) => run(screenApi(path).record(key).then((state) => show({ kind: 'form', mode: 'edit', key, state, notice })));
  // the "new" state is rebuilt each time (ClearForm: today's date, refreshed lists)
  const fresh = (notice) => run(screenApi(path).spec().then((state) => show({ kind: 'form', mode: 'new', state, notice })));
  const copy = (key) => run(screenApi(path).copy(key).then((state) => show({ kind: 'form', mode: 'new', state })));

  const title = texts.title || spec?.title || screen?.caption || 'Screen';
  return (
    <Page
      icon={layout?.icon ?? screen?.group.icon}
      title={title}
      subtitle={view.kind === 'list' && spec ? 'Saved records — click one to open it' : layout?.subtitle}
      actions={spec && view.kind === 'list' && spec.buttons.add && <Button size="sm" icon={Plus} onClick={() => fresh()}>Add new</Button>}
    >
        {!spec || view.kind === 'opening' ? (
          (error ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />)
        ) : view.kind === 'list' ? (
          <RecordList path={path} spec={spec} onOpen={open} filter={listFilter} texts={texts} />
        ) : (
          <RecordForm
            key={seq}
            path={path}
            state={view.state}
            mode={view.mode}
            notice={view.notice}
            buttons={spec.buttons}
            callNewOnSave={spec.callNewOnSave}
            copyOptions={spec.copyOptions}
            print={spec.print}
            printers={spec.printers}
            onReload={(key, notice) => open(key, notice)}
            events={spec.events ?? []}
            onCopy={copy}
            onBack={spec.hasList ? () => show({ kind: 'list' }) : undefined}
            onDone={(notice) => fresh(notice)}
            onListFilter={setListFilter}
            layout={layout}
            page={{ ...page, texts }}
          />
        )}
    </Page>
  );
}
