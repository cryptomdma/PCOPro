import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';

type NavItem = {
  path: string;
  label: string;
};

function navItemsFor(role?: string): NavItem[] {
  if (role === 'TECH') {
    return [
      { path: '/', label: 'Home' },
      { path: '/checkout', label: 'Checkout/Return' },
      { path: '/requests', label: 'Requests' },
    ];
  }
  if (role === 'MANAGER' || role === 'ADMIN') {
    return [
      { path: '/', label: 'Home' },
      { path: '/checkout', label: 'Issue' },
      { path: '/receiving', label: 'Receiving' },
      { path: '/ordering', label: 'Ordering' },
      { path: '/requests', label: 'Requests' },
      { path: '/products', label: 'Products' },
    ];
  }
  return [
    { path: '/', label: 'Home' },
    { path: '/checkout', label: 'Issue' },
    { path: '/receiving', label: 'Receiving' },
    { path: '/requests', label: 'Requests' },
  ];
}

export function BottomNav() {
  const { user } = useAuth();
  const role = user?.role;
  const items = navItemsFor(role);

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
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
