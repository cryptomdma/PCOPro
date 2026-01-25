import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';
import { ProductDetailsModal } from './products/ProductDetailsModal';
import { formatProductType } from './products/productType';
import { useAuth } from '../auth';
import { getStockDisplay } from '../utils/stockDisplay';

type Product = {
  id: string;
  name: string;
  description?: string;
  epaRegNo?: string;
  category?: string | null;
  productType?: string | null;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  balances?: { onHandBase: number } | null;
  trackingToBase: number;
  reorderLevelBase?: number | null;
};

export function ProductsView() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [parLevels, setParLevels] = useState<Array<{ productId: string; locationScope: string; parBase: number }>>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [epaFile, setEpaFile] = useState<File | null>(null);
  const [epaResult, setEpaResult] = useState<any | null>(null);
  const [epaError, setEpaError] = useState<string | null>(null);
  const [epaUploading, setEpaUploading] = useState(false);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const lowStockOnly = searchParams.get('filter') === 'low';
  const locationScope = 'WAREHOUSE';

  useEffect(() => {
    axios.get('/api/v1/products').then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    axios
      .get('/api/v1/par-levels', { params: { locationScope } })
      .then((res) => setParLevels(res.data))
      .catch(() => setParLevels([]));
  }, []);

  const lowStockIds = useMemo(() => {
    const parByProduct = new Map(parLevels.map((par) => [par.productId, par.parBase]));
    const ids = new Set<string>();
    for (const product of products) {
      const parBase = parByProduct.get(product.id);
      if (parBase === undefined) continue;
      const onHandBase = product.balances?.onHandBase ?? 0;
      if (onHandBase < parBase) {
        ids.add(product.id);
      }
    }
    return ids;
  }, [products, parLevels]);

  const visibleProducts = useMemo(() => {
    if (!lowStockOnly) return products;
    return products.filter((product) => lowStockIds.has(product.id));
  }, [products, lowStockIds, lowStockOnly]);

  async function uploadEpaCsv() {
    if (!epaFile) {
      setEpaError('Select a CSV file first.');
      return;
    }
    setEpaError(null);
    setEpaUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', epaFile);
      const response = await axios.post('/api/v1/products/epa-import', formData);
      setEpaResult(response.data);
    } catch (err: any) {
      setEpaError(err?.response?.data?.message || 'EPA import failed.');
      setEpaResult(null);
    } finally {
      setEpaUploading(false);
    }
  }

  const canImportEpa = user?.role === 'ADMIN' || user?.role === 'MANAGER';

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
      {canImportEpa ? (
        <div className="card">
          <h4>EPA Import</h4>
          <p className="muted">Upload a CSV to update EPA numbers for existing products.</p>
          <div className="card-row">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setEpaFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={uploadEpaCsv} disabled={epaUploading}>
              {epaUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {epaError ? <div className="error-panel">{epaError}</div> : null}
          {epaResult ? (
            <div className="card-stack">
              <div className="muted">
                Rows: {epaResult.rowsRead} | Updated: {epaResult.updatedCount} | Skipped: {epaResult.skippedCount} | Failed:{' '}
                {epaResult.failedCount}
              </div>
              {epaResult.failures?.length ? (
                <textarea
                  readOnly
                  rows={Math.min(8, epaResult.failures.length + 1)}
                  value={epaResult.failures
                    .map((failure: any) => `Row ${failure.rowIndex} (${failure.identifier}): ${failure.reason}`)
                    .join('\n')}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid">
        {visibleProducts.map((product) => {
          const stock = getStockDisplay({
            role: user?.role,
            onHandBase: product.balances?.onHandBase ?? 0,
            trackingToBase: product.trackingToBase,
            trackingUnitLabel: product.trackingUnitLabel,
          });
          const isLow = lowStockIds.has(product.id);
          return (
            <article key={product.id} className="card clickable" onClick={() => setSelected(product)}>
              <div>
                <div className="card-title">
                  {product.name} {isLow ? <span className="badge low">LOW</span> : null}
                </div>
                <p className="muted">EPA: {product.epaRegNo ?? 'N/A'}</p>
                <p className="muted">
                  {product.category ?? 'Uncategorized'} • {formatProductType(product.productType)}
                </p>
                <p>
                  On-hand: <strong>{stock.label}</strong>
                </p>
                <p>{product.description || 'No description provided.'}</p>
              </div>
            </article>
          );
        })}
      </div>
      <ProductDetailsModal open={Boolean(selected)} product={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
