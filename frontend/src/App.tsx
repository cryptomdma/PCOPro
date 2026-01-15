import { Route, Routes } from 'react-router-dom';
import { ProductsView } from './components/ProductsView';
import { ReceivingView } from './components/ReceivingView';
import { CheckoutView } from './components/CheckoutView';
import { AnalyticsPreview } from './components/AnalyticsPreview';
import { AuditCountView } from './components/AuditCountView';
import { TransferRequestsView } from './components/TransferRequestsView';
import { Header } from './components/ui/Header';
import { BottomNav } from './components/ui/BottomNav';
import { ToastHost } from './components/ui/Toast';

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<ProductsView />} />
          <Route path="/receiving" element={<ReceivingView />} />
          <Route path="/checkout" element={<CheckoutView />} />
          <Route path="/transfers" element={<TransferRequestsView />} />
          <Route path="/audit" element={<AuditCountView />} />
          <Route path="/analytics" element={<AnalyticsPreview />} />
        </Routes>
      </main>
      <BottomNav />
      <ToastHost />
    </div>
  );
}
