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
    Array<{
      receiptId: string;
      postedAt: string;
      destinationScope: string;
      lineCount: number;
      totalUnitsBase: number;
      createdByName?: string | null;
      createdByEmail?: string | null;
      createdByRole?: string | null;
      vendor?: string | null;
      vendorName?: string | null;
      supplierName?: string | null;
      createdBy?: { name?: string | null; email?: string | null; role?: string | null } | null;
    }>
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
    createdByName?: string | null;
    createdByEmail?: string | null;
    createdByRole?: string | null;
    vendor?: string | null;
    vendorName?: string | null;
    supplierName?: string | null;
    createdBy?: { name?: string | null; email?: string | null; role?: string | null } | null;
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
  const [showReceiptTechDetails, setShowReceiptTechDetails] = useState(false);
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
  const [showPoReceive, setShowPoReceive] = useState(false);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  const [openPurchaseOrders, setOpenPurchaseOrders] = useState<
    Array<{
      id: string;
      status: 'DRAFT' | 'PLACED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
      shipToScope: string;
      createdAt: string;
      supplier: { name: string; email?: string | null };
      lines: Array<{
        id: string;
        qtyOrdered: number;
        qtyReceived: number;
        product: { id: string; name: string; orderingUnitLabel: string };
      }>;
    }>
  >([]);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [poReceiveLines, setPoReceiveLines] = useState<Record<string, string>>({});
  const [poSubmitting, setPoSubmitting] = useState(false);

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

  function firstNonEmpty(...values: Array<string | null | undefined>) {
    for (const value of values) {
      if (value && value.trim()) return value.trim();
    }
    return null;
  }

  function receiptCreatorLabel(receipt: {
    createdByName?: string | null;
    createdByEmail?: string | null;
    createdByRole?: string | null;
    createdBy?: { name?: string | null; email?: string | null; role?: string | null } | null;
  }) {
    const name = firstNonEmpty(receipt.createdByName, receipt.createdBy?.name);
    const email = firstNonEmpty(receipt.createdByEmail, receipt.createdBy?.email);
    const role = firstNonEmpty(receipt.createdByRole, receipt.createdBy?.role);
    const identity = name ?? email ?? 'Unknown';
    return role ? `${identity} (${role})` : identity;
  }

  function receiptVendorLabel(receipt: {
    vendor?: string | null;
    vendorName?: string | null;
    supplierName?: string | null;
  }) {
    return firstNonEmpty(receipt.vendor, receipt.vendorName, receipt.supplierName);
  }

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', 'true');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      showToast({ kind: 'success', message: successMessage });
    } catch {
      showToast({ kind: 'error', message: 'Could not copy to clipboard.' });
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
    setShowReceiptTechDetails(false);
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

  const selectedPo = useMemo(
    () => openPurchaseOrders.find((po) => po.id === selectedPoId) ?? null,
    [openPurchaseOrders, selectedPoId],
  );

  async function openPoReceiveModal() {
    setShowPoReceive(true);
    setPoError(null);
    setPoLoading(true);
    setSelectedPoId('');
    setPoReceiveLines({});
    try {
      const response = await axios.get('/api/v1/purchase-orders', {
        params: { statuses: 'PLACED,PARTIALLY_RECEIVED,DRAFT', take: 100 },
      });
      setOpenPurchaseOrders(response.data ?? []);
    } catch (err: any) {
      setPoError(err?.response?.data?.message || 'Failed to load purchase orders.');
    } finally {
      setPoLoading(false);
    }
  }

  function selectPo(poId: string) {
    setSelectedPoId(poId);
    const po = openPurchaseOrders.find((item) => item.id === poId);
    if (!po) {
      setPoReceiveLines({});
      return;
    }
    const next: Record<string, string> = {};
    for (const line of po.lines) {
      const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived);
      if (remaining > 0) {
        next[line.id] = String(remaining);
      }
    }
    setPoReceiveLines(next);
  }

  async function receiveFromPo() {
    if (!selectedPo) {
      setPoError('Select a purchase order first.');
      return;
    }
    const lines = selectedPo.lines
      .map((line) => ({ lineId: line.id, qtyReceived: Number(poReceiveLines[line.id] ?? '0') }))
      .filter((line) => Number.isFinite(line.qtyReceived) && line.qtyReceived > 0);
    if (!lines.length) {
      setPoError('Enter at least one received quantity greater than 0.');
      return;
    }
    if (lines.some((line) => !Number.isInteger(line.qtyReceived))) {
      setPoError('Received quantities must be whole numbers.');
      return;
    }
    setPoSubmitting(true);
    setPoError(null);
    try {
      const response = await axios.post(`/api/v1/purchase-orders/${selectedPo.id}/receive`, {
        receiptDate: date,
        scope: locationScope,
        lines,
      });
      setSummary({
        postedCount: response.data?.postedCount ?? 0,
        skippedCount: response.data?.skippedCount ?? 0,
        idempotencyKeys: response.data?.receiptKey ? [response.data.receiptKey] : [],
      });
      showToast({ kind: 'success', message: 'PO receiving posted' });
      setShowPoReceive(false);
      setSelectedPoId('');
      setPoReceiveLines({});
      fetchHistory(historyMode);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to receive from PO.';
      setPoError(message);
      showToast({ kind: 'error', message });
    } finally {
      setPoSubmitting(false);
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
        <div className="pill-row">
          <button type="button" className="ghost-button" onClick={openPoReceiveModal}>
            Receive from PO
          </button>
          <button type="button" className="ghost-button" onClick={() => setShowCsvImport(true)}>
            CSV Import
          </button>
        </div>
      </header>

      <ModalShell
        open={showPoReceive}
        title="Receive from Purchase Order"
        onClose={() => {
          setShowPoReceive(false);
          setSelectedPoId('');
          setPoReceiveLines({});
          setPoError(null);
        }}
      >
        <div className="card-stack">
          {poError ? <div className="error-panel">{poError}</div> : null}
          {poLoading ? <div className="muted">Loading purchase orders...</div> : null}
          {!poLoading ? (
            <SearchableSelect
              label="Purchase Order"
              placeholder="Select open PO"
              value={selectedPoId}
              onChange={selectPo}
              options={openPurchaseOrders.map((po) => ({
                value: po.id,
                label: `${po.supplier.name} (${po.status})`,
                subtitle: new Date(po.createdAt).toLocaleString(),
              }))}
            />
          ) : null}
          {selectedPo ? (
            <div className="card card-stack">
              <div className="muted">
                Supplier: {selectedPo.supplier.name} | Scope: {selectedPo.shipToScope}
              </div>
              {selectedPo.lines.map((line) => {
                const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived);
                return (
                  <div key={line.id} className="card-stack">
                    <strong>{line.product.name}</strong>
                    <div className="muted">
                      Ordered: {line.qtyOrdered} {line.product.orderingUnitLabel} | Received: {line.qtyReceived}{' '}
                      {line.product.orderingUnitLabel} | Remaining: {remaining} {line.product.orderingUnitLabel}
                    </div>
                    <label>
                      Receive now
                      <input
                        type="number"
                        min="0"
                        step={1}
                        max={remaining}
                        value={poReceiveLines[line.id] ?? '0'}
                        onChange={(e) => setPoReceiveLines((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      />
                    </label>
                  </div>
                );
              })}
              <button type="button" onClick={receiveFromPo} disabled={poSubmitting}>
                {poSubmitting ? 'Posting...' : 'Finalize PO Receiving'}
              </button>
            </div>
          ) : null}
        </div>
      </ModalShell>

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
                    <div className="muted">Date: {new Date(receipt.postedAt).toLocaleString()}</div>
                    <div className="muted">Created by: {receiptCreatorLabel(receipt)}</div>
                    {receiptVendorLabel(receipt) ? <div className="muted">Vendor: {receiptVendorLabel(receipt)}</div> : null}
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
            <div className="muted">Created by: {receiptCreatorLabel(receiptDetail)}</div>
            {receiptVendorLabel(receiptDetail) ? <div className="muted">Vendor: {receiptVendorLabel(receiptDetail)}</div> : null}
            <button type="button" className="ghost-button" onClick={() => setShowReceiptTechDetails((prev) => !prev)}>
              {showReceiptTechDetails ? 'Hide technical details' : 'Show technical details'}
            </button>
            {showReceiptTechDetails ? (
              <div className="card card-stack">
                <div className="card-row">
                  <span className="muted">Receipt ID hidden in list view</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => copyToClipboard(receiptDetail.receiptId, 'Receipt ID copied')}
                  >
                    Copy Receipt ID
                  </button>
                </div>
                <textarea readOnly rows={2} value={receiptDetail.receiptId} />
                <div className="card-row">
                  <span className="muted">Idempotency keys</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      copyToClipboard(
                        Array.from(new Set(receiptDetail.lines.map((line) => line.idempotencyKey))).join('\n'),
                        'Receipt hash keys copied',
                      )
                    }
                  >
                    Copy Hashes
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={Math.min(8, Math.max(2, receiptDetail.lines.length))}
                  value={Array.from(new Set(receiptDetail.lines.map((line) => line.idempotencyKey))).join('\n')}
                />
              </div>
            ) : null}
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
