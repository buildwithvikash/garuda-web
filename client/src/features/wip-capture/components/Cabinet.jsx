import { AlertTriangle, CheckCircle2, Refrigerator } from 'lucide-react';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import Station from './Station.jsx';

export default function Cabinet({ unit, e, serialOk, line }) {
  const { values, ctl } = e;
  const c = unit?.cabinet;
  const [model, serial] = String(values.tbFG ?? '').split('|');
  const rows = c
    ? [
        ['Model', c.name || model],
        ['Category', c.category],
        ...c.variants.map((v) => [v.name, v.value]),
        ['Customer Name', c.customer],
        ['Order', c.order],
        ['Line', line],
        ['Work Station', values.TBWorkStation],
      ]
    : model
      ? [['Model', model], ['Serial', serial], ['Line', line], ['Work Station', values.TBWorkStation]]
      : [];
  const order = values.DDLProdOrder && ctl('DDLProdOrder')?.options?.find((o) => o.value === values.DDLProdOrder)?.text;
  if (c && !c.order && order) rows.splice(rows.length - 2, 0, ['Order', order]);
  return (
    <SectionCard
      icon={Refrigerator}
      title="Cabinet Details"
      actions={
        serialOk === true ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200"><CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" /> Valid Serial No.</span>
        ) : serialOk === false ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-semibold text-rose-700 dark:text-rose-300 ring-1 ring-rose-200"><AlertTriangle className="w-4 h-4" /> Serial not accepted</span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Scan a serial to see the cabinet.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="grid h-44 w-full shrink-0 place-items-center rounded-xl bg-muted/50 sm:h-auto sm:w-40">
            {c?.image ? <img src={c.image} alt={c.name} className="max-h-48 object-contain" /> : <Refrigerator className="w-16 h-16 text-muted-foreground/50" aria-hidden />}
          </div>
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {rows
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <div key={`${k}-${i}`} className="contents">
                  <dt className="py-1 font-semibold text-foreground">{k}</dt>
                  <dd className="truncate rounded-md bg-muted/50 px-2.5 py-1 text-foreground" title={v}>{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </SectionCard>
  );
}
