// Home dashboard: today's production at a glance. Navigation lives in the sidebar, so none is repeated here.
// Data comes from useDashboard(); it returns SAMPLE data until you connect your API (see the TODO below).
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  RefreshCcw,
  Target,
} from "lucide-react";
import { useMemo } from "react";
import { useMe } from "../layouts/AppLayout.jsx";

/* ───────────── Data (replace the body of this hook with your API call) ───────────── */

const SAMPLE = {
  isSample: true,
  kpis: { planned: 480, produced: 312, passRate: 97.4, reworkPending: 9 },
  hourly: [
    { hour: "08", done: 38, target: 60 },
    { hour: "09", done: 52, target: 60 },
    { hour: "10", done: 61, target: 60 },
    { hour: "11", done: 57, target: 60 },
    { hour: "12", done: 30, target: 60 },
    { hour: "13", done: 54, target: 60 },
    { hour: "14", done: 20, target: 60 },
  ],
  orders: [
    {
      no: "PO-24051",
      product: "Evaporator coil 12K",
      done: 120,
      total: 120,
      status: "Completed",
    },
    {
      no: "PO-24052",
      product: "Condenser unit 18K",
      done: 96,
      total: 160,
      status: "In progress",
    },
    {
      no: "PO-24053",
      product: "Compressor mount kit",
      done: 64,
      total: 100,
      status: "In progress",
    },
    {
      no: "PO-24054",
      product: "Copper header 24K",
      done: 32,
      total: 100,
      status: "On hold",
    },
  ],
};

// TODO: fetch from your backend, e.g. useEffect + fetch('/api/dashboard/today'), and return the same shape.
function useDashboard() {
  return SAMPLE;
}

/* ───────────── Small pieces ───────────── */

const WEEKDAY_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const partOfDay = (h) =>
  h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

function Kpi({ icon: Icon, label, value, note, tone = "text-slate-500" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

const STATUS_STYLE = {
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "In progress": "bg-blue-50 text-blue-700 ring-blue-600/20",
  "On hold": "bg-amber-50 text-amber-700 ring-amber-600/20",
};

function HourlyChart({ data }) {
  const W = 560;
  const H = 200;
  const pad = { top: 12, right: 8, bottom: 24, left: 28 };
  const max = Math.max(10, ...data.flatMap((d) => [d.done, d.target]));
  const top = Math.ceil(max / 20) * 20;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(36, slot * 0.55);
  const y = (v) => pad.top + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Units completed per hour against target"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(t)}
            y2={y(t)}
            className="stroke-slate-100"
          />
          <text
            x={pad.left - 6}
            y={y(t) + 3}
            textAnchor="end"
            className="fill-slate-400 text-[10px]"
          >
            {t}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.left + slot * i + (slot - barW) / 2;
        const met = d.done >= d.target;
        return (
          <g key={d.hour}>
            <rect
              x={x}
              y={y(d.done)}
              width={barW}
              height={pad.top + innerH - y(d.done)}
              rx="2"
              className={met ? "fill-blue-600" : "fill-blue-300"}
            />
            <line
              x1={x - 4}
              x2={x + barW + 4}
              y1={y(d.target)}
              y2={y(d.target)}
              className="stroke-slate-700"
              strokeDasharray="3 3"
            />
            <text
              x={x + barW / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {d.hour}:00
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────── Page ───────────── */

export default function Start() {
  const me = useMe();
  const u = me.user;
  const { kpis, hourly, orders, isSample } = useDashboard();

  const { greeting, today } = useMemo(() => {
    const now = new Date();
    return {
      greeting: partOfDay(now.getHours()),
      today: WEEKDAY_DATE.format(now),
    };
  }, []);

  const name = String(u.userName || u.userId || "").split(" ")[0];
  const context = [u.lineName, u.department && `Department ${u.department}`]
    .filter(Boolean)
    .join(" · ");
  const achievement = kpis.planned
    ? Math.round((kpis.produced / kpis.planned) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Good {greeting}, {name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{context || today}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          {isSample && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              Sample data
            </span>
          )}
          {context && <span>{today}</span>}
        </div>
      </header>

      <section
        aria-label="Today's summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          icon={Target}
          label="Planned today"
          value={kpis.planned}
          note="Units on today's plan"
        />
        <Kpi
          icon={Factory}
          label="Produced"
          value={kpis.produced}
          note={`${achievement}% of plan`}
          tone="text-blue-600"
        />
        <Kpi
          icon={CheckCircle2}
          label="QC pass rate"
          value={`${kpis.passRate}%`}
          note="Units passed first time"
          tone="text-emerald-600"
        />
        <Kpi
          icon={kpis.reworkPending ? RefreshCcw : AlertTriangle}
          label="Rework pending"
          value={kpis.reworkPending}
          note="Units waiting for rework confirmation"
          tone={kpis.reworkPending ? "text-amber-600" : "text-slate-400"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section
          className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3"
          aria-labelledby="hourly"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 id="hourly" className="text-sm font-semibold text-slate-900">
              Output by hour
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-blue-600" />
                On target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-blue-300" />
                Below target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-3 border-t border-dashed border-slate-700" />
                Target
              </span>
            </div>
          </div>
          <HourlyChart data={hourly} />
        </section>

        <section
          className="rounded-lg border border-slate-200 bg-white lg:col-span-2"
          aria-labelledby="orders"
        >
          <h2
            id="orders"
            className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900"
          >
            Production orders
          </h2>
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => {
              const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
              return (
                <li key={o.no} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {o.no}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {o.product}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[o.status] ?? STATUS_STYLE["In progress"]}`}
                    >
                      {o.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${o.no} progress`}
                    >
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs tabular-nums text-slate-500">
                      {o.done}/{o.total}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
