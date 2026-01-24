import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OfflineQueueIndicator } from '../common/OfflineQueueIndicator';
import { useAuth } from '../../auth';
import { useTheme } from './theme';

const TITLE_MAP: Array<{ path: string; title: string }> = [
  { path: '/', title: 'Dashboard' },
  { path: '/inventory', title: 'Inventory' },
  { path: '/products', title: 'Products' },
  { path: '/equipment', title: 'Equipment' },
  { path: '/receiving', title: 'Incoming' },
  { path: '/orders', title: 'Orders' },
  { path: '/transfers', title: 'Orders' },
  { path: '/audit', title: 'Audit' },
  { path: '/analytics', title: 'Analytics' },
  { path: '/login', title: 'Sign in' },
];

function titleForPath(pathname: string, role?: string) {
  if (pathname === '/checkout') {
    return role === 'TECH' ? 'Checkout/Return' : 'Issue';
  }
  const match = TITLE_MAP.find((entry) => entry.path === pathname);
  return match ? match.title : 'PCOPro';
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const title = titleForPath(location.pathname, user?.role);
  const isTech = user?.role === 'TECH';
  const canGoBack = location.pathname !== '/';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const menuItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Inventory', path: '/inventory' },
    { label: isTech ? 'Checkout/Return' : 'Issue', path: '/checkout' },
    { label: 'Orders', path: '/orders' },
    { label: 'Products', path: '/products' },
    ...(user?.role === 'ADMIN' ? [{ label: 'Audit', path: '/audit' }] : []),
    ...(!isTech ? [{ label: 'Analytics', path: '/analytics' }] : []),
    { label: 'Settings', path: '' },
  ];

  return (
    <>
      <header className="app-header">
        <div className="header-side">
          <button type="button" className="ghost-button" onClick={() => (canGoBack ? navigate(-1) : setMenuOpen(true))}>
            {canGoBack ? 'Back' : 'Menu'}
          </button>
        </div>
        <div className="header-title">{title}</div>
        <div className="header-side header-right">
          <button type="button" className="ghost-button" onClick={toggleDarkMode}>
            {darkMode ? 'Light' : 'Dark'}
          </button>
          <OfflineQueueIndicator />
          {user ? (
            <div className="user-menu">
              <div className="user-meta">
                <div>{user.email}</div>
                <div className="muted">{user.role}</div>
              </div>
              <button type="button" onClick={logout}>
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {menuOpen ? (
        <div className="menu-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="menu-item"
                disabled={!item.path}
                onClick={() => {
                  if (!item.path) return;
                  navigate(item.path);
                  setMenuOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
