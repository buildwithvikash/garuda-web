// GridView (BoundFields): rows live in the form until Save/Update, as in ViewState. Its Select (edit) and Delete command
// columns run the page's handlers on the server with the row's DataKey. Drawn like QMAS's DataTable.
import { Inbox, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';

const ROW_TONE = { green: 'bg-emerald-500/10', red: 'bg-rose-500/10' };

export default function Grid({ c, rows = [], onSelect, onDelete, onEdit, onCommand, title }) {
  // BoundFields show text; TemplateFields (a TextBox bound to "<header without spaces>") are edited in place.
  // No columns in the markup: AutoGenerateColumns, one per data column.
  const markup = c.columns.length ? c.columns : Object.keys(rows[0] ?? {}).filter((k) => !k.startsWith('__')).map((k) => ({ kind: 'boundfield', dataField: k, header: k }));
  const cols = markup
    .filter((x) => x.dataField || x.kind === 'templatefield')
    .map((x) => ({ ...x, field: x.dataField ?? x.template?.bind ?? x.header.replaceAll(' ', ''), edit: x.kind === 'templatefield' && (x.template?.type ?? 'TextBox') === 'TextBox', command: x.template?.type === 'Button' ? x.template : null }));
  const key = (r) => r[c.keyName] ?? '';
  const th = 'px-3 py-3 text-xs font-semibold text-foreground/80 border-b border-border whitespace-nowrap text-left';
  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      {title && <div className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {onSelect && <th className={`${th} w-12`} aria-label="Edit" />}
              {cols.map((x) => <th key={x.field} scope="col" className={th}>{x.header || x.field}</th>)}
              {onDelete && <th className={`${th} w-12`} aria-label="Remove" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 2}>
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"><Inbox className="w-5 h-5 text-muted-foreground/70" /></span>
                    <p className="text-sm text-muted-foreground">No rows yet.</p>
                  </div>
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className={`hover:bg-muted/60 ${ROW_TONE[r.__color] ?? ''}`}>
                {onSelect && (
                  <td className="px-2">
                    <button type="button" title="Edit row" aria-label={`Edit row ${i + 1}`} onClick={() => onSelect(key(r), i)} className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
                {cols.map((x) => (
                  <td key={x.field} className="whitespace-nowrap px-3 py-2.5 text-foreground">
                    {x.command ? (
                      onCommand && <button type="button" className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-input bg-card text-foreground/80 hover:bg-muted/50 cursor-pointer" onClick={() => onCommand(x.command.command, key(r), i)}>{x.command.text}</button>
                    ) : x.edit ? (
                      <Input className=" h-8 w-24 tabular" aria-label={`${x.header} row ${i + 1}`} value={r[x.field] ?? ''} onChange={(e) => onEdit(i, x.field, e.target.value)} />
                    ) : (
                      r[x.field]
                    )}
                  </td>
                ))}
                {onDelete && (
                  <td className="px-2">
                    <button type="button" title="Remove row" aria-label={`Remove row ${i + 1}`} onClick={() => onDelete(key(r), i)} className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-rose-700 dark:text-rose-300 hover:border-rose-300 flex items-center justify-center cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
