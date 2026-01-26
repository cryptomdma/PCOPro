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
  sku?: string;
  codes?: Array<{ payload: string; codeType: string }>;
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
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'onhand-desc' | 'onhand-asc' | 'low-first'>('name-asc');
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const lowStockOnly = searchParams.get('filter') === 'low';
  const locationScope = 'WAREHOUSE';
  const isTech = user?.role === 'TECH';

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

  const parByProduct = useMemo(() => {
    return new Map(parLevels.map((par) => [par.productId, par.parBase]));
  }, [parLevels]);

  const visibleProducts = useMemo(() => {
    if (!lowStockOnly) return products;
    return products.filter((product) => lowStockIds.has(product.id));
  }, [products, lowStockIds, lowStockOnly]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return visibleProducts;
    return visibleProducts.filter((product) => {
      const sku = product.codes?.find((code) => code.codeType === 'sku')?.payload ?? product.sku ?? '';
      const haystack = [product.name, product.epaRegNo, sku].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [visibleProducts, search]);

  const sortedProducts = useMemo(() => {
    const withIndex = filteredProducts.map((product, index) => ({ product, index }));
    withIndex.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.product.name.localeCompare(b.product.name) || a.index - b.index;
      }
      if (sortBy === 'name-desc') {
        return b.product.name.localeCompare(a.product.name) || a.index - b.index;
      }
      if (sortBy === 'onhand-desc') {
        const aOnHand = a.product.balances?.onHandBase ?? 0;
        const bOnHand = b.product.balances?.onHandBase ?? 0;
        return bOnHand - aOnHand || a.product.name.localeCompare(b.product.name) || a.index - b.index;
      }
      if (sortBy === 'onhand-asc') {
        const aOnHand = a.product.balances?.onHandBase ?? 0;
        const bOnHand = b.product.balances?.onHandBase ?? 0;
        return aOnHand - bOnHand || a.product.name.localeCompare(b.product.name) || a.index - b.index;
      }
      const aPar = parByProduct.get(a.product.id);
      const bPar = parByProduct.get(b.product.id);
      const aLow = aPar !== undefined && (a.product.balances?.onHandBase ?? 0) < aPar;
      const bLow = bPar !== undefined && (b.product.balances?.onHandBase ?? 0) < bPar;
      if (aLow !== bLow) return aLow ? -1 : 1;
      return a.product.name.localeCompare(b.product.name) || a.index - b.index;
    });
    return withIndex.map((entry) => entry.product);
  }, [filteredProducts, sortBy, parByProduct]);

  const sortOptions = [
    { value: 'name-asc', label: 'Name A-Z' },
    { value: 'name-desc', label: 'Name Z-A' },
    ...(isTech
      ? []
      : [
          { value: 'onhand-desc', label: 'On-hand high-low' },
          { value: 'onhand-asc', label: 'On-hand low-high' },
          { value: 'low-first', label: 'Low stock first' },
        ]),
  ];

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
      <div className="card">
        <div className="card-row">
          <label>
            Search
            <input
              type="text"
              placeholder="Search name, SKU, EPA"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="grid">
        {sortedProducts.map((product) => {
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
