import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useConfirm } from './ui/ConfirmDialog';

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

type AuditLine = {
  id: string;
  auditSessionId: string;
  productId: string;
  productName: string;
  countedQty: number;
  countedQtyInput: string;
  unitBasis: 'CHECKOUT' | 'TRACKING';
  desiredBase: number;
  deltaBase: number;
  currentOnHandBase: number;
  locationScope: string;
};

type AuditSummary = {
  linesTotal: number;
  linesAdjusted: number;
  linesZeroDeltaSkipped: number;
  idempotencyKeys: string[];
};

const toDisplay = (value: number) => Math.round(value * 100) / 100;

export function AuditCountView() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [countedQty, setCountedQty] = useState('');
  const [unitBasis, setUnitBasis] = useState<'CHECKOUT' | 'TRACKING'>('TRACKING');
  const [notes, setNotes] = useState('');
  const [locationScope, setLocationScope] = useState('WAREHOUSE');
  const [auditSessionId, setAuditSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [totalProducts, setTotalProducts] = useState<number | null>(null);

  const canAudit = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';

  useEffect(() => {
    axios
      .get('/api/v1/inventory/balances', {
        params: { stockedOnly: false, includeDiscontinued: true, scope: locationScope },
      })
      .then((res) => setBalances(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Unable to load inventory balances.'));
  }, [locationScope]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    axios
      .get('/api/v1/products', { params: { limit: 500 } })
      .then((res) => {
        const count = Array.isArray(res.data) ? res.data.length : 0;
        if (count > 0 && count < 500) {
          setTotalProducts(count);
        } else {
          setTotalProducts(null);
        }
      })
      .catch(() => setTotalProducts(null));
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (totalProducts !== null && balances.length < totalProducts) {
      console.warn(
        `[AuditCountView] Inventory balances returned ${balances.length} products, expected ${totalProducts}.`,
      );
    }
  }, [balances.length, totalProducts]);

  const balanceMap = useMemo(() => {
    return new Map(balances.map((balance) => [balance.productId, balance]));
  }, [balances]);

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return balances;
    return balances.filter((b) => b.name.toLowerCase().includes(term));
  }, [balances, search]);

  const selected = balances.find((b) => b.productId === selectedId);

  async function handleCreateSession() {
    setError(null);
    setSummary(null);
    setLoading(true);
    try {
      const response = await axios.post('/api/v1/audits', {
        locationScope,
        notes: notes || undefined,
      });
      setAuditSessionId(response.data.id);
      setLines([]);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to start audit session.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    if (!auditSessionId) {
      setError('Start an audit session first.');
      return;
    }
    if (!selected) {
      setError('Select a product to audit.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await axios.post<AuditLine>(`/api/v1/audits/${auditSessionId}/lines`, {
        productId: selected.productId,
        countedQty: Number(countedQty),
        unitBasis,
      });
      const payload = response.data;
      setLines((prev) => {
        const next = prev.filter((line) => line.productId !== payload.productId);
        return [
          ...next,
          {
            ...payload,
            countedQtyInput: payload.countedQty.toString(),
          },
        ];
      });
      setSelectedId('');
      setCountedQty('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to add audit line.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateLine(line: AuditLine) {
    if (!auditSessionId) return;
    const qty = Number(line.countedQtyInput);
    if (!Number.isFinite(qty)) {
      setError('Enter a valid counted quantity.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await axios.post<AuditLine>(`/api/v1/audits/${auditSessionId}/lines`, {
        productId: line.productId,
        countedQty: qty,
        unitBasis: line.unitBasis,
      });
      const payload = response.data;
      setLines((prev) =>
        prev.map((item) =>
          item.productId === payload.productId
            ? {
                ...payload,
                countedQtyInput: payload.countedQty.toString(),
              }
            : item,
        ),
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to update audit line.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize() {
    if (!auditSessionId) return;
    const ok = await confirm({
      title: 'Finalize audit',
      body: 'This will post ledger adjustments for all non-zero deltas.',
      confirmLabel: 'Finalize',
    });
    if (!ok) return;
    setError(null);
    setFinalizing(true);
    try {
      const response = await axios.post<AuditSummary>(`/api/v1/audits/${auditSessionId}/finalize`);
      setSummary(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to finalize audit.');
    } finally {
      setFinalizing(false);
    }
  }

  if (!canAudit) {
    return (
      <section>
        <header className="section-header">
          <div>
            <h2>Audit</h2>
            <p>Only ADMIN or WAREHOUSE users can access audits.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Audit</h2>
          <p>Capture physical counts and post ledger-only adjustments.</p>
        </div>
      </header>

      {error ? (
        <div className="error-panel">
          <h4>Heads up</h4>
          <p>{error}</p>
        </div>
      ) : null}

      <form className="form card" onSubmit={handleAddLine}>
        <label>
          Location
          <select value={locationScope} onChange={(e) => setLocationScope(e.target.value)} disabled={Boolean(auditSessionId)}>
            <option value="WAREHOUSE">WAREHOUSE</option>
          </select>
        </label>

        <label>
          Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Audit notes" />
        </label>

        <button type="button" disabled={loading || Boolean(auditSessionId)} onClick={handleCreateSession}>
          {auditSessionId ? 'Session active' : loading ? 'Starting...' : 'Start audit session'}
        </button>

        <hr />

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
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
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
          Unit basis
          <select value={unitBasis} onChange={(e) => setUnitBasis(e.target.value as 'CHECKOUT' | 'TRACKING')}>
            <option value="TRACKING">Tracking ({selected?.trackingUnitLabel ?? 'tracking'})</option>
            <option value="CHECKOUT">Checkout ({selected?.checkoutUnitLabel ?? 'checkout'})</option>
          </select>
        </label>

        <button type="submit" disabled={loading || !auditSessionId}>
          {loading ? 'Saving...' : 'Add line'}
        </button>
      </form>

      {lines.length ? (
        <div className="card">
          <h3>Audit lines</h3>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>On-hand</th>
                  <th>Counted</th>
                  <th>Unit</th>
                  <th>Delta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const balance = balanceMap.get(line.productId);
                  const trackingLabel = balance?.trackingUnitLabel ?? 'tracking';
                  const trackingFactor = balance?.trackingToBase ?? 1;
                  const onHandTracking = balance ? balance.onHandBase / trackingFactor : 0;
                  const deltaTracking = line.deltaBase / trackingFactor;

                  return (
                    <tr key={line.id} className="table-row">
                      <td>{line.productName}</td>
                      <td>
                        {toDisplay(onHandTracking)} {trackingLabel}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.countedQtyInput}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((item) =>
                                item.id === line.id ? { ...item, countedQtyInput: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={line.unitBasis}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((item) =>
                                item.id === line.id
                                  ? { ...item, unitBasis: e.target.value as 'CHECKOUT' | 'TRACKING' }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="TRACKING">Tracking</option>
                          <option value="CHECKOUT">Checkout</option>
                        </select>
                      </td>
                      <td>
                        {toDisplay(deltaTracking)} {trackingLabel}
                      </td>
                      <td>
                        <button type="button" onClick={() => handleUpdateLine(line)} disabled={loading}>
                          Update
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={handleFinalize} disabled={finalizing}>
            {finalizing ? 'Finalizing...' : 'Finalize audit'}
          </button>
        </div>
      ) : null}

      {summary ? (
        <div className="result-panel">
          <h4>Audit finalized</h4>
          <div className="grid two-col">
            <div className="metric">
              <div className="label">Lines total</div>
              <div className="value">{summary.linesTotal}</div>
            </div>
            <div className="metric">
              <div className="label">Lines adjusted</div>
              <div className="value">{summary.linesAdjusted}</div>
            </div>
            <div className="metric">
              <div className="label">Zero delta skipped</div>
              <div className="value">{summary.linesZeroDeltaSkipped}</div>
            </div>
          </div>
          {summary.idempotencyKeys.length ? (
            <div className="muted">Idempotency keys: {summary.idempotencyKeys.join(', ')}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
