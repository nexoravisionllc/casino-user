import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import MobileNav from './MobileNav.jsx';
import RouteLoader from './RouteLoader.jsx';

// Shared shell. On desktop the sidebar collapses between a full panel and a
// narrow icon rail. On mobile it becomes an off-canvas drawer opened from the
// header menu button.
export default function Layout({ children }) {
  const isDesktop = typeof window !== 'undefined' ? window.innerWidth > 900 : true;
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);

  const { pathname } = useLocation();

  // On mobile the sidebar is a drawer: close it after navigating.
  useEffect(() => {
    if (window.innerWidth <= 900) setSidebarOpen(false);
  }, [pathname]);

  const toggle = () => setSidebarOpen((v) => !v);
  const closeDrawer = () => setSidebarOpen(false);

  return (
    <div className={`layout ${sidebarOpen ? 'layout--open' : 'layout--collapsed'}`}>
      <Header onToggleSidebar={toggle} />
      <div className="layout__body">
        <Sidebar open={sidebarOpen} />
        {/* Backdrop closes the drawer on mobile. */}
        <div className="layout__backdrop" onClick={closeDrawer} />
        <main className="layout__content">{children}</main>
        {/* Loading overlay scoped to the content area (header + sidebar stay put). */}
        <RouteLoader />
      </div>
      <MobileNav onOpenMenu={toggle} />
    </div>
  );
}
