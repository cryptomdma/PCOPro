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
};

export function ProductDetailsModal({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: ProductDetails | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [parBase, setParBase] = useState<number | null>(null);
  const [parInput, setParInput] = useState('');
  const [parSaving, setParSaving] = useState(false);
  const [parError, setParError] = useState<string | null>(null);
  const locationScope = 'WAREHOUSE';
  const canEditProduct = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canEditPar = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const showPar = user?.role !== 'TECH';
  const activeProduct = detail ?? product;

  const [form, setForm] = useState({
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
  });

  const stock = getStockDisplay({
    role: user?.role,
    onHandBase: activeProduct?.balances?.onHandBase ?? 0,
    trackingToBase: activeProduct?.trackingToBase ?? null,
    trackingUnitLabel: activeProduct?.trackingUnitLabel ?? null,
  });
  const statusLabel = stock.inStock ? 'In Stock' : 'Out of Stock';
  const showParEditor = canEditPar && editMode;

  const parTracking = useMemo(() => {
    if (parBase === null || !activeProduct?.trackingToBase) return null;
    return Math.round((parBase / activeProduct.trackingToBase) * 100) / 100;
  }, [parBase, activeProduct?.trackingToBase]);

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
    setSaveError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !activeProduct) return;
    if (editMode) return;
    setForm({
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
    });
  }, [open, activeProduct, editMode]);

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

  async function savePar() {
    if (!activeProduct || !activeProduct.trackingToBase) return;
    const parsed = Number(parInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setParError('Par must be a number greater than or equal to 0.');
      return;
    }
    setParError(null);
    setParSaving(true);
    try {
      const response = await axios.put<{ productId: string; locationScope: string; parBase: number }[]>(
        '/api/v1/par-levels',
        {
          locationScope,
          items: [{ productId: activeProduct.id, parQty: parsed, unitBasis: 'TRACKING' }],
        },
      );
      const updated = response.data.find((row) => row.productId === activeProduct.id);
      const nextBase = updated?.parBase ?? Math.round(parsed * activeProduct.trackingToBase);
      setParBase(nextBase);
    } catch (err: any) {
      setParError(err?.response?.data?.message || 'Unable to save par level.');
    } finally {
      setParSaving(false);
    }
  }

  async function saveProduct() {
    if (!activeProduct) return;
    const payload = {
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

    setSaveError(null);
    setLoading(true);
    try {
      const response = await axios.put<ProductDetails>(`/api/v1/products/${activeProduct.id}`, payload);
      setDetail(response.data);
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

  return (
    <ModalShell open={open} title={activeProduct?.name ?? 'Product'} onClose={onClose}>
      {activeProduct ? (
        <div className="card-stack">
          {loading ? <div className="muted">Loading...</div> : null}
          {saveError ? <div className="error-panel">{saveError}</div> : null}

          <div className="card-row">
            <div className="muted">Product ID</div>
            <div>{activeProduct.id}</div>
            {canEditProduct && !editMode ? (
              <button type="button" onClick={() => setEditMode(true)}>
                Edit
              </button>
            ) : null}
          </div>

          <div className="card-stack">
            <h4>Product Info</h4>
            {editMode ? (
              <>
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
                  EPA
                  <input value={form.epaRegNo} onChange={(e) => setForm((prev) => ({ ...prev, epaRegNo: e.target.value }))} />
                </label>
                <label>
                  Description
                  <input
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
              </>
            ) : (
              <>
                <div>
                  <div className="muted">Name</div>
                  <div>{activeProduct.name}</div>
                </div>
                <div>
                  <div className="muted">Category</div>
                  <div>{activeProduct.category || 'N/A'}</div>
                </div>
                <div>
                  <div className="muted">Type</div>
                  <div>{formatProductType(activeProduct.productType)}</div>
                </div>
                <div>
                  <div className="muted">Base Type</div>
                  <div>{activeProduct.baseType || 'N/A'}</div>
                </div>
                <div>
                  <div className="muted">EPA</div>
                  <div>{activeProduct.epaRegNo ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="muted">Description</div>
                  <div>{activeProduct.description || 'No description provided.'}</div>
                </div>
              </>
            )}
          </div>

          <div className="card-stack">
            <h4>Units / Conversions</h4>
            {editMode ? (
              <>
                <label>
                  Tracking unit
                  <input
                    value={form.trackingUnitLabel}
                    onChange={(e) => setForm((prev) => ({ ...prev, trackingUnitLabel: e.target.value }))}
                  />
                </label>
                <label>
                  Checkout unit
                  <input
                    value={form.checkoutUnitLabel}
                    onChange={(e) => setForm((prev) => ({ ...prev, checkoutUnitLabel: e.target.value }))}
                  />
                </label>
                <label>
                  Ordering unit
                  <input
                    value={form.orderingUnitLabel}
                    onChange={(e) => setForm((prev) => ({ ...prev, orderingUnitLabel: e.target.value }))}
                  />
                </label>
                <label>
                  Tracking to base
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.trackingToBase}
                    onChange={(e) => setForm((prev) => ({ ...prev, trackingToBase: e.target.value }))}
                  />
                </label>
                <label>
                  Checkout to base
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.checkoutToBase}
                    onChange={(e) => setForm((prev) => ({ ...prev, checkoutToBase: e.target.value }))}
                  />
                </label>
                <label>
                  Ordering to base
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.orderingToBase}
                    onChange={(e) => setForm((prev) => ({ ...prev, orderingToBase: e.target.value }))}
                  />
                </label>
              </>
            ) : (
              <>
                <div>
                  <div className="muted">Tracking unit</div>
                  <div>
                    {activeProduct.trackingUnitLabel} ({activeProduct.trackingToBase ?? '-'} base)
                  </div>
                </div>
                <div>
                  <div className="muted">Checkout unit</div>
                  <div>
                    {activeProduct.checkoutUnitLabel} ({activeProduct.checkoutToBase ?? '-'} base)
                  </div>
                </div>
                <div>
                  <div className="muted">Ordering unit</div>
                  <div>
                    {activeProduct.orderingUnitLabel} ({activeProduct.orderingToBase ?? '-'} base)
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card-stack">
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
            </div>
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
                      step="0.01"
                      value={parInput}
                      onChange={(e) => setParInput(e.target.value)}
                      placeholder="Set par"
                    />
                    <button type="button" onClick={savePar} disabled={parSaving}>
                      {parSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ) : null}
                {parError ? <div className="muted">{parError}</div> : null}
              </div>
            ) : null}
          </div>

          {editMode ? (
            <div className="card-row">
              <button type="button" onClick={saveProduct} disabled={loading}>
                {loading ? 'Saving...' : 'Save changes'}
              </button>
              <button type="button" className="ghost-button" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          ) : null}

          <div>
            <div className="muted">QR Code</div>
            <div className="qr-preview">
              <QRCodeCanvas value={`MGPC:prod:${activeProduct.id}`} size={160} />
            </div>
          </div>
        </div>
      ) : (
        <div className="muted">Product not found.</div>
      )}
    </ModalShell>
  );
}
