import { Link, Route, Routes } from 'react-router-dom';
import { ProductsView } from './components/ProductsView';
import { ReceivingView } from './components/ReceivingView';
import { CheckoutView } from './components/CheckoutView';
import { AnalyticsPreview } from './components/AnalyticsPreview';
import { OfflineQueueIndicator } from './components/common/OfflineQueueIndicator';
import { AuditCountView } from './components/AuditCountView';
import { TransferRequestsView } from './components/TransferRequestsView';
import { useAuth } from './auth';

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>PCO Inventory</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <OfflineQueueIndicator />
          {user ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>{user.email}</span>
              <span className="muted">{user.role}</span>
              <button type="button" onClick={logout}>
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <nav className="app-nav">
        <Link to="/">Inventory</Link>
        <Link to="/receiving">Incoming</Link>
        <Link to="/checkout">Checkout</Link>
        <Link to="/transfers">Transfers</Link>
        <Link to="/audit">Audit Count</Link>
        <Link to="/analytics">Analytics</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<ProductsView />} />
          <Route path="/receiving" element={<ReceivingView />} />
          <Route path="/checkout" element={<CheckoutView />} />
          <Route path="/transfers" element={<TransferRequestsView />} />
          <Route path="/audit" element={<AuditCountView />} />
          <Route path="/analytics" element={<AnalyticsPreview />} />
        </Routes>
      </main>
    </div>
  );
}
