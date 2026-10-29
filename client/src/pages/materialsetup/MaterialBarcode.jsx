// ════════════════════════════════════════════════════════════════════════════════
//  Material Barcode: reprint of the FG label and the assembly and foaming barcodes
//  Sidebar: Materialsetup › Material Barcode
//
//  Reprint only (owner, 29 Oct 2026): the operator scans the label's serial, sees which label it is and what is on
//  it, picks a printer, gives the reason and reprints; the reprints so far are in its history. The original page's
//  list of barcodes, Add new and Save are not offered; any other barcode (component scans, GRN labels ...) is refused
//  by the server.
//
//  This page is four files (the router opens this one; the folder beside it holds the views):
//    MaterialBarcode.jsx              the page: one label, many labels (?view=many) or the history (?view=history)
//    MaterialBarcode/Reprint.jsx      scan, the label's details, printer + reason + Reprint
//    MaterialBarcode/BulkReprint.jsx  many serials checked at once, then printed in parts with progress
//    MaterialBarcode/History.jsx      the reprints so far, with a date-time filter
//  Server: server/src/modules/masters/material-barcode-reprint.js (/api/masters/material-barcodes/reprint).
// ════════════════════════════════════════════════════════════════════════════════

import { useSearchParams } from 'react-router-dom';
import { Barcode, History as HistoryIcon, Layers, Printer } from 'lucide-react';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import BulkReprint from './MaterialBarcode/BulkReprint.jsx';
import History from './MaterialBarcode/History.jsx';
import Reprint from './MaterialBarcode/Reprint.jsx';

export const route = '/materialsetup/materialbarcode';

/** the page's views (?view=…; none: one label) */
const VIEWS = [
  { view: '', label: 'One label', icon: Printer, subtitle: 'Reprint an FG label, an assembly barcode or a foaming barcode', body: () => <Reprint /> },
  { view: 'many', label: 'Many labels', icon: Layers, subtitle: 'Reprint many labels at once from their serials (e.g. 300 FG labels)', body: () => <BulkReprint /> },
  { view: 'history', label: 'Reprint history', icon: HistoryIcon, subtitle: 'Every reprint of an FG label, assembly or foaming barcode, newest first', body: () => <History /> },
];

export default function MaterialBarcode() {
  const [params, setParams] = useSearchParams();
  const current = VIEWS.find((v) => v.view === (params.get('view') ?? '')) ?? VIEWS[0];
  return (
    <Page
      icon={Barcode}
      title="Material Barcode"
      subtitle={current.subtitle}
      actions={
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Material Barcode views">
          {VIEWS.map((v) => (
            <Button key={v.view} size="sm" role="tab" aria-selected={v === current} variant={v === current ? 'default' : 'outline'} icon={v.icon} onClick={() => setParams(v.view ? { view: v.view } : {}, { replace: true })}>
              {v.label}
            </Button>
          ))}
        </div>
      }
    >
      {current.body()}
    </Page>
  );
}
