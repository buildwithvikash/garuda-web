// Model To Model Transfer by a list of FG serials (owner, 29 Oct 2026): 1 scan or paste the complete FG serials, one a
// line, Check: they are grouped by product (source material); 2 each product gets its destination; 3 a printer,
// Transfer: each unit is moved and its label printed again, PART at a time per product, with progress and Stop.
// Server: production/model-transfer-bulk.js (POST /api/production/model-transfers/bulk/check, …/bulk).
import { useRef, useState } from 'react';
import { ArrowRight, Boxes, ListChecks, Printer, ScanBarcode, Square, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import { Step } from '@/components/shared/FormStep.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';

const MAX = 500; // as the server checks at a time
const PART = 25; // units a request moves (the server takes up to 50)
const STATE = { ready: ['neutral', 'Ready'], moving: ['info', 'Moving'], moved: ['success', 'Moved'], unprinted: ['warning', 'Moved, label not printed'], failed: ['danger', 'Failed'] };

const serialsOf = (text) => [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
const optionsOf = (spec, id) => spec?.controls?.find((c) => c.id === id)?.options ?? [];

/** spec: the screen (its destination materials and printers, as the range form lists them) */
export default function BulkTransfer({ spec }) {
  const materials = optionsOf(spec, 'DDLDestiMaterial');
  const printerList = optionsOf(spec, 'DDLPrinter');
  const [text, setText] = useState('');
  const [groups, setGroups] = useState(null); // [{ materialCode, material, materialAlias, destination, units: [{ serial, barcodeNo, state, error? }] }]
  const [refused, setRefused] = useState([]);
  const [checking, setChecking] = useState(false);
  const [printer, setPrinter] = useState(() => (printerList.length === 2 ? printerList[1].value : ''));
  const [progress, setProgress] = useState(null); // { done, total } while moving
  const stop = useRef(false);

  const serials = serialsOf(text);
  const moving = progress !== null;
  const units = (groups ?? []).flatMap((g) => g.units);
  const ready = (groups ?? []).filter((g) => g.units.some((u) => u.state === 'ready' || u.state === 'failed'));
  const todo = ready.flatMap((g) => g.units.filter((u) => u.state === 'ready' || u.state === 'failed'));
  const unset = ready.filter((g) => !g.destination);
  const count = (state) => units.filter((u) => u.state === state).length;

  async function check() {
    if (serials.length > MAX) return void toast.error(`Check at most ${MAX} serials at a time (${serials.length} given).`);
    setChecking(true);
    try {
      const r = await api('/production/model-transfers/bulk/check', { method: 'POST', body: { serials } });
      setGroups(r.groups.map((g) => ({ ...g, destination: '', units: g.units.map((u) => ({ ...u, state: 'ready' })) })));
      setRefused(r.refused);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setChecking(false);
    }
  }

  const setGroup = (code, patch) => setGroups((gs) => gs.map((g) => (g.materialCode === code ? { ...g, ...patch } : g)));
  const markUnits = (code, list, state, results) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.materialCode !== code
          ? g
          : {
              ...g,
              units: g.units.map((u) => {
                const hit = results?.find((x) => String(x.barcodeNo) === String(u.barcodeNo));
                if (hit) return { ...u, state: !hit.ok ? 'failed' : hit.printed ? 'moved' : 'unprinted', error: hit.error };
                return list.some((x) => x.barcodeNo === u.barcodeNo) ? { ...u, state } : u;
              }),
            },
      ),
    );

  async function transfer() {
    const name = (v) => materials.find((o) => o.value === v)?.text ?? v;
    const lines = ready.map((g) => `${g.units.filter((u) => u.state !== 'moved' && u.state !== 'unprinted').length} × ${g.material} → ${name(g.destination)}`).join('\n');
    if (!(await askConfirm({ title: `Transfer ${todo.length} unit${todo.length === 1 ? '' : 's'}?`, message: `${lines}\n\nEach unit's material, stock, job card and location change, and its label is printed again.`, confirmLabel: 'Transfer', variant: 'danger' }))) return;
    stop.current = false;
    let done = 0;
    let ok = 0;
    let refusedPart = false;
    setProgress({ done, total: todo.length });
    try {
      for (const g of ready) {
        const list = g.units.filter((u) => u.state === 'ready' || u.state === 'failed');
        for (let i = 0; i < list.length && !stop.current && !refusedPart; i += PART) {
          const part = list.slice(i, i + PART);
          markUnits(g.materialCode, part, 'moving');
          try {
            const res = await api('/production/model-transfers/bulk', { method: 'POST', body: { source: g.materialCode, destination: g.destination, barcodeNos: part.map((u) => u.barcodeNo), printer } });
            markUnits(g.materialCode, part, 'failed', res);
            ok += res.filter((x) => x.ok).length;
          } catch (e) {
            // the whole part refused (printer offline, destination ...): nothing in it moved; it can be sent again
            markUnits(g.materialCode, part, 'failed', part.map((u) => ({ barcodeNo: u.barcodeNo, ok: false, error: e.message })));
            refusedPart = true;
            toast.error(e.message);
          }
          done += part.length;
          setProgress({ done, total: todo.length });
        }
        if (stop.current || refusedPart) break;
      }
    } finally {
      setProgress(null);
    }
    const left = todo.length - done;
    const failed = done - ok;
    if (left) toast(`${ok} moved, ${failed} failed, ${left} not sent${stop.current ? ' (stopped)' : ''}`);
    else if (failed) toast.error(`${ok} moved, ${failed} failed: send the failed ones again`);
    else toast.success(`${ok} unit${ok === 1 ? '' : 's'} transferred`);
  }

  return (
    <div className="grid items-start gap-2 lg:grid-cols-10">
      <div className="min-w-0 lg:col-span-3">
        <Step n={1} tone="blue" icon={ScanBarcode} title="FG serials" subtitle={`Scan or paste them, one a line (up to ${MAX})`}>
          <div className="grid gap-3">
            <Textarea rows={14} className="font-mono text-[13px]" value={text} onChange={(e) => (setText(e.target.value), setGroups(null), setRefused([]))} placeholder={'42214260201910\n42214260201912\n…'} disabled={moving} aria-label="FG serials" />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" icon={ListChecks} loading={checking} disabled={!serials.length || moving} onClick={check}>Check {serials.length || ''}</Button>
              <Button type="button" variant="outline" icon={Trash2} disabled={moving || (!text && !groups)} onClick={() => (setText(''), setGroups(null), setRefused([]))}>Clear</Button>
            </div>
            <span className="text-xs text-muted-foreground">{serials.length} serial{serials.length === 1 ? '' : 's'} (repeats counted once)</span>
          </div>
        </Step>
      </div>

      <div className="min-w-0 lg:col-span-7">
        <Step n={2} tone="emerald" icon={Boxes} title="Products" subtitle={groups ? 'The serials grouped by their product; choose where each product goes' : 'Check the serials to group them here'}>
          {!groups ? (
            <p className="text-sm text-muted-foreground">Nothing checked yet.</p>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" dot>{units.length} unit{units.length === 1 ? '' : 's'} in {groups.length} product{groups.length === 1 ? '' : 's'}</Badge>
                {refused.length > 0 && <Badge variant="danger" dot>{refused.length} refused</Badge>}
                {count('moved') + count('unprinted') > 0 && <Badge variant="info" dot>{count('moved') + count('unprinted')} moved</Badge>}
                {count('unprinted') > 0 && <Badge variant="warning" dot>{count('unprinted')} label{count('unprinted') === 1 ? '' : 's'} to reprint</Badge>}
              </div>
              {groups.map((g) => (
                <div key={g.materialCode} className="rounded-xl border bg-card">
                  <div className="grid items-center gap-3 border-b bg-muted/30 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={g.material}>{g.material}</p>
                      <p className="text-xs text-muted-foreground">{g.materialAlias || g.materialCode} · {g.units.length} unit{g.units.length === 1 ? '' : 's'}</p>
                    </div>
                    <ArrowRight className="hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
                    <NativeSelect value={g.destination} onChange={(e) => setGroup(g.materialCode, { destination: e.target.value })} disabled={moving} aria-label={`Destination for ${g.material}`} placeholder="Move to … (type to search)">
                      {materials.filter((o) => o.value !== g.materialCode).map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
                    </NativeSelect>
                    <Button type="button" size="icon-sm" variant="outline" icon={X} title="Leave this product out" aria-label={`Leave ${g.material} out`} disabled={moving} onClick={() => setGroups((gs) => gs.filter((x) => x.materialCode !== g.materialCode))} />
                  </div>
                  <details className="px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Serials</summary>
                    <ul className="mt-2 grid max-h-56 gap-1 overflow-auto text-[13px] sm:grid-cols-2">
                      {g.units.map((u) => (
                        <li key={u.barcodeNo} className="flex min-w-0 items-center gap-2" title={u.error}>
                          <span className="font-mono">{u.serial}</span>
                          <Badge variant={STATE[u.state][0]}>{STATE[u.state][1]}</Badge>
                          {u.state === 'failed' && u.error && <span className="truncate text-xs text-rose-700 dark:text-rose-300">{u.error}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
              {refused.length > 0 && (
                <details className="rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2 dark:border-rose-900 dark:bg-rose-950/20" open>
                  <summary className="cursor-pointer text-sm font-semibold text-rose-700 dark:text-rose-300">Refused ({refused.length})</summary>
                  <ul className="mt-2 grid max-h-48 gap-1 overflow-auto text-[13px]">
                    {refused.map((r) => <li key={r.serial}><span className="font-mono">{r.serial}</span> <span className="text-muted-foreground">— {r.error}</span></li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Step>
      </div>

      {groups?.length > 0 && (
        <div className="min-w-0 lg:col-span-10">
          <Step n={3} tone="amber" icon={Printer} title="Transfer" subtitle="Each unit is moved to its product's destination and its label printed again">
            <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid max-w-md gap-1.5 text-sm font-medium">
                Printer
                <NativeSelect value={printer} onChange={(e) => setPrinter(e.target.value)} disabled={moving} aria-label="Printer">
                  {printerList.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
                </NativeSelect>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {moving ? (
                  <Button type="button" variant="outline" icon={Square} onClick={() => (stop.current = true)}>Stop after this part</Button>
                ) : (
                  <Button type="button" icon={ArrowRight} disabled={!todo.length || !printer || unset.length > 0} onClick={transfer}>
                    {todo.length && count('failed') === todo.length ? `Send ${todo.length} failed again` : `Transfer ${todo.length} unit${todo.length === 1 ? '' : 's'}`}
                  </Button>
                )}
              </div>
            </div>
            {unset.length > 0 && !moving && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Choose a destination for {unset.length === 1 ? unset[0].material : `${unset.length} products`} (or leave {unset.length === 1 ? 'it' : 'them'} out).</p>}
            {moving && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Transferring…</span>
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
