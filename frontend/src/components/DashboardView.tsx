import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

type Product = {
  id: string;
  name: string;
  trackingToBase: number;
  balances?: { onHandBase: number } | null;
  reorderLevelBase?: number | null;
};

type TransferRequest = { id: string };

export function DashboardView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<TransferRequest[] | null>(null);

  useEffect(() => {
    axios.get<Product[]>('/api/v1/products').then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    axios
      .get<TransferRequest[]>('/api/v1/transfer-requests', { params: { status: 'SUBMITTED,ACK_PENDING,DISPUTED' } })
      .then((res) => setRequests(res.data))
      .catch(() => setRequests(null));
  }, []);

  const lowStockCount = useMemo(() => {
    return products.filter((product) => {
      if (!product.reorderLevelBase || product.reorderLevelBase <= 0) return false;
      const onHandBase = product.balances?.onHandBase ?? 0;
      const onHandTracking = onHandBase / product.trackingToBase;
      const reorderLevelTracking = product.reorderLevelBase / product.trackingToBase;
      return onHandTracking <= reorderLevelTracking;
    }).length;
  }, [products]);

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Dashboard</h2>
          <p>Quick status and shortcuts for daily work.</p>
        </div>
      </header>

      <div className="dashboard-grid">
        <Link to="/inventory?filter=low" className="dashboard-card">
          <div className="card-title">Low Stock</div>
          <div className="dashboard-value">{lowStockCount}</div>
          <div className="muted">Needs attention</div>
        </Link>
        <Link to="/inventory" className="dashboard-card">
          <div className="card-title">Total Products</div>
          <div className="dashboard-value">{products.length}</div>
          <div className="muted">Inventory items</div>
        </Link>
        <Link to="/orders" className="dashboard-card">
          <div className="card-title">Pending Requests</div>
          <div className="dashboard-value">{requests ? requests.length : '—'}</div>
          <div className="muted">{requests ? 'Open requests' : 'Coming soon'}</div>
        </Link>
      </div>

      <div className="dashboard-grid">
        <Link to="/inventory" className="dashboard-card">
          <div className="card-title">Inventory</div>
          <div className="muted">View stock</div>
        </Link>
        <Link to="/checkout" className="dashboard-card">
          <div className="card-title">Issue / Checkout</div>
          <div className="muted">Create request</div>
        </Link>
        <Link to="/orders" className="dashboard-card">
          <div className="card-title">Orders</div>
          <div className="muted">Queue &amp; history</div>
        </Link>
        <Link to="/receiving" className="dashboard-card">
          <div className="card-title">Receiving</div>
          <div className="muted">Log inbound</div>
        </Link>
        <Link to="/analytics" className="dashboard-card">
          <div className="card-title">Analytics</div>
          <div className="muted">Usage insights</div>
        </Link>
      </div>
    </section>
  );
}
