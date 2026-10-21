// Any menu entry whose screen hasn't been migrated yet: point to the same page in the existing app.
import { useLocation } from 'react-router-dom';
import { useMe } from '../layouts/AppLayout.jsx';
import EngineForm from './forms/EngineForm.jsx';

const LEGACY = import.meta.env.VITE_LEGACY_URL ?? '';

export default function NotMigrated() {
  const { pathname } = useLocation();
  const me = useMe();
  // Screens rebuilt from a shared definition are resolved here rather than one route each.
  const path = pathname.toLowerCase();
  if (me.migrated?.forms?.includes(path)) return <EngineForm key={path} path={path} />;
  const item = (function find(nodes) {
    for (const n of nodes) {
      if (n.route === pathname) return n;
      const c = find(n.children);
      if (c) return c;
    }
  })(me.menu);

  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <h1 className="text-lg font-semibold text-slate-900">{item?.caption ?? 'Page not found'}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {item ? 'This screen has not been migrated yet. Use it in the existing application for now.' : 'There is no screen at this address.'}
      </p>
      {item && LEGACY && (
        <a className="btn mt-6" href={`${LEGACY}/View${pathname}.aspx`} target="_blank" rel="noreferrer">
          Open in existing app
        </a>
      )}
    </div>
  );
}
