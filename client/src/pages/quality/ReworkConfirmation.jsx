// ════════════════════════════════════════════════════════════════════════════════
//  Rework Confirmation
//  Sidebar: Quality › Rework Confirmation
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    ReworkConfirmation.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                                  6. PAGE       loads the screen and switches between list and form
//    ReworkConfirmation/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    ReworkConfirmation/Form.jsx   2. STATE      how the form's state is read and patched
//                                  3. ENGINE     sends events to the server and applies its reply
//                                  5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { RotateCw, History, Plus, Printer, RefreshCcw, ScanLine, ShieldCheck, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './ReworkConfirmation/List.jsx';
import RecordForm from './ReworkConfirmation/Form.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/quality/reworkconfirmationnew';

/** Dedicated layout: sections of control ids. Save / Update / Delete and every event stay the server page's own handlers. */
const layout = {
  icon: RefreshCcw,
  subtitle: 'Scan a unit sent to rework, then confirm the repair',
  sections: [
    { title: 'Scan unit', icon: ScanLine, scan: { box: 'TBBarcode', go: 'Go', label: 'Unit barcode', placeholder: 'Scan the unit barcode' }, ids: ['DDLDepartment', 'BtnProduction'] },
    { title: 'Unit', icon: Tag, ids: ['GVInspectionDetails', 'GVProcess'] },
    { title: 'Inspection', icon: ShieldCheck, ids: ['DDLStatus', 'DDLNextAction', 'BtnUD', 'GVSelfInspection', 'GVTransData'] },
    { title: 'Confirmation', icon: ShieldCheck, ids: ['DDLRootCause', 'SSLActionTaken', 'TBQty', 'DDLUom', 'DDLApproverStatus', 'DDLNewAction', 'DDLPrinter', 'TBApproverRemark'] },
    { title: 'Rework history', icon: History, ids: ['GVReworkHistory'] },
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
  title: 'Rework Confirmation',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'ID', hidden: false }, // TextBox · InspectionTrans.ID · hidden by the screen until its logic shows it
    TBDate: { label: 'InspectedOn', hidden: false }, // TextBox · InspectionTrans.InspectedOn · hidden by the screen until its logic shows it
    TextBox1: { label: 'UserCode', hidden: false }, // TextBox · InspectionTrans.UserCode · hidden by the screen until its logic shows it
    TBInspectionLot: { label: 'InspectionLotNo', hidden: false }, // TextBox · InspectionTrans.InspectionLotNo · hidden by the screen until its logic shows it
    ddlPlant: { label: 'BusinessUnit', hidden: false }, // DropDownList · hidden by the screen until its logic shows it
    DDLDepartment: { label: 'Sub inventory', hidden: false }, // DropDownList
    TBBarcode: { label: 'Scan Barcode', hidden: false }, // TextBox
    TbBar: { label: 'SampleBarcode', hidden: false }, // TextBox · InspectionTrans.SampleBarcode · hidden by the screen until its logic shows it
    GVInspectionDetails: { label: '', hidden: false }, // GridView
    GVProcess: { label: '', hidden: false }, // GridView
    OtherFields: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    DefectPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    DDLStatus: { label: 'Status', hidden: false }, // DropDownList · InspectionTrans.Status
    DDLNextAction: { label: 'Next Action', hidden: false }, // DropDownList · InspectionTrans.NextAction
    GVSelfInspection: { label: '', hidden: false }, // GridView
    GVTransData: { label: 'Inspection Defect', hidden: false }, // GridView
    DDLRootCause: { label: 'Root Cause', hidden: false }, // DropDownList
    SSLActionTaken: { label: 'Action Taken', hidden: false }, // DropDownList
    TBQty: { label: 'Quantity', hidden: false }, // TextBox · InspectionTrans.Qty
    DDLUom: { label: 'Unit', hidden: false }, // DropDownList · InspectionTrans.Uom
    TBApproverRemark: { label: 'Approver remark', hidden: false }, // TextBox
    DDLNewAction: { label: 'Next action', hidden: false }, // DropDownList
    GVReworkHistory: { label: '', hidden: false }, // GridView
    BtnProduction: { label: 'Back to production', hidden: false }, // Button
    LeftPanel: { label: '', hidden: false }, // Panel
    BarcodePanel: { label: '', hidden: false }, // Panel
    Go: { label: 'Go', hidden: false }, // Button
    GridPanel: { label: '', hidden: false }, // Panel
    ProcessGrid: { label: '', hidden: false }, // Panel
    BtnUD: { label: 'Quality parameters', hidden: false }, // Button · hidden by the screen until its logic shows it
    ConfirmationPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    PnlRootCause: { label: '', hidden: false }, // Panel
    QtyPanel: { label: '', hidden: false }, // Panel
    DDLApproverStatus: { label: 'Status', hidden: false }, // DropDownList
    QCPrinterPanel: { label: '', hidden: false }, // Panel
    DDLPrinter: { label: 'Printer', hidden: false }, // DropDownList
    ActionPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    ReworkHistory: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    QC: { label: '', hidden: false }, // QC · hidden by the screen until its logic shows it
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVInspectionDetails: {
    },
    GVProcess: {
    },
    GVSelfInspection: {
    },
    GVTransData: {
      Defect: { header: 'Defect', hidden: false },
      Alias: { header: 'DefectCode', hidden: false },
      Name: { header: 'Name', hidden: false },
      ID: { header: 'ID', hidden: false },
    },
    GVReworkHistory: {
    },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function ReworkConfirmation() {
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
    screenApi(path)
      .spec()
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
