import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { ModalShell } from './ui/ModalShell';

export function ReceivingView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canReceive = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'WAREHOUSE';
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [productId, setProductId] = useState('');
  const [qtyInput, setQtyInput] = useState('1');
  const [messages, setMessages] = useState<string[]>([]);
  const [history, setHistory] = useState<
    Array<{ receiptId: string; postedAt: string; destinationScope: string; lineCount: number; totalUnitsBase: number }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!canReceive) return;
    fetchHistory();
  }, [canReceive]);

  async function fetchHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await axios.get('/api/v1/incoming/receipts');
      setHistory(response.data ?? []);
    } catch (err: any) {
      setHistoryError(err?.response?.data?.message || 'Failed to load receiving history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function fetchReceiptDetail(receiptId: string) {
    setReceiptDetail(null);
    try {
      const response = await axios.get(`/api/v1/incoming/receipts/${encodeURIComponent(receiptId)}`);
      setReceiptDetail(response.data);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to load receipt details.';
      showToast({ kind: 'error', message });
    }
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

  async function submit() {
    if (!productId.trim()) {
      showToast({ kind: 'error', message: 'Product ID is required.' });
      return;
    }
    const qty = Number(qtyInput);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      showToast({ kind: 'error', message: 'Quantity must be a whole number greater than 0.' });
      return;
    }
    await axios.post('/api/v1/incoming', {
      receiptDate: date,
      lines: [
        { productId, qtyOrdered: qty, qtyReceived: qty, backorderedQty: 0, receivingUnitLabel: 'ordering' },
      ],
    });
    setMessages((m) => [`Posted receipt for ${productId}`, ...m]);
    setProductId('');
    setQtyInput('1');
    fetchHistory();
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
          <p>Stage items then post to create ledger entries.</p>
        </div>
      </header>
      <div className="form card">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Product ID (scan to fill)
          <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="MGPC scan or ID" />
        </label>
        <label>
          Qty Received
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onFocus={handleSelectQuantity}
            onClick={handleSelectQuantity}
          />
        </label>
        <button type="button" onClick={submit}>
          Post Receipt
        </button>
      </div>
      <div className="card-stack">
        <div className="card-row">
          <div>
            <div className="card-title">Receiving History</div>
            <div className="muted">Recent posted receipts.</div>
          </div>
          <button type="button" className="ghost-button" onClick={fetchHistory} disabled={historyLoading}>
            {historyLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {historyError ? <div className="error-panel">{historyError}</div> : null}
        {historyLoading ? (
          <div className="muted">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="muted">No receiving history yet.</div>
        ) : (
          <ul className="activity">
            {history.map((receipt) => (
              <li
                key={receipt.receiptId}
                className="clickable"
                onClick={() => {
                  setSelectedReceiptId(receipt.receiptId);
                  fetchReceiptDetail(receipt.receiptId);
                }}
              >
                <div className="card-stack">
                  <strong>{receipt.receiptId}</strong>
                  <div className="muted">
                    {new Date(receipt.postedAt).toLocaleString()} | {receipt.destinationScope} | {receipt.lineCount} lines
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ul className="activity">
        {messages.map((msg, idx) => (
          <li key={idx}>{msg}</li>
        ))}
      </ul>

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
              {new Date(receiptDetail.postedAt).toLocaleString()} | {receiptDetail.destinationScope} |{' '}
              {receiptDetail.lineCount} lines
            </div>
            {receiptDetail.lines.map((line) => (
              <div key={`${line.idempotencyKey}-${line.productId}`} className="card">
                <div className="card-row">
                  <strong>{line.productName}</strong>
                  <span className="muted">
                    {line.quantityOrdering} {line.orderingUnitLabel}
                  </span>
                </div>
                <div className="muted">Base units: {line.quantityBase}</div>
              </div>
            ))}
          </div>
        )}
      </ModalShell>
    </section>
  );
}
