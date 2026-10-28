// ════════════════════════════════════════════════════════════════════════════════
//  Production Order
//  Sidebar: Production › Production Order
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    ProductionOrder.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                               6. PAGE       loads the screen and switches between list and form
//    ProductionOrder/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    ProductionOrder/Form.jsx   2. STATE      how the form's state is read and patched
//                               3. ENGINE     sends events to the server and applies its reply
//                               5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { RotateCw, ClipboardList, Package, Plus, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './ProductionOrder/List.jsx';
import RecordForm from './ProductionOrder/Form.jsx';

const enc = encodeURIComponent;

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/production/productionorderform';

/** Dedicated layout: numbered steps of control ids. Save / Update / Delete and every event stay the server page's own
 *  handlers. `header`: fields shown in the page header beside Back to list and Save. In a step an item may be
 *  { id, label, span: 2 (two columns), wide (the whole row), count (characters used / allowed), columns (a grid's data
 *  fields to show) }; `actions` sit in the
 *  step's title bar. Hidden controls (the screen's own panels) stay hidden; a step with nothing visible is left out. */
const layout = {
  icon: ClipboardList,
  subtitle: 'Create a production order: product, quantity and materials',
  saveLabel: 'Create Order',
  updateLabel: 'Update Order',
  header: [{ id: 'DropDownList4', label: 'Department' }, { id: 'ddlStatus', label: 'Record status' }],
  sections: [
    {
      title: 'Order Details',
      subtitle: 'Basic information about the production order',
      icon: ClipboardList,
      tone: 'blue',
      ids: [{ id: 'PrimaryKey', label: 'Order code', span: 2 }, { id: 'Alias', label: 'Alias', span: 2 }, { id: 'TextBox2', label: 'Order date' }, 'DDLOrderType', { id: 'DropDownList2', label: 'Priority' }, 'DDLSO'],
    },
    {
      title: 'Product & Quantity',
      subtitle: 'Select the product and define the production quantity',
      icon: Package,
      tone: 'emerald',
      ids: ['DDLMaterial', 'DdlBOM', { id: 'TBTotalQty', label: 'Order quantity' }, { id: 'DdlTotalUom', label: 'Order unit' }, { id: 'TBQty', label: 'Production quantity' }, { id: 'DDLUom', label: 'Unit' }],
    },
    {
      // the screen shows these only for a serial-tracked material (its Track panel); otherwise this step is left out
      title: 'Tracking',
      subtitle: 'Tracking information for this order',
      icon: Tag,
      tone: 'violet',
      ids: [{ id: 'TBTrackID', label: 'Track ID', span: 2 }, { id: 'TextBox1', label: 'Customer ID', span: 2 }],
    },
  ],
  // not shown on this page (owner, 28 Oct 2026): the remark, and the service-request lines (picker, add, grid)
  hide: ['TextBox9', 'DDLOrder', 'BtnAdd', 'GVTransData'],
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
const page = undefined;

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function ProductionOrder() {
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

  const title = spec?.title || screen?.caption || 'Screen';
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
