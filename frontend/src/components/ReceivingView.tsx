import { useState } from 'react';
import axios from 'axios';
import { OfflineTag } from './common/OfflineTag';

export function ReceivingView() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [messages, setMessages] = useState<string[]>([]);

  async function submit() {
    await axios.post('/api/v1/incoming', {
      receiptDate: date,
      lines: [
        { productId, qtyOrdered: qty, qtyReceived: qty, backorderedQty: 0, receivingUnitLabel: 'ordering' },
      ],
    });
    setMessages((m) => [`Posted receipt for ${productId}`, ...m]);
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Incoming (Receiving)</h2>
          <p>Stage items then post to create ledger entries.</p>
        </div>
        <OfflineTag />
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
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </label>
        <button type="button" onClick={submit}>
          Post Receipt
        </button>
      </div>
      <ul className="activity">
        {messages.map((msg, idx) => (
          <li key={idx}>{msg}</li>
        ))}
      </ul>
    </section>
  );
}
