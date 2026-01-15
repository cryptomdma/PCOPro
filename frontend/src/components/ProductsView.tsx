import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { OfflineTag } from './common/OfflineTag';
import { ModalShell } from './ui/ModalShell';

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
  const [selected, setSelected] = useState<Product | null>(null);

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
            <article key={product.id} className="card clickable" onClick={() => setSelected(product)}>
              <div>
                <div className="card-title">{product.name}</div>
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
