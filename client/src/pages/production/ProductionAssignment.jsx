// ════════════════════════════════════════════════════════════════════════════════
//  Production Assignment
//  Sidebar: Production › Production Assignment
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    ProductionAssignment.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                                    6. PAGE       loads the screen and switches between list and form
//    ProductionAssignment/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    ProductionAssignment/Form.jsx   2. STATE      how the form's state is read and patched
//                                    3. ENGINE     sends events to the server and applies its reply
//                                    5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { RotateCw, Boxes, ClipboardList, Factory, PackageMinus, PackagePlus, Plus, Printer, Route } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './ProductionAssignment/List.jsx';
import RecordForm from './ProductionAssignment/Form.jsx';

const enc = encodeURIComponent;

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/production/productionassignmentform';

/** Dedicated layout: sections of control ids. Save / Update / Delete and every event stay the server page's own handlers. */
const layout = {
  icon: Printer,
  subtitle: 'Start a production order at its first station and print the job cards',
  header: ['DDLDepartment', 'ddlStatus'],
  sections: [
    { title: 'Order', icon: ClipboardList, ids: ['DDlProdOrder', 'TextBox2'] },
    { title: 'Product', icon: Boxes, ids: ['DDLMaterial', 'DDLVariant', 'DDLBom', 'DDLRouting', 'TBTotalQty', 'DdlTotalUom', 'TBQty', 'DDLUom'] },
    { title: 'Start at', icon: Factory, ids: ['DDLProcessCode', 'DDLStationCode'] },
    { title: 'Print job cards', icon: Printer, ids: ['DDLPrinter', 'btnPrint'] },
    // the grids show the columns an operator reads, under readable headers; the rows keep every field (codes, status,
    // PS no.) for the screen. The BOM's input and output side by side (`width` in tenths)
    {
      title: 'Routing Stages', subtitle: 'The stages the order goes through, in sequence', icon: Route, tone: 'violet',
      // Started On / Completed On not shown (owner, 29 Oct 2026): empty before the order starts
      ids: ['GVRoute'],
    },
    {
      title: 'BOM Input', subtitle: 'Materials the order consumes', icon: PackageMinus, tone: 'amber', width: 5,
      ids: ['GVBOMInput'],
    },
    {
      title: 'BOM Output', subtitle: 'What the order produces', icon: PackagePlus, tone: 'emerald', width: 5,
      ids: ['GVOutput'],
    },
  ],
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
const page = {};

// ────────────────────────────────────────────────────────────────────────────
// TEXTS
// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).
// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.
// ────────────────────────────────────────────────────────────────────────────
const texts = {
  title: 'Production Assignment',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Order Code', hidden: false }, // TextBox · ProcessOrder.PSNo · hidden by the screen until its logic shows it
    TextBox2: { label: 'Assign date', hidden: false }, // TextBox · ProcessOrder.AssignDate
    Alias: { label: 'Alias', hidden: false }, // TextBox · ProcessOrder.Alias · hidden by the screen until its logic shows it
    DDLDepartment: { label: 'Department', hidden: false }, // DropDownList · ProcessOrder.Department
    DDLBU: { label: 'Business Unit', hidden: false }, // DropDownList · ProcessOrder.BusinessUnit · hidden by the screen until its logic shows it
    ddlStatus: { label: 'Record status', hidden: false }, // DropDownList · ProcessOrder.Status
    DDlProdOrder: { label: 'Production order', hidden: false }, // DropDownList · ProcessOrder.PRODNo
    DDLMaterial: { label: 'Material', hidden: false }, // DropDownList · ProcessOrder.Material
    DDLBom: { label: 'BOM', hidden: false }, // DropDownList · ProcessOrder.BOMCode
    DDLRouting: { label: 'Routing', hidden: false }, // DropDownList · ProcessOrder.Routing
    DDLVariant: { label: 'Variant', hidden: false }, // DropDownList
    DDLProcessCode: { label: 'Process', hidden: false }, // DropDownList · ProcessStageLabel.ProcessCode
    DDLStationCode: { label: 'Station', hidden: false }, // DropDownList · ProcessStageLabel.StationCode
    TBTotalQty: { label: 'Order quantity', hidden: false }, // TextBox
    DdlTotalUom: { label: 'Order unit', hidden: false }, // DropDownList
    TBQty: { label: 'Production quantity', hidden: false }, // TextBox · ProcessOrder.Qty
    DDLUom: { label: 'Unit', hidden: false }, // DropDownList · ProcessOrder.Uom
    ContentPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    GVRoute: { label: 'Process Routing', hidden: false }, // GridView
    GVBOMInput: { label: 'Process Input BOM', hidden: false }, // GridView
    GVOutput: { label: 'Process Output BOM', hidden: false }, // GridView
    DDLPrinter: { label: 'Printer', hidden: false }, // DropDownList
    btnPrint: { label: 'Print job cards', hidden: false }, // Button
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVRoute: {
      SeqNo: { header: 'Seq', hidden: false },
      Process: { header: 'Process', hidden: false },
      Station: { header: 'Station', hidden: false },
      StartedOn: { header: 'StartedOn', hidden: true },
      CompletedOn: { header: 'CompletedOn', hidden: true },
      ProcessCode: { header: 'ProcessCode', hidden: true },
      StationCode: { header: 'StationCode', hidden: true },
      ParameterCode: { header: 'ParameterCode', hidden: true },
      SetupParameter: { header: 'SetupParameter', hidden: true },
      Status: { header: 'Status', hidden: true },
      RouteCode: { header: 'Route', hidden: true },
      PSNo: { header: 'ProcessNo', hidden: true },
    },
    GVBOMInput: {
      RowID: { header: 'RowID', hidden: true },
      MaterialDesc: { header: 'Material', hidden: false },
      Qty: { header: 'Quantity', hidden: false },
      UomDesc: { header: 'Unit', hidden: false },
      ProcessDesc: { header: 'Process', hidden: false },
      ScanReq: { header: 'Scan Required', hidden: false },
      OutputScan: { header: 'Output Scan', hidden: false },
      ConsumedQty: { header: 'ConsumedQty', hidden: true },
      Parameters: { header: 'Parameters', hidden: true },
      Status: { header: 'Status', hidden: true },
      Material: { header: 'Mat Code', hidden: true },
      Uom: { header: 'Uom Code', hidden: true },
      PSNo: { header: 'Process', hidden: true },
      BOMCode: { header: 'BOM Code', hidden: true },
      ProcessCode: { header: 'ProcessNo', hidden: true },
    },
    GVOutput: {
      RowID: { header: 'RowID', hidden: true },
      MaterialDesc: { header: 'Material', hidden: false },
      Qty: { header: 'Quantity', hidden: false },
      UomDesc: { header: 'Unit', hidden: false },
      YieldQty: { header: 'Yield Qty', hidden: false },
      ProcessDesc: { header: 'Process', hidden: false },
      Status: { header: 'Status', hidden: true },
      Material: { header: 'Mat Code', hidden: true },
      Uom: { header: 'Uom Code', hidden: true },
      PSNo: { header: 'Process', hidden: true },
      BOMCode: { header: 'BOM Code', hidden: true },
      ProcessCode: { header: 'ProcessNo', hidden: true },
    },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function ProductionAssignment() {
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
    api(`/forms/spec?path=${enc(path)}`)
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
  const open = (key, notice) => run(api(`/forms/record?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'edit', key, state, notice })));
  // the "new" state is rebuilt each time (ClearForm: today's date, refreshed lists)
  const fresh = (notice) => run(api(`/forms/spec?path=${enc(path)}`).then((state) => show({ kind: 'form', mode: 'new', state, notice })));
  const copy = (key) => run(api(`/forms/copy?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'new', state })));

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
