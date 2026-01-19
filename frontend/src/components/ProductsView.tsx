import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { Link, useLocation } from 'react-router-dom';
import { ModalShell } from './ui/ModalShell';

type Product = {
  id: string;
  name: string;
  description?: string;
  epaRegNo?: string;
  category?: string | null;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  balances?: { onHandBase: number } | null;
  trackingToBase: number;
  reorderLevelBase?: number | null;
};

export function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const lowStockOnly = searchParams.get('filter') === 'low';

  useEffect(() => {
    axios.get('/api/v1/products').then((res) => setProducts(res.data));
  }, []);

  const lowStockIds = useMemo(() => {
    const ids = new Set<string>();
    for (const product of products) {
      if (!product.reorderLevelBase || product.reorderLevelBase <= 0) continue;
      const onHandBase = product.balances?.onHandBase ?? 0;
      const onHandTracking = onHandBase / product.trackingToBase;
      const reorderTracking = product.reorderLevelBase / product.trackingToBase;
      if (onHandTracking <= reorderTracking) {
        ids.add(product.id);
      }
    }
    return ids;
  }, [products]);

  const visibleProducts = useMemo(() => {
    if (!lowStockOnly) return products;
    return products.filter((product) => lowStockIds.has(product.id));
  }, [products, lowStockIds, lowStockOnly]);

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Inventory List</h2>
          <p>{lowStockOnly ? 'Showing low stock items only.' : 'Mirrors Excel Inventory List with reorder flagging.'}</p>
        </div>
        <div className="header-side">
          <Link to="/equipment" className="ghost-button">
            Equipment
          </Link>
        </div>
      </header>
      <div className="grid">
        {visibleProducts.map((product) => {
          const onHandTracking = product.balances ? product.balances.onHandBase / product.trackingToBase : 0;
          const isLow = lowStockIds.has(product.id);
          return (
            <article key={product.id} className="card clickable" onClick={() => setSelected(product)}>
              <div>
                <div className="card-title">
                  {product.name} {isLow ? <span className="badge low">LOW</span> : null}
                </div>
                <p className="muted">EPA: {product.epaRegNo ?? 'N/A'}</p>
                <p>
                  On-hand: <strong>{onHandTracking}</strong> {product.trackingUnitLabel}
                </p>
                <p>{product.description || 'No description provided.'}</p>
              </div>
            </article>
          );
        })}
      </div>
      <ModalShell open={Boolean(selected)} title={selected?.name} onClose={() => setSelected(null)}>
        {selected ? (
          <div className="card-stack">
            <div>
              <div className="muted">Product ID</div>
              <div>{selected.id}</div>
            </div>
            <div>
              <div className="muted">EPA</div>
              <div>{selected.epaRegNo ?? 'N/A'}</div>
            </div>
            <div>
              <div className="muted">Description</div>
              <div>{selected.description || 'No description provided.'}</div>
            </div>
            <div>
              <div className="muted">Category</div>
              <div>{selected.category || '—'}</div>
            </div>
            <div>
              <div className="muted">QR Code</div>
              <div className="qr-preview">
                <QRCodeCanvas value={`MGPC:prod:${selected.id}`} size={160} />
              </div>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </section>
  );
}
