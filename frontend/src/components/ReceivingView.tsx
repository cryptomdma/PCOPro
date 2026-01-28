import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { SearchableSelect } from './ui/SearchableSelect';

export function ReceivingView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canReceive = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'WAREHOUSE';

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [locationScope, setLocationScope] = useState('WAREHOUSE');
  const [lines, setLines] = useState<Array<{ productId: string; quantityInput: string }>>([
    { productId: '', quantityInput: '1' },
  ]);
  const [products, setProducts] = useState<
    Array<{ id: string; name: string; orderingUnitLabel: string; orderingToBase: number }>
  >([]);
  const [summary, setSummary] = useState<{ postedCount: number; skippedCount: number; idempotencyKeys: string[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canReceive) return;
    axios
      .get('/api/v1/products', { params: { limit: 500 } })
      .then((res) => setProducts(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load products.'));
  }, [canReceive]);

  const productById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  function updateLine(index: number, patch: Partial<{ productId: string; quantityInput: string }>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantityInput: '1' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function validateLines() {
    const trimmed = lines.filter((line) => line.productId || line.quantityInput.trim());
    if (trimmed.length === 0) {
      return { ok: false, message: 'At least one line item is required.' };
    }
    const parsed = trimmed.map((line) => {
      const quantity = Number(line.quantityInput);
      return { ...line, quantity };
    });
    const invalid = parsed.find((line) => !line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0);
    if (invalid) {
      return { ok: false, message: 'Each line needs a product and quantity greater than 0.' };
    }
    return { ok: true, value: parsed };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);
    const validation = validateLines();
    if (!validation.ok) {
      setError(validation.message);
      showToast({ kind: 'error', message: validation.message });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        receiptDate: date,
        scope: locationScope,
        lines: validation.value.map((line) => {
          const product = productById.get(line.productId);
          return {
            productId: line.productId,
            qtyOrdered: line.quantity,
            qtyReceived: line.quantity,
            backorderedQty: 0,
            receivingUnitLabel: product?.orderingUnitLabel ?? 'ordering',
          };
        }),
      };
      const response = await axios.post('/api/v1/incoming', payload);
      setSummary(response.data);
      showToast({ kind: 'success', message: 'Receiving posted' });
      setLines([{ productId: '', quantityInput: '1' }]);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to post receiving.';
      setError(message);
      showToast({ kind: 'error', message });
    } finally {
      setLoading(false);
    }
  }

  if (!canReceive) {
    return (
      <section>
        <header className="section-header">
          <div>
            <h2>Receiving</h2>
            <p>Not authorized.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Receiving</h2>
          <p>Post incoming stock to update ledger balances.</p>
        </div>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      <form className="form card" onSubmit={submit}>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Destination
          <select value={locationScope} onChange={(e) => setLocationScope(e.target.value)}>
            <option value="WAREHOUSE">WAREHOUSE</option>
          </select>
        </label>

        <div className="card-stack">
          <strong>Incoming items</strong>
          {lines.map((line, idx) => (
            <div key={idx} className="line-row">
              <SearchableSelect
                label="Product"
                placeholder="Select product"
                value={line.productId}
                onChange={(value) => updateLine(idx, { productId: value })}
                options={products.map((product) => ({
                  value: product.id,
                  label: product.name,
                  subtitle: `Ordering unit: ${product.orderingUnitLabel}`,
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
                  required
                />
              </label>
              <label>
                Unit
                <input
                  value={productById.get(line.productId)?.orderingUnitLabel ?? ''}
                  readOnly
                  placeholder="Ordering unit"
                />
              </label>
              <div className="line-actions">
                <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addLine}>
            Add product
          </button>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Posting...' : 'Post receipt'}
        </button>
      </form>

      {summary ? (
        <div className="result-panel">
          <h4>Receiving posted</h4>
          <div className="grid two-col">
            <div className="metric">
              <div className="label">Lines posted</div>
              <div className="value">{summary.postedCount}</div>
            </div>
            <div className="metric">
              <div className="label">Lines skipped</div>
              <div className="value">{summary.skippedCount}</div>
            </div>
          </div>
          {summary.idempotencyKeys?.length ? (
            <div className="muted">Idempotency keys: {summary.idempotencyKeys.join(', ')}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
