// ════════════════════════════════════════════════════════════════════════════════
//  Routing Guide
//  Sidebar: Productionsetup › Routing Guide
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    RoutingGuide.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                            6. PAGE       loads the screen and switches between list and form
//    RoutingGuide/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    RoutingGuide/Form.jsx   2. STATE      how the form's state is read and patched
//                            3. ENGINE     sends events to the server and applies its reply
//                            5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { RotateCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './RoutingGuide/List.jsx';
import RecordForm from './RoutingGuide/Form.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/productionsetup/routingguideform';

// const layout = { icon, subtitle, sections: [{ title, icon, ids: ['ControlId', { id: 'ControlId', label: 'Caption' }] }] };
const layout = undefined;

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
const page = {};

// ────────────────────────────────────────────────────────────────────────────
// TEXTS
// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).
// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.
// ────────────────────────────────────────────────────────────────────────────
const texts = {
  title: 'Routing Guide',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Route Code', hidden: false }, // TextBox · RoutingHeader.RouteCode
    ddlStatus: { label: 'Record Status', hidden: false }, // DropDownList · RoutingHeader.Status
    TextBox3: { label: 'Name', hidden: false }, // TextBox · RoutingHeader.Name
    Alias: { label: 'Alias', hidden: false }, // TextBox · RoutingHeader.Alias
    DDLModel: { label: 'Model', hidden: false }, // DropDownList · RoutingHeader.Model
    DDLMaterial: { label: 'Material', hidden: false }, // DropDownList · RoutingHeader.Material
    GVTransData: { label: 'Routing Trans', hidden: false }, // GridView
    GVInstruction: { label: 'Route Instruction', hidden: false }, // GridView
    DDLGuideFileType: { label: 'File Type', hidden: false }, // DropDownList
    TBGuideDesc: { label: 'Description', hidden: false }, // TextBox
    DDLExistingGuide: { label: 'Existing File', hidden: false }, // DropDownList
    GVGuide: { label: 'Routing Guide', hidden: false }, // GridView
    InsructionPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    IMBInstructionClose: { label: 'Instruction', hidden: false }, // ImageButton
    DescriptionPanel: { label: '', hidden: false }, // Panel
    MaxMinPanel: { label: '', hidden: false }, // Panel
    TBInstruction: { label: 'Instruction', hidden: false }, // TextBox
    BtnInstructionAdd: { label: '✔', hidden: false }, // Button
    InstructionGridPanel: { label: '', hidden: false }, // Panel
    GuidePanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    IMBGuideClose: { label: 'Guide', hidden: false }, // ImageButton
    Panel2: { label: '', hidden: false }, // Panel
    Panel3: { label: '', hidden: false }, // Panel
    FileUploadGuide: { label: 'Upload File', hidden: false }, // FileUpload
    TBGuideFilePath: { label: 'Path', hidden: false }, // TextBox
    BTNGuideAdd: { label: '✔', hidden: false }, // Button
    Panel4: { label: '', hidden: false }, // Panel
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVTransData: {
      RouteCode: { header: 'Code', hidden: false },
      SeqNo: { header: 'SeqNo', hidden: false },
      ProcessCode: { header: 'ProcessCode', hidden: false },
      Process: { header: 'Process', hidden: false },
      ProcessTime: { header: 'ProcessTime', hidden: false },
      MachineSetupTime: { header: 'MachineSetupTime', hidden: false },
      SetupCheckList: { header: 'SetupCheckList', hidden: false },
      InputMaterialScan: { header: 'InputMaterial', hidden: false },
      MatConsession: { header: 'MatConsession', hidden: false },
      MaterialSeq: { header: 'MaterialSeq', hidden: false },
      OutputLabel: { header: 'OutputLabel', hidden: false },
      YieldCapture: { header: 'YieldCapture', hidden: false },
      HandlingUnit: { header: 'Hu', hidden: false },
      MinHoldPeriod: { header: 'MinHold', hidden: false },
      MaxHoldPeriod: { header: 'MaxHold', hidden: false },
      StationScan: { header: 'StationScan', hidden: false },
      ProcessSeq: { header: 'ProcessSeq', hidden: false },
      ScanBarcodeType: { header: 'BarcodeType', hidden: false },
      InspectionCheckList: { header: 'InspectionCheckList', hidden: false },
      DrawingNo: { header: 'DrawingNo', hidden: false },
    },
    GVInstruction: {
      RouteCode: { header: 'Route Code', hidden: false },
      RowID: { header: 'RowID', hidden: false },
      Instruction: { header: 'Instruction', hidden: false },
      SeqNo: { header: 'SeqNo', hidden: false },
    },
    GVGuide: {
      Description: { header: 'Description', hidden: false },
      GuideType: { header: 'Guide Type', hidden: false },
      GuidePath: { header: 'Guide Path', hidden: false },
      SeqNo: { header: 'SeqNo', hidden: false },
      RouteCode: { header: 'Route Code', hidden: false },
      RowID: { header: 'RowID', hidden: false },
    },
  },
  // the list of saved records: its columns { header, hidden } (RECNO is the # column)
  list: {
    RECNO: { header: 'Rec No', hidden: false },
    ALIAS: { header: 'Alias', hidden: false },
    ROUTE: { header: 'Route', hidden: false },
    MATERIAL: { header: 'Material', hidden: false },
    ROUTECODE: { header: 'Route Code', hidden: false },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function RoutingGuide() {
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
