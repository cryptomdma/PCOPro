import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';
import { ProductDetailsModal } from './products/ProductDetailsModal';
import { formatProductType } from './products/productType';
import { useAuth } from '../auth';
import { getStockDisplay } from '../utils/stockDisplay';
import { ModalShell } from './ui/ModalShell';
import { useToast } from './ui/Toast';
import { MultiSearchableSelect } from './ui/MultiSearchableSelect';

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
  isStocked: boolean;
  isDiscontinued?: boolean;
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
const ALPHA_INDEX = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

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
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'category-asc' | 'type-asc'>('name-asc');
  const [showOutOfStock, setShowOutOfStock] = useState(true);
  const [showDoNotStock, setShowDoNotStock] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [showTopButton, setShowTopButton] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [scopeOptions, setScopeOptions] = useState<TechnicianOption[]>([]);
  const alphaRefs = useRef<Record<string, HTMLElement | null>>({});
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const lowStockOnly = searchParams.get('filter') === 'low';
  const locationScope = 'WAREHOUSE';
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

  useEffect(() => {
    function onScroll() {
      setShowTopButton(window.scrollY > 420);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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

  const categoryFilterOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.category).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [products]);

  const typeFilterOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.productType).filter(Boolean) as string[]))
      .sort((a, b) => formatProductType(a).localeCompare(formatProductType(b)))
      .map((value) => ({ value, label: formatProductType(value) }));
  }, [products]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      if (lowStockOnly && !lowStockIds.has(product.id)) return false;
      if (!showOutOfStock && (product.balances?.onHandBase ?? 0) <= 0) return false;
      if (!showDoNotStock && !product.isStocked) return false;
      if (selectedCategories.length && !selectedCategories.includes(product.category ?? '')) return false;
      if (selectedTypes.length && !selectedTypes.includes(product.productType ?? '')) return false;
      return true;
    });
  }, [products, lowStockIds, lowStockOnly, selectedCategories, selectedTypes, showDoNotStock, showOutOfStock]);

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
      if (sortBy === 'category-asc') {
        const aCategory = a.product.category ?? 'Uncategorized';
        const bCategory = b.product.category ?? 'Uncategorized';
        return aCategory.localeCompare(bCategory) || a.product.name.localeCompare(b.product.name) || a.index - b.index;
      }
      const aType = formatProductType(a.product.productType);
      const bType = formatProductType(b.product.productType);
      return aType.localeCompare(bType) || a.product.name.localeCompare(b.product.name) || a.index - b.index;
    });
    return withIndex.map((entry) => entry.product);
  }, [filteredProducts, sortBy]);

  const firstIndexByLetter = useMemo(() => {
    const lookup = new Map<string, number>();
    sortedProducts.forEach((product, index) => {
      const firstChar = product.name.trim().charAt(0).toUpperCase();
      const bucket = /[A-Z]/.test(firstChar) ? firstChar : '#';
      if (!lookup.has(bucket)) {
        lookup.set(bucket, index);
      }
    });
    return lookup;
  }, [sortedProducts]);

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

  const sortOptions = [
    { value: 'name-asc', label: 'Name A-Z' },
    { value: 'name-desc', label: 'Name Z-A' },
    { value: 'category-asc', label: 'Category A-Z' },
    { value: 'type-asc', label: 'Type A-Z' },
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
      <div className="card products-controls-card">
        <div className="card-row products-controls-row">
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
        <div className="card-row products-toggle-row">
          <label className="products-toggle">
            <input
              type="checkbox"
              checked={showOutOfStock}
              onChange={(e) => setShowOutOfStock(e.target.checked)}
            />
            Show Out-of-Stock
          </label>
          <label className="products-toggle">
            <input
              type="checkbox"
              checked={showDoNotStock}
              onChange={(e) => setShowDoNotStock(e.target.checked)}
            />
            Show Do Not Stock
          </label>
        </div>
        <div className="products-filter-list">
          <MultiSearchableSelect
            label="Category Filter"
            placeholder="Filter by category"
            values={selectedCategories}
            options={categoryFilterOptions}
            onChange={setSelectedCategories}
          />
          <MultiSearchableSelect
            label="Type Filter"
            placeholder="Filter by type"
            values={selectedTypes}
            options={typeFilterOptions}
            onChange={setSelectedTypes}
          />
        </div>
      </div>
      <div className="grid products-list-grid">
        {sortedProducts.map((product, index) => {
          const stock = getStockDisplay({
            role: user?.role,
            onHandBase: product.balances?.onHandBase ?? 0,
            trackingToBase: product.trackingToBase,
            trackingUnitLabel: product.trackingUnitLabel,
          });
          const isLow = lowStockIds.has(product.id);
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
                <div className="card-title">
                  {product.name} {isLow ? <span className="badge low">LOW</span> : null}
                  {!product.isStocked ? <span className="badge warning">DO NOT STOCK</span> : null}
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
