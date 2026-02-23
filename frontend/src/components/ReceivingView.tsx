import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { SearchableSelect } from './ui/SearchableSelect';
import { ModalShell } from './ui/ModalShell';
import { ProductDetailsModal } from './products/ProductDetailsModal';

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
  const [historyMode, setHistoryMode] = useState<'grouped' | 'lines'>('grouped');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [receiptHistory, setReceiptHistory] = useState<
    Array<{ receiptId: string; postedAt: string; destinationScope: string; lineCount: number; totalUnitsBase: number }>
  >([]);
  const [lineHistory, setLineHistory] = useState<
    Array<{
      receiptId: string;
      postedAt: string;
      destinationScope: string;
      productId: string;
      productName: string;
      quantityReceived: number;
      receivingUnitLabel: string;
    }>
  >([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [receiptDetail, setReceiptDetail] = useState<{
    receiptId: string;
    postedAt: string;
    destinationScope: string;
    lineCount: number;
    lines: Array<{
      productId: string;
      productName: string;
      quantityBase: number;
      quantityOrdering: number;
      orderingUnitLabel: string;
      orderingToBase: number;
      postedAt: string;
      destinationScope: string;
      idempotencyKey: string;
    }>;
  } | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvResult, setCsvResult] = useState<{
    rowsRead: number;
    resolvedCount: number;
    failedCount: number;
    scope: string;
    date: string;
    receiptKey: string | null;
    postedCount?: number;
    skippedCount?: number;
    wouldPostCount?: number;
    dryRun?: boolean;
    errors?: Array<{ rowIndex: number; identifier: string; reason: string }>;
  } | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);

  useEffect(() => {
    if (!canReceive) return;
    axios
      .get('/api/v1/products', { params: { limit: 500 } })
      .then((res) => setProducts(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load products.'));
  }, [canReceive]);

  useEffect(() => {
    if (!canReceive) return;
    fetchHistory(historyMode);
  }, [canReceive, historyMode]);

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
    const invalid = parsed.find(
      (line) => !line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isInteger(line.quantity),
    );
    if (invalid) {
      return { ok: false, message: 'Each line needs a product and whole-number quantity greater than 0.' };
    }
    return { ok: true, value: parsed };
  }

  function handleSelectQuantity(e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    input.select();
    try {
      input.setSelectionRange(0, input.value.length);
    } catch {
      // no-op for unsupported inputs
    }
  }

  async function fetchHistory(mode: 'grouped' | 'lines') {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      if (mode === 'grouped') {
        const response = await axios.get('/api/v1/incoming/receipts');
        setReceiptHistory(response.data ?? []);
      } else {
        const response = await axios.get('/api/v1/incoming');
        const receipts = response.data ?? [];
        const flattened = receipts.flatMap((receipt: any) =>
          (receipt.lines ?? []).map((line: any) => ({
            receiptId: receipt.id,
            postedAt: receipt.postedAt ?? receipt.receiptDate,
            destinationScope: 'WAREHOUSE',
            productId: line.productId,
            productName: line.product?.name ?? line.productName ?? line.productId,
            quantityReceived: line.qtyReceived,
            receivingUnitLabel: line.receivingUnitLabel,
          })),
        );
        setLineHistory(flattened);
      }
    } catch (err: any) {
      setHistoryError(err?.response?.data?.message || 'Failed to load receiving history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openReceipt(receiptId: string) {
    setSelectedReceiptId(receiptId);
    setReceiptDetail(null);
    try {
      const response = await axios.get(`/api/v1/incoming/receipts/${encodeURIComponent(receiptId)}`);
      setReceiptDetail(response.data);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to load receipt details.';
      showToast({ kind: 'error', message });
    }
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
      fetchHistory(historyMode);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to post receiving.';
      setError(message);
      showToast({ kind: 'error', message });
    } finally {
      setLoading(false);
    }
  }

  async function uploadReceivingCsv(dryRun: boolean) {
    if (!csvFile) {
      setCsvError('Select a CSV file first.');
      return;
    }
    setCsvError(null);
    setCsvLoading(true);
    setCsvResult(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const response = await axios.post(`/api/v1/incoming/receiving-csv?dryRun=${dryRun}`, formData);
      setCsvResult(response.data);
      if (!dryRun) {
        fetchHistory(historyMode);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || 'CSV import failed.';
      setCsvError(message);
      const data = err?.response?.data;
      if (data?.rowsRead !== undefined) {
        setCsvResult(data);
      }
    } finally {
      setCsvLoading(false);
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
    <section className="receiving-page">
      <header className="section-header receiving-header">
        <div>
          <h2>Receiving</h2>
          <p>Post incoming stock to update ledger balances.</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setShowCsvImport(true)}>
          CSV Import
        </button>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      <form className="form card receiving-form" onSubmit={submit}>
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

        <div className="card-stack receiving-lines">
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
                  min="1"
                  step={1}
                  inputMode="numeric"
                  value={line.quantityInput}
                  onChange={(e) => updateLine(idx, { quantityInput: e.target.value })}
                  onFocus={handleSelectQuantity}
                  onClick={handleSelectQuantity}
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
        </div>
      ) : null}

      <div className="card card-stack receiving-history-card">
        <div className="card-row">
          <div>
            <div className="card-title">Receiving History</div>
            <div className="muted">Recent receipts (grouped by receipt).</div>
          </div>
          <div className="pill-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setHistoryMode('grouped')}
              disabled={historyMode === 'grouped'}
            >
              Grouped
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setHistoryMode('lines')}
              disabled={historyMode === 'lines'}
            >
              Lines
            </button>
            <button type="button" className="ghost-button" onClick={() => fetchHistory(historyMode)} disabled={historyLoading}>
              {historyLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        {historyError ? <div className="error-panel">{historyError}</div> : null}
        {historyLoading ? (
          <div className="muted">Loading history...</div>
        ) : historyMode === 'grouped' ? (
          receiptHistory.length === 0 ? (
            <div className="muted">No receipts yet.</div>
          ) : (
            <ul className="activity">
              {receiptHistory.map((receipt) => (
                <li key={receipt.receiptId} className="clickable" onClick={() => openReceipt(receipt.receiptId)}>
                  <div className="card-stack">
                    <strong>Receipt</strong>
                    <div className="muted">
                      {new Date(receipt.postedAt).toLocaleString()} | {receipt.destinationScope} | {receipt.lineCount} lines
                    </div>
                    <div className="muted">{receipt.receiptId}</div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : lineHistory.length === 0 ? (
          <div className="muted">No receipt lines yet.</div>
        ) : (
          <ul className="activity">
            {lineHistory.map((line, idx) => (
              <li
                key={`${line.receiptId}-${line.productId}-${idx}`}
                className="clickable"
                onClick={() => setSelectedProductId(line.productId)}
              >
                <div className="card-stack">
                  <strong>{productById.get(line.productId)?.name ?? line.productName}</strong>
                  <div className="muted">
                    {line.quantityReceived} {line.receivingUnitLabel} | {new Date(line.postedAt).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ModalShell
        open={Boolean(selectedReceiptId)}
        title="Receipt details"
        onClose={() => {
          setSelectedReceiptId(null);
          setReceiptDetail(null);
        }}
      >
        {!receiptDetail ? (
          <div className="muted">Loading...</div>
        ) : (
          <div className="card-stack">
            <div className="muted">
              {new Date(receiptDetail.postedAt).toLocaleString()} | {receiptDetail.destinationScope} | {receiptDetail.lineCount} lines
            </div>
            {receiptDetail.lines.map((line) => (
              <button
                key={`${line.idempotencyKey}-${line.productId}`}
                type="button"
                className="card clickable"
                onClick={() => setSelectedProductId(line.productId)}
              >
                <div className="card-row">
                  <strong>{line.productName}</strong>
                  <span className="muted">
                    {line.quantityOrdering} ({line.orderingUnitLabel})
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ModalShell>

      <ProductDetailsModal
        open={Boolean(selectedProductId)}
        product={selectedProductId ? productById.get(selectedProductId) ?? null : null}
        onClose={() => setSelectedProductId(null)}
      />

      <ModalShell
        open={showCsvImport}
        title="Receiving CSV Import"
        onClose={() => setShowCsvImport(false)}
        sheetClassName="receiving-csv-modal"
      >
        <div className="card card-stack">
          <div className="muted">
            Upload a CSV to post a single receiving receipt. qtyReceived is interpreted as tracking units.
          </div>
          <div className="muted">
            Headers: productId | sku | name | qtyReceived | scope | date | note (aliases supported).
          </div>
          <div className="card-row">
            <input type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => uploadReceivingCsv(true)} disabled={csvLoading}>
              {csvLoading ? 'Uploading...' : 'Preview'}
            </button>
            <button type="button" onClick={() => uploadReceivingCsv(false)} disabled={csvLoading}>
              {csvLoading ? 'Uploading...' : 'Apply'}
            </button>
          </div>
          {csvError ? <div className="error-panel">{csvError}</div> : null}
          {csvResult ? (
            <div className="card-stack">
              <div className="muted">
                Rows: {csvResult.rowsRead} | Resolved: {csvResult.resolvedCount} | Failed: {csvResult.failedCount}
              </div>
              <div className="muted">
                Scope: {csvResult.scope} | Date: {csvResult.date}
              </div>
              {csvResult.receiptKey ? <div className="muted">Receipt key: {csvResult.receiptKey}</div> : null}
              {csvResult.dryRun ? (
                <div className="muted">
                  Would post: {csvResult.wouldPostCount ?? 0} | Already posted: {csvResult.skippedCount ?? 0}
                </div>
              ) : csvResult.postedCount !== undefined ? (
                <div className="muted">
                  Posted: {csvResult.postedCount} | Skipped: {csvResult.skippedCount ?? 0}
                </div>
              ) : null}
              {csvResult.errors?.length ? (
                <textarea
                  readOnly
                  rows={Math.min(10, csvResult.errors.length + 1)}
                  value={csvResult.errors
                    .map((failure) => `Row ${failure.rowIndex} (${failure.identifier}): ${failure.reason}`)
                    .join('\n')}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </ModalShell>
    </section>
  );
}
