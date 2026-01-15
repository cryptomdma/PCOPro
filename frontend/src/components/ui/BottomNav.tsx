import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';

type NavItem = {
  path: string;
  label: string;
  roles?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Inventory' },
  { path: '/receiving', label: 'Incoming', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { path: '/checkout', label: 'Checkout', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { path: '/transfers', label: 'Transfers' },
  { path: '/audit', label: 'Audit', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { path: '/analytics', label: 'Analytics', roles: ['ADMIN', 'MANAGER'] },
];

export function BottomNav() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.filter((item) => !item.roles || (role ? item.roles.includes(role) : false)).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `bottom-nav-link${isActive ? ' active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
