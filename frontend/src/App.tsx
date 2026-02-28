import { Route, Routes } from 'react-router-dom';
import { ProductsView } from './components/ProductsView';
import { ReceivingView } from './components/ReceivingView';
import { CheckoutView } from './components/CheckoutView';
import { AnalyticsPreview } from './components/AnalyticsPreview';
import { AuditCountView } from './components/AuditCountView';
import { OrdersView } from './components/OrdersView';
import { EquipmentView } from './components/EquipmentView';
import { Header } from './components/ui/Header';
import { BottomNav } from './components/ui/BottomNav';
import { ToastHost } from './components/ui/Toast';
import { DashboardView } from './components/DashboardView';
import { RequireNonTech } from './components/RequireRole';
import { SettingsView } from './components/SettingsView';

export default function App() {
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
          <Route path="/checkout" element={<CheckoutView />} />
          <Route path="/requests" element={<OrdersView />} />
          <Route path="/orders" element={<OrdersView />} />
          <Route path="/transfers" element={<OrdersView />} />
          <Route path="/audit" element={<AuditCountView />} />
          <Route path="/analytics" element={<RequireNonTech><AnalyticsPreview /></RequireNonTech>} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
      <BottomNav />
      <ToastHost />
    </div>
  );
}
