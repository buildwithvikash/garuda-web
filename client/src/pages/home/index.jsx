// Home dashboard: today's production at a glance, in colour. Navigation lives in the sidebar, so none is repeated here.
// Data comes from useDashboard(); it returns SAMPLE data until you connect your API (see the TODO below).
import { Boxes, CalendarDays, CheckCircle2, ClipboardList, Factory, PieChart, RefreshCcw, Target, TrendingUp, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import Page from '@/components/shared/Page.jsx';
import Section from '@/components/shared/Section.jsx';
import StatCard from '@/components/shared/StatCard.jsx';
import StatChip from '@/components/shared/StatChip.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { TONES } from '@/lib/tones.js';
import { cn } from '@/lib/utils';

/* ───────────── Data (replace the body of useDashboard with your API call) ───────────── */

const SAMPLE = {
  isSample: true,
  kpis: { planned: 480, produced: 312, passRate: 97.4, reworkPending: 9, openOrders: 4 },
  hourly: [
    { hour: '08', done: 38, target: 60 },
    { hour: '09', done: 52, target: 60 },
    { hour: '10', done: 61, target: 60 },
    { hour: '11', done: 57, target: 60 },
    { hour: '12', done: 30, target: 60 },
    { hour: '13', done: 54, target: 60 },
    { hour: '14', done: 20, target: 60 },
  ],
  qc: [
    { label: 'Passed', value: 304, tone: 'emerald' },
    { label: 'Rework', value: 9, tone: 'amber' },
    { label: 'Rejected', value: 3, tone: 'rose' },
  ],
  orders: [
    { no: 'PO-24051', product: 'Evaporator coil 12K', done: 120, total: 120, status: 'Completed' },
    { no: 'PO-24052', product: 'Condenser unit 18K', done: 96, total: 160, status: 'In progress' },
    { no: 'PO-24053', product: 'Compressor mount kit', done: 64, total: 100, status: 'In progress' },
    { no: 'PO-24054', product: 'Copper header 24K', done: 32, total: 100, status: 'On hold' },
  ],
  topModels: [
    { name: 'GSF-450', value: 96 },
    { name: 'GSF-300', value: 71 },
    { name: 'DSF-250', value: 58 },
    { name: 'VRF-120', value: 44 },
    { name: 'GSF-150', value: 31 },
  ],
};

// TODO: fetch from your backend, e.g. useEffect + fetch('/api/dashboard/today'), and return the same shape.
function useDashboard() {
  return SAMPLE;
}

/* ───────────── Small pieces ───────────── */

const WEEKDAY_DATE = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const partOfDay = (h) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');

const STATUS = {
  Completed: { badge: 'success', bar: 'bg-emerald-500' },
  'In progress': { badge: 'info', bar: 'bg-blue-500' },
  'On hold': { badge: 'warning', bar: 'bg-amber-500' },
};

/** Ring chart with the pass rate in the middle. */
function Donut({ parts, centre, caption }) {
  const R = 58;
  const C = 2 * Math.PI * R;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 160 160" className="size-44" role="img" aria-label={`${caption}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        <circle cx="80" cy="80" r={R} fill="none" strokeWidth="20" className="stroke-muted" />
        {parts.map((p) => {
          const len = (p.value / total) * C;
          const el = (
            <circle
              key={p.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              strokeWidth="20"
              strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              className={TONES[p.tone].stroke}
            />
          );
          offset += len;
          return el;
        })}
        <text x="80" y="78" textAnchor="middle" className="fill-foreground text-[22px] font-bold">{centre}</text>
        <text x="80" y="96" textAnchor="middle" className="fill-muted-foreground text-[9px] font-semibold tracking-widest uppercase">{caption}</text>
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', TONES[p.tone].bar)} />
            <span className="text-muted-foreground">{p.label}</span>
            <b className="tabular-nums">{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HourlyChart({ data }) {
  const W = 560;
  const H = 210;
  const pad = { top: 12, right: 8, bottom: 26, left: 30 };
  const max = Math.max(10, ...data.flatMap((d) => [d.done, d.target]));
  const top = Math.ceil(max / 20) * 20;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(38, slot * 0.55);
  const y = (v) => pad.top + innerH - (v / top) * innerH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Units completed per hour against target">
      {[0, top / 2, top].map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" />
          <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.left + slot * i + (slot - barW) / 2;
        const met = d.done >= d.target;
        return (
          <g key={d.hour}>
            <rect x={x} y={y(d.done)} width={barW} height={pad.top + innerH - y(d.done)} rx="4" className={met ? 'fill-emerald-500' : 'fill-blue-500'} />
            <line x1={x - 5} x2={x + barW + 5} y1={y(d.target)} y2={y(d.target)} strokeDasharray="3 3" className="stroke-foreground/60" />
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{d.hour}:00</text>
          </g>
        );
      })}
    </svg>
  );
}

const Legend = ({ items }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {items.map(([color, label]) => (
      <span key={label} className="flex items-center gap-1.5">
        <span className={cn('h-2.5 w-2.5 rounded-sm', color)} />
        {label}
      </span>
    ))}
  </div>
);

/* ───────────── Page ───────────── */

export default function Start() {
  const me = useMe();
  const u = me.user;
  const { kpis, hourly, qc, orders, topModels, isSample } = useDashboard();

  const { greeting, today } = useMemo(() => {
    const now = new Date();
    return { greeting: partOfDay(now.getHours()), today: WEEKDAY_DATE.format(now) };
  }, []);

  const name = String(u.userName || u.userId || '').split(' ')[0];
  const context = [u.lineName, u.department && `Department ${u.department}`].filter(Boolean).join(' · ');
  const achievement = kpis.planned ? Math.round((kpis.produced / kpis.planned) * 100) : 0;
  const topMax = Math.max(1, ...topModels.map((m) => m.value));

  return (
    <Page
      icon={Factory}
      title={`Good ${greeting}, ${name}`}
      subtitle={context || today}
      actions={
        <>
          {isSample && <Badge variant="neutral">Sample data</Badge>}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" /> {today}
          </span>
          <StatChip tone="blue" value={kpis.planned} label="Planned" />
          <StatChip tone="indigo" value={kpis.produced} label="Produced" />
          <StatChip tone="amber" value={kpis.reworkPending} label="Rework" />
        </>
      }
    >
      <section aria-label="Today's summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard icon={Target} tone="blue" label="Planned today" value={kpis.planned} note="On today's plan" />
        <StatCard icon={Factory} tone="indigo" label="Produced" value={kpis.produced} note={`${achievement}% of plan`} />
        <StatCard icon={CheckCircle2} tone="emerald" label="QC pass rate" value={`${kpis.passRate}%`} note="Passed first time" />
        <StatCard icon={RefreshCcw} tone="amber" label="Rework pending" value={kpis.reworkPending} note="To be confirmed" />
        <StatCard icon={ClipboardList} tone="violet" label="Open orders" value={kpis.openOrders} note="Running or on hold" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={PieChart} tone="emerald" title="Quality outcome">
          <Donut parts={qc} centre={`${kpis.passRate}%`} caption="Pass rate" />
        </Section>
        <Section icon={TrendingUp} tone="blue" title="Output by hour" className="lg:col-span-2" actions={<Legend items={[['bg-emerald-500', 'On target'], ['bg-blue-500', 'Below target'], ['bg-foreground/60', 'Target']]} />}>
          <HourlyChart data={hourly} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={Boxes} tone="indigo" title="Production orders" flush className="lg:col-span-2">
          <ul className="divide-y">
            {orders.map((o) => {
              const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
              const s = STATUS[o.status] ?? STATUS['In progress'];
              return (
                <li key={o.no} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{o.no}</p>
                      <p className="truncate text-xs text-muted-foreground">{o.product}</p>
                    </div>
                    <Badge variant={s.badge} dot>{o.status}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${o.no} progress`}>
                      <div className={cn('h-full rounded-full', s.bar)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">{o.done}/{o.total} · {pct}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section icon={Trophy} tone="violet" title="Top models today">
          <ul className="space-y-4">
            {topModels.map((m, i) => (
              <li key={m.name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="grid size-5 place-items-center rounded-md bg-violet-500/10 text-[11px] font-bold text-violet-600 dark:text-violet-400">{i + 1}</span>
                    {m.name}
                  </span>
                  <b className="tabular-nums">{m.value}</b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${(m.value / topMax) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Page>
  );
}
