import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { getStockDisplay } from '../utils/stockDisplay';
import { ProductDetailsModal } from './products/ProductDetailsModal';

type Product = {
  id: string;
  name: string;
  trackingToBase: number;
  balances?: { onHandBase: number } | null;
  reorderLevelBase?: number | null;
};

type TransferRequest = { id: string };
type RecentTransferRequest = {
  id: string;
  technicianId: string;
  direction: string;
  status: string;
  createdAt: string;
  finalizedAt?: string;
};
type ParLevel = { productId: string; locationScope: string; parBase: number };

export function DashboardView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<TransferRequest[] | null>(null);
  const [parLevels, setParLevels] = useState<ParLevel[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recent, setRecent] = useState<RecentTransferRequest[] | null>(null);
  const isTech = user?.role === 'TECH';
  const locationScope = 'WAREHOUSE';

  useEffect(() => {
    if (isTech) return;
    axios.get<Product[]>('/api/v1/products').then((res) => setProducts(res.data));
  }, [isTech]);

  useEffect(() => {
    if (isTech) return;
    axios
      .get<ParLevel[]>('/api/v1/par-levels', { params: { locationScope } })
      .then((res) => setParLevels(res.data))
      .catch(() => setParLevels([]));
  }, [isTech]);

  useEffect(() => {
    if (!isTech) return;
    axios
      .get<RecentTransferRequest[]>('/api/v1/transfer-requests', { params: { includeClosed: true, limit: 20 } })
      .then((res) => {
        const filtered = res.data.filter((req) => req.technicianId === user?.technicianId);
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRecent(filtered.slice(0, 10));
      })
      .catch(() => setRecent([]));
  }, [isTech, user?.technicianId]);

  useEffect(() => {
    axios
      .get<TransferRequest[]>('/api/v1/transfer-requests', { params: { status: 'SUBMITTED,ACK_PENDING,DISPUTED' } })
      .then((res) => setRequests(res.data))
      .catch(() => setRequests(null));
  }, []);

  const parByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const par of parLevels) {
      map.set(par.productId, par.parBase);
    }
    return map;
  }, [parLevels]);

  const lowStockProducts = useMemo(() => {
    return products.filter((product) => {
      const parBase = parByProduct.get(product.id);
      if (parBase === undefined) return false;
      const onHandBase = product.balances?.onHandBase ?? 0;
      return onHandBase < parBase;
    });
  }, [products, parByProduct]);

  if (isTech) {
    return (
      <section>
        <header className="section-header">
          <div>
            <h2>Dashboard</h2>
            <p>Recent transactions for your truck.</p>
          </div>
        </header>
        <div className="card-stack">
          <h4>Recent activity</h4>
          <ul className="activity">
            {recent?.map((req) => (
              <li key={req.id}>
                <div className="card-stack">
                  <strong>{req.direction}</strong>
                  <div className="muted">Status: {req.status}</div>
                  <div className="muted">
                    {req.finalizedAt
                      ? `Finalized ${new Date(req.finalizedAt).toLocaleString()}`
                      : `Created ${new Date(req.createdAt).toLocaleString()}`}
                  </div>
                </div>
              </li>
            ))}
            {recent && recent.length === 0 ? <li>No recent transactions</li> : null}
            {!recent ? <li>Loading...</li> : null}
          </ul>
        </div>
      </section>
    );
  }

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
          <div className="dashboard-value">{lowStockProducts.length}</div>
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

      <div className="card-stack">
        <h4>Low Stock (Par)</h4>
        {lowStockProducts.length ? (
          <ul className="activity">
            {lowStockProducts.map((product) => {
              const parBase = parByProduct.get(product.id) ?? 0;
              const parTracking = product.trackingToBase ? Math.round((parBase / product.trackingToBase) * 100) / 100 : 0;
              const stock = getStockDisplay({
                role: user?.role,
                onHandBase: product.balances?.onHandBase ?? 0,
                trackingToBase: product.trackingToBase,
                trackingUnitLabel: product.trackingUnitLabel,
              });
              return (
                <li key={product.id} className="clickable" onClick={() => setSelectedProduct(product)}>
                  <div className="card-stack">
                    <strong>{product.name}</strong>
                    <div className="muted">
                      On-hand: {stock.label} | Par: {parTracking} {product.trackingUnitLabel}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="muted">No low stock items at current par levels.</div>
        )}
      </div>

      <ProductDetailsModal open={Boolean(selectedProduct)} product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </section>
  );
}
