// WIP Capture's checklist (owner, 1 Nov 2026): one table with lines, each item's parameter, description, value, remark
// and result on its own row, the item being checked open for editing in its row. A yes/no item is saved with one tap
// on Pass or Fail (type the remark first); others with Save. Once every item is saved the checklist closes by itself
// (its results go to the server as with Close checklist). The state and its events are QCValueCaptureControl's
// (server/src/modules/forms/qc.js): "QC:save", "QC:goto" (a row clicked), "QC:value", "QC:go", "QC:close".
import { useRef, useState } from 'react';
import { CheckCircle2, ListChecks, Save, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { cn } from '@/lib/utils';

const cellOf = (r, n) => r[Object.keys(r).find((k) => k.toLowerCase() === n.toLowerCase())];
const typeOf = (r) => String(cellOf(r, 'InputType') ?? '').toLowerCase();
const passed = (r) => String(cellOf(r, 'qcstatus') ?? '') === '1';

/** s: the checklist's state; onChange(next): its inputs typed; onEvent(name, state, arg, index): a server event,
 *  answering the engine's result */
export default function ChecklistTable({ s, busy, onChange, onEvent }) {
  const f = s.f;
  const rows = s.rows ?? [];
  const current = Number(s.index ?? -1);
  // the items saved since the checklist opened: all of them closes it
  const [saved, setSaved] = useState(() => new Set());
  const remarkRef = useRef(null);
  const set = (patch) => onChange({ ...s, f: { ...f, ...patch } });

  async function save(state = s) {
    const i = current;
    const r = await onEvent('QC:save', state);
    if (!r || r.alert) return;
    const next = r.set?.InspectionCheckList?.value ?? state;
    const done = new Set(saved).add(i);
    setSaved(done);
    if (done.size >= rows.length) return void onEvent('QC:close', next);
    // the server moved on to the next item; when that one is saved already, the first one still to do instead
    const to = Number(next.index ?? -1);
    if (done.has(to)) {
      const left = rows.findIndex((_, j) => !done.has(j));
      if (left >= 0) await onEvent('QC:goto', next, '', left);
    }
    remarkRef.current?.focus();
  }
  // a yes/no item: Pass or Fail picked and saved at once (as its Yes / No list would set it, then Save)
  const verdict = (yes) =>
    save({ ...s, f: { ...f, DDLList: { ...f.DDLList, value: yes ? '1' : '0' }, DdlQCStatus: { ...f.DdlQCStatus, value: yes ? '1' : '0' } } });

  const th = 'border border-border bg-muted/60 px-3 py-2 text-left text-xs font-semibold text-foreground/80 whitespace-nowrap';
  const td = 'border border-border px-3 py-2 align-middle';

  return (
    <section className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-primary/50 px-4 py-3">
        <span className="rounded-lg bg-primary p-2 text-white">
          <ListChecks className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{f.lblTitle || 'Checklist'}</h2>
          <p className="text-[11px] text-muted-foreground tabular">
            {saved.size} of {rows.length} saved · closes by itself when all are saved
          </p>
        </div>
        <Button variant="outline" size="sm" icon={X} loading={busy} onClick={() => onEvent('QC:close')}>
          Close checklist
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${th} w-12`}>Code</th>
                <th className={th}>Parameter</th>
                <th className={th}>Description</th>
                <th className={th}>Value</th>
                <th className={`${th} w-[28%]`}>Remark</th>
                <th className={th}>Result</th>
                <th className={`${th} w-44`} aria-label="Save" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const on = i === current;
                const type = typeOf(r);
                const value = cellOf(r, 'qcvalue');
                const done = saved.has(i);
                return (
                  <tr
                    key={i}
                    aria-current={on ? 'true' : undefined}
                    onClick={on || busy ? undefined : () => onEvent('QC:goto', s, '', i)}
                    className={cn(on ? 'bg-primary/5 ring-2 ring-primary/40 ring-inset' : 'cursor-pointer hover:bg-muted/50', done && !on && 'bg-emerald-50/50 dark:bg-emerald-950/20')}
                  >
                    <td className={`${td} tabular text-muted-foreground`}>{cellOf(r, 'LineCode')}</td>
                    <td className={`${td} font-semibold`}>{cellOf(r, 'Name')}</td>
                    <td className={`${td} text-muted-foreground`}>{cellOf(r, 'Description')}</td>
                    <td className={td}>{on ? <ValueEditor s={s} f={f} type={type} busy={busy} set={set} onEvent={onEvent} /> : <ValueText type={type} value={value} />}</td>
                    <td className={td} onClick={(ev) => on && ev.stopPropagation()}>
                      {on ? (
                        <Input
                          ref={remarkRef}
                          autoFocus
                          aria-label={`Remark for ${cellOf(r, 'Name')}`}
                          placeholder="Remark (optional)"
                          value={f.TBRemark}
                          onChange={(e) => set({ TBRemark: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && !busy && type !== 'bit' && save()}
                          className="h-9"
                        />
                      ) : (
                        <span className="text-muted-foreground">{cellOf(r, 'remark')}</span>
                      )}
                    </td>
                    <td className={td}>
                      {on && type !== 'bit' && f.DdlQCStatus.visible ? (
                        <NativeSelect className="h-9 w-28" aria-label="Result" value={f.DdlQCStatus.value} onChange={(e) => set({ DdlQCStatus: { ...f.DdlQCStatus, value: e.target.value } })}>
                          <option value="1">Pass</option>
                          <option value="0">Fail</option>
                        </NativeSelect>
                      ) : passed(r) ? (
                        <Badge variant="success">
                          <CheckCircle2 className="size-3.5" /> Pass
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          <XCircle className="size-3.5" /> Fail
                        </Badge>
                      )}
                    </td>
                    <td className={td} onClick={(ev) => on && ev.stopPropagation()}>
                      {on ? (
                        type === 'bit' ? (
                          <div className="flex gap-2">
                            <Button size="sm" disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => verdict(true)}>
                              <CheckCircle2 /> Pass
                            </Button>
                            <Button size="sm" variant="destructive" disabled={busy} onClick={() => verdict(false)}>
                              <XCircle /> Fail
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" icon={Save} loading={busy} onClick={() => save()}>
                            Save
                          </Button>
                        )
                      ) : done ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="size-3.5" /> Saved
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">To check</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {f.GuideImage?.visible && f.GuideImage.url && <img src={f.GuideImage.url.replace(/^~\//, '/')} alt="Guide" className="max-h-64 rounded-lg border border-border" />}
      </div>
    </section>
  );
}

/** a saved (or not shown) item's value */
function ValueText({ type, value }) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'bit') return <span>{String(value) === '1' ? 'Yes' : 'No'}</span>;
  if (type === 'image') return <img src={value} alt="" className="h-10 rounded" />;
  return <span className="tabular">{value}</span>;
}

/** the shown item's value input, by its type (a yes/no item takes its answer from Pass / Fail) */
function ValueEditor({ s, f, type, busy, set, onEvent }) {
  if (type === 'bit') return <span className="text-xs text-muted-foreground">Pass or Fail →</span>;
  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
      {f.TBValue.visible && (
        <Input
          className="h-9 w-32 tabular"
          aria-label="Value"
          type={f.TBValue.mode === 'Number' ? 'number' : 'text'}
          value={f.TBValue.text}
          onChange={(e) => set({ TBValue: { ...f.TBValue, text: e.target.value } })}
          onBlur={() => onEvent('QC:value')}
        />
      )}
      {f.DDLUom.visible && (
        <NativeSelect className="h-9 w-24" aria-label="UOM" value={f.DDLUom.value} onChange={(e) => set({ DDLUom: { ...f.DDLUom, value: e.target.value } })}>
          {f.DDLUom.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </NativeSelect>
      )}
      {f.DDLList.visible && (
        <NativeSelect className="h-9 min-w-36" aria-label="Value" value={f.DDLList.value} onChange={(e) => onEvent('QC:list', { ...s, f: { ...f, DDLList: { ...f.DDLList, value: e.target.value } } })}>
          {f.DDLList.options.map((o, i) => (
            <option key={i} value={o.value}>
              {o.text}
            </option>
          ))}
        </NativeSelect>
      )}
      {f.PnlImage && (
        <input
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Photo"
          className="block max-w-56 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/5 file:px-2 file:py-1.5 file:font-semibold file:text-primary"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = () => set({ TBImage: String(r.result), Image: String(r.result) });
            r.readAsDataURL(file);
          }}
        />
      )}
      {f.LblMaxMin?.visible && <span className="w-full text-xs text-muted-foreground">{f.LblMaxMin.text}</span>}
      {f.InstrumentPanel && (
        <div className="flex w-full items-center gap-2">
          <Input className="h-9 w-40" aria-label="Instrument (asset ID)" placeholder="Instrument" value={f.TBBarcode.text} onChange={(e) => set({ TBBarcode: { ...f.TBBarcode, text: e.target.value } })} />
          <Button size="sm" variant="outline" loading={busy} onClick={() => onEvent('QC:go')}>
            Go
          </Button>
        </div>
      )}
    </div>
  );
}
