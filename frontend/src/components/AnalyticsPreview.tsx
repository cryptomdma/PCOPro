import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { SearchableSelect } from './ui/SearchableSelect';

type GroupBy = 'product' | 'technician' | 'product_technician';

type Product = {
  id: string;
  name: string;
  category: string;
  trackingUnitLabel: string;
};

type Technician = { id: string; name: string };

type UsageRow = {
  productId: string | null;
  productName: string | null;
  category: string | null;
  technicianId: string | null;
  technicianName: string | null;
  quantityTracking: number;
  transactions: number;
  trackingUnitLabel: string | null;
};

type UsageResponse = {
  meta: {
    start: string;
    end: string;
    groupBy: GroupBy;
    filters: Record<string, string | null>;
  };
  rows: UsageRow[];
  totals: { quantityTracking: number; transactions: number };
};

const toLocalInput = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

const escapeCsv = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export function AnalyticsPreview() {
  const now = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), [now]);

  const [startInput, setStartInput] = useState(toLocalInput(defaultStart));
  const [endInput, setEndInput] = useState(toLocalInput(now));
  const [groupBy, setGroupBy] = useState<GroupBy>('product');
  const [technicianId, setTechnicianId] = useState('');
  const [productId, setProductId] = useState('');
  const [category, setCategory] = useState('');
  const [locationId, setLocationId] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(), [products]);

  useEffect(() => {
    fetchReference();
  }, []);

  useEffect(() => {
    fetchUsage();
  }, []);

  async function fetchReference() {
    try {
      const [techRes, prodRes] = await Promise.all([
        axios.get<Technician[]>('/api/v1/technicians'),
        axios.get<Product[]>('/api/v1/products', { params: { limit: 200 } }),
      ]);
      setTechnicians(techRes.data);
      setProducts(prodRes.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load reference data');
    }
  }

  async function fetchUsage() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { groupBy };
      if (startInput) params.start = new Date(startInput).toISOString();
      if (endInput) params.end = new Date(endInput).toISOString();
      if (technicianId) params.technicianId = technicianId;
      if (productId) params.productId = productId;
      if (category) params.category = category;
      if (locationId) params.locationId = locationId;

      const response = await axios.get<UsageResponse>('/api/v1/analytics/usage', { params });
      setUsage(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load analytics');
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!usage) return;
    const columns =
      groupBy === 'product'
        ? ['Product', 'Category', 'Qty (tracking)', 'Transactions']
        : groupBy === 'technician'
          ? ['Technician', 'Qty (tracking)', 'Transactions']
          : ['Technician', 'Product', 'Category', 'Qty (tracking)', 'Transactions'];

    const rows = usage.rows.map((row) => {
      if (groupBy === 'product') {
        return [row.productName, row.category, row.quantityTracking, row.transactions];
      }
      if (groupBy === 'technician') {
        return [row.technicianName, row.quantityTracking, row.transactions];
      }
      return [row.technicianName, row.productName, row.category, row.quantityTracking, row.transactions];
    });

    const metaLine = [
      'meta',
      `start=${usage.meta.start}`,
      `end=${usage.meta.end}`,
      `groupBy=${usage.meta.groupBy}`,
      `filters=${JSON.stringify(usage.meta.filters)}`,
    ];

    const totalsRow =
      groupBy === 'product'
        ? ['Total', '', usage.totals.quantityTracking, usage.totals.transactions]
        : groupBy === 'technician'
          ? ['Total', usage.totals.quantityTracking, usage.totals.transactions]
          : ['Total', '', '', usage.totals.quantityTracking, usage.totals.transactions];

    const csvLines = [
      metaLine.map(escapeCsv).join(','),
      '',
      columns.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
      totalsRow.map(escapeCsv).join(','),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-analytics-${groupBy}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const columns =
    groupBy === 'product'
      ? ['Product', 'Category', 'Qty (tracking)', 'Transactions']
      : groupBy === 'technician'
        ? ['Technician', 'Qty (tracking)', 'Transactions']
        : ['Technician', 'Product', 'Category', 'Qty (tracking)', 'Transactions'];

  const rows = usage?.rows ?? [];

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Analytics</h2>
          <p>Usage summary based on finalized ledger activity.</p>
        </div>
        <button type="button" className="ghost-button" onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </button>
      </header>

      <div className="card card-stack">
        <div className="grid two-col">
          <label>
            Start
            <input type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
          </label>
          <label>
            End
            <input type="datetime-local" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
          </label>
          <label>
            Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="product">Product</option>
              <option value="technician">Technician</option>
              <option value="product_technician">Product + Technician</option>
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid two-col">
          <SearchableSelect
            label="Technician"
            placeholder="All technicians"
            value={technicianId}
            onChange={setTechnicianId}
            options={technicians.map((tech) => ({ value: tech.id, label: tech.name, subtitle: tech.id }))}
          />
          <SearchableSelect
            label="Product"
            placeholder="All products"
            value={productId}
            onChange={setProductId}
            options={products.map((product) => ({ value: product.id, label: product.name, subtitle: product.category }))}
          />
          <label>
            Location (optional)
            <input
              type="text"
              placeholder="Scope or location ID"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            />
          </label>
          <button type="button" onClick={fetchUsage} disabled={loading}>
            {loading ? 'Loading...' : 'Apply'}
          </button>
        </div>
        {error ? <div className="error-panel">{error}</div> : null}
      </div>

      <div className="card card-stack">
        <div className="card-row">
          <div>
            <div className="card-title">Results</div>
            <p className="muted">
              {usage ? `${formatNumber(rows.length)} rows` : 'Apply filters to see analytics.'}
            </p>
          </div>
          {usage ? (
            <div className="muted">
              {formatNumber(usage.totals.quantityTracking)} tracking units • {formatNumber(usage.totals.transactions)} transactions
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="muted">Loading analytics...</div>
        ) : rows.length === 0 ? (
          <div className="muted">No data for selected filters.</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.productId ?? 'product'}-${row.technicianId ?? 'tech'}-${idx}`}>
                    {groupBy === 'product' ? (
                      <>
                        <td>{row.productName}</td>
                        <td>{row.category}</td>
                        <td>
                          {formatNumber(row.quantityTracking)} {row.trackingUnitLabel ?? ''}
                        </td>
                        <td>{formatNumber(row.transactions)}</td>
                      </>
                    ) : groupBy === 'technician' ? (
                      <>
                        <td>{row.technicianName}</td>
                        <td>{formatNumber(row.quantityTracking)}</td>
                        <td>{formatNumber(row.transactions)}</td>
                      </>
                    ) : (
                      <>
                        <td>{row.technicianName}</td>
                        <td>{row.productName}</td>
                        <td>{row.category}</td>
                        <td>
                          {formatNumber(row.quantityTracking)} {row.trackingUnitLabel ?? ''}
                        </td>
                        <td>{formatNumber(row.transactions)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  {groupBy === 'product' ? (
                    <>
                      <td>Total</td>
                      <td />
                      <td>{formatNumber(usage?.totals.quantityTracking ?? 0)}</td>
                      <td>{formatNumber(usage?.totals.transactions ?? 0)}</td>
                    </>
                  ) : groupBy === 'technician' ? (
                    <>
                      <td>Total</td>
                      <td>{formatNumber(usage?.totals.quantityTracking ?? 0)}</td>
                      <td>{formatNumber(usage?.totals.transactions ?? 0)}</td>
                    </>
                  ) : (
                    <>
                      <td>Total</td>
                      <td />
                      <td />
                      <td>{formatNumber(usage?.totals.quantityTracking ?? 0)}</td>
                      <td>{formatNumber(usage?.totals.transactions ?? 0)}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
