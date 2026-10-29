// ════════════════════════════════════════════════════════════════════════════════
//  Serial Generation Logic
//  Sidebar: Materialsetup › Serial Generation Logic
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    SerialGenerationLogic.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                                     6. PAGE       loads the screen and switches between list and form
//    SerialGenerationLogic/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    SerialGenerationLogic/Form.jsx   2. STATE      how the form's state is read and patched
//                                     3. ENGINE     sends events to the server and applies its reply
//                                     5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { ClipboardList, Eye, Hash, ListOrdered, RotateCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './SerialGenerationLogic/List.jsx';
import RecordForm from './SerialGenerationLogic/Form.jsx';
import SerialPreview from './SerialGenerationLogic/SerialPreview.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/materialsetup/serialgenerationlogicform';

// the logic beside its preview (what it makes, as its lines change), then its lines (`width` in tenths of the row)
const layout = {
  icon: Hash,
  subtitle: 'How a serial number is built, part by part',
  header: ['ddlStatus'],
  sections: [
    { title: 'Logic', icon: ClipboardList, tone: 'blue', width: 5, cols: 2, ids: ['PrimaryKey', 'TextBox3', 'Alias', 'DdlType', 'TextBox1'] },
    { title: 'Serial Preview', subtitle: 'What this logic makes', icon: Eye, tone: 'emerald', width: 5, render: ({ values }) => <SerialPreview values={values} /> },
    { title: 'Serial Parts', subtitle: 'In sequence order; add a part in the first row, ✏ changes one', icon: ListOrdered, tone: 'violet', ids: ['GVTransData'] },
  ],
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
// the logic's lines added and edited in their table: each column's editor (the screen's control; the date / serial /
// value ones show as the Sequence Field asks), Add (✔) and the cancel of an edit (shared RowFormGrid)
const page = {
  rowForms: {
    GVTransData: {
      fields: { VariantName: 'DdlName', Name: 'TbDescription', Seperator: 'DDLSeperator', StartingNo: 'tbStartingNo', Seed: 'tbSeed', Length: 'tbLenth', EndingNo: 'tbEndingNo', Format: 'tbFormat', Value: 'tbValue', Seq: 'tbSeqNo' },
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
  title: 'Serial Generation Logic',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Value Code', hidden: false }, // TextBox · SerialGenerationLogicHeader.SerialCode
    ddlStatus: { label: 'Record Status', hidden: false }, // DropDownList · SerialGenerationLogicHeader.Status
    TextBox3: { label: 'Name', hidden: false }, // TextBox · SerialGenerationLogicHeader.Name
    Alias: { label: 'Alias', hidden: false }, // TextBox · SerialGenerationLogicHeader.Alias
    DdlType: { label: 'Type', hidden: false }, // DropDownList · SerialGenerationLogicHeader.Type
    TextBox1: { label: 'Barcode Length', hidden: false }, // TextBox · SerialGenerationLogicHeader.SerialLength
    DdlName: { label: 'Sequence Field', hidden: true }, // DropDownList · in the table's cells
    TbDescription: { label: 'Field Desc', hidden: true }, // TextBox · in the table's cells
    tbSeqNo: { label: 'Sequence No', hidden: true }, // TextBox · in the table's cells
    DDLSeperator: { label: 'Seperator', hidden: true }, // DropDownList · in the table's cells
    Serial: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    tbStartingNo: { label: 'Starting No', hidden: true }, // TextBox · in the table's cells
    tbSeed: { label: 'Seed NO', hidden: true }, // TextBox · in the table's cells
    tbLenth: { label: 'Length', hidden: true }, // TextBox · in the table's cells
    tbEndingNo: { label: 'Ending No', hidden: true }, // TextBox · in the table's cells
    dateFormat: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    tbFormat: { label: 'Format', hidden: true }, // TextBox · in the table's cells
    Value: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    tbValue: { label: 'Value', hidden: true }, // TextBox · in the table's cells
    GVTransData: { label: 'Serial Generation Logic Detail', hidden: false }, // GridView
    BtnAdd: { label: '✔', hidden: true }, // Button · in the table's cells
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVTransData: {
      RowID: { header: 'Row ID', hidden: false },
      VariantName: { header: 'VariantName', hidden: false },
      Name: { header: 'Description', hidden: false },
      Seperator: { header: 'Seperator', hidden: false },
      StartingNo: { header: 'Starting No', hidden: false },
      Seed: { header: 'Serial No Seed', hidden: false },
      Length: { header: 'Length', hidden: false },
      EndingNo: { header: 'Ending No', hidden: false },
      Format: { header: 'Format', hidden: false },
      Value: { header: 'Value', hidden: false },
      VariantCode: { header: 'Variant Code', hidden: true },

      SerialCode: { header: 'ValueCode', hidden: true },
    },
  },
  // the list of saved records: its columns { header, hidden } (RECNO is the # column)
  list: {
    RECNO: { header: 'Rec No', hidden: false },
    SerialCode: { header: 'Serial Code', hidden: false },
    Name: { header: 'Name', hidden: false },
    Type: { header: 'Type', hidden: false },
    Alias: { header: 'Alias', hidden: true },
    Status: { header: 'Status', hidden: false },

  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function SerialGenerationLogic() {
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
