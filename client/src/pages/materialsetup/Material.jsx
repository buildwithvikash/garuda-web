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
  header: ['ddlStatus'],
  sections: [
    {
      title: 'Basic Information', subtitle: 'Primary material and classification details', icon: FileText, tone: 'blue', width: 6, cols: 3,
      ids: [
        'PrimaryKey', 'DdlType', 'DDLLedger',
        'DdlMaterialCategory', 'DdlModel', 'DDLTag',
        'TextBox2', 'TextBox1', 'Alias',
        // Routing: Production Assignment picks it for this material's orders (server: forms/specs.js ADDED)
        'DdlBaseUom', 'TbRetailRate', 'DDLRoute',
      ],
    },
    {
      title: 'Tag & Asset Details', subtitle: 'Tag length, asset tagging and tracking details', icon: Tag, tone: 'violet', width: 4, cols: 2,
      // a row each: FG serial (tracking), asset tag, green tag, packing
      ids: [
        'DropDownList24', 'ddlTrackSerialLogic',
        'DropDownList6', 'TextBox11',
        'DropDownList1', 'TextBox10',
      ],
    },
    {
      title: 'Purchase & Sales', subtitle: 'Tax, rate and unit for purchase and sale', icon: Receipt, tone: 'amber', cols: 4,
      ids: ['DdlPurchaseTax', 'TbPurchaseRate', 'DdlPurchaseUom', 'TbPConvQty', 'DdlSalesTax', 'TbWholeSaleRate', 'DdlSalesUom', 'TbSConvQty'],
    },
    { title: 'Material Variant', subtitle: 'Add a field and its value in the first row; ✏ changes a value, 🗑 removes it', icon: SlidersHorizontal, tone: 'violet', width: 7, ids: ['GVTransData'] },
    { title: 'Image', subtitle: 'The material\'s picture', icon: ImageIcon, tone: 'slate', width: 3, cols: 1, ids: ['UploadImage'] },
    // artwork, unit frame and basket: stored on their own as soon as each is picked (Material/Images.jsx)
    {
      title: 'Artwork & Packing Images', subtitle: 'PNG, JPEG, WebP or PDF, up to 10 MB each; saved as soon as you pick one', icon: Images, tone: 'emerald',
      render: ({ values, mode }) => <MaterialImages code={values.PrimaryKey} saved={mode === 'edit'} />,
    },
  ],
  // hidden fields: texts.fields (hidden: true)
};

// const page = { labels: { ControlId: 'Caption' }, checkSearch: { SearchTextBoxId: 'CheckBoxListId' } };
// the variants grid, edited in place: the controls its add / edit row uses (shared VariantGrid), as on Model
const page = {
  rowEdit: { grid: 'GVTransData', group: 'DDLGroup', field: 'DdlName', value: 'DdlValue', newValue: 'TbNewValue', add: 'BtnAdd' },
  // the material code: given by the server on save (IDMaster), not typed
  locked: ['PrimaryKey'],
};

