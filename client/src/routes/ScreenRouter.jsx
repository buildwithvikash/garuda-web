// Any route inside the app shell: the page file registered for it (src/pages/<group>/<Page>.jsx), or the generic
// page (pages/system/GenericPage.jsx) for a screen the server lists in me.migrated.forms, or a clear "not available" page. The server still
// decides which screens exist and which the user's role may open; this only decides how each one is drawn.
import { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { pages } from 'virtual:pages';
import Loader from '@/components/shared/Loader.jsx';
import GenericPage from '@/pages/system/GenericPage.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import ScreenNotAvailable from '@/pages/system/ScreenNotAvailable.jsx';

export default function ScreenRouter() {
  const { pathname } = useLocation();
  const me = useMe();
  const path = pathname.toLowerCase();

  if (!me.migrated?.forms?.includes(path)) return <ScreenNotAvailable pathname={pathname} />;

  const Page = pages[path];
  return <Suspense fallback={<Loader />}>{Page ? <Page key={path} /> : <GenericPage key={path} />}</Suspense>;
}
