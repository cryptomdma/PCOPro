import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';
import { ProductDetailsModal } from './products/ProductDetailsModal';
import { formatProductType } from './products/productType';
import { useAuth } from '../auth';
import { getStockDisplay } from '../utils/stockDisplay';
import { ModalShell } from './ui/ModalShell';
import { useToast } from './ui/Toast';

type Product = {
  id: string;
  name: string;
  description?: string;
  epaRegNo?: string;
  sku?: string;
  codes?: Array<{ payload: string; codeType: string }>;
  category?: string | null;
  productType?: string | null;
  baseType: 'MASS' | 'VOLUME' | 'COUNT';
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  orderingUnitLabel: string;
  balances?: { onHandBase: number } | null;
  trackingToBase: number;
  checkoutToBase: number;
  orderingToBase: number;
  reorderLevelBase?: number | null;
};

type TechnicianOption = {
  id: string;
  name: string;
  licenseNumber?: string | null;
};

const BASE_TYPES = ['MASS', 'VOLUME', 'COUNT'] as const;
const CATEGORY_OPTIONS = ['CHEMICAL', 'EQUIPMENT', 'PPE', 'OTHER'] as const;
const PRODUCT_TYPE_OPTIONS = [
  'DUST',
  'GRANULE',
  'CONCENTRATE',
  'AEROSOL',
  'ANT_BAIT',
  'ROACH_BAIT',
  'RODENT_BAIT',
  'SANITATION',
  'OTHER',
] as const;

function defaultsForBaseType(baseType: Product['baseType']) {
  if (baseType === 'COUNT') {
    return {
      trackingUnitLabel: 'EACH',
      checkoutUnitLabel: 'EACH',
      orderingUnitLabel: 'EACH',
      trackingToBase: '1',
      checkoutToBase: '1',
      orderingToBase: '1',
    };
  }
  if (baseType === 'MASS') {
    return {
      trackingUnitLabel: 'lbs',
      checkoutUnitLabel: 'oz',
      orderingUnitLabel: 'lbs',
      trackingToBase: '16',
      checkoutToBase: '1',
      orderingToBase: '16',
    };
  }
  return {
    trackingUnitLabel: 'gal',
    checkoutUnitLabel: 'oz',
    orderingUnitLabel: 'gal',
    trackingToBase: '128',
    checkoutToBase: '1',
    orderingToBase: '128',
  };
}

