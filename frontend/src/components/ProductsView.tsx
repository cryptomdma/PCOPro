import { useCallback, useEffect, useMemo, useState } from 'react';
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
  isStocked: boolean;
  isDiscontinued: boolean;
};

type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
};

export function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockedOnly, setStockedOnly] = useState(true);
  const [includeDiscontinued, setIncludeDiscontinued] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const adminImportEnabled = useMemo(() => import.meta.env.VITE_ENABLE_IMPORT === 'true', []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/v1/products', {
        params: {
          stockedOnly,
          includeDiscontinued,
          search: search || undefined,
        },
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setProducts(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError('Unable to load products. Please check API connectivity.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [includeDiscontinued, search, stockedOnly]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const triggerImport = async () => {
    setError(null);
    try {
      const res = await axios.post('/api/v1/import/products');
      setImportSummary(res.data);
      fetchProducts();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError('Import failed. Ensure CSV files are present and API is reachable.');
    }
  };

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Inventory List</h2>
          <p>Mirrors Excel Inventory List with reorder flagging.</p>
        </div>
        <OfflineTag />
      </header>

      <div className="filter-row">
        <label>
          <input type="checkbox" checked={stockedOnly} onChange={(e) => setStockedOnly(e.target.checked)} />
          Stocked only
        </label>
        <label>
          <input type="checkbox" checked={includeDiscontinued} onChange={(e) => setIncludeDiscontinued(e.target.checked)} />
          Include discontinued
        </label>
        <input
          placeholder="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={fetchProducts}
        />
        <button onClick={fetchProducts} disabled={loading}>
          Refresh
        </button>
        {adminImportEnabled ? (
          <button onClick={triggerImport} disabled={loading}>
            Run import
          </button>
        ) : null}
      </div>

      {importSummary ? (
        <div className="import-summary">
          Imported: created {importSummary.created}, updated {importSummary.updated}, skipped {importSummary.skipped}. Warnings: {importSummary.warnings?.length ?? 0}
        </div>
      ) : null}

      {error ? (
        <div className="error-panel">
          <p>{error}</p>
          <button onClick={fetchProducts}>Retry</button>
        </div>
      ) : null}

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
                <div className="card-badges">
                  {!product.isStocked ? <span className="badge muted">Not stocked</span> : null}
                  {product.isDiscontinued ? <span className="badge warn">Discontinued</span> : null}
                </div>
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
