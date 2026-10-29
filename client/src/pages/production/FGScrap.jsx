// ════════════════════════════════════════════════════════════════════════════════
//  FG Scrap
//  Sidebar: Production › FG Scrap
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    FGScrap.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                       6. PAGE       loads the screen and switches between list and form
//    FGScrap/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    FGScrap/Form.jsx   2. STATE      how the form's state is read and patched
//                       3. ENGINE     sends events to the server and applies its reply
//                       5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { RotateCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './FGScrap/List.jsx';
import RecordForm from './FGScrap/Form.jsx';

const enc = encodeURIComponent;

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/production/fgscrapform';

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
  title: 'FG Scrap',
  // fields, buttons and panels: { label, hidden }
  fields: {
    TBDate: { label: '', hidden: false }, // TextBox · hidden by the screen until its logic shows it
    TBBarcode: { label: 'Scan Barcode', hidden: false }, // TextBox
    GvDetails: { label: '', hidden: false }, // GridView
    DDLScrapCategory: { label: 'Scrap Category', hidden: false }, // DropDownList
    TBRemark: { label: 'Remark', hidden: false }, // TextBox
    LeftPanel: { label: '', hidden: false }, // Panel
    BarcodePanel: { label: '', hidden: false }, // Panel
    Go: { label: 'Go', hidden: false }, // Button
    GridPanel: { label: '', hidden: false }, // Panel
    pnlRemark: { label: '', hidden: false }, // Panel
    btnSave: { label: 'Save', hidden: false }, // Button
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GvDetails: {
      Category: { header: 'Category', hidden: false },
      Material: { header: 'Material', hidden: false },
      Process: { header: 'Process', hidden: false },
      Serial: { header: 'Serial', hidden: false },
      PsNo: { header: 'PsNo', hidden: false },
      RowID: { header: 'RowID', hidden: false },
      ProcessCode: { header: 'ProcessCode', hidden: false },
      matCode: { header: 'matCode', hidden: false },
    },
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function FGScrap() {
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
      subtitle={view.kind === 'list' && spec ? 'Units and items scrapped, newest first' : layout?.subtitle}
      actions={spec && view.kind === 'list' && <Button size="sm" icon={Plus} onClick={() => fresh()}>Scrap a unit</Button>}
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
            onBack={() => show({ kind: 'list' })} // the scrap history (List.jsx), which this page adds
            onDone={(notice) => fresh(notice)}
            onListFilter={setListFilter}
            layout={layout}
            page={{ ...page, texts }}
          />
        )}
    </Page>
  );
}
