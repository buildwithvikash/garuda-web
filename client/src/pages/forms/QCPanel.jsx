// QCValueCaptureControl: the checklist panel. Its state (rows, shown item, inputs) is the control's value; its buttons
// run the page's "QC:<name>" events on the server.
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Pencil, Save, X, XCircle } from 'lucide-react';
import Badge from '../../ui/Badge.jsx';
import Button from '../../ui/Button.jsx';

export default function QCPanel({ s, busy, onChange, onEvent }) {
  const f = s.f;
  const set = (patch) => onChange({ ...s, f: { ...f, ...patch } });
  const url = (u) => (u ?? '').replace(/^~\//, '/');
  const cellOf = (r, n) => r[Object.keys(r).find((k) => k.toLowerCase() === n.toLowerCase())];
  const rows = s.rows ?? [];
  const th = 'px-3 py-2.5 text-xs font-semibold text-slate-700 border-b border-slate-200 text-left whitespace-nowrap';
  return (
    <section className="card overflow-hidden ring-2 ring-blue-100">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-blue-50/50 px-4 py-3">
        <span className="p-2 rounded-lg bg-blue-600 text-white"><ListChecks className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="section-title">{f.lblTitle || 'Checklist'}</h2>
          <p className="text-[11px] text-slate-500 tabular">{rows.length} item{rows.length === 1 ? '' : 's'}</p>
        </div>
        <Button variant="secondary" size="sm" icon={X} loading={busy} onClick={() => onEvent('QC:close')}>Close checklist</Button>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4 min-w-0">
          {f.LblDescription && <p className="text-sm font-medium text-slate-800">{f.LblDescription}</p>}
          {f.LblMaxMin.visible && <p className="text-xs text-slate-500">{f.LblMaxMin.text}</p>}
          {f.TopDataPanel && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              {f.DataPanel && (
                <div className="flex flex-wrap items-end gap-3">
                  {f.TBValue.visible && (
                    <label className="min-w-40">
                      {f.LblValue && <span className="label">Value</span>}
                      <input className="field tabular" type={f.TBValue.mode === 'Number' ? 'number' : 'text'} value={f.TBValue.text} onChange={(e) => set({ TBValue: { ...f.TBValue, text: e.target.value } })} onBlur={() => onEvent('QC:value')} />
                    </label>
                  )}
                  {f.DDLUom.visible && (
                    <select className="field w-28 cursor-pointer" aria-label="UOM" value={f.DDLUom.value} onChange={(e) => set({ DDLUom: { ...f.DDLUom, value: e.target.value } })}>
                      {f.DDLUom.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                    </select>
                  )}
                  {f.DDLList.visible && (
                    <label className="min-w-48">
                      {f.LblList && <span className="label">Select from list</span>}
                      <select className="field cursor-pointer" value={f.DDLList.value} onChange={(e) => onEvent('QC:list', { ...s, f: { ...f, DDLList: { ...f.DDLList, value: e.target.value } } })}>
                        {f.DDLList.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
                      </select>
                    </label>
                  )}
                  {f.PnlImage && (
                    <div>
                      {f.Image && <img src={f.Image} alt="" className="mb-2 h-24 rounded-lg border border-slate-200" />}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        aria-label="Photo"
                        className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-700"
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
                  <span className="label">Remark</span>
                  <input className="field" value={f.TBRemark} onChange={(e) => set({ TBRemark: e.target.value })} />
                </label>
                {f.DdlQCStatus.visible && (
                  <label>
                    {f.Label2 && <span className="label">Quality status</span>}
                    <select className="field w-32 cursor-pointer" value={f.DdlQCStatus.value} onChange={(e) => set({ DdlQCStatus: { ...f.DdlQCStatus, value: e.target.value } })}>
                      <option value="1">Pass</option>
                      <option value="0">Fail</option>
                    </select>
                  </label>
                )}
              </div>
              {f.InstrumentPanel && (
                <div className="flex items-end gap-2">
                  <label className="min-w-48">
                    <span className="label">Instrument (asset ID)</span>
                    <input className="field" value={f.TBBarcode.text} onChange={(e) => set({ TBBarcode: { ...f.TBBarcode, text: e.target.value } })} />
                  </label>
                  <Button loading={busy} onClick={() => onEvent('QC:go')}>Go</Button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button variant="secondary" icon={ChevronLeft} disabled={busy || !f.BtnPrevious.enabled} onClick={() => onEvent('QC:prev')}>{f.BtnPrevious.text || 'Previous'}</Button>
                <Button icon={Save} loading={busy} onClick={() => onEvent('QC:save')}>Save item</Button>
                <Button variant="secondary" disabled={busy || !f.BtnNext.enabled} onClick={() => onEvent('QC:next')}>
                  {f.BtnNext.text || 'Next'} <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
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
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const type = String(cellOf(r, 'InputType') ?? '').toLowerCase();
                  const v = cellOf(r, 'qcvalue');
                  const yes = v === null || v === undefined || v === '' ? true : ['1', 'true', 'y', 'yes'].includes(String(v).trim().toLowerCase());
                  const pass = String(cellOf(r, 'qcstatus') ?? '') === '1';
                  return (
                    <tr key={i} className="hover:bg-slate-50/60">
                      <td className="px-2 py-1.5">
                        <button type="button" title="Show item" aria-label={`Show item ${cellOf(r, 'Name') ?? i + 1}`} disabled={busy} onClick={() => onEvent('QC:select', s, String(cellOf(r, 'LineCode') ?? ''), i)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-300 flex items-center justify-center cursor-pointer disabled:opacity-50">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="px-3 py-2 tabular text-slate-500">{cellOf(r, 'LineCode')}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{cellOf(r, 'Name')}</td>
                      <td className="px-3 py-2">
                        {type === 'bit' && s.bound === false ? (v == null ? '' : String(v) === '1' ? 'Yes' : 'No') : type === 'bit' ? <input type="checkbox" disabled checked={yes} aria-label="Value" className="h-4 w-4 accent-blue-600" /> : type === 'image' && v != null ? <img src={v} alt="" className="h-10 rounded" /> : v}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{cellOf(r, 'remark')}</td>
                      <td className="px-3 py-2">{pass ? <Badge variant="success"><CheckCircle2 className="w-3.5 h-3.5" /> Pass</Badge> : <Badge variant="danger"><XCircle className="w-3.5 h-3.5" /> Fail</Badge>}</td>
                      <td className="px-3 py-2">
                        {type === 'bit' && v != null &&
                          (String(v) === '1' ? (
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onEvent('QC:Fail', s, '', i)}>Mark fail</Button>
                          ) : (
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onEvent('QC:Pass', s, '', i)}>Mark pass</Button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {f.GuideImage.visible && f.GuideImage.url && <img src={url(f.GuideImage.url)} alt="Guide" className="max-h-80 rounded-lg border border-slate-200" />}
      </div>
    </section>
  );
}
