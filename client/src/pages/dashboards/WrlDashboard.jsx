// All 32 View/Dashboards/WRL pages: the server returns the page spec + computed data; panels render by kind.
// Auto-rotation keeps the original "Refresh: 60; URL=<next page>" behaviour, including kiosk (?UCode=) URLs.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ChartBox, CircularProgress, DataGrid, Gauge } from '../../components/dashboard/Widgets.jsx';

const ROTATE_MS = 60_000;

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = (n) => String(n).padStart(2, '0');
  return <>{`${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`}</>;
}

function Header({ title, header, kiosk }) {
  const Info = ({ label, children }) => (
    <div className="rounded-lg bg-slate-800 px-3 py-2">
      <span className="text-slate-400">{label} </span>
      <span className="font-semibold text-white">{children}</span>
    </div>
  );
  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
        {kiosk ? (
          <img src="/Assets/Images/WRLLogo.png" alt="WRL" className="h-12" />
        ) : (
          <Link to="/start" title="Back to start">
            <img src="/Assets/Images/WRLLogo.png" alt="WRL" className="h-12" />
          </Link>
        )}
        <h1 className="flex-1 text-center text-lg font-bold tracking-wide text-slate-900 sm:text-2xl">{title}</h1>
        <img src="/Assets/Images/WRLHoshi.png" alt="" className="h-12" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        <Info label="Shift:">{header.shift}</Info>
        <Info label="Date:">{header.date}</Info>
        <Info label="Time:"><Clock /></Info>
        <Info label="Shift Duration:">{header.duration}</Info>
      </div>
    </div>
  );
}