// ────────────────────────────────────────────────────────────────────────────
// TEXTS
// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).
// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.
// ────────────────────────────────────────────────────────────────────────────
const texts = {
  title: 'Material Master',
  // fields, buttons and panels: { label, hidden }
  fields: {
    PrimaryKey: { label: 'Material Code', hidden: false }, // TextBox · Material.MatCode
    ddlStatus: { label: 'Record status', hidden: false }, // DropDownList · Material.Status
    DdlType: { label: 'Item Type', hidden: false }, // DropDownList · Material.Type
    DdlMaterialCategory: { label: 'Category', hidden: false }, // DropDownList · Material.Category
    DdlModel: { label: 'Model', hidden: false }, // DropDownList · Material.Model
    DDLLedger: { label: 'Customer', hidden: false }, // DropDownList · Material.Ledger
    TextBox2: { label: 'Name', hidden: false }, // TextBox · Material.Name
    TextBox1: { label: 'Item Code', hidden: false }, // TextBox · Material.ALTName
    Alias: { label: 'Alias', hidden: false }, // TextBox · Material.Alias
    DdlBaseUom: { label: 'Base UOM', hidden: false }, // DropDownList · Material.BaseUom
    TextBox10: { label: 'Green Tag Length', hidden: false }, // TextBox · Material.HSNCode
    TextBox11: { label: 'Asset Tag Length', hidden: false }, // TextBox · Material.Barcode
    DDLTag: { label: 'Material Tag Design', hidden: false }, // DropDownList · Material.TagCode
    TbRetailRate: { label: 'MRP', hidden: false }, // TextBox · Material.SRetailRate
    DropDownList3: { label: 'Enable Batch', hidden: true }, // DropDownList · Material.Batch
    DropDownList4: { label: 'Supplier Batch', hidden: true }, // DropDownList · Material.SupBatch
    DropDownList5: { label: 'Manf. Date', hidden: true }, // DropDownList · Material.ManDate
    DropDownList9: { label: 'Enable Expiry', hidden: true }, // DropDownList · Material.Expiry
    TextBox5: { label: 'Exipiry Months', hidden: true }, // TextBox · Material.ExipiryMonths
    DropDownList2: { label: 'Serialized Item', hidden: true }, // DropDownList · Material.Serial
    DropDownList6: { label: 'Asset Tag Type', hidden: false }, // DropDownList · Material.AssetTagType
    DropDownList24: { label: 'Track', hidden: false }, // DropDownList · Material.Track
    ddlTrackSerialLogic: { label: 'FG Serial Logic', hidden: false }, // DropDownList · Material.TrackNoType
    DropDownList10: { label: 'Is Packet', hidden: true }, // DropDownList · Material.IsPacket
    DropDownList11: { label: 'Gross Weight', hidden: true }, // DropDownList · Material.GrossWeight
    DropDownList7: { label: 'Alternative Uom', hidden: true }, // DropDownList · Material.AlterUOM
    TextBox3: { label: 'Conversion Qty', hidden: true }, // TextBox · Material.ConvVal
    DropDownList1: { label: 'Green Tag Require', hidden: false }, // DropDownList · Material.Classification
    DropDownList16: { label: 'FIFO Enable', hidden: true }, // DropDownList · Material.IsFIFO
    TextBox14: { label: 'FIFO Age(Months)', hidden: true }, // TextBox · Material.FIFOAge
    TextBox15: { label: 'Reorder Level', hidden: true }, // TextBox · Material.ReorderLevel
    TextBox4: { label: 'Reorder Qty', hidden: true }, // TextBox · Material.ReorderQty
    DropDownList26: { label: 'Depreciation', hidden: true }, // DropDownList · Material.DepreciationMethod
    DDLInspectionRequired: { label: 'Inspection Req', hidden: true }, // DropDownList · Material.IsInspectionReq
    DDLInspectionType: { label: 'Inspection Type', hidden: true }, // DropDownList · Material.InspectionType
    DDLInspectionCheckList: { label: 'Inspection Checklist', hidden: true }, // DropDownList · Material.InspectionCheckList
    TBResetIn: { label: 'Retest In(Months)', hidden: true }, // TextBox · Material.RetestIn
    DDLCertificate: { label: 'Certificate', hidden: true }, // DropDownList · Material.CertificateControl
    UploadImage: { label: 'Image', hidden: false }, // Image · Material.MaterialImage
    DdlPurchaseTax: { label: 'Purchase Tax', hidden: false }, // DropDownList · Material.PurchaseTax
    TbPurchaseRate: { label: 'Purchase Rate', hidden: false }, // TextBox · Material.PurchaseRate
    DdlPurchaseUom: { label: 'Purchase UOM', hidden: false }, // DropDownList · Material.PurchaseUnit
    TbPConvQty: { label: 'Conversion Qty', hidden: false }, // TextBox · Material.PConvQty
    DdlSalesTax: { label: 'Sales Tax', hidden: false }, // DropDownList · Material.SalesTax
    TbWholeSaleRate: { label: 'Wholesale Rate', hidden: false }, // TextBox · Material.WholesaleRate
    DdlSalesUom: { label: 'Sales UOM', hidden: false }, // DropDownList · Material.SalesUnit
    TbSConvQty: { label: 'Conversion Qty', hidden: false }, // TextBox · Material.SConvQty
    DDLGroup: { label: 'Variant Group', hidden: true }, // DropDownList
    DdlName: { label: 'Variant Field', hidden: true }, // DropDownList
    TbNewValue: { label: 'New Value', hidden: true }, // TextBox
    GVTransData: { label: 'Material variants', hidden: false }, // GridView
    ddlVendor: { label: 'Ledger', hidden: true }, // DropDownList
    DDlSerialLogic: { label: 'Serial Logic', hidden: true }, // DropDownList
    GVLedgerCode: { label: 'Material Ledger Map', hidden: true }, // GridView
    DDLRoute: { label: 'Routing', hidden: false }, // DropDownList · Material.Route
    BatchPanel: { label: '', hidden: false }, // Panel
    packPanel: { label: '', hidden: false }, // Panel
    FifoPanel: { label: '', hidden: false }, // Panel
    QCPanel: { label: '', hidden: false }, // Panel
    PurchaseConfigPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    SalesConfigPanel: { label: '', hidden: false }, // Panel · hidden by the screen until its logic shows it
    VariantPanel: { label: '', hidden: false }, // Panel
    DdlValue: { label: 'Value', hidden: true }, // DropDownList
    BtnAdd: { label: '✔', hidden: true }, // Button
    LedgerMaterial: { label: '', hidden: false }, // Panel
    tbVendorMat: { label: 'Vendor Material Code', hidden: true }, // TextBox
    btnLedgerMap: { label: '✔', hidden: true }, // Button
  },
  // grids: each one's columns { header, hidden } (its rows keep every field)
  grids: {
    GVTransData: {
      RecNo: { header: 'RecNo', hidden: false },
      Name: { header: 'Field Name', hidden: false },
      Value: { header: 'Variant Value', hidden: false },
      Prefix: { header: 'Prefix', hidden: false },
      MatCode: { header: 'MatCode', hidden: false },
      RowID: { header: 'Row ID', hidden: false },
      ValueCode: { header: 'ValueCode', hidden: false },
    },
    GVLedgerCode: {
      RecNo: { header: 'RecNo', hidden: false },
      Ledger: { header: 'Ledger', hidden: false },
      LedgerName: { header: 'LedgerName', hidden: false },
      VandorMatCode: { header: 'VandorMatCode', hidden: false },
      SerialLogic: { header: 'SerialLogic', hidden: false },
      SerialLogicName: { header: 'SerialLogic', hidden: false },
      MatCode: { header: 'MatCode', hidden: false },
    },
  },
  // the list of saved records: its columns { header, hidden } (RECNO is the # column)
  list: {
    RECNO: { header: 'Rec No', hidden: false },
    ALIAS: { header: 'Alias', hidden: false },
    NAME: { header: 'Name', hidden: false },
    ALTNAME: { header: 'Alt Name', hidden: false },
    TYPE: { header: 'Type', hidden: false },
    CATEGORY: { header: 'Category', hidden: false },
    MODEL: { header: 'Model', hidden: false },
    VARIANTCODE: { header: 'Variant Code', hidden: false },
  },
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
