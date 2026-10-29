// Serial Generation Logic: what the logic makes (owner, 29 Oct 2026), from the lines on the form (saved or not), read
// only: the first and last serial of its range, how many, each line's part, and what does not add up (a length that
// differs from the Barcode Length, a start after the end ...). Asked again as the lines change (debounced). A Model line
// takes a material's Alt Name: a saved logic offers the materials that use it. Server: masters/serial-logic-preview.js.
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/api.js';
import { NativeSelect } from '@/components/ui/native-select.jsx';

const WAIT_MS = 400;

/** values: the form's values (its lines GVTransData, Barcode Length TextBox1, the logic's code PrimaryKey) */
export default function SerialPreview({ values }) {
  const [material, setMaterial] = useState('');
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const rows = values.GVTransData ?? [];
  const body = { rows, barcodeLength: values.TextBox1 ?? '', serialCode: values.PrimaryKey ?? '', material };
  const key = JSON.stringify(body);
  useEffect(() => {
    const t = setTimeout(() => {
      api('/masters/serial-logics/preview', { method: 'POST', body })
        .then((r) => (setP(r), setError('')))
        .catch((e) => setError(e.message));
    }, WAIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (error) return <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>;
  if (!p) return <p className="text-sm text-muted-foreground">Building the preview…</p>;
  const hasModel = rows.some((r) => String(r.VariantCode) === '11');
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">First serial</p>
          <p className="truncate font-mono text-base font-bold tracking-wide" title={p.first}>{p.first || '—'}</p>
        </div>
        <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Last serial</p>
          <p className="truncate font-mono text-base font-bold tracking-wide" title={p.last}>{p.last || '—'}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Serials in the range</dt>
        <dd className="text-right font-semibold tabular">{/^\d+$/.test(p.count) ? Number(p.count).toLocaleString() : p.count}</dd>
        <dt className="text-muted-foreground">Length</dt>
        <dd className="text-right font-semibold tabular">{p.length}{Number(values.TextBox1) > 0 ? ` / ${values.TextBox1} (Barcode Length)` : ''}</dd>
      </dl>
      {hasModel && (p.materials?.length ?? 0) > 0 && (
        <label className="grid gap-1 text-xs font-medium">
          Model from the material
          <NativeSelect className="h-8 text-xs" value={p.material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material for the Model part">
            {p.materials.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </NativeSelect>
        </label>
      )}
      {p.parts.length > 0 && (
        <div className="flex flex-wrap items-stretch gap-1">
          {p.parts.map((x, i) => (
            <div key={i} className="flex items-stretch gap-1">
              <div className="rounded-md border bg-card px-2 py-1" title={x.note || undefined}>
                <p className="text-[10px] leading-tight text-muted-foreground">{x.name}</p>
                <p className="font-mono text-xs font-semibold">{x.first === x.last ? x.first : `${x.first} upto ${x.last}`}</p>
              </div>
              {x.separator && <span className="self-center font-mono text-xs text-muted-foreground">{x.separator === ' ' ? '␣' : x.separator}</span>}
            </div>
          ))}
        </div>
      )}
      {p.problems.length > 0 && (
        <ul className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          {p.problems.map((m, i) => (
            <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{m}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Dates are today's; the numbers are the line's range, not what has been used.</p>
    </div>
  );
}