const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-slate-900 p-4 ring-1 ring-slate-700 ${className}`}>{children}</div>;
const PanelError = ({ message }) => (
  <Card><p className="text-sm text-red-300">This panel could not be loaded: {message}</p></Card>
);

function DialPanel({ p }) {
  return (
    <Card className="flex flex-col items-center gap-3">
      {p.data ? <Gauge value={p.data.value} title={p.title} units={p.unit} /> : <div className="h-[300px]" />}
      <div className="text-center text-sm font-semibold uppercase tracking-wide text-slate-200">{p.title}</div>
      <div className="w-full"><DataGrid columns={['Name', 'Value']} rows={p.data?.rows ?? []} /></div>
    </Card>
  );
}

function MonthlyPanel({ d }) {
  const items = [
    ['MONTHLY PRODUCTION QTY:', d.monthlyProductionQty],
    ['MONTHLY PRODUCTION ACHIEVEMENT:', d.monthlyAchievement],
    ['REMAINING QTY:', d.remainingQty],
    ['ASKING RATE:', d.askingRate],
    ['REMANING DAYS TO ACHIEVE:', d.remainingDays],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl bg-slate-800 p-3 text-center">
          <div className="text-xs font-medium text-slate-400">{k}</div>
          <div className="mt-1 text-xl font-bold text-white tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}

function HourlyPanel({ d }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-around gap-4 text-center">
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">CONSUMED TIME IN SHIFT %</div>
            <CircularProgress value={d.shiftProgress} />
            <div className="mt-1 text-sm text-slate-300">{d.runningHour}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">ACHIEVEMENT RATE %</div>
            <CircularProgress value={d.achievement} color="#22c55e" />
          </div>
        </div>
        <div className="space-y-1 font-mono text-sm text-slate-100">
          <div className="whitespace-pre">{d.plan}</div>
          <div className="whitespace-pre">{d.achieved}</div>
          <div className="whitespace-pre">{d.remaining}</div>
        </div>
      </Card>
      <Card>
        <ChartBox type="bar" title={d.chartTitle} labels={d.chart.map((c) => c.label)} values={d.chart.map((c) => c.value)} colors="#254061" height={380} />
      </Card>
    </div>
  );
}

function QualityPanel({ p }) {
  const d = p.data;
  const values = [d.packing, d.actual, d.ok, d.defect, d.okPercentage, d.defectPercentage];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="space-y-4">
        <div className="text-center">
          <div className="mb-2 text-xs font-semibold text-slate-400">CONSUMED TIME IN SHIFT %</div>
          <CircularProgress value={d.shiftProgress} />
          <div className="mt-1 text-sm text-slate-300">{d.updatedHour}</div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          {p.captions.map((c, i) => (
            <div key={c} className="rounded-lg bg-slate-800 p-2 text-center">
              <dt className="text-xs text-slate-400">{c}</dt>
              <dd className="text-lg font-bold text-white tabular-nums">{values[i]}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <ChartBox type="doughnut" labels={d.chart.map((c) => c.label)} values={d.chart.map((c) => c.value)} colors={['#0bc835', '#ff0000']} height={380} />
      </Card>
    </div>
  );
}

function BrazingPanel({ data }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {data.map((s, i) => (
        <Card key={i} className="space-y-3">
          <div className="text-center text-sm font-semibold uppercase text-slate-200">{s.name ?? 'BRAZING JOINTS - 1'}</div>
          <img src={s.photo ?? '/Assets/Images/businessman.png'} alt="Operator" className="mx-auto h-24 w-24 rounded-full bg-white object-cover" />
          <ChartBox type="pie" labels={s.chart.map((c) => c.label)} values={s.chart.map((c) => c.value)} colors={['#0bc835', '#ff0000']} height={220} />
          <DataGrid columns={['Name', 'Value']} rows={s.rows} />
        </Card>
      ))}
    </div>
  );
}

function Panels({ panels }) {
  const dials = panels.filter((p) => p.kind === 'foamDial' || p.kind === 'cabinetDial');
  const others = panels.filter((p) => !dials.includes(p));
  return (
    <div className="space-y-4">
      {dials.length > 0 && (
        <div className={`grid gap-4 sm:grid-cols-2 ${dials.length > 2 ? 'xl:grid-cols-4' : ''}`}>
          {dials.map((p, i) => (p.error ? <PanelError key={i} message={p.error} /> : <DialPanel key={i} p={p} />))}
        </div>
      )}
      {others.map((p, i) => {
        if (p.error) return <PanelError key={i} message={p.error} />;
        if (p.kind === 'static')
          return <Card key={i}><p className="text-sm text-slate-300">This dashboard has no live data in the existing application either; only the shift details are shown.</p></Card>;
        if (!p.data) return null;
        if (p.kind === 'monthly') return <MonthlyPanel key={i} d={p.data} />;
        if (p.kind === 'hourly') return <HourlyPanel key={i} d={p.data} />;
        if (p.kind === 'quality') return <QualityPanel key={i} p={p} />;
        if (p.kind === 'station')
          return <Card key={i}><DataGrid columns={['Location', 'Time_Elapsed', 'HitCount']} rows={p.data.map((r) => [r.Location, r.Time_Elapsed, r.HitCount])} danger /></Card>;
        if (p.kind === 'brazing') return <BrazingPanel key={i} data={p.data} />;
        return null;
      })}
    </div>
  );
}

export default function WrlDashboard() {
  const { slug } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    api(`/dashboards/wrl/${slug}${search}`)
      .then((p) => alive && setPage(p))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [slug, search, tick]);

  // Original: Response.AddHeader("Refresh", "60; URL=<next>"); pages without it never refreshed.
  useEffect(() => {
    if (!page?.next) return;
    const t = setTimeout(() => {
      if (page.next === slug) setTick((n) => n + 1);
      else navigate(`/dashboards/wrl/${page.next}${search}`);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [page, slug, search, navigate]);

  if (error) return <div className="rounded-xl bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if (!page || page.slug !== slug) return <div className="p-6 text-sm text-slate-500">Loading dashboard…</div>;

  return (
    <div className="-m-4 min-h-full bg-slate-950 p-4 sm:-m-6 sm:p-6">
      <Header title={page.title} header={page.header} kiosk={page.kiosk} />
      <Panels panels={page.panels} />
    </div>
  );
}
