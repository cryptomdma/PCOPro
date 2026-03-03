import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProductsView } from './components/ProductsView';
import { ReceivingView } from './components/ReceivingView';
import { CheckoutView } from './components/CheckoutView';
import { AnalyticsPreview } from './components/AnalyticsPreview';
import { AuditCountView } from './components/AuditCountView';
import { OrdersView } from './components/OrdersView';
import { EquipmentView } from './components/EquipmentView';
import { OrderingView } from './components/OrderingView';
import { Header } from './components/ui/Header';
import { BottomNav } from './components/ui/BottomNav';
import { ToastHost } from './components/ui/Toast';
import { DashboardView } from './components/DashboardView';
import { RequireManagerOrAdmin } from './components/RequireRole';
import { SettingsView } from './components/SettingsView';

export default function App() {
  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'number') return;
      if (target.readOnly || target.disabled) return;
      if (target.dataset.selectOnFocus === 'off') return;
      requestAnimationFrame(() => {
        if (document.activeElement === target) {
          target.select();
        }
      });
    }
    document.addEventListener('focusin', handleFocusIn, true);
    return () => document.removeEventListener('focusin', handleFocusIn, true);
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/inventory" element={<ProductsView />} />
          <Route path="/products" element={<ProductsView />} />
          <Route path="/equipment" element={<EquipmentView />} />
          <Route path="/receiving" element={<ReceivingView />} />
          <Route path="/ordering" element={<RequireManagerOrAdmin><OrderingView /></RequireManagerOrAdmin>} />
          <Route path="/checkout" element={<CheckoutView />} />
          <Route path="/requests" element={<OrdersView />} />
          <Route path="/orders" element={<OrdersView />} />
          <Route path="/transfers" element={<OrdersView />} />
          <Route path="/audit" element={<RequireManagerOrAdmin><AuditCountView /></RequireManagerOrAdmin>} />
          <Route path="/analytics" element={<RequireManagerOrAdmin><AnalyticsPreview /></RequireManagerOrAdmin>} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
      <BottomNav />
      <ToastHost />
    </div>
  );
}
