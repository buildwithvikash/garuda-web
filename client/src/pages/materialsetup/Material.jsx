// Material Master (sidebar: Material Setup › Material): the materials, or one open; a new one can be copied from a saved
// one. Picking a type, category, model or base UOM runs the screen's own code (the category and model lists, the tag
// design, the purchase / sales units); the variants are added in their table (shared VariantGrid), Add also builds the
// Alias. The purchase / sales section shows only with PO / SO finance, as before. Fields the page does not show (batch,
// FIFO, inspection ... and the tag lengths the logics now set; owner, 28 Oct / 1 Nov 2026) are kept as saved. Plain page
// on /api/masters/materials; the artwork, unit frame and basket images have their own calls (Material/Images.jsx).
import { FileText, Image as ImageIcon, Images, Package, Receipt, SlidersHorizontal, Tag } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';
import MaterialImages from './Material/Images.jsx';

export const route = '/materialsetup/materialform';

// two rows of sections side by side on wide screens (`width` in tenths, `cols` fields across), then the purchase /
// sales, the variants beside the image, the artwork
const sections = [
  {
    title: 'Basic Information', subtitle: 'Primary material and classification details', icon: FileText, tone: 'blue', width: 6, cols: 3,
    fields: [
      { f: 'matCode', label: 'Material Code', kind: 'key' },
      { f: 'type', label: 'Item Type', kind: 'select', on: 'type' },
      { f: 'ledger', label: 'Customer', kind: 'select' },
      { f: 'category', label: 'Category', kind: 'select', on: 'category' },
      { f: 'model', label: 'Model', kind: 'select', on: 'model' },
      { f: 'tagDesign', label: 'Material Tag Design', kind: 'select' },
      { f: 'name', label: 'Name' },
      { f: 'itemCode', label: 'Item Code' },
      { f: 'alias', label: 'Alias' },
      { f: 'baseUom', label: 'Base UOM', kind: 'select', on: 'baseUom' },
      { f: 'mrp', label: 'MRP' },
      // Production Assignment picks it for this material's orders
      { f: 'routing', label: 'Routing', kind: 'select' },
    ],
  },
  {
    title: 'Tag & Asset Details', subtitle: 'The logic of each tag: none, no tag', icon: Tag, tone: 'violet', width: 4, cols: 2,
    // a row each: FG serial (tracking), then the asset tag and green tag logics (the logic sets their format and length)
    fields: [
      { f: 'track', label: 'Track', kind: 'select' },
      { f: 'fgSerialLogic', label: 'FG Serial Logic', kind: 'select' },
      { f: 'assetTagLogic', label: 'Asset Tag Logic', kind: 'select' },
      { f: 'greenTagLogic', label: 'Green Tag Logic', kind: 'select' },
    ],
  },
  {
    title: 'Purchase & Sales', subtitle: 'Tax, rate and unit for purchase and sale', icon: Receipt, tone: 'amber', panel: 'purchasePanel',
    fields: [
      { f: 'purchaseTax', label: 'Purchase Tax', kind: 'select' },
      { f: 'purchaseRate', label: 'Purchase Rate' },
      { f: 'purchaseUom', label: 'Purchase UOM', kind: 'select' },
      { f: 'purchaseConvQty', label: 'Conversion Qty' },
      { f: 'salesTax', label: 'Sales Tax', kind: 'select' },
      { f: 'wholesaleRate', label: 'Wholesale Rate' },
      { f: 'salesUom', label: 'Sales UOM', kind: 'select' },
      { f: 'salesConvQty', label: 'Conversion Qty' },
    ],
  },
  {
    title: 'Material Variant', subtitle: 'Add a field and its value in the first row; ✏ changes a value, 🗑 removes it', icon: SlidersHorizontal, tone: 'violet', width: 7, panel: 'variantPanel',
    fields: [
      {
        f: 'variants', kind: 'variants', group: 'variantGroup', field: 'variantField', value: 'variantValue', newValue: 'newValue',
        events: { group: 'variantGroup', field: 'variantField', add: 'add', delete: 'remove' },
      },
    ],
  },
  { title: 'Image', subtitle: "The material's picture", icon: ImageIcon, tone: 'slate', width: 3, cols: 1, fields: [{ f: 'image', label: 'Image', kind: 'image' }] },
  {
    // stored on their own as soon as each is picked, on a saved material
    title: 'Artwork & Packing Images', subtitle: 'PNG, JPEG, WebP or PDF, up to 10 MB each; saved as soon as you pick one', icon: Images, tone: 'emerald', cols: 1,
    fields: [{ f: 'images', kind: 'custom', span: 'full', render: (r, { isNew }) => <MaterialImages code={r.matCode} saved={!isNew} /> }],
  },
];

export default function Material() {
  return <MasterScreen name="materials" title="Material Master" icon={Package} subtitle="Materials: their classification, tracking, stock and quality settings" sections={sections} />;
}
