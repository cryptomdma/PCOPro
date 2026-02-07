import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { SearchableSelect } from './ui/SearchableSelect';
import { getStockDisplay } from '../utils/stockDisplay';

type TransferDirection = 'ISSUE' | 'RETURN';
type TransferRequestLine = { productId: string; quantityInput: string; unitLabel: string };

type CheckoutRecipient = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  technicianId: string;
  technician?: { licenseNumber?: string | null } | null;
};
type Product = {
  id: string;
  name: string;
  baseType: string;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  balances?: { onHandBase: number } | null;
  trackingToBase: number;
  trackingMode?: 'EQUIPMENT' | 'BULK';
};

const unitOptionsFor = (product?: Product) => {
  const options = [product?.checkoutUnitLabel, product?.trackingUnitLabel].filter(Boolean) as string[];
  return Array.from(new Set(options));
};

export function CheckoutView() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [direction, setDirection] = useState<TransferDirection>('ISSUE');
  const [technicianId, setTechnicianId] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'equipment' | 'bulk'>('all');
  const [lines, setLines] = useState<TransferRequestLine[]>([{ productId: '', quantityInput: '1', unitLabel: '' }]);

  const [recipients, setRecipients] = useState<CheckoutRecipient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'TECH' && user.technicianId) {
      setTechnicianId(user.technicianId);
    }
    fetchReference();
  }, [user]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (inventoryFilter === 'equipment') return product.trackingMode === 'EQUIPMENT';
      if (inventoryFilter === 'bulk') return product.trackingMode !== 'EQUIPMENT';
      return true;
    });
  }, [products, inventoryFilter]);

  async function fetchReference() {
    try {
      const [techRes, prodRes] = await Promise.all([
        axios.get<CheckoutRecipient[]>('/api/v1/transfer-requests/recipients'),
        axios.get<Product[]>('/api/v1/products', { params: { limit: 200 } }),
      ]);
      setRecipients(techRes.data);
      setProducts(prodRes.data);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to load reference data';
      setError(message);
      showToast({ kind: 'error', message });
    }
  }

  function updateLine(index: number, patch: Partial<TransferRequestLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    const options = unitOptionsFor(product);
    const defaultUnit = options[0] ?? '';
    updateLine(index, {
      productId,
      unitLabel: options.includes(lines[index].unitLabel) ? lines[index].unitLabel : defaultUnit,
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantityInput: '1', unitLabel: '' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function validateLines() {
    if (!technicianId) {
      return { ok: false, message: 'Technician is required' };
    }
    const trimmed = lines.filter((line) => line.productId || line.unitLabel || line.quantityInput);
    if (trimmed.length === 0) {
      return { ok: false, message: 'At least one line item is required' };
    }
    const parsedLines = trimmed.map((line) => {
      const quantity = Number(line.quantityInput);
      return { ...line, quantity };
    });
    const invalid = parsedLines.find(
      (line) => !line.productId || !line.unitLabel || !Number.isFinite(line.quantity) || line.quantity <= 0,
    );
    if (invalid) {
      return { ok: false, message: 'Each line needs a product, unit, and quantity greater than 0' };
    }
    return { ok: true, value: parsedLines };
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validation = validateLines();
    if (!validation.ok) {
      setError(validation.message);
      showToast({ kind: 'error', message: validation.message });
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/v1/transfer-requests', {
        direction,
        technicianId,
        lines: validation.value,
      });
      showToast({ kind: 'success', message: 'Transfer request submitted' });
      setLines([{ productId: '', quantityInput: '1', unitLabel: '' }]);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to create transfer request';
      setError(message);
      showToast({ kind: 'error', message });
    } finally {
      setLoading(false);
    }
  }

  const isTech = user?.role === 'TECH';
  const headerTitle = isTech ? 'Request' : 'Issue';
  const directionLabel = isTech ? 'Request type' : 'Issue type';

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>{headerTitle}</h2>
          <p>Build a cart and submit a transfer request.</p>
        </div>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      <form className="form card" onSubmit={submitRequest}>
        <h4>Request Details</h4>
        <label>
          {directionLabel}
          <select value={direction} onChange={(e) => setDirection(e.target.value as TransferDirection)}>
            <option value="ISSUE">Issue to technician</option>
            <option value="RETURN">Return to warehouse</option>
          </select>
        </label>
        {!isTech ? (
          <>
            <SearchableSelect
              label="Technician"
              placeholder="Select technician"
              value={technicianId}
              onChange={setTechnicianId}
              options={recipients.map((recipient) => {
                const licenseLabel = recipient.technician?.licenseNumber
                  ? `Lic #${recipient.technician.licenseNumber}`
                  : 'Lic # missing';
                return {
                  value: recipient.technicianId,
                  label: recipient.active ? recipient.name : `${recipient.name} (inactive)`,
                  subtitle: licenseLabel,
                };
              })}
              required
            />
          </>
        ) : (
          <div className="muted">Requesting as technician</div>
        )}
        <label>
          Inventory filter
          <select value={inventoryFilter} onChange={(e) => setInventoryFilter(e.target.value as 'all' | 'equipment' | 'bulk')}>
            <option value="all">All inventory</option>
            <option value="equipment">Equipment only</option>
            <option value="bulk">Products only</option>
          </select>
        </label>
        <div className="card-stack">
          <strong>Cart</strong>
          {lines.map((line, idx) => {
            const product = products.find((p) => p.id === line.productId);
            const options = unitOptionsFor(product);
            const unitLabel = options.includes(line.unitLabel) ? line.unitLabel : '';
            return (
              <div key={idx} className="line-row">
                <SearchableSelect
                  label="Product"
                  placeholder="Select product"
                  value={line.productId}
                  onChange={(value) => onProductChange(idx, value)}
                  options={filteredProducts.map((p) => ({
                    value: p.id,
                    label: p.name,
                    subtitle: `${p.baseType} | ${getStockDisplay({
                      role: user?.role,
                      onHandBase: p.balances?.onHandBase ?? 0,
                      trackingToBase: p.trackingToBase,
                      trackingUnitLabel: p.trackingUnitLabel,
                    }).label}`,
                  }))}
                  required
                />
                <label>
                  Quantity
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantityInput}
                    onChange={(e) => updateLine(idx, { quantityInput: e.target.value })}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next === '') {
                        updateLine(idx, { quantityInput: '1' });
                      }
                    }}
                    required
                  />
                </label>
                <label>
                  Unit
                  <select
                    value={unitLabel}
                    onChange={(e) => updateLine(idx, { unitLabel: e.target.value })}
                    disabled={!product}
                    required
                  >
                    <option value="" disabled>
                      Select unit
                    </option>
                    {options.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="line-actions">
                  <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={addLine}>
            Add product
          </button>
        </div>
        <button type="submit" disabled={loading}>
          Submit request
        </button>
      </form>
    </section>
  );
}
