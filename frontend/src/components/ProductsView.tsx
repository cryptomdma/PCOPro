import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { OfflineTag } from './common/OfflineTag';

type Product = {
  id: string;
  name: string;
  description?: string;
  epaRegNo?: string;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  balances?: { onHandBase: number } | null;
  trackingToBase: number;
};

export function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    axios.get('/api/v1/products').then((res) => setProducts(res.data));
  }, []);

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Inventory List</h2>
          <p>Mirrors Excel Inventory List with reorder flagging.</p>
        </div>
        <OfflineTag />
      </header>
      <div className="grid">
        {products.map((product) => {
          const onHandTracking = product.balances ? product.balances.onHandBase / product.trackingToBase : 0;
          return (
            <article key={product.id} className="card">
              <div className="card-body">
                <div className="card-title">{product.name}</div>
                <p className="muted">EPA: {product.epaRegNo ?? '—'}</p>
                <p>
                  On-hand: <strong>{onHandTracking}</strong> {product.trackingUnitLabel}
                </p>
                <p>{product.description}</p>
              </div>
              <div className="qr-preview">
                <QRCodeCanvas value={`MGPC:prod:${product.id}`} size={96} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
