// A grid whose lines are added and edited in the table itself (owner, 29 Oct 2026; first for Bill of Material's BOM
// Input / Output), instead of the editors above it: the add row first, ✏ edits a line in place, 🗑 deletes it. Every
// step runs the screen's own controls and events: its editors (drawn in the cells), its Add button (Add / Update), the
// grid's Select (a line into the editors) and Delete, its command buttons (e.g. Alternative), and a Cancel event that
// puts the editors back to Add. A page turns it on with page.rowForms[gridId] (its Form.jsx draws it).
import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';

// compact, so a table fits beside another (owner, 29 Oct 2026): long names and headers wrap, numbers / codes do not
const cell = 'px-1.5 py-1.5 align-middle';
const th = 'border-b border-border px-1.5 py-2 text-left text-[11px] leading-tight font-semibold text-foreground/80';
/** a cell's text: a number or code on one line, a name wrapped */
const textCell = (v) => (/^[-\d.,/]*$/.test(v) ? `${cell} whitespace-nowrap tabular` : `${cell} min-w-24 break-words`);
/** an editor in a cell: lower and smaller than on a form */
const editorCell = `${cell} min-w-24 [&_input]:h-7 [&_input]:px-2 [&_input]:text-xs [&_[data-slot=native-select]]:h-7 [&_[data-slot=native-select]]:pl-2 [&_[data-slot=native-select]]:pr-6 [&_[data-slot=native-select]]:text-xs [&_svg]:right-1.5`;

/** cfg = { fields: { dataField: controlId }, more: [controlId], add, cancel }; field(id): the control drawn in a cell;
 *  onScreen(id): the screen shows it (its panels) */
export default function RowFormGrid({ c, cfg, rows = [], fire, values, controls, events, busy, cancelled, field, onScreen }) {
  const [editing, setEditing] = useState(null); // the line (its key) being edited, or null
  const cols = c.columns.filter((x) => x.kind === 'boundfield' && x.dataField);
  const commands = c.columns.filter((x) => x.kind === 'templatefield' && x.template?.type === 'Button' && events.includes(`${c.id}:${x.template.command}`));
  const can = (k) => !cancelled && events.includes(`${c.id}:${k}`);
  const keyOf = (r, i) => r[c.keyName] ?? r.RowID ?? i;
  const more = (cfg.more ?? []).filter(onScreen);
  const off = busy || cancelled;

  // the editors in the cells: a column's own control, the others left empty
  const editorCells = (adding) => {
    const mark = cols.findIndex((x) => !cfg.fields[x.dataField]); // where the add row's + goes
    return cols.map((x, i) => {
      const id = cfg.fields[x.dataField];
      if (id) return <td key={x.dataField} className={editorCell}>{onScreen(id) ? field(id) : null}</td>;
      return <td key={x.dataField} className={`${cell} text-muted-foreground`}>{adding && i === mark ? <Plus className="size-4" aria-label="New line" /> : null}</td>;
    });
  };
  // what the screen shows besides the columns (e.g. a sub-routing), under the editors
  const moreRow = (key) =>
    more.length > 0 && (
      <tr key={`${key}-more`} className="bg-primary/5">
        <td colSpan={cols.length + 1} className={`${cell} whitespace-normal`}>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">{more.map((id) => <div key={id}>{field(id)}</div>)}</div>
        </td>
      </tr>
    );

  async function save() {
    const r = await fire(cfg.add, values);
    if (r && !r.alert) setEditing(null);
  }
  async function edit(r, i) {
    const k = keyOf(r, i);
    const res = await fire(`${c.id}:select`, values, k, controls, i);
    if (res && !res.alert) setEditing(k);
  }
  async function cancel() {
    if (cfg.cancel && events.includes(cfg.cancel)) await fire(cfg.cancel, values);
    setEditing(null);
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            {/* the add row first, above the column headers (owner, 29 Oct 2026) */}
            {editing === null && !cancelled && (
              <>
                <tr className="border-b border-border bg-muted/20">
                  {editorCells(true)}
                  <td className={`${cell} text-center`}>
                    <Button type="button" size="sm" className="h-7 px-2.5 text-xs" icon={Check} loading={busy} disabled={off} onClick={save}>Add</Button>
                  </td>
                </tr>
                {moreRow('add')}
              </>
            )}
            <tr>
              {cols.map((x) => <th key={x.dataField} className={th}>{x.header || x.dataField}</th>)}
              <th className={`${th} w-24 text-center`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const k = keyOf(r, i);
              if (editing === k)
                return [
                  <tr key={k} className="bg-primary/5">
                    {editorCells(false)}
                    <td className={`${cell} text-center`}>
                      <div className="flex justify-center gap-1.5">
                        <Button type="button" size="icon-sm" className="size-7" icon={Check} title="Save the line" aria-label="Save the line" loading={busy} disabled={cancelled} onClick={save} />
                        <Button type="button" size="icon-sm" className="size-7" variant="outline" icon={X} title="Cancel" aria-label="Cancel" disabled={busy} onClick={cancel} />
                      </div>
                    </td>
                  </tr>,
                  moreRow(k),
                ];
              return (
                <tr key={k} className="hover:bg-muted/60">
                  {cols.map((x) => <td key={x.dataField} className={textCell(String(r[x.dataField] ?? ''))}>{String(r[x.dataField] ?? '')}</td>)}
                  <td className={`${cell} text-center`}>
                    <div className="flex justify-center gap-1.5">
                      {commands.map((x) => (
                        <Button key={x.template.command} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={off || editing !== null} onClick={() => fire(`${c.id}:${x.template.command}`, values, k, controls, i)}>
                          {String(x.template.text ?? x.template.command).trim()}
                        </Button>
                      ))}
                      {can('select') && <Button type="button" size="icon-sm" variant="outline" icon={Pencil} className="size-7 text-primary" title="Edit the line" aria-label={`Edit line ${i + 1}`} disabled={off || editing !== null} onClick={() => edit(r, i)} />}
                      {can('delete') && <Button type="button" size="icon-sm" variant="outline" icon={Trash2} className="size-7 text-rose-600" title="Delete the line" aria-label={`Delete line ${i + 1}`} disabled={off || editing !== null} onClick={() => fire(`${c.id}:delete`, values, k, controls, i)} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && cancelled && (
              <tr>
                <td colSpan={cols.length + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">No lines.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
