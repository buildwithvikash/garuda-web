// QCValueCaptureControl: the checklist panel. Its state (rows, shown item, inputs) is the control's value; its buttons
// run the page's "QC:<name>" events on the server.
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Pencil, Save, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Input } from '@/components/ui/input.jsx';

export default function QCPanel({ s, busy, onChange, onEvent }) {
  const f = s.f;
  const set = (patch) => onChange({ ...s, f: { ...f, ...patch } });
  const url = (u) => (u ?? '').replace(/^~\//, '/');
  const cellOf = (r, n) => r[Object.keys(r).find((k) => k.toLowerCase() === n.toLowerCase())];
  const rows = s.rows ?? [];
  const th = 'px-3 py-2.5 text-xs font-semibold text-foreground/80 border-b border-border text-left whitespace-nowrap';
  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden ring-2 ring-primary/15">
      <div className="flex items-center gap-3 border-b border-border bg-primary/50 px-4 py-3">
        <span className="p-2 rounded-lg bg-primary text-white"><ListChecks className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{f.lblTitle || 'Checklist'}</h2>
          <p className="text-[11px] text-muted-foreground tabular">{rows.length} item{rows.length === 1 ? '' : 's'}</p>
        </div>
        <Button variant="outline" size="sm" icon={X} loading={busy} onClick={() => onEvent('QC:close')}>Close checklist</Button>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4 min-w-0">
          {f.LblDescription && <p className="text-sm font-medium text-foreground">{f.LblDescription}</p>}
          {f.LblMaxMin.visible && <p className="text-xs text-muted-foreground">{f.LblMaxMin.text}</p>}
          {f.TopDataPanel && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/60 p-3">
              {f.DataPanel && (
                <div className="flex flex-wrap items-end gap-3">
                  {f.TBValue.visible && (
                    <label className="min-w-40">
                      {f.LblValue && <span className="text-sm leading-none font-medium">Value</span>}
                      <Input className="tabular" type={f.TBValue.mode === 'Number' ? 'number' : 'text'} value={f.TBValue.text} onChange={(e) => set({ TBValue: { ...f.TBValue, text: e.target.value } })} onBlur={() => onEvent('QC:value')} />
                    </label>
                  )}
                  {f.DDLUom.visible && (
                    <NativeSelect className=" w-28 cursor-pointer" aria-label="UOM" value={f.DDLUom.value} onChange={(e) => set({ DDLUom: { ...f.DDLUom, value: e.target.value } })}>
                      {f.DDLUom.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                    </NativeSelect>
                  )}
                  {f.DDLList.visible && (
                    <label className="min-w-48">
                      {f.LblList && <span className="text-sm leading-none font-medium">Select from list</span>}
                      <NativeSelect className="cursor-pointer" value={f.DDLList.value} onChange={(e) => onEvent('QC:list', { ...s, f: { ...f, DDLList: { ...f.DDLList, value: e.target.value } } })}>
                        {f.DDLList.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
                      </NativeSelect>
                    </label>
                  )}
                  {f.PnlImage && (
                    <div>
                      {f.Image && <img src={f.Image} alt="" className="mb-2 h-24 rounded-lg border border-border" />}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        aria-label="Photo"
                        className="block text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/5 file:px-3 file:py-2 file:font-semibold file:text-primary"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const r = new FileReader();
                          r.onload = () => set({ TBImage: String(r.result), Image: String(r.result) });
                          r.readAsDataURL(file);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-56 flex-1">
                  <span className="text-sm leading-none font-medium">Remark</span>
                  <Input value={f.TBRemark} onChange={(e) => set({ TBRemark: e.target.value })} />
                </label>
                {f.DdlQCStatus.visible && (
                  <label>
                    {f.Label2 && <span className="text-sm leading-none font-medium">Quality status</span>}
                    <NativeSelect className=" w-32 cursor-pointer" value={f.DdlQCStatus.value} onChange={(e) => set({ DdlQCStatus: { ...f.DdlQCStatus, value: e.target.value } })}>
                      <option value="1">Pass</option>
                      <option value="0">Fail</option>
                    </NativeSelect>
                  </label>
                )}
              </div>
              {f.InstrumentPanel && (
                <div className="flex items-end gap-2">
                  <label className="min-w-48">
                    <span className="text-sm leading-none font-medium">Instrument (asset ID)</span>
                    <Input value={f.TBBarcode.text} onChange={(e) => set({ TBBarcode: { ...f.TBBarcode, text: e.target.value } })} />
                  </label>
                  <Button loading={busy} onClick={() => onEvent('QC:go')}>Go</Button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" icon={ChevronLeft} disabled={busy || !f.BtnPrevious.enabled} onClick={() => onEvent('QC:prev')}>{f.BtnPrevious.text || 'Previous'}</Button>
                <Button icon={Save} loading={busy} onClick={() => onEvent('QC:save')}>Save item</Button>
                <Button variant="outline" disabled={busy || !f.BtnNext.enabled} onClick={() => onEvent('QC:next')}>
                  {f.BtnNext.text || 'Next'} <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className={`${th} w-12`} aria-label="Show" />
                  <th className={th}>Code</th>
                  <th className={th}>Parameter</th>
                  <th className={th}>Value</th>
                  <th className={th}>Remark</th>
                  <th className={th}>Result</th>
                  <th className={th} aria-label="Pass or fail" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => {
                  const type = String(cellOf(r, 'InputType') ?? '').toLowerCase();
                  const v = cellOf(r, 'qcvalue');
                  const yes = v === null || v === undefined || v === '' ? true : ['1', 'true', 'y', 'yes'].includes(String(v).trim().toLowerCase());
                  const pass = String(cellOf(r, 'qcstatus') ?? '') === '1';
                  return (
                    <tr key={i} className="hover:bg-muted/60">
                      <td className="px-2 py-1.5">
                        <button type="button" title="Show item" aria-label={`Show item ${cellOf(r, 'Name') ?? i + 1}`} disabled={busy} onClick={() => onEvent('QC:select', s, String(cellOf(r, 'LineCode') ?? ''), i)} className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center cursor-pointer disabled:opacity-50">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="px-3 py-2 tabular text-muted-foreground">{cellOf(r, 'LineCode')}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{cellOf(r, 'Name')}</td>
                      <td className="px-3 py-2">
                        {type === 'bit' && s.bound === false ? (v == null ? '' : String(v) === '1' ? 'Yes' : 'No') : type === 'bit' ? <input type="checkbox" disabled checked={yes} aria-label="Value" className="h-4 w-4 accent-primary" /> : type === 'image' && v != null ? <img src={v} alt="" className="h-10 rounded" /> : v}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{cellOf(r, 'remark')}</td>
                      <td className="px-3 py-2">{pass ? <Badge variant="success"><CheckCircle2 className="w-3.5 h-3.5" /> Pass</Badge> : <Badge variant="danger"><XCircle className="w-3.5 h-3.5" /> Fail</Badge>}</td>
                      <td className="px-3 py-2">
                        {type === 'bit' && v != null &&
                          (String(v) === '1' ? (
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => onEvent('QC:Fail', s, '', i)}>Mark fail</Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => onEvent('QC:Pass', s, '', i)}>Mark pass</Button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {f.GuideImage.visible && f.GuideImage.url && <img src={url(f.GuideImage.url)} alt="Guide" className="max-h-80 rounded-lg border border-border" />}
      </div>
    </section>
  );
}
