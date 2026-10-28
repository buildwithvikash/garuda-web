// ════════════════════════════════════════════════════════════════════════════════
//  RM Replacement
//  Sidebar: Production › RM Replacement
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    RmReplacement.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                             6. PAGE       loads the screen and switches between list and form
//    RmReplacement/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    RmReplacement/Form.jsx   2. STATE      how the form's state is read and patched
//                             3. ENGINE     sends events to the server and applies its reply
//                             5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Boxes, RefreshCcw, RotateCw, Plus, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './RmReplacement/List.jsx';
import RecordForm from './RmReplacement/Form.jsx';

const enc = encodeURIComponent;

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/production/rmreplacementform';

/** Scan the unit, then the component to replace (scanned, typed, or picked from the unit's list below) beside the new
 *  one. Each scan's Go / Clear is the screen's own handler. */
const layout = {
  icon: RefreshCcw,
  subtitle: 'Replace a raw material in a unit: scan the unit, choose the old component, scan the new one',
  sections: [
    { title: 'Unit', subtitle: 'Scan the unit whose component is replaced', icon: ScanLine, scan: { box: 'TBBarcode', go: 'Go', label: 'Scan barcode', placeholder: 'Scan the unit serial' }, ids: [] },
    {
      title: 'Replace component',
      subtitle: 'Scan or type the existing component, or pick a raw material from the list; then scan the new one',
      icon: RefreshCcw,
      side: true, // the scans on the left, the unit's components on the right
      scans: [
        { box: 'TBExistingRM', go: 'btnexistScan', label: 'Scan existing component', placeholder: 'Scan, type or pick from the list' },
        { box: 'TBNewRM', go: 'btnNewScan', label: 'Scan new component', placeholder: 'Scan the new component' },
      ],
      // the list shows what an operator reads; its rows keep PsNo, RowID, ProcessCode and matCode for the replacement
      ids: [{ id: 'GvDetails', label: 'Components (only raw material can be replaced)', columns: ['Category', 'Material', 'Process', 'Serial'] }],
    },
  ],
};

// a click on a Raw Material row of the list fills "Scan existing component" and runs its Go (the server checks it too)
const page = {
  pick: { grid: 'GvDetails', box: 'TBExistingRM', go: 'btnexistScan', field: 'Serial', allow: (r) => /^raw material$/i.test(String(r.Category ?? '').trim()), hint: 'Only raw material can be replaced' },
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function RmReplacement() {
  const me = useMe();
  const { pathname } = useLocation();
  const path = route;
  const screen = me ? screenOf(me.menu, pathname) : null;
  const [spec, setSpec] = useState(null);
  const [view, setView] = useState({ kind: 'list' });
  const [error, setErrorState] = useState('');
  const setError = (message) => {
    setErrorState(message);
    if (message) toast.error(message, { id: message, duration: 6000 });
  };
  const [seq, setSeq] = useState(0);
  const [listFilter, setListFilter] = useState({});
  const show = (v) => {
    setError('');
    setSeq((n) => n + 1); // a fresh form each time, never on unrelated re-renders
    setView(v);
  };

  useEffect(() => {
    setSpec(null);
    api(`/forms/spec?path=${enc(path)}`)
      .then((s) => {
        setSpec(s);
        show(s.startOnList ? { kind: 'list' } : { kind: 'form', mode: 'new', state: s });
      })
      .catch((e) => setError(e.message));
  }, [path]);

  const run = (p) => p.catch((e) => setError(e.message));
  const open = (key, notice) => run(api(`/forms/record?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'edit', state, notice })));
  // the "new" state is rebuilt each time (ClearForm: today's date, refreshed lists)
  const fresh = (notice) => run(api(`/forms/spec?path=${enc(path)}`).then((state) => show({ kind: 'form', mode: 'new', state, notice })));
  const copy = (key) => run(api(`/forms/copy?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'new', state })));

  const title = spec?.title || screen?.caption || 'Screen';
  return (
    <Page
      icon={layout?.icon ?? screen?.group.icon}
      title={title}
      subtitle={view.kind === 'list' && spec ? 'Components replaced in units, newest first' : layout?.subtitle}
      actions={spec && view.kind === 'list' && <Button size="sm" icon={Plus} onClick={() => fresh()}>Replace a component</Button>}
    >
        {!spec ? (
          (error ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />)
        ) : view.kind === 'list' ? (
          <RecordList path={path} spec={spec} onOpen={open} filter={listFilter} />
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
            onBack={() => show({ kind: 'list' })} // the replacement history (List.jsx), which this page adds
            onDone={(notice) => fresh(notice)}
            onListFilter={setListFilter}
            layout={layout}
            page={page}
          />
        )}
    </Page>
  );
}
