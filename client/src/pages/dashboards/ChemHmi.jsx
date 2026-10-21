// Reports/WRLCHEM(2).aspx: tank readings overlaid on the plant diagram, refreshed every 30 s ("Refresh: 30").
import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Same box positions as the original WRLCHEM.css (percent of the image): T1 weight, T1 level, T1 temp, T2 level, T2 temp, T2 weight.
const BOXES = [
  { tank: 0, key: 'weight', top: 27, left: 12, width: 7, height: 6, size: 0.9 },
  { tank: 0, key: 'level', top: 45.5, left: 23.1, width: 10.5, height: 8, size: 1 },
  { tank: 0, key: 'temp', top: 61, left: 23.1, width: 10.5, height: 8, size: 1 },
  { tank: 1, key: 'level', top: 44.5, left: 69.5, width: 10.5, height: 8, size: 1 },
  { tank: 1, key: 'temp', top: 59.5, left: 69.5, width: 10.5, height: 8, size: 1 },
  { tank: 1, key: 'weight', top: 21.7, left: 84, width: 7, height: 5, size: 0.9 },
];
const LABEL = { weight: 'weight', level: 'level', temp: 'temperature' };

export default function ChemHmi({ page }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => api(`/dashboards/hmi/${page}${window.location.search}`).then((d) => alive && (setData(d), setError(''))).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [page]);

  const image = page === 'wrlchem' ? '/Assets/Images/chem-iso.jpg' : '/Assets/Images/chem-poly.jpg';
  return (
    <div className="space-y-3">
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="relative mx-auto w-full max-w-[1600px]">
        <img src={image} alt={`${page === 'wrlchem' ? 'ISO' : 'POLY'} chemical bulk storage`} className="block w-full rounded-xl shadow" />
        {BOXES.map((b, i) => (
          <output
            key={i}
            aria-label={`Tank ${b.tank + 1} ${LABEL[b.key]}`}
            // Original @media (max-width: 768px): boxes stacked at left 10%, 70% wide, top 10%..60%.
            className="absolute left-[var(--l)] top-[var(--t)] flex h-[var(--h)] w-[var(--w)] items-center justify-center rounded border border-[#275e75] bg-[#292423] text-[length:var(--fs)] font-bold text-neutral-100 shadow-[1px_1px_2px_black] max-md:left-[10%] max-md:top-[var(--mt)] max-md:h-[6%] max-md:w-[70%] max-md:text-[3.5vw]"
            style={{ '--t': `${b.top}%`, '--l': `${b.left}%`, '--w': `${b.width}%`, '--h': `${b.height}%`, '--fs': `${b.size}vw`, '--mt': `${10 + i * 10}%` }}
          >
            {data?.tanks[b.tank]?.[b.key] ?? ''}
          </output>
        ))}
      </div>
    </div>
  );
}
