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
import { RotateCw, Boxes, ClipboardList, Factory, Plus, Printer, Route } from 'lucide-react';
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
  header: [{ id: 'DDLDepartment', label: 'Department' }, { id: 'ddlStatus', label: 'Record status' }],
  sections: [
    { title: 'Order', icon: ClipboardList, ids: [{ id: 'DDlProdOrder', label: 'Production order' }, { id: 'TextBox2', label: 'Assign date' }] },
    { title: 'Product', icon: Boxes, ids: ['DDLMaterial', 'DDLVariant', { id: 'DDLBom', label: 'BOM' }, 'DDLRouting', { id: 'TBTotalQty', label: 'Order quantity' }, { id: 'DdlTotalUom', label: 'Order unit' }, { id: 'TBQty', label: 'Production quantity' }, { id: 'DDLUom', label: 'Unit' }] },
    { title: 'Start at', icon: Factory, ids: [{ id: 'DDLProcessCode', label: 'Process' }, { id: 'DDLStationCode', label: 'Station' }] },
    { title: 'Print job cards', icon: Printer, ids: [{ id: 'DDLPrinter', label: 'Printer' }, { id: 'btnPrint', label: 'Print job cards' }] },
    {
      title: 'Route and materials',
      icon: Route,
      // the grids show the columns an operator reads; the rows keep every field (codes, status, PS no.) for the screen
      ids: [
        { id: 'GVRoute', label: 'Routing stages', columns: ['SeqNo', 'Process', 'Station', 'StartedOn', 'CompletedOn'] },
        { id: 'GVBOMInput', label: 'BOM Input', columns: ['MaterialDesc', 'Qty', 'UomDesc', 'ProcessDesc', 'ScanReq', 'OutputScan'] },
        { id: 'GVOutput', label: 'BOM Output', columns: ['MaterialDesc', 'Qty', 'UomDesc', 'YieldQty', 'ProcessDesc'] },
      ],
    },
  ],
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
const page = undefined;

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
      subtitle={view.kind === 'list' && spec ? 'Saved records — click one to open it' : layout?.subtitle}
      actions={spec && view.kind === 'list' && spec.buttons.add && <Button size="sm" icon={Plus} onClick={() => fresh()}>Add new</Button>}
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
            onBack={spec.hasList ? () => show({ kind: 'list' }) : undefined}
            onDone={(notice) => fresh(notice)}
            onListFilter={setListFilter}
            layout={layout}
            page={page}
          />
        )}
    </Page>
  );
}
