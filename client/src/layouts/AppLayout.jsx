// App shell (QMAS layout): signed-in check, top bar, collapsible sidebar with the role-filtered menu, content area.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { api } from '@/api.js';
import { useApplyTheme } from '@/app/theme.js';
import Loader from '@/components/shared/Loader.jsx';
import ConfirmHost from './ConfirmHost.jsx';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';

const MeContext = createContext(null);
export const useMe = () => useContext(MeContext);

const MOBILE_BREAKPOINT = 768;
const WIDE_BREAKPOINT = 1100;

export default function AppLayout() {
  useApplyTheme();
  const [me, setMe] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  // Wide screens start with the full menu; tablets start with the icon rail to leave room for tables.
  const [expanded, setExpanded] = useState(() => window.innerWidth >= WIDE_BREAKPOINT);
  const { pathname } = useLocation();

  useEffect(() => {
    api('/auth/me').then(setMe);
  }, []);
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) setExpanded(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const toggle = useCallback(() => setExpanded((e) => !e), []);

  if (!me) return <Loader fullScreen />;

  return (
    <MeContext.Provider value={me}>
      <div className="flex flex-col h-screen">
        <Navbar me={me} />
        <ConfirmHost />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar menu={me.menu} expanded={expanded} onToggle={toggle} isMobile={isMobile} />
          <main className={`flex-1 overflow-hidden transition-all duration-300 ${isMobile ? 'ml-0' : expanded ? 'ml-64' : 'ml-[72px]'}`}>
            <div key={pathname} className="h-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
