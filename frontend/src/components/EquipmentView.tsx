import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { ModalShell } from './ui/ModalShell';
import { useAuth } from '../auth';
import { getStockDisplay } from '../utils/stockDisplay';

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
const ALPHA_INDEX = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

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
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [showTopButton, setShowTopButton] = useState(false);
  const alphaRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    axios.get('/api/v1/products').then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowTopButton(window.scrollY > 420);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const equipment = useMemo(() => {
    const filtered = products.filter((product) => product.trackingMode === 'EQUIPMENT');
    if (typeFilter === 'All') return filtered;
    return filtered.filter((product) => equipmentType(product) === typeFilter);
  }, [products, typeFilter]);

  const firstIndexByLetter = useMemo(() => {
    const lookup = new Map<string, number>();
    equipment.forEach((product, index) => {
      const firstChar = product.name.trim().charAt(0).toUpperCase();
      const bucket = /[A-Z]/.test(firstChar) ? firstChar : '#';
      if (!lookup.has(bucket)) {
        lookup.set(bucket, index);
      }
    });
    return lookup;
  }, [equipment]);

  function scrollToLetter(letter: string) {
    const currentIndex = ALPHA_INDEX.indexOf(letter);
    if (currentIndex < 0) return;
    for (let i = currentIndex; i < ALPHA_INDEX.length; i += 1) {
      const nextLetter = ALPHA_INDEX[i];
      if (firstIndexByLetter.has(nextLetter)) {
        alphaRefs.current[nextLetter]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Equipment</h2>
          <p>Tracked equipment and gear that can be issued or requested.</p>
        </div>
        <div className="header-side">
          <Link to="/inventory" className="ghost-button">
            Inventory
          </Link>
        </div>
      </header>

      <div className="card products-controls-card">
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

      <div className="grid products-list-grid">
        {equipment.map((product, index) => {
          const stock = getStockDisplay({
            role: user?.role,
            onHandBase: product.balances?.onHandBase ?? 0,
            trackingToBase: product.trackingToBase,
            trackingUnitLabel: product.trackingUnitLabel,
          });
          const firstChar = product.name.trim().charAt(0).toUpperCase();
          const alphaBucket = /[A-Z]/.test(firstChar) ? firstChar : '#';
          const shouldAnchor = firstIndexByLetter.get(alphaBucket) === index;
          return (
            <article
              key={product.id}
              ref={shouldAnchor ? (node) => { alphaRefs.current[alphaBucket] = node; } : undefined}
              className="card clickable"
              onClick={() => setSelected(product)}
            >
              <div>
                <div className="card-title">{product.name}</div>
                <p className="muted">Type: {equipmentType(product)}</p>
                <p>
                  On-hand: <strong>{stock.label}</strong>
                </p>
                <p>{product.description || 'No description provided.'}</p>
              </div>
            </article>
          );
        })}
      </div>
      <div className="products-alpha-dex" aria-label="Alphabet quick jump">
        {ALPHA_INDEX.map((letter) => (
          <button type="button" key={letter} onClick={() => scrollToLetter(letter)}>
            {letter}
          </button>
        ))}
      </div>
      {showTopButton ? (
        <button
          type="button"
          className="products-top-button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Top
        </button>
      ) : null}

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