export function ProductsView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [parLevels, setParLevels] = useState<Array<{ productId: string; locationScope: string; parBase: number }>>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'onhand-desc' | 'onhand-asc' | 'low-first'>('name-asc');
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [scopeOptions, setScopeOptions] = useState<TechnicianOption[]>([]);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const lowStockOnly = searchParams.get('filter') === 'low';
  const locationScope = 'WAREHOUSE';
  const isTech = user?.role === 'TECH';
  const canAddProduct = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [addForm, setAddForm] = useState({
    name: '',
    epaRegNo: '',
    baseType: 'MASS' as Product['baseType'],
    category: '',
    productType: '',
    ...defaultsForBaseType('MASS'),
    initialOnHand: '',
    initialScopeId: '',
  });

  async function loadProducts() {
    const res = await axios.get('/api/v1/products');
    setProducts(res.data);
  }

  useEffect(() => {
    loadProducts().catch(() => {
      showToast({ kind: 'error', message: 'Unable to load products' });
    });
  }, []);

  useEffect(() => {
    axios
      .get('/api/v1/par-levels', { params: { locationScope } })
      .then((res) => setParLevels(res.data))
      .catch(() => setParLevels([]));
  }, []);

  useEffect(() => {
    if (!canAddProduct || !addOpen) return;
    axios
      .get('/api/v1/technicians', { params: { active: true, limit: 200 } })
      .then((res) => setScopeOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setScopeOptions([]));
  }, [canAddProduct, addOpen]);

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

  const hasInitialOnHand = addForm.initialOnHand.trim() !== '';

  async function handleAddProductSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const name = addForm.name.trim();
    const epaRegNo = addForm.epaRegNo.trim();
    const trackingUnitLabel = addForm.trackingUnitLabel.trim();
    const checkoutUnitLabel = addForm.checkoutUnitLabel.trim();
    const orderingUnitLabel = addForm.orderingUnitLabel.trim();
    const trackingToBase = Number(addForm.trackingToBase);
    const checkoutToBase = Number(addForm.checkoutToBase);
    const orderingToBase = Number(addForm.orderingToBase);

    if (!name || !epaRegNo || !trackingUnitLabel || !checkoutUnitLabel || !orderingUnitLabel) {
      const message = 'Complete all required fields';
      setAddError(message);
      showToast({ kind: 'error', message });
      return;
    }
    if (
      !Number.isFinite(trackingToBase) ||
      !Number.isFinite(checkoutToBase) ||
      !Number.isFinite(orderingToBase) ||
      trackingToBase <= 0 ||
      checkoutToBase <= 0 ||
      orderingToBase <= 0
    ) {
      const message = 'Conversion multipliers must be numbers greater than 0';
      setAddError(message);
      showToast({ kind: 'error', message });
      return;
    }

    let initialOnHand: number | undefined;
    if (hasInitialOnHand) {
      initialOnHand = Number(addForm.initialOnHand);
      if (!Number.isFinite(initialOnHand) || initialOnHand < 0) {
        const message = 'Initial On-Hand must be a number greater than or equal to 0';
        setAddError(message);
        showToast({ kind: 'error', message });
        return;
      }
      if (!addForm.initialScopeId) {
        const message = 'Scope/Location is required when Initial On-Hand is provided';
        setAddError(message);
        showToast({ kind: 'error', message });
        return;
      }
    }

    const payload: Record<string, unknown> = {
      name,
      epaRegNo,
      baseType: addForm.baseType,
      category: addForm.category || undefined,
      productType: addForm.productType || undefined,
      trackingUnitLabel,
      checkoutUnitLabel,
      orderingUnitLabel,
      trackingToBase,
      checkoutToBase,
      orderingToBase,
    };
    if (initialOnHand !== undefined) {
      payload.initialOnHand = initialOnHand;
      payload.initialScopeId = addForm.initialScopeId;
    }

    setAddSaving(true);
    try {
      await axios.post('/api/v1/products', payload);
      setAddOpen(false);
      setAddForm({
        name: '',
        epaRegNo: '',
        baseType: 'MASS',
        category: '',
        productType: '',
        ...defaultsForBaseType('MASS'),
        initialOnHand: '',
        initialScopeId: '',
      });
      await loadProducts();
      showToast({ kind: 'success', message: 'Product created' });
    } catch (err: any) {
      const message =
        err?.response?.data?.message === 'Product name already exists'
          ? 'A product with that name already exists'
          : err?.response?.data?.message || 'Unable to create product';
      setAddError(message);
      showToast({ kind: 'error', message });
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Inventory List</h2>
          <p>{lowStockOnly ? 'Showing low stock items only.' : 'Mirrors Excel Inventory List with reorder flagging.'}</p>
        </div>
        <div className="header-side">
          {canAddProduct ? (
            <button type="button" onClick={() => setAddOpen(true)}>
              Add Product
            </button>
          ) : null}
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
                  {product.category ?? 'Uncategorized'} - {formatProductType(product.productType)}
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
      <ModalShell open={addOpen} title="Add Product" onClose={() => setAddOpen(false)}>
        <form className="form" onSubmit={handleAddProductSubmit}>
          {addError ? <div className="error-panel">{addError}</div> : null}
          <label>
            Name
            <input
              value={addForm.name}
              onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label>
            EPA Reg #
            <input
              value={addForm.epaRegNo}
              onChange={(e) => setAddForm((prev) => ({ ...prev, epaRegNo: e.target.value }))}
              required
            />
          </label>
          <label>
            Base Type
            <select
              value={addForm.baseType}
              onChange={(e) => {
                const nextBaseType = e.target.value as Product['baseType'];
                setAddForm((prev) => ({
                  ...prev,
                  baseType: nextBaseType,
                  ...defaultsForBaseType(nextBaseType),
                }));
              }}
            >
              {BASE_TYPES.map((baseType) => (
                <option key={baseType} value={baseType}>
                  {baseType}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category (optional)
            <select
              value={addForm.category}
              onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              <option value="">Unspecified</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type (optional)
            <select
              value={addForm.productType}
              onChange={(e) => setAddForm((prev) => ({ ...prev, productType: e.target.value }))}
            >
              <option value="">Unspecified</option>
              {PRODUCT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {formatProductType(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tracking Unit Label
            <input
              value={addForm.trackingUnitLabel}
              onChange={(e) => setAddForm((prev) => ({ ...prev, trackingUnitLabel: e.target.value }))}
              required
            />
          </label>
          <label>
            Checkout Unit Label
            <input
              value={addForm.checkoutUnitLabel}
              onChange={(e) => setAddForm((prev) => ({ ...prev, checkoutUnitLabel: e.target.value }))}
              required
            />
          </label>
          <label>
            Ordering Unit Label
            <input
              value={addForm.orderingUnitLabel}
              onChange={(e) => setAddForm((prev) => ({ ...prev, orderingUnitLabel: e.target.value }))}
              required
            />
          </label>
          <label>
            Tracking to Base
            <input
              type="number"
              min="1"
              step="1"
              value={addForm.trackingToBase}
              onChange={(e) => setAddForm((prev) => ({ ...prev, trackingToBase: e.target.value }))}
              required
            />
          </label>
          <label>
            Checkout to Base
            <input
              type="number"
              min="1"
              step="1"
              value={addForm.checkoutToBase}
              onChange={(e) => setAddForm((prev) => ({ ...prev, checkoutToBase: e.target.value }))}
              required
            />
          </label>
          <label>
            Ordering to Base
            <input
              type="number"
              min="1"
              step="1"
              value={addForm.orderingToBase}
              onChange={(e) => setAddForm((prev) => ({ ...prev, orderingToBase: e.target.value }))}
              required
            />
          </label>
          <label>
            Initial On-Hand (optional)
            <input
              type="number"
              min="0"
              step="any"
              value={addForm.initialOnHand}
              onChange={(e) => setAddForm((prev) => ({ ...prev, initialOnHand: e.target.value }))}
              placeholder="Leave blank to skip initial count"
            />
          </label>
          <label>
            Scope/Location (required if Initial On-Hand is set)
            <select
              value={addForm.initialScopeId}
              onChange={(e) => setAddForm((prev) => ({ ...prev, initialScopeId: e.target.value }))}
              required={hasInitialOnHand}
            >
              <option value="">Select scope/location</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
              {scopeOptions.map((tech) => (
                <option key={tech.id} value={`TRUCK:${tech.id}`}>
                  TRUCK: {tech.name}
                  {tech.licenseNumber ? ` (Lic #${tech.licenseNumber})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="card-row">
            <button type="submit" disabled={addSaving}>
              {addSaving ? 'Creating...' : 'Create Product'}
            </button>
            <button type="button" className="ghost-button" onClick={() => setAddOpen(false)} disabled={addSaving}>
              Cancel
            </button>
          </div>
        </form>
      </ModalShell>
    </section>
  );
}
