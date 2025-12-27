import { useEffect, useState } from 'react';
import axios from 'axios';
import { OfflineTag } from './common/OfflineTag';

type UsageRow = { productId: string; productName: string; month: string; quantityUsed: number };

export function AnalyticsPreview() {
  const [rows, setRows] = useState<UsageRow[]>([]);

  useEffect(() => {
    axios.get('/api/v1/analytics/usage').then((res) => setRows(res.data));
  }, []);

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Usage Snapshot</h2>
          <p>Preview of UsageByMonth/Product pivot.</p>
        </div>
        <OfflineTag />
      </header>
      <table className="table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Product</th>
            <th>Qty Used</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.productId}-${row.month}`}>
              <td>{row.month}</td>
              <td>{row.productName}</td>
              <td>{row.quantityUsed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
