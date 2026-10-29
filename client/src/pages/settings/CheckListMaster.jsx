// ════════════════════════════════════════════════════════════════════════════════
//  CheckList Master
//  Sidebar: Settings › CheckList Master
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    CheckListMaster.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                               6. PAGE       loads the screen and switches between list and form
//    CheckListMaster/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    CheckListMaster/Form.jsx   2. STATE      how the form's state is read and patched
//                               3. ENGINE     sends events to the server and applies its reply
//                               5. FORM VIEW  one record: fields, buttons, grids, print ...
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
import RecordList from './CheckListMaster/List.jsx';
import RecordForm from './CheckListMaster/Form.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/settings/parameterform';

// const layout = { icon, subtitle, sections: [{ title, icon, ids: ['ControlId', { id: 'ControlId', label: 'Caption' }] }] };
const layout = undefined;

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
// the checklist's parameters added and edited in their table: each column's editor (the screen's control; Min / Max /
// Unit and the list item show for the input types that use them), Add / Update and the cancel of an edit (shared
// RowFormGrid)
const page = {
  rowForms: {
    GVTransData: {
      fields: { Name: 'TbName', Description: 'TbDescription', InputType: 'DdlInputType', MinValue: 'TbMinValue', MaxValue: 'TbMaxValue', PassValue: 'TbPassValue', Unit: 'DdlUom', ListName: 'DdlList', Instrument: 'DDLInstrument', ResultDefined: 'DdlResultDefined', GuideImage: 'UploadImage' },
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
  title: 'Check List',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Checklist Code', hidden: false }, // TextBox · ParameterHeader.ParameterCode
    ddlStatus: { label: 'Record Status', hidden: false }, // DropDownList · ParameterHeader.Status
    TextBox3: { label: 'Checklist Name', hidden: false }, // TextBox · ParameterHeader.Name
    TextBox1: { label: 'Alias', hidden: false }, // TextBox · ParameterHeader.Alias
    DDLType: { label: 'Type', hidden: false }, // DropDownList · ParameterHeader.Type
    DdlUom: { label: '', hidden: true }, // DropDownList · in the table's cells
    DdlList: { label: 'List Items', hidden: true }, // DropDownList · in the table's cells
    DDLInstrument: { label: 'Instrument', hidden: true }, // DropDownList · in the table's cells
    UploadImage: { label: 'Guide Image', hidden: true }, // Image · in the table's cells
    GVTransData: { label: 'Parameter Tran', hidden: false }, // GridView
    TbName: { label: 'Parameter Name', hidden: true }, // TextBox · in the table's cells
    TbDescription: { label: 'Description', hidden: true }, // TextBox · in the table's cells
    DdlInputType: { label: 'Input Type', hidden: true }, // DropDownList · in the table's cells
    MinMaxPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    TbMinValue: { label: 'Min', hidden: true }, // TextBox · in the table's cells
    TbMaxValue: { label: 'Max', hidden: true }, // TextBox · in the table's cells
    TbPassValue: { label: 'Pass Value', hidden: true }, // TextBox · in the table's cells
    DdlResultDefined: { label: 'Result Defined By', hidden: true }, // DropDownList · in the table's cells
    ListPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    BtnAdd: { label: 'ADD', hidden: true }, // Button · in the table's cells
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVTransData: {
      LineCode: { header: 'LineCode', hidden: false },
     ParameterCode: { header: 'Code', hidden: true },
      Name: { header: 'Name', hidden: false },
      Description: { header: 'Description', hidden: false },
      InputType: { header: 'InputType', hidden: false },
      MinValue: { header: 'MinValue', hidden: true },
      MaxValue: { header: 'MaxValue', hidden: true },
      PassValue: { header: 'PassValue', hidden: true },
      Unit: { header: 'Unit', hidden: true },
      ListName: { header: 'ListName', hidden: true },
      Instrument: { header: 'Instrument', hidden: true },
      ResultDefined: { header: 'ResultDefined', hidden: true },
      GuideImage: { header: 'Guide Image', hidden: true },
      List: { header: 'List', hidden: true },
      Uom: { header: 'Uom', hidden: true },

    },
  },
  // the list of saved records: its columns { header, hidden } (RECNO is the # column)
  list: {
    RECNO: { header: 'Rec No', hidden: false },
    PARAMETERCODE: { header: 'Parameter Code', hidden: false },
    ALIAS: { header: 'Alias', hidden: false },
    NAME: { header: 'Name', hidden: false },
    PARAMETERCODE: { header: 'Parameter Code', hidden: false },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function CheckListMaster() {
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
