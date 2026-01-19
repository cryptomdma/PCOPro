import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type InventoryBalance = {
  productId: string;
  name: string;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  trackingToBase: number;
  checkoutToBase: number;
  onHandBase: number;
  onHandTracking: number;
  isStocked: boolean;
  isDiscontinued: boolean;
};

type AuditResponse = {
  productId: string;
  beforeBase: number;
  countedBase: number;
  deltaBase: number;
  afterBase: number;
  transactionId: string;
  negativeAfter?: boolean;
  deltaLarge?: boolean;
};

const toDisplay = (value: number) => Math.round(value * 100) / 100;

export function AuditCountView() {
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [countedQty, setCountedQty] = useState('');
  const [unit, setUnit] = useState<'tracking' | 'checkout'>('tracking');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [device, setDevice] = useState('');
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios
      .get('/api/v1/inventory/balances', { params: { stockedOnly: true } })
      .then((res) => setBalances(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Unable to load inventory balances.'));
  }, []);

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return balances;
    return balances.filter((b) => b.name.toLowerCase().includes(term));
  }, [balances, search]);

  const selected = balances.find((b) => b.productId === selectedId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError('Select a product to audit.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await axios.post<AuditResponse>('/api/v1/inventory/audit', {
        productId: selected.productId,
        countedQty: Number(countedQty),
        unit,
        reason,
        comment: comment || undefined,
        device: device || undefined,
      });
      const payload = response.data;
      setResult(payload);
      setBalances((prev) =>
        prev.map((item) =>
          item.productId === selected.productId
            ? {
                ...item,
                onHandBase: payload.afterBase,
                onHandTracking: payload.afterBase / item.trackingToBase,
              }
            : item,
        ),
      );
    } catch (err: any) {
      setResult(null);
      setError(err?.response?.data?.message || 'Audit failed. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  const trackingLabel = selected?.trackingUnitLabel ?? 'tracking';
  const checkoutLabel = selected?.checkoutUnitLabel ?? 'checkout';
  const trackingFactor = selected?.trackingToBase ?? 1;

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Audit Count / True-Up</h2>
          <p>Record a physical count and true-up ledger balances.</p>
        </div>
      </header>

      {error ? (
        <div className="error-panel">
          <h4>Heads up</h4>
          <p>{error}</p>
        </div>
      ) : null}

      <form className="form card" onSubmit={handleSubmit}>
        <label>
          Search product
          <input
            type="text"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <label>
          Product
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
            <option value="">Select product</option>
            {filteredBalances.map((b) => (
              <option key={b.productId} value={b.productId}>
                {b.name} {!b.isStocked ? '(Not stocked)' : ''} {b.isDiscontinued ? '(Discontinued)' : ''}
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <div className="muted">
            On-hand: <strong>{toDisplay(selected.onHandTracking)}</strong> {selected.trackingUnitLabel} (
            {selected.onHandBase} base)
          </div>
        ) : null}

        <label>
          Counted quantity
          <input
            type="number"
            step="0.01"
            min="0"
            value={countedQty}
            onChange={(e) => setCountedQty(e.target.value)}
            required
          />
        </label>

        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'tracking' | 'checkout')}>
            <option value="tracking">Tracking ({trackingLabel})</option>
            <option value="checkout">Checkout ({checkoutLabel})</option>
          </select>
        </label>

        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Why are we adjusting?" />
        </label>

        <label>
          Comment (optional)
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Notes for the record" />
        </label>

        <label>
          Device (optional)
          <input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Scanner or device id" />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Posting...' : 'Submit audit'}
        </button>
      </form>

      {result && selected ? (
        <div className="result-panel">
          <h4>Audit posted</h4>
          <p>Transaction ID: {result.transactionId}</p>
          <div className="grid two-col">
            <div className="metric">
              <div className="label">Before</div>
              <div className="value">
                {toDisplay(result.beforeBase / trackingFactor)} {trackingLabel} ({result.beforeBase} base)
              </div>
            </div>
            <div className="metric">
              <div className="label">Counted</div>
              <div className="value">
                {toDisplay(result.countedBase / trackingFactor)} {trackingLabel} ({result.countedBase} base)
              </div>
            </div>
            <div className="metric">
              <div className="label">Delta</div>
              <div className="value">
                {toDisplay(result.deltaBase / trackingFactor)} {trackingLabel} ({result.deltaBase} base)
              </div>
            </div>
            <div className="metric">
              <div className="label">After</div>
              <div className="value">
                {toDisplay(result.afterBase / trackingFactor)} {trackingLabel} ({result.afterBase} base)
              </div>
            </div>
          </div>
          <div className="pill-row">
            {result.negativeAfter ? <span className="badge warning">Negative balance</span> : null}
            {result.deltaLarge ? <span className="badge info">Large delta flagged</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
