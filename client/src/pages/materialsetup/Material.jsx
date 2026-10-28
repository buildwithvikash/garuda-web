// ════════════════════════════════════════════════════════════════════════════════
//  Material
//  Sidebar: Materialsetup › Material
//
//  Change how this page works or looks in its three files: nothing in them is used by
//  any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  This page is three files (the router opens this one; the folder beside it holds the views):
//    Material.jsx        1. SETTINGS   this page's layout and captions          <- start here
//                        6. PAGE       loads the screen and switches between list and form
//    Material/List.jsx   4. LIST VIEW  saved records: search, table, paging
//    Material/Form.jsx   2. STATE      how the form's state is read and patched
//                        3. ENGINE     sends events to the server and applies its reply
//                        5. FORM VIEW  one record: fields, buttons, grids, print ...
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { FileText, Image as ImageIcon, Images, Package, Plus, Receipt, RotateCw, SlidersHorizontal, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';
import RecordList from './Material/List.jsx';
import RecordForm from './Material/Form.jsx';
import MaterialImages from './Material/Images.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/materialsetup/materialform';

// two rows of steps side by side on wide screens (`width` in tenths, `cols` fields across), then the variants, the
// image. The purchase / sales panels show only with PO / SO finance, as before.
const layout = {
  icon: Package,
  subtitle: 'Materials: their classification, tracking, stock and quality settings',
  header: [{ id: 'ddlStatus', label: 'Record status' }],
  sections: [
    {
      title: 'Basic Information', subtitle: 'Primary material and classification details', icon: FileText, tone: 'blue', width: 6, cols: 3,
      ids: [
        'PrimaryKey', 'DdlType', { id: 'DDLLedger', label: 'Customer' },
        'DdlMaterialCategory', 'DdlModel', 'DDLTag',
        'TextBox2', 'TextBox1', 'Alias',
        // Routing: Production Assignment picks it for this material's orders (server: forms/specs.js ADDED)
        { id: 'DdlBaseUom', label: 'Base UOM' }, { id: 'TbRetailRate', label: 'MRP' }, { id: 'DDLRoute', label: 'Routing' },
      ],
    },
    {
      title: 'Tag & Asset Details', subtitle: 'Tag length, asset tagging and tracking details', icon: Tag, tone: 'violet', width: 4, cols: 2,
      // a row each: FG serial (tracking), asset tag, green tag, packing
      ids: [
        'DropDownList24', { id: 'ddlTrackSerialLogic', label: 'FG Serial Logic' },
        { id: 'DropDownList6', label: 'Asset Tag Type' }, { id: 'TextBox11', label: 'Asset Tag Length' },
        { id: 'DropDownList1', label: 'Green Tag Require' }, { id: 'TextBox10', label: 'Green Tag Length' },
      ],
    },
    {
      title: 'Purchase & Sales', subtitle: 'Tax, rate and unit for purchase and sale', icon: Receipt, tone: 'amber', cols: 4,
      ids: ['DdlPurchaseTax', 'TbPurchaseRate', { id: 'DdlPurchaseUom', label: 'Purchase UOM' }, 'TbPConvQty', 'DdlSalesTax', { id: 'TbWholeSaleRate', label: 'Wholesale Rate' }, { id: 'DdlSalesUom', label: 'Sales UOM' }, 'TbSConvQty'],
    },
    { title: 'Material Variant', subtitle: 'Add a field and its value in the first row; ✏ changes a value, 🗑 removes it', icon: SlidersHorizontal, tone: 'violet', width: 7, ids: [{ id: 'GVTransData', label: 'Material variants' }] },
    { title: 'Image', subtitle: 'The material\'s picture', icon: ImageIcon, tone: 'slate', width: 3, cols: 1, ids: ['UploadImage'] },
    // artwork, unit frame and basket: stored on their own as soon as each is picked (Material/Images.jsx)
    {
      title: 'Artwork & Packing Images', subtitle: 'PNG, JPEG, WebP or PDF, up to 10 MB each; saved as soon as you pick one', icon: Images, tone: 'emerald',
      render: ({ values, mode }) => <MaterialImages code={values.PrimaryKey} saved={mode === 'edit'} />,
    },
  ],
  // the group / field / value / new value / Add the variant table drives: in the form, not shown on their own
  hide: [
    'DDLGroup', 'DdlName', 'DdlValue', 'TbNewValue', 'BtnAdd',
    // not used here (owner, 28 Oct 2026): batch & expiry, inventory & accounting, inspection & quality. Not shown; a
    // record keeps their saved values. To bring one back, give it a step again.
    'DropDownList3', 'DropDownList4', 'DropDownList5', 'DropDownList9', 'TextBox5', 'DropDownList2',
    'DropDownList11', 'TextBox3', 'DropDownList16', 'TextBox14', 'TextBox15', 'TextBox4', 'DropDownList26', 'TBResetIn',
    'DDLInspectionRequired', 'DDLInspectionType', 'DDLInspectionCheckList', 'DDLCertificate',
    // vendor material codes (MaterialLedgerMap): not used either
    'ddlVendor', 'DDlSerialLogic', 'tbVendorMat', 'btnLedgerMap', 'GVLedgerCode','DropDownList10','DropDownList7',
  ],
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
// the variants grid, edited in place: the controls its add / edit row uses (shared VariantGrid), as on Model
const page = {
  rowEdit: { grid: 'GVTransData', group: 'DDLGroup', field: 'DdlName', value: 'DdlValue', newValue: 'TbNewValue', add: 'BtnAdd' },
  // the material code: given by the server on save (IDMaster), not typed
  locked: ['PrimaryKey'],
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function Material() {
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
