// Material Barcode: the reprint view. 1 scan the label's serial (or its barcode number), 2 what label it is and what is
// on it, 3 printer + reason + Reprint. The server finds and prints (masters/material-barcode-reprint.js).
import { useEffect, useRef, useState } from 'react';
import { Printer, ScanBarcode, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { Step } from '@/components/shared/FormStep.jsx';
import { ScanBox } from '@/components/shopfloor';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

const KIND_BADGE = { FG: 'success', Assembly: 'info', Foaming: 'warning' };
const when = (d) => (d ? new Date(d).toLocaleString() : '—');

/** one detail of the label: caption above, value below */
function Detail({ label, children, wide }) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-foreground" title={typeof children === 'string' ? children : undefined}>{children || '—'}</dd>
    </div>
  );
}

export default function Reprint() {
  const [scan, setScan] = useState('');
  const [label, setLabel] = useState(null); // the label found, or null
  const [finding, setFinding] = useState(false);
  const [printers, setPrinters] = useState({ options: [], value: '' });
  const [printer, setPrinter] = useState('');
  const [remark, setRemark] = useState('');
  const [printing, setPrinting] = useState(false);
  const scanRef = useRef(null);

  useEffect(() => {
    api('/masters/material-barcodes/reprint/printers')
      .then((p) => (setPrinters(p), setPrinter(p.value ?? '')))
      .catch((e) => toast.error(e.message));
  }, []);

  async function find() {
    setFinding(true);
    try {
      setLabel(await api(`/masters/material-barcodes/reprint/${encodeURIComponent(scan.trim())}`));
      setRemark('');
    } catch (e) {
      setLabel(null);
      toast.error(e.message, { id: 'reprint-find' });
    } finally {
      setFinding(false);
    }
  }

  function clear() {
    setScan('');
    setLabel(null);
    setRemark('');
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  async function print() {
    if (remark.trim() === '') return void toast.error('Enter the reason for the reprint.');
    if (printer === '') return void toast.error('Select a printer.');
    setPrinting(true);
    try {
      const done = await api('/masters/material-barcodes/reprint', { method: 'POST', body: { barcodeNo: label.barcodeNo, printer, remark } });
      toast.success(`${done.kind} label ${done.serial} sent to the printer`);
      clear(); // ready for the next label
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="grid items-start gap-2 lg:grid-cols-10">
      <div className="min-w-0 lg:col-span-10">
        <Step n={1} tone="blue" icon={ScanBarcode} title="Scan the label" subtitle="The FG serial, the assembly S… serial or the foaming F… serial (or the barcode number)">
          <ScanBox ref={scanRef} size="md" label="Label serial" placeholder="Scan or type the serial, then Enter" value={scan} onChange={setScan} onScan={find} locked={!!label} onClear={clear} busy={finding} />
        </Step>
      </div>
      {label && (
        <>
          <div className="min-w-0 lg:col-span-6">
            <Step n={2} tone="emerald" icon={Tag} title="Label" subtitle="What the reprint will carry">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant={KIND_BADGE[label.kind] ?? 'neutral'} dot>{label.kind} {label.kind === 'FG' ? 'label' : 'barcode'}</Badge>
                <span className="font-mono text-base font-bold tracking-wide">{label.serial}</span>
              </div>
              <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-3">
                <Detail label="Material" wide>{label.material}</Detail>
                <Detail label="Material code">{label.materialAlias}</Detail>
                {label.kind === 'FG' && <Detail label="Assembly serial">{label.alias}</Detail>}
                <Detail label="Barcode No">{String(label.barcodeNo)}</Detail>
                <Detail label="Job card">{label.jobCard}</Detail>
                <Detail label="Production order">{label.productionOrder}</Detail>
                <Detail label="Process">{label.processName}</Detail>
                <Detail label="Created on">{when(label.createdOn)}</Detail>
                <Detail label="Reprints">{`${label.reprints}${label.lastReprint ? ` (last ${when(label.lastReprint)})` : ''}`}</Detail>
              </dl>
            </Step>
          </div>
          <div className="min-w-0 lg:col-span-4">
            <Step n={3} tone="amber" icon={Printer} title="Reprint" subtitle="Every reprint is logged with its reason">
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm font-medium">
                  Printer
                  <NativeSelect value={printer} onChange={(e) => setPrinter(e.target.value)} disabled={printing} aria-label="Printer">
                    {printers.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                  </NativeSelect>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Reason for the reprint
                  <Textarea rows={3} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. label damaged" disabled={printing} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" icon={Printer} loading={printing} disabled={!remark.trim() || !printer} onClick={print}>Reprint</Button>
                  <Button type="button" variant="outline" disabled={printing} onClick={clear}>Scan another</Button>
                </div>
              </div>
            </Step>
          </div>
        </>
      )}
    </div>
  );
}
