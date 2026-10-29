// ════════════════════════════════════════════════════════════════════════════════
//  Routing
//  Sidebar: Productionsetup › Routing
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    Routing.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                       6. PAGE       loads the screen and switches between list and form
//    Routing/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    Routing/Form.jsx   2. STATE      how the form's state is read and patched
//                       3. ENGINE     sends events to the server and applies its reply
//                       5. FORM VIEW  one record: fields, buttons, grids, print ...
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
import RecordList from './Routing/List.jsx';
import RecordForm from './Routing/Form.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/productionsetup/routingform';

// const layout = { icon, subtitle, sections: [{ title, icon, ids: ['ControlId', { id: 'ControlId', label: 'Caption' }] }] };
const layout = undefined;

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
// the routing's lines added and edited in their table: each column's editor (the screen's control; the editors this
// page's texts hide stay hidden), what has no column below them (`more`), Add / Update and the cancel of an edit
// (shared RowFormGrid)
const page = {
  rowForms: {
    GVTransData: {
      fields: { SeqNo: 'TBSeq', Process: 'DdlProcess', MatConsession: 'DdlConsession', MaterialSeq: 'DDLMaterialSeq', InspectionCheckList: 'DDLInspection', StageLabel: 'DDLStageLabel', StageQC: 'DDLStageQC', PrintNextStageLabel: 'DDLNextStageLabel', AutoProcessing: 'TBAutoProcess', NoOfCopy: 'TbNoOfCopy', StationScan: 'DDLWorkStation' },
      more: ['DDLQCStatus'],
      add: 'BtnAdd',
      cancel: 'GVTransData:cancel',
    },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// TEXTS
// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).
// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.
// ────────────────────────────────────────────────────────────────────────────
const texts = {
  title: 'Routing',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Route Code', hidden: false }, // TextBox · RoutingHeader.RouteCode
    ddlStatus: { label: 'Record Status', hidden: false }, // DropDownList · RoutingHeader.Status
    TextBox3: { label: 'Routing Name', hidden: false }, // TextBox · RoutingHeader.Name
    Alias: { label: 'Alias', hidden: false }, // TextBox · RoutingHeader.Alias
    DropDownList1: { label: 'Routing Type', hidden: false }, // DropDownList · RoutingHeader.Type
    DDLModel: { label: 'Model', hidden: false }, // DropDownList · RoutingHeader.Model
    DDLMaterial: { label: 'Material', hidden: false }, // DropDownList · RoutingHeader.Material
    TBSeq: { label: 'Process Sequence', hidden: true }, // TextBox · in the table's cells
    DdlProcess: { label: 'Production Process', hidden: true }, // DropDownList · in the table's cells
    TbProcessTime: { label: 'Process Time', hidden: true }, // TextBox
    TbSetupTime: { label: 'Setup Time', hidden: true }, // TextBox
    TbMinHoldP: { label: 'Min', hidden: true }, // TextBox
    TbMaxHoldP: { label: 'Max', hidden: true }, // TextBox
    TBAutoProcess: { label: 'Auto Next Process', hidden: true }, // TextBox · in the table's cells
    DDLQCStatus: { label: 'Input QC Status', hidden: true }, // DropDownList · in the table's cells
    DdlConsession: { label: 'Allow Consession', hidden: true }, // DropDownList · in the table's cells
    DDLValidate: { label: 'Vaildate Process Sequence', hidden: true }, // DropDownList
    DDLWorkStation: { label: 'Grouping', hidden: true }, // DropDownList · in the table's cells
    DDLPallet: { label: 'Pallet Scan', hidden: true }, // DropDownList
    TBDrawaingNo: { label: 'Drawing No', hidden: true }, // TextBox
    DDLCheckList: { label: 'Setup Checklist', hidden: true }, // DropDownList
    DDLInspection: { label: 'Inspection Checklist', hidden: true }, // DropDownList · in the table's cells
    ddlBatchFreq: { label: 'Batch Number Frequncy', hidden: true }, // DropDownList
    DDLStageLabel: { label: 'Stage Label', hidden: true }, // DropDownList · in the table's cells
    DDLNextStageLabel: { label: 'PrintNextStageLabel', hidden: true }, // DropDownList · in the table's cells
    TbNoOfCopy: { label: 'No Of Copy', hidden: true }, // TextBox · in the table's cells
    GVTransData: { label: 'Routing Trans', hidden: false }, // GridView
    GVInstruction: { label: 'Route Instruction', hidden: true }, // GridView
    DDLGuideFileType: { label: 'File Type', hidden: true }, // DropDownList
    TBGuideDesc: { label: 'Description', hidden: true }, // TextBox
    DDLExistingGuide: { label: 'Existing File', hidden: true }, // DropDownList
    GVGuide: { label: 'Routing Guide', hidden: false }, // GridView
    PnlAutoProcess: { label: '', hidden: false }, // Panel
    DDLMaterialSeq: { label: 'Validate Material Sequence', hidden: true }, // DropDownList · in the table's cells
    PnlDescrete: { label: '', hidden: false }, // Panel
    DDLStageQC: { label: 'Stage Quality', hidden: true }, // DropDownList · in the table's cells
    BtnAdd: { label: 'ADD', hidden: true }, // Button · in the table's cells
    InsructionPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    IMBInstructionClose: { label: 'Instruction', hidden: true }, // ImageButton
    DescriptionPanel: { label: '', hidden: false }, // Panel
    MaxMinPanel: { label: '', hidden: false }, // Panel
    TBInstruction: { label: 'Instruction', hidden: true }, // TextBox
    BtnInstructionAdd: { label: '✔', hidden: true }, // Button
    InstructionGridPanel: { label: '', hidden: false }, // Panel
    GuidePanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    IMBGuideClose: { label: 'Guide', hidden: true }, // ImageButton
    Panel2: { label: '', hidden: false }, // Panel
    Panel3: { label: '', hidden: false }, // Panel
    FileUploadGuide: { label: 'Upload File', hidden: true }, // FileUpload
    PathPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    TBGuideFilePath: { label: 'Path', hidden: false }, // TextBox
    BTNGuideAdd: { label: '✔', hidden: true }, // Button
    Panel4: { label: '', hidden: false }, // Panel
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVTransData: {
      RouteCode: { header: 'Code', hidden: false },
      SeqNo: { header: 'SeqNo', hidden: false },
      ProcessCode: { header: 'ProcessCode', hidden: false },
      Process: { header: 'Process', hidden: false },
      ProcessTime: { header: 'ProcessTime', hidden: true },
      MachineSetupTime: { header: 'MachineSetupTime', hidden: true },
      SetupCheckList: { header: 'SetupCheckList', hidden: true },
      MatConsession: { header: 'MatConsession', hidden: false },
      MaterialSeq: { header: 'MaterialSeq', hidden: false },
      MinHoldPeriod: { header: 'MinHold', hidden: true },
      MaxHoldPeriod: { header: 'MaxHold', hidden: true },
      HandlingUnit: { header: 'HandlingUnit', hidden: true },
      ProcessSeq: { header: 'ProcessSeq', hidden: false },
      ScanBarcodeType: { header: 'BarcodeType', hidden: true },
      InspectionCheckList: { header: 'InspectionCheckList', hidden: false },
      DrawingNo: { header: 'DrawingNo', hidden: true },
      StageLabel: { header: 'Stage Label', hidden: false },
      StageQC: { header: 'Stage QC', hidden: false },
      PrintNextStageLabel: { header: 'PrintNextStage', hidden: false },
      AutoProcessing: { header: 'AutoProcessing', hidden: false },
      NoOfCopy: { header: 'NoOfCopy', hidden: false },
      StationScan: { header: 'Grouping', hidden: false },
      // the lines' Instruction and Guide buttons (by their button id): not shown (owner, 29 Oct 2026)
      BTNInstruction: { header: 'Instruction', hidden: true },
      BTNGuide: { header: 'Guide', hidden: true },
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
    ROUTECODE: { header: 'Route Code', hidden: false },
    ALIAS: { header: 'Alias', hidden: false },
    ROUTE: { header: 'Route', hidden: false },
    MATERIAL: { header: 'Material', hidden: false },

  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function Routing() {
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
