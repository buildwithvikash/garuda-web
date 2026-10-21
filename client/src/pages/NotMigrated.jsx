// Any route inside the app: a screen of this app (EngineForm), or a clear "not here" page.
import { Home, SearchX } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMe } from '../layouts/AppLayout.jsx';
import EngineForm from './forms/EngineForm.jsx';

export default function NotMigrated() {
  const { pathname } = useLocation();
  const me = useMe();
  const path = pathname.toLowerCase();
  if (me.migrated?.forms?.includes(path)) return <EngineForm key={path} path={path} />;
  return (
    <div className="p-4">
      <div className="card mx-auto mt-10 flex max-w-lg flex-col items-center gap-2 px-6 py-14 text-center">
        <span className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center"><SearchX className="w-6 h-6 text-slate-400" /></span>
        <p className="text-sm font-semibold text-slate-700">This screen is not available</p>
        <p className="text-xs text-slate-500">There is no screen at {pathname}, or your role cannot open it. Use the menu or Ctrl+K to find a screen.</p>
        <Link to="/start" className="btn mt-3"><Home className="w-4 h-4" /> Back to home</Link>
      </div>
    </div>
  );
}
