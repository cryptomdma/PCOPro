import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { Link } from 'react-router-dom';
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
  category?: string;
  trackingMode?: 'EQUIPMENT' | 'BULK';
};

const EQUIPMENT_TYPES = ['All', 'PPE', 'Exclusion gear', 'Cameras', 'Loaners', 'Termite tools'];

function equipmentType(product: Product): string {
  if (product.category === 'PPE') return 'PPE';
  const haystack = `${product.name} ${product.description ?? ''}`.toLowerCase();
  if (haystack.includes('camera')) return 'Cameras';
  if (haystack.includes('loaner')) return 'Loaners';
  if (haystack.includes('termite')) return 'Termite tools';
  if (haystack.includes('exclusion')) return 'Exclusion gear';
  return 'Other';
}

export function EquipmentView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('All');

  useEffect(() => {
    axios.get('/api/v1/products').then((res) => setProducts(res.data));
  }, []);

  const equipment = useMemo(() => {
    const filtered = products.filter((product) => product.trackingMode === 'EQUIPMENT');
    if (typeFilter === 'All') return filtered;
    return filtered.filter((product) => equipmentType(product) === typeFilter);
  }, [products, typeFilter]);

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Equipment</h2>
          <p>Tracked equipment and gear that can be issued or requested.</p>
        </div>
        <div className="header-side">
          <Link to="/" className="ghost-button">
            Products
          </Link>
          <OfflineTag />
        </div>
      </header>

      <div className="card">
        <label>
          Equipment type
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {EQUIPMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid">
        {equipment.map((product) => {
          const onHandTracking = product.balances ? product.balances.onHandBase / product.trackingToBase : 0;
          return (
            <article key={product.id} className="card clickable" onClick={() => setSelected(product)}>
              <div>
                <div className="card-title">{product.name}</div>
                <p className="muted">Type: {equipmentType(product)}</p>
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
              <div className="muted">Type</div>
              <div>{equipmentType(selected)}</div>
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
