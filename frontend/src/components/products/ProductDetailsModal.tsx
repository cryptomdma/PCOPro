import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { ModalShell } from '../ui/ModalShell';
import { formatProductType } from './productType';
import { useAuth } from '../../auth';
import { getStockDisplay } from '../../utils/stockDisplay';

const CATEGORY_OPTIONS = ['CHEMICAL', 'EQUIPMENT', 'PPE', 'OTHER'];
const PRODUCT_TYPES = [
  'DUST',
  'GRANULE',
  'CONCENTRATE',
  'AEROSOL',
  'ANT_BAIT',
  'ROACH_BAIT',
  'RODENT_BAIT',
  'SANITATION',
  'OTHER',
];
const BASE_TYPES = ['MASS', 'VOLUME', 'COUNT'];

export type ProductDetails = {
  id: string;
  name: string;
  baseType?: string;
  category?: string | null;
  epaRegNo?: string | null;
  description?: string | null;
  productType?: string | null;
  trackingUnitLabel?: string;
  checkoutUnitLabel?: string;
  orderingUnitLabel?: string;
  trackingToBase?: number;
  checkoutToBase?: number;
  orderingToBase?: number;
  balances?: { onHandBase: number } | null;
  codes?: Array<{ payload: string; codeType: string }>;
  defaultCostPerBase?: number | string | null;
  isStocked?: boolean;
};

