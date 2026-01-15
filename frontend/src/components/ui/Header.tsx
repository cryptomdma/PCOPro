import { useLocation, useNavigate } from 'react-router-dom';
import { OfflineQueueIndicator } from '../common/OfflineQueueIndicator';
import { useAuth } from '../../auth';
import { useTheme } from './theme';

const TITLE_MAP: Array<{ path: string; title: string }> = [
  { path: '/', title: 'Inventory' },
  { path: '/receiving', title: 'Incoming' },
  { path: '/checkout', title: 'Checkout' },
  { path: '/transfers', title: 'Transfers' },
  { path: '/audit', title: 'Audit Count' },
  { path: '/analytics', title: 'Analytics' },
  { path: '/login', title: 'Sign in' },
];

function titleForPath(pathname: string) {
  const match = TITLE_MAP.find((entry) => entry.path === pathname);
  return match ? match.title : 'PCOPro';
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const title = titleForPath(location.pathname);
  const canGoBack = location.pathname !== '/';

  return (
    <header className="app-header">
      <div className="header-side">
        <button type="button" className="ghost-button" onClick={() => (canGoBack ? navigate(-1) : null)}>
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
  );
}
