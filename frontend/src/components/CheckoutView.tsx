import { useState } from 'react';
import axios from 'axios';
import { OfflineTag } from './common/OfflineTag';

export function CheckoutView() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [techId, setTechId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [messages, setMessages] = useState<string[]>([]);

  async function submit() {
    await axios.post('/api/v1/checkout/requests', {
      requestDate: date,
      technicianId: techId,
      lines: [{ productId, qtyRequested: qty, checkoutUnitLabel: 'checkout' }],
    });
    setMessages((m) => [`Requested ${qty} of ${productId}`, ...m]);
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Checkout / Request</h2>
          <p>Technicians request or self-checkout depending on policy.</p>
        </div>
        <OfflineTag />
      </header>
      <div className="form">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Technician ID
          <input value={techId} onChange={(e) => setTechId(e.target.value)} />
        </label>
        <label>
          Product ID
          <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Scan to fill" />
        </label>
        <label>
          Qty
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </label>
        <button onClick={submit}>Submit Request</button>
      </div>
      <ul className="activity">
        {messages.map((msg, idx) => (
          <li key={idx}>{msg}</li>
        ))}
      </ul>
    </section>
  );
}
