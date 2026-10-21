// Building blocks for the WRL dashboards, matching the original controls:
// radial gauge (canvas-gauges, same settings), SVG circular progress, Name/Value grids, Chart.js charts.
import { useEffect, useRef, useState } from 'react';
import { loadScript } from '../../lib/loadScript.js';

const GAUGE_JS = '/Assets/Javascript/JsLibrary/gauge.min.js';
const CHART_JS = '/Assets/Javascript/JsLibrary/Chart.min.js';

/** The single gauge configuration all 36 original dials use. */
export function Gauge({ value, title, units }) {
  const ref = useRef(null);
  const gauge = useRef(null);
  useEffect(() => {
    let cancelled = false;
    loadScript(GAUGE_JS).then(() => {
      if (cancelled || !ref.current) return;
      gauge.current = new window.RadialGauge({
        renderTo: ref.current,
        width: 300,
        height: 300,
        units,
        title,
        value: Number(value) || 0,
        minValue: 5,
        maxValue: 1000,
        majorTicks: ['0', '100', '200', '300', '400', '500', '600', '700', '800', '900', '1000'],
        minorTicks: 10,
        strokeTicks: false,
        highlights: [
          { from: 0, to: 250, color: 'rgb(255,0,0)' },
          { from: 250, to: 550, color: 'rgb(255,255,0)' },
          { from: 550, to: 800, color: 'rgb(0,255,0)' },
        ],
        colorPlate: '#222',
        colorMajorTicks: '#f5f5f5',
        colorMinorTicks: '#000000',
        colorTitle: '#fff',
        colorUnits: '#ccc',
        colorNumbers: '#eee',
        colorNeedleStart: 'rgba(240, 128, 128, 1)',
        colorNeedleEnd: 'rgba(255, 160, 122, .9)',
        valueBox: true,
        animationRule: 'linear',
        animationDuration: 2000,
        borderOuterWidth: 3,
        borderMiddleWidth: 3,
        borderInnerWidth: 3,
        animateOnInit: true,
        animatedValue: true,
      }).draw();
    });
    return () => {
      cancelled = true;
      gauge.current?.destroy?.();
    };
  }, [title, units]);
  useEffect(() => {
    if (gauge.current) gauge.current.value = Number(value) || 0;
  }, [value]);
  return <canvas ref={ref} aria-label={`${title}: ${value} ${units}`} role="img" />;
}

/** Original .circular-progress SVG: stroke-dashoffset = (100 - p) / 100 * -219.99. */
export function CircularProgress({ value, color = '#008eff', size = 150 }) {
  const max = -219.99078369140625;
  const p = Number(value);
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={`${value}%`}>
      <path d="M5,40a35,35 0 1,0 70,0a35,35 0 1,0 -70,0" fill="none" stroke="#20313e" strokeWidth="7" transform="rotate(90 40 40)" />
      <path
        d="M5,40a35,35 0 1,0 70,0a35,35 0 1,0 -70,0"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeDasharray="219.99078369140625"
        strokeDashoffset={Number.isFinite(p) ? ((100 - p) / 100) * max : max}
        transform="rotate(90 40 40)"
        style={{ transition: 'stroke-dashoffset 1s' }}
      />
      <text x="50%" y="55%" textAnchor="middle" fontSize="12" fontWeight="600" fill={color}>
        {value}%
      </text>
    </svg>
  );
}

/** GridView with auto-generated columns. */
export function DataGrid({ columns, rows, danger = false }) {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-700 text-xs uppercase tracking-wide text-slate-200">
          <tr>{columns.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-3 py-3 text-center text-slate-400">No records</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className={danger ? 'bg-red-600 text-white' : 'odd:bg-slate-800 even:bg-slate-800/60 text-slate-100'}>
              {r.map((v, j) => <td key={j} className="px-3 py-1.5 tabular-nums">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chart.js 2.6 (the version the original app ships). type: 'bar' | 'doughnut' | 'pie'. */
export function ChartBox({ type, labels, values, colors, title, height = 320 }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let chart;
    let cancelled = false;
    setFailed(false);
    loadScript(CHART_JS)
      .then(() => {
        if (cancelled || !ref.current) return;
        chart = new window.Chart(ref.current.getContext('2d'), {
          type,
          data: { labels, datasets: [{ label: title ?? 'Total', data: values, backgroundColor: colors }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600 },
            legend: { display: type !== 'bar' || !!title, labels: { fontColor: '#e2e8f0' } },
            // Chart.js 2.x breaks on an explicit `scales: undefined`, so only bar charts get the key.
            ...(type === 'bar' && {
              scales: { xAxes: [{ ticks: { fontColor: '#cbd5e1' } }], yAxes: [{ ticks: { beginAtZero: true, fontColor: '#cbd5e1' } }] },
            }),
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [type, JSON.stringify(labels), JSON.stringify(values)]);
  if (failed) return <p className="text-sm text-red-300">Chart library failed to load.</p>;
  return (
    <div style={{ height }} className="relative">
      <canvas ref={ref} />
    </div>
  );
}
