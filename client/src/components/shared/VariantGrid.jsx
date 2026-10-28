// The variants of a record (Model, Material) added and edited in their table, instead of the group / field / value
// form beside it. Every step runs the screen's own handlers on the same (hidden) controls: the field and value lists,
// Add (its checks and the record's Alias), and the grid's Delete. A page turns it on with page.rowEdit (its Form.jsx).
import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import TypeSelect from '@/components/shared/TypeSelect.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';

const sel = 'h-9 w-full min-w-40 text-[13px]';
const cell = 'px-3 py-2 align-middle';

/** page.rowEdit = { grid, group, field, value, newValue, add, category }: the grid and the controls its rows use */
export default function VariantGrid({ c, cfg, values, setValues, controls, ctl, fire, busy, cancelled, setError }) {
  const rows = values[c.id] ?? [];
  const [editing, setEditing] = useState(null); // the row (its RowID) whose value is being changed, or null
  const fieldOpts = ctl(cfg.field)?.options ?? [];
  const valueOpts = ctl(cfg.value)?.options ?? [];
  const off = busy || cancelled;
  const put = (id) => (e) => setValues({ ...values, [id]: e.target.value });

  // ✏: the row's field chosen (its values listed), its value to pick again; nothing changes until ✓
  async function startEdit(row) {
    let opt = fieldOpts.find((o) => o.text === row.Name && o.value !== '');
    let base = controls;
    let next = { ...values, [cfg.newValue]: '' };
    if (!opt) {
      // a group filter hides the field: list every field again (an empty group is all fields)
      next = { ...next, [cfg.group]: '' };
      const r = await fire(cfg.group, next);
      const all = r?.set?.[cfg.field]?.options ?? [];
      opt = all.find((o) => o.text === row.Name && o.value !== '');
      base = controls.map((x) => (x.id === cfg.field ? { ...x, options: all, refilled: true } : x));
    }
    if (!opt) return void setError(`The field ${row.Name} is not in the field list`);
    next = { ...next, [cfg.field]: opt.value };
    await fire(cfg.field, next, undefined, base);
    setEditing(row.RowID);
  }

  // ✓ on an edited row: the old value removed and the new one added, only once Add is sure to have what it needs (a
  // removed saved variant is deleted at once, as the screen's Delete does)
  async function saveEdit(row, index) {
    if (!values[cfg.field]) return void setError('Select a Variant Field');
    if (!values[cfg.value] && !String(values[cfg.newValue] ?? '').trim()) return void setError('Pick the new value, or type it');
    if (cfg.category && !values[cfg.category]) return void setError('Choose the category first');
    const r = await fire(`${c.id}:delete`, values, row[c.keyName] ?? row.RowID, controls, index);
    if (!r || r.alert) return;
    await fire(cfg.add, { ...values, [c.id]: r.set?.[c.id]?.rows ?? rows });
    setEditing(null);
  }

  const valueEditor = (
    <div className="flex flex-wrap gap-2">
      <TypeSelect id="variant-values" options={valueOpts} value={values[cfg.value] ?? ''} onPick={(v) => setValues({ ...values, [cfg.value]: v })} disabled={off || !values[cfg.field]} className={sel} aria-label="Value" placeholder="Type to search a value" />
      <Input className="h-9 min-w-40 flex-1 text-[13px]" value={values[cfg.newValue] ?? ''} onChange={put(cfg.newValue)} placeholder="or type a new value" disabled={off || !values[cfg.field]} aria-label="New value" />
    </div>
  );
  const th = 'border-b border-border px-3 py-3 text-left text-xs font-semibold whitespace-nowrap text-foreground/80';
  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={`${th} w-12`}>#</th>
              <th className={th}>Field Name</th>
              <th className={th}>Variant Value</th>
              <th className={`${th} w-28 text-center`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {editing === null && !cancelled && (
              // the add row, first: a field (every field: no group filter), its value picked or typed, then Add
              <tr className="bg-muted/30">
                <td className={`${cell} text-muted-foreground`}>
                  <Plus className="size-4" aria-hidden="true" />
                </td>
                <td className={cell}>
                  <TypeSelect id="variant-fields" options={fieldOpts} value={values[cfg.field] ?? ''} onPick={(v) => fire(cfg.field, { ...values, [cfg.field]: v, [cfg.newValue]: '' })} disabled={off} className={sel} aria-label="Variant field" placeholder="Type to search a field" />
                </td>
                <td className={cell}>{valueEditor}</td>
                <td className={`${cell} text-center`}>
                  <Button type="button" size="sm" icon={Check} loading={busy} disabled={!values[cfg.field]} onClick={() => fire(cfg.add, values)}>
                    Add
                  </Button>
                </td>
              </tr>
            )}
            {rows.map((r, i) =>
              editing === r.RowID ? (
                <tr key={r.RowID ?? i} className="bg-primary/5">
                  <td className={`${cell} tabular text-muted-foreground`}>{r.RecNo}</td>
                  <td className={`${cell} font-medium`}>{r.Name}</td>
                  <td className={cell}>{valueEditor}</td>
                  <td className={`${cell} text-center`}>
                    <div className="flex justify-center gap-1.5">
                      <Button type="button" size="icon-sm" icon={Check} title="Save the new value" aria-label="Save the new value" loading={busy} disabled={cancelled} onClick={() => saveEdit(r, i)} />
                      <Button type="button" size="icon-sm" variant="outline" icon={X} title="Cancel" aria-label="Cancel" disabled={busy} onClick={() => setEditing(null)} />
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.RowID ?? i} className="hover:bg-muted/60">
                  <td className={`${cell} tabular text-muted-foreground`}>{r.RecNo}</td>
                  <td className={cell}>{r.Name}</td>
                  <td className={cell}>{r.Value}</td>
                  <td className={`${cell} text-center`}>
                    <div className="flex justify-center gap-1.5">
                      <Button type="button" size="icon-sm" variant="outline" icon={Pencil} className="text-primary" title="Change the value" aria-label={`Change ${r.Name}`} disabled={off || editing !== null} onClick={() => startEdit(r)} />
                      <Button type="button" size="icon-sm" variant="outline" icon={Trash2} className="text-rose-600" title="Remove" aria-label={`Remove ${r.Name}`} disabled={off || editing !== null} onClick={() => fire(`${c.id}:delete`, values, r[c.keyName] ?? r.RowID, controls, i)} />
                    </div>
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 && cancelled && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">No variants.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
