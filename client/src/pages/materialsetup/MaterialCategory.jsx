// ════════════════════════════════════════════════════════════════════════════════
//  Material Category
//  Sidebar: Materialsetup › Material Category
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    MaterialCategory.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                                6. PAGE       loads the screen and switches between list and form
//    MaterialCategory/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    MaterialCategory/Form.jsx   2. STATE      how the form's state is read and patched
//                                3. ENGINE     sends events to the server and applies its reply
//                                5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { Boxes, ClipboardList, RotateCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './MaterialCategory/List.jsx';
import RecordForm from './MaterialCategory/Form.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/materialsetup/materialcategoryform';

/** The category's own fields. Material tag design, inspection required / type / checklist and certificate are not
 *  shown (owner, 28 Oct 2026: kept for display elsewhere, not set by users here); they stay in the form, so a save keeps
 *  a record's values and a new record gets the screen's defaults, as before. */
const layout = {
  icon: Boxes,
  subtitle: 'Material categories: code, name and type',
  header: ['ddlStatus'],
  sections: [{ title: 'Details', subtitle: 'The main information of this category', icon: ClipboardList, ids: ['PrimaryKey', 'TextBox3', 'TextBox4', 'TextBox1', 'DropDownList1'] }],
  // hidden fields: texts.fields (hidden: true)
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
const page = {};

// ────────────────────────────────────────────────────────────────────────────
// TEXTS
// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).
// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.
// ────────────────────────────────────────────────────────────────────────────
const texts = {
  title: 'Material Category',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Category Code', hidden: false }, // TextBox · MaterialCategory.CategoryCode
    ddlStatus: { label: 'Record status', hidden: false }, // DropDownList · MaterialCategory.Status
    TextBox3: { label: 'Name', hidden: false }, // TextBox · MaterialCategory.Name
    TextBox4: { label: 'Alias', hidden: false }, // TextBox · MaterialCategory.Alias
    TextBox1: { label: 'Prefix', hidden: false }, // TextBox · MaterialCategory.Prefix
    DropDownList1: { label: 'Category Type', hidden: false }, // DropDownList · MaterialCategory.CategoryType
    DropDownList2: { label: 'Material Tag Design', hidden: true }, // DropDownList · MaterialCategory.TagCode
    DDLInspectionRequired: { label: 'Inspection Req', hidden: true }, // DropDownList · MaterialCategory.IsInspectionReq
    DDLInspectionType: { label: 'Inspection Type', hidden: true }, // DropDownList · MaterialCategory.InspectionType
    DDLInspectionCheckList: { label: 'Inspection Checklist', hidden: true }, // DropDownList · MaterialCategory.InspectionCheckList
    DDLCertificate: { label: 'Certificate', hidden: true }, // DropDownList · MaterialCategory.CertificateControl
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
  },
  // the list of saved records: its columns { header, hidden } (RECNO is the # column)
  list: {
    RECNO: { header: 'Rec No', hidden: false },
    CODE: { header: 'Code', hidden: false },
    NAME: { header: 'Name', hidden: false },
    ALIAS: { header: 'Alias', hidden: false },
    TYPE: { header: 'Type', hidden: false },
    STATUS: { header: 'Status', hidden: false },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function MaterialCategory() {
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
