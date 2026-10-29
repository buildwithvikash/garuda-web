// Material Barcode: many labels at once (owner, 29 Oct 2026), e.g. 200 or 300 FG labels from their serials. 1 scan or
// paste the serials, Check: each one found (its label) or not; 2 the list; 3 printer + one reason, Print: sent to the
// server PART at a time, so the progress shows and Stop works between parts; a label that fails can be printed again.
// Server: masters/material-barcode-reprint.js (POST …/reprint/check, POST …/reprint/many).
import { useEffect, useRef, useState } from 'react';
import { ListChecks, Printer, ScanBarcode, Square, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import { Step } from '@/components/shared/FormStep.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

const MAX = 500; // as the server checks at a time
const PART = 25; // labels a request prints (the server takes up to 50)
const KIND_BADGE = { FG: 'success', Assembly: 'info', Foaming: 'warning' };
const STATE = { ready: ['neutral', 'Ready'], printing: ['info', 'Printing'], printed: ['success', 'Printed'], failed: ['danger', 'Failed'] };

const serialsOf = (text) => [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];

export default function BulkReprint() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null); // the checked list: [{ serial, kind?, barcodeNo?, material?, jobCard?, error?, state? }]
  const [checking, setChecking] = useState(false);
  const [printers, setPrinters] = useState({ options: [], value: '' });
  const [printer, setPrinter] = useState('');
  const [remark, setRemark] = useState('');
  const [progress, setProgress] = useState(null); // { done, total } while printing
  const stop = useRef(false);

  useEffect(() => {
    api('/masters/material-barcodes/reprint/printers')
      .then((p) => (setPrinters(p), setPrinter(p.value ?? '')))
      .catch((e) => toast.error(e.message));
  }, []);

  const serials = serialsOf(text);
  const found = rows?.filter((r) => r.barcodeNo) ?? [];
  const missing = (rows?.length ?? 0) - found.length;
  const printing = progress !== null;

  async function check() {
    if (serials.length > MAX) return void toast.error(`Check at most ${MAX} serials at a time (${serials.length} given).`);
    setChecking(true);
    try {
      setRows((await api('/masters/material-barcodes/reprint/check', { method: 'POST', body: { serials } })).map((r) => (r.barcodeNo ? { ...r, state: 'ready' } : r)));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setChecking(false);
    }
  }

  // the labels in `todo` (ready or failed ones), PART at a time; Stop ends it after the part being printed
  async function print(todo) {
    const name = printers.options.find((o) => o.value === printer)?.text ?? 'the printer';
    if (!(await askConfirm({ title: `Print ${todo.length} label${todo.length === 1 ? '' : 's'}?`, message: `They are sent to ${name}, each logged with the reason given.`, confirmLabel: 'Print', variant: 'primary' }))) return;
    stop.current = false;
    let done = 0; // labels sent (printed or failed)
    let sent = 0; // printed
    let refused = false;
    setProgress({ done, total: todo.length });
    const mark = (list, state, results) =>
      setRows((rs) => rs.map((r) => {
        const hit = results?.find((x) => String(x.barcodeNo) === String(r.barcodeNo));
        if (hit) return { ...r, state: hit.ok ? 'printed' : 'failed', error: hit.ok ? undefined : hit.error };
        return list.some((x) => x.barcodeNo === r.barcodeNo) ? { ...r, state } : r;
      }));
    try {
      for (let i = 0; i < todo.length && !stop.current; i += PART) {
        const part = todo.slice(i, i + PART);
        mark(part, 'printing');
        try {
          const res = await api('/masters/material-barcodes/reprint/many', { method: 'POST', body: { barcodeNos: part.map((r) => String(r.barcodeNo)), printer, remark } });
          mark(part, 'failed', res);
          sent += res.filter((x) => x.ok).length;
        } catch (e) {
          // the whole part refused (printer offline, reason missing ...): it can be printed again; the rest stays ready
          mark(part, 'failed', part.map((r) => ({ barcodeNo: r.barcodeNo, ok: false, error: e.message })));
          refused = true;
          toast.error(e.message);
        }
        done += part.length;
        setProgress({ done, total: todo.length });
        if (refused) break;
      }
    } finally {
      setProgress(null);
    }
    const failed = done - sent;
    const left = todo.length - done;
    if (left) toast(`${sent} printed, ${failed} failed, ${left} not sent${stop.current ? ' (stopped)' : ''}`);
    else if (failed) toast.error(`${sent} printed, ${failed} failed: print the failed ones again`);
    else toast.success(`${sent} label${sent === 1 ? '' : 's'} printed`);
  }

  const toPrint = found.filter((r) => r.state === 'ready');
  const toRetry = found.filter((r) => r.state === 'failed');

  return (
    <div className="grid items-start gap-2 lg:grid-cols-10">
      <div className="min-w-0 lg:col-span-4">
        <Step n={1} tone="blue" icon={ScanBarcode} title="FG serials" subtitle={`Scan or paste them, one a line (up to ${MAX})`}>
          <div className="grid gap-3">
            <Textarea
              rows={12}
              className="font-mono text-[13px]"
              value={text}
              onChange={(e) => (setText(e.target.value), setRows(null))}
              placeholder={'42734261000346\n42734261000347\n…'}
              disabled={printing}
              aria-label="FG serials"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" icon={ListChecks} loading={checking} disabled={!serials.length || printing} onClick={check}>Check {serials.length || ''}</Button>
              <Button type="button" variant="outline" icon={Trash2} disabled={printing || (!text && !rows)} onClick={() => (setText(''), setRows(null))}>Clear</Button>
              <span className="text-xs text-muted-foreground">{serials.length} serial{serials.length === 1 ? '' : 's'} (repeats counted once)</span>
            </div>
          </div>
        </Step>
      </div>

      <div className="min-w-0 lg:col-span-6">
        <Step n={2} tone="emerald" icon={ListChecks} title="Labels" subtitle={rows ? 'What will be printed, in this order' : 'Check the serials to see them here'}>
          {!rows ? (
            <p className="text-sm text-muted-foreground">Nothing checked yet.</p>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" dot>{found.length} found</Badge>
                {missing > 0 && <Badge variant="danger" dot>{missing} not found</Badge>}
                {found.some((r) => r.state === 'printed') && <Badge variant="info" dot>{found.filter((r) => r.state === 'printed').length} printed</Badge>}
                {missing > 0 && !printing && (
                  <Button type="button" size="sm" variant="outline" onClick={() => (setRows((rs) => rs.filter((r) => r.barcodeNo)), setText(found.map((r) => r.serial).join('\n')))}>Remove not found</Button>
                )}
              </div>
              <div className="max-h-[26rem] overflow-auto rounded-lg border">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left text-xs text-foreground/80">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Serial</th>
                      <th className="px-3 py-2">Label</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2">Job Card</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => (
                      <tr key={r.serial} className={r.barcodeNo ? undefined : 'bg-rose-50/60 dark:bg-rose-950/20'}>
                        <td className="px-3 py-1.5 text-muted-foreground tabular">{i + 1}</td>
                        <td className="px-3 py-1.5 font-mono">{r.serial}</td>
                        <td className="px-3 py-1.5">{r.kind ? <Badge variant={KIND_BADGE[r.kind]}>{r.kind}</Badge> : '—'}</td>
                        <td className="max-w-52 truncate px-3 py-1.5" title={r.material}>{r.material ?? '—'}</td>
                        <td className="px-3 py-1.5">{r.jobCard ?? '—'}</td>
                        <td className="px-3 py-1.5" title={r.error}>
                          {r.barcodeNo ? <Badge variant={STATE[r.state][0]}>{STATE[r.state][1]}</Badge> : <span className="text-rose-700 dark:text-rose-300">Not found</span>}
                          {r.state === 'failed' && r.error && <span className="ml-2 text-xs text-rose-700 dark:text-rose-300">{r.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Step>
      </div>

      {found.length > 0 && (
        <div className="min-w-0 lg:col-span-10">
          <Step n={3} tone="amber" icon={Printer} title="Print" subtitle="One reason for all of them; each reprint is logged">
            <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
              <label className="grid gap-1.5 text-sm font-medium">
                Printer
                <NativeSelect value={printer} onChange={(e) => setPrinter(e.target.value)} disabled={printing} aria-label="Printer">
                  {printers.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Reason for the reprint
                <Textarea rows={1} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. labels damaged in packing" disabled={printing} />
              </label>
              <div className="flex flex-wrap gap-2">
                {printing ? (
                  <Button type="button" variant="outline" icon={Square} onClick={() => (stop.current = true)}>Stop after this part</Button>
                ) : (
                  <>
                    <Button type="button" icon={Printer} disabled={!toPrint.length || !printer || !remark.trim()} onClick={() => print(toPrint)}>Print {toPrint.length} label{toPrint.length === 1 ? '' : 's'}</Button>
                    {toRetry.length > 0 && <Button type="button" variant="outline" icon={Printer} disabled={!printer || !remark.trim()} onClick={() => print(toRetry)}>Print {toRetry.length} failed again</Button>}
                  </>
                )}
              </div>
            </div>
            {printing && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Printing…</span>
                  <span className="tabular">{progress.done} / {progress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </Step>
        </div>
      )}
    </div>
  );
}