export function ProductDetailsModal({
  open,
  product,
  readOnly = false,
  onClose,
}: {
  open: boolean;
  product: ProductDetails | null;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [parBase, setParBase] = useState<number | null>(null);
  const [parInput, setParInput] = useState('');
  const [parError, setParError] = useState<string | null>(null);
  const locationScope = 'WAREHOUSE';
  const canEditProduct = !readOnly && (user?.role === 'ADMIN' || user?.role === 'MANAGER');
  const canEditPar = !readOnly && (user?.role === 'ADMIN' || user?.role === 'MANAGER');
  const showPar = user?.role !== 'TECH';
  const showCost = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const activeProduct = detail ?? product;

  const [form, setForm] = useState({
    sku: '',
    name: '',
    baseType: '',
    category: '',
    productType: '',
    trackingUnitLabel: '',
    checkoutUnitLabel: '',
    orderingUnitLabel: '',
    trackingToBase: '',
    checkoutToBase: '',
    orderingToBase: '',
    epaRegNo: '',
    description: '',
    costQty: '',
    costPrice: '',
    isStocked: true,
  });

  const stock = getStockDisplay({
    role: user?.role,
    onHandBase: activeProduct?.balances?.onHandBase ?? 0,
    trackingToBase: activeProduct?.trackingToBase ?? null,
    trackingUnitLabel: activeProduct?.trackingUnitLabel ?? null,
  });
  const showParEditor = canEditPar && editMode;
  const onHandBase = activeProduct?.balances?.onHandBase ?? 0;
  const hasPar = parBase !== null;
  const isLow = hasPar && onHandBase < (parBase ?? 0);
  const statusLabel = isLow ? 'Low Stock' : stock.inStock ? 'In Stock' : 'Out of Stock';
  const statusTone = isLow ? 'warning' : stock.inStock ? 'good' : 'neutral';

  const parTracking = useMemo(() => {
    if (parBase === null || !activeProduct?.trackingToBase) return null;
    return Math.round((parBase / activeProduct.trackingToBase) * 100) / 100;
  }, [parBase, activeProduct?.trackingToBase]);

  const costBase = useMemo(() => {
    const value = activeProduct?.defaultCostPerBase;
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }, [activeProduct?.defaultCostPerBase]);

  const derivedCostBase = useMemo(() => {
    if (!editMode) return costBase;
    const qty = Number(form.costQty);
    const price = Number(form.costPrice);
    const trackingToBase = activeProduct?.trackingToBase ?? 0;
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0 || !trackingToBase) {
      return null;
    }
    const baseQty = qty * trackingToBase;
    return baseQty ? price / baseQty : null;
  }, [editMode, form.costQty, form.costPrice, activeProduct?.trackingToBase, costBase]);

  const costPerTracking = useMemo(() => {
    if (derivedCostBase === null || !activeProduct?.trackingToBase) return null;
    return derivedCostBase * activeProduct.trackingToBase;
  }, [derivedCostBase, activeProduct?.trackingToBase]);
  const onHandValue = useMemo(() => {
    if (costBase === null) return null;
    const onHand = activeProduct?.balances?.onHandBase ?? 0;
    return onHand * costBase;
  }, [activeProduct?.balances?.onHandBase, costBase]);

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return `$${value.toFixed(2)}`;
  };
  const displayCostBase = editMode ? derivedCostBase : costBase;
  const onHandValueLabel = !showCost ? 'Unavailable' : onHandValue === null ? 'N/A' : formatCurrency(onHandValue);

  useEffect(() => {
    if (!open || !product) return;
    setLoading(true);
    axios
      .get<ProductDetails>(`/api/v1/products/${product.id}`)
      .then((res) => setDetail(res.data))
      .catch(() => setDetail(product))
      .finally(() => setLoading(false));
  }, [open, product]);

  useEffect(() => {
    if (open) return;
    setEditMode(false);
    setExpanded(false);
    setSaveError(null);
  }, [open]);

  useEffect(() => {
    if (editMode) {
      setExpanded(true);
    }
  }, [editMode]);

  useEffect(() => {
    if (!open || !activeProduct) return;
    if (editMode) return;
    const sku = activeProduct.codes?.find((code) => code.codeType === 'sku')?.payload ?? '';
    const hasCost = costPerTracking !== null;
    const initialCostPrice = hasCost ? costPerTracking.toFixed(2) : '';
    setForm({
      sku,
      name: activeProduct.name ?? '',
      baseType: activeProduct.baseType ?? '',
      category: activeProduct.category ?? '',
      productType: activeProduct.productType ?? '',
      trackingUnitLabel: activeProduct.trackingUnitLabel ?? '',
      checkoutUnitLabel: activeProduct.checkoutUnitLabel ?? '',
      orderingUnitLabel: activeProduct.orderingUnitLabel ?? '',
      trackingToBase: activeProduct.trackingToBase?.toString() ?? '',
      checkoutToBase: activeProduct.checkoutToBase?.toString() ?? '',
      orderingToBase: activeProduct.orderingToBase?.toString() ?? '',
      epaRegNo: activeProduct.epaRegNo ?? '',
      description: activeProduct.description ?? '',
      costQty: hasCost ? '1' : '',
      costPrice: initialCostPrice,
      isStocked: activeProduct.isStocked ?? true,
    });
  }, [open, activeProduct, editMode, costPerTracking]);

  useEffect(() => {
    if (!open || !activeProduct || !showPar) return;
    setParError(null);
    axios
      .get<{ productId: string; locationScope: string; parBase: number }[]>('/api/v1/par-levels', {
        params: { locationScope },
      })
      .then((res) => {
        const match = res.data.find((row) => row.productId === activeProduct.id);
        const nextBase = match?.parBase ?? null;
        setParBase(nextBase);
        if (nextBase !== null && activeProduct.trackingToBase) {
          setParInput(String(Math.round((nextBase / activeProduct.trackingToBase) * 100) / 100));
        } else {
          setParInput('');
        }
      })
      .catch((err) => {
        setParError(err?.response?.data?.message || 'Unable to load par level.');
        setParBase(null);
        setParInput('');
      });
  }, [open, activeProduct, showPar]);

  async function saveProduct() {
    if (!activeProduct) return;
    const payload: any = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      baseType: form.baseType || undefined,
      category: form.category || undefined,
      productType: form.productType || undefined,
      trackingUnitLabel: form.trackingUnitLabel.trim(),
      checkoutUnitLabel: form.checkoutUnitLabel.trim(),
      orderingUnitLabel: form.orderingUnitLabel.trim(),
      trackingToBase: form.trackingToBase ? Number(form.trackingToBase) : undefined,
      checkoutToBase: form.checkoutToBase ? Number(form.checkoutToBase) : undefined,
      orderingToBase: form.orderingToBase ? Number(form.orderingToBase) : undefined,
      epaRegNo: form.epaRegNo.trim() || undefined,
      description: form.description.trim() || undefined,
      isStocked: form.isStocked,
    };

    if (!payload.name) {
      setSaveError('Name is required.');
      return;
    }
    if (
      (payload.trackingToBase !== undefined && (!Number.isFinite(payload.trackingToBase) || payload.trackingToBase <= 0)) ||
      (payload.checkoutToBase !== undefined && (!Number.isFinite(payload.checkoutToBase) || payload.checkoutToBase <= 0)) ||
      (payload.orderingToBase !== undefined && (!Number.isFinite(payload.orderingToBase) || payload.orderingToBase <= 0))
    ) {
      setSaveError('Conversion values must be numbers greater than 0.');
      return;
    }

    if (showCost) {
      const qtyRaw = form.costQty.trim();
      const priceRaw = form.costPrice.trim();
      if (!qtyRaw && !priceRaw) {
        payload.defaultCostPerBase = null;
      } else {
        const qty = Number(qtyRaw);
        const price = Number(priceRaw);
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
          setSaveError('Cost inputs must be valid numbers.');
          return;
        }
        const trackingToBase = activeProduct.trackingToBase ?? 0;
        if (!trackingToBase) {
          setSaveError('Tracking conversion is required to save cost.');
          return;
        }
        const baseQty = qty * trackingToBase;
        payload.defaultCostPerBase = baseQty ? price / baseQty : null;
      }
    }

    setSaveError(null);
    setParError(null);
    setLoading(true);
    try {
      const response = await axios.put<ProductDetails>(`/api/v1/products/${activeProduct.id}`, payload);
      setDetail(response.data);
      if (showParEditor && parInput.trim() !== '') {
        const parsedPar = Number(parInput);
        if (!Number.isFinite(parsedPar) || parsedPar < 0) {
          setParError('Par must be a number greater than or equal to 0.');
          return;
        }
        const parResponse = await axios.put<{ productId: string; locationScope: string; parBase: number }[]>(
          '/api/v1/par-levels',
          {
            locationScope,
            items: [{ productId: activeProduct.id, parQty: parsedPar, unitBasis: 'TRACKING' }],
          },
        );
        const updated = parResponse.data.find((row) => row.productId === activeProduct.id);
        const nextBase =
          updated?.parBase ?? Math.round(parsedPar * (activeProduct.trackingToBase ?? 1));
        setParBase(nextBase);
      }
      setEditMode(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Unable to save product.');
    } finally {
      setLoading(false);
    }
  }

  function cancelEdit() {
    setEditMode(false);
    setSaveError(null);
  }

  const showDetails = expanded || editMode;
  const subtitleParts = [
    activeProduct?.category ?? 'Uncategorized',
    formatProductType(activeProduct?.productType),
  ].filter(Boolean);
  const headerContent = (
    <div className="product-modal-header">
      <div className="product-modal-title-group">
        <div className="product-modal-title">{activeProduct?.name ?? 'Product'}</div>
        <div className="product-modal-subtitle">{subtitleParts.join(' - ')}</div>
        <span className={`status-pill ${statusTone}`}>{statusLabel}</span>
      </div>
      <div className="product-modal-header-actions">
        {canEditProduct && !editMode ? (
          <button type="button" onClick={() => setEditMode(true)}>
            Edit
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="ghost-button" aria-label="Close">
          X
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell open={open} title="" onClose={onClose} headerContent={headerContent} sheetClassName="product-details-modal">
      {activeProduct ? (
        <div className="product-modal">
          {loading ? <div className="muted">Loading...</div> : null}
          {saveError ? <div className="error-panel">{saveError}</div> : null}

          <div className="inventory-summary">
            <div className="summary-item">
              <div className="summary-label">On-hand</div>
              <div className="summary-value">{stock.label}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Par</div>
              <div className="summary-value">
                {parTracking !== null && activeProduct.trackingUnitLabel
                  ? `${parTracking} ${activeProduct.trackingUnitLabel}`
                  : '-'}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Status</div>
              <div className="summary-value">{statusLabel}</div>
            </div>
          </div>

          <div className="product-mini">
            <div>
              <div className="muted">EPA</div>
              <div>{activeProduct.epaRegNo ?? 'N/A'}</div>
            </div>
            <div>
              <div className="muted">Base Type</div>
              <div>{activeProduct.baseType || 'N/A'}</div>
            </div>
          </div>

          {!editMode ? (
            <button type="button" className="details-toggle" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? 'Hide details' : 'See more'}
            </button>
          ) : null}

          {showDetails ? (
            <div className="product-section">
              <h4>Product Info</h4>
              {editMode ? (
                <div className="product-grid">
                  <label>
                    Name
                    <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label>
                    Category
                    <select
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    >
                      <option value="">Unspecified</option>
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type
                    <select
                      value={form.productType}
                      onChange={(e) => setForm((prev) => ({ ...prev, productType: e.target.value }))}
                    >
                      <option value="">Unspecified</option>
                      {PRODUCT_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {formatProductType(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Base Type
                    <select
                      value={form.baseType}
                      onChange={(e) => setForm((prev) => ({ ...prev, baseType: e.target.value }))}
                    >
                      <option value="">Select base type</option>
                      {BASE_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    SKU
                    <input
                      value={form.sku}
                      onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
                      placeholder="SKU"
                    />
                  </label>
                  <label>
                    EPA
                    <input
                      value={form.epaRegNo}
                      onChange={(e) => setForm((prev) => ({ ...prev, epaRegNo: e.target.value }))}
                    />
                  </label>
                  <label>
                    Description
                    <input
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </label>
                </div>
              ) : (
                <div className="product-grid">
                  <div>
                    <div className="muted">Product ID</div>
                    <div>{activeProduct.id}</div>
                  </div>
                  <div>
                    <div className="muted">SKU</div>
                    <div>{form.sku || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="muted">EPA</div>
                    <div>{activeProduct.epaRegNo ?? 'N/A'}</div>
                  </div>
                  <div className="product-span">
                    <div className="muted">Description</div>
                    <div>{activeProduct.description || 'No description provided.'}</div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {showDetails ? (
            <div className="product-section">
              <h4>Units & Conversions</h4>
              {editMode ? (
                <div className="units-grid">
                  <label className="units-row">
                    <span className="muted">Tracking</span>
                    <input
                      value={form.trackingUnitLabel}
                      onChange={(e) => setForm((prev) => ({ ...prev, trackingUnitLabel: e.target.value }))}
                      placeholder="Unit label"
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.trackingToBase}
                      onChange={(e) => setForm((prev) => ({ ...prev, trackingToBase: e.target.value }))}
                      placeholder="Base"
                    />
                  </label>
                  <label className="units-row">
                    <span className="muted">Checkout</span>
                    <input
                      value={form.checkoutUnitLabel}
                      onChange={(e) => setForm((prev) => ({ ...prev, checkoutUnitLabel: e.target.value }))}
                      placeholder="Unit label"
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.checkoutToBase}
                      onChange={(e) => setForm((prev) => ({ ...prev, checkoutToBase: e.target.value }))}
                      placeholder="Base"
                    />
                  </label>
                  <label className="units-row">
                    <span className="muted">Ordering</span>
                    <input
                      value={form.orderingUnitLabel}
                      onChange={(e) => setForm((prev) => ({ ...prev, orderingUnitLabel: e.target.value }))}
                      placeholder="Unit label"
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.orderingToBase}
                      onChange={(e) => setForm((prev) => ({ ...prev, orderingToBase: e.target.value }))}
                      placeholder="Base"
                    />
                  </label>
                </div>
              ) : (
                <div className="units-grid">
                  <div className="units-row">
                    <span className="muted">Tracking</span>
                    <span>{activeProduct.trackingUnitLabel}</span>
                    <span>{activeProduct.trackingToBase ?? '-'}</span>
                  </div>
                  <div className="units-row">
                    <span className="muted">Checkout</span>
                    <span>{activeProduct.checkoutUnitLabel}</span>
                    <span>{activeProduct.checkoutToBase ?? '-'}</span>
                  </div>
                  <div className="units-row">
                    <span className="muted">Ordering</span>
                    <span>{activeProduct.orderingUnitLabel}</span>
                    <span>{activeProduct.orderingToBase ?? '-'}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {showDetails ? (
            <div className="product-section">
              <h4>Inventory</h4>
              <div className="card-row">
                <div>
                  <div className="muted">On-hand</div>
                  <div>{stock.label}</div>
                </div>
                <div>
                  <div className="muted">Status</div>
                  <div>{statusLabel}</div>
                </div>
                <div>
                  <div className="muted">Stock Designation</div>
                  <div>{activeProduct.isStocked === false ? 'Do Not Stock' : 'Stock'}</div>
                </div>
              </div>
              {editMode ? (
                <div>
                  <div className="muted">Set designation</div>
                  <div className="binary-switch">
                    <button
                      type="button"
                      className={form.isStocked ? 'active' : ''}
                      onClick={() => setForm((prev) => ({ ...prev, isStocked: true }))}
                    >
                      Stock
                    </button>
                    <button
                      type="button"
                      className={!form.isStocked ? 'active' : ''}
                      onClick={() => setForm((prev) => ({ ...prev, isStocked: false }))}
                    >
                      Do Not Stock
                    </button>
                  </div>
                </div>
              ) : null}
              {showPar ? (
                <div>
                  <div className="muted">Par (WAREHOUSE)</div>
                  <div>
                    {parTracking !== null && activeProduct.trackingUnitLabel
                      ? `${parTracking} ${activeProduct.trackingUnitLabel}`
                      : '-'}
                  </div>
                  {showParEditor ? (
                    <div className="card-row">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={parInput}
                        onChange={(e) => setParInput(e.target.value)}
                        placeholder="Set par"
                      />
                    </div>
                  ) : null}
                  {parError ? <div className="muted">{parError}</div> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {showDetails && showCost ? (
            <div className="product-section">
              <h4>Cost</h4>
              {editMode ? (
                <div className="product-grid">
                  <label>
                    Purchase quantity (tracking units)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.costQty}
                      onChange={(e) => setForm((prev) => ({ ...prev, costQty: e.target.value }))}
                    />
                  </label>
                  <label>
                    Purchase cost (per tracking unit)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.costPrice}
                      onChange={(e) => setForm((prev) => ({ ...prev, costPrice: e.target.value }))}
                    />
                  </label>
                  <div>
                    <div className="muted">Cost / tracking</div>
                    <div>{formatCurrency(costPerTracking)}</div>
                  </div>
                  <div>
                    <div className="muted">Cost / base (derived)</div>
                    <div>{formatCurrency(displayCostBase)}</div>
                  </div>
                </div>
              ) : (
                <div className="product-grid">
                  <div>
                    <div className="muted">Cost / tracking</div>
                    <div>{formatCurrency(costPerTracking)}</div>
                  </div>
                  <div>
                    <div className="muted">Cost / base</div>
                    <div>{formatCurrency(displayCostBase)}</div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {editMode ? (
            <div className="edit-actions">
              <button type="button" onClick={saveProduct} disabled={loading}>
                {loading ? 'Saving...' : 'Save changes'}
              </button>
              <button type="button" className="ghost-button" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          ) : null}

          <div className="product-bottom-row">
            {!showDetails ? (
              <button type="button" className="compact-qr" onClick={() => setExpanded(true)}>
                <span className="muted">QR</span>
                <QRCodeCanvas value={`MGPC:prod:${activeProduct.id}`} size={64} />
              </button>
            ) : (
              <div className="product-section">
                <div className="muted">QR Code</div>
                <div className="qr-preview">
                  <QRCodeCanvas value={`MGPC:prod:${activeProduct.id}`} size={160} />
                </div>
              </div>
            )}
            <div className="product-onhand-inline">
              <div className="muted">On-hand</div>
              <div>
                <strong>{stock.label}</strong>
              </div>
              <div className="muted">On-hand value ($)</div>
              <div>
                <strong>{onHandValueLabel}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="muted">Product not found.</div>
      )}
    </ModalShell>
  );
}
