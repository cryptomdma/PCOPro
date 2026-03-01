import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { ModalShell } from './ui/ModalShell';
import { SearchableSelect } from './ui/SearchableSelect';
import { ProductDetailsModal } from './products/ProductDetailsModal';

type Supplier = {
  id: string;
  name: string;
  email?: string | null;
};

type Product = {
  id: string;
  name: string;
  orderingUnitLabel: string;
};

type LowStockRow = {
  productId: string;
  productName: string;
  scope: string;
  onHandBase: number;
  parBase: number;
  shortageBase: number;
  orderingUnitLabel: string;
  suggestedOrderQty: number;
};

type PurchaseOrder = {
  id: string;
  supplierId: string;
  shipToScope: string;
  status: 'DRAFT' | 'PLACED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  orderType: 'EMAIL' | 'API';
  createdAt: string;
  createdBy?: { name?: string | null; email?: string | null } | null;
  notes?: string | null;
  externalOrderRef?: string | null;
  supplier: Supplier;
  lines: Array<{
    id: string;
    productId: string;
    qtyOrdered: number;
    qtyReceived: number;
    product: { name: string; orderingUnitLabel: string };
  }>;
};

type DraftLine = { productId: string; qtyOrdered: string };

export function OrderingView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canAccess = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [lowStockExpanded, setLowStockExpanded] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<PurchaseOrder[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState<Record<string, boolean>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPoId, setEditPoId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [shipToScope, setShipToScope] = useState('WAREHOUSE');
  const [orderType, setOrderType] = useState<'EMAIL' | 'API'>('EMAIL');
  const [status, setStatus] = useState<'DRAFT' | 'PLACED'>('PLACED');
  const [externalOrderRef, setExternalOrderRef] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', qtyOrdered: '1' }]);

  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, subtitle: supplier.email ?? '' })),
    [suppliers],
  );
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    if (!canAccess) return;
    loadAll();
  }, [canAccess]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [lowRes, historyRes, suppliersRes, productsRes] = await Promise.all([
        axios.get('/api/v1/purchase-orders/low-stock'),
        axios.get('/api/v1/purchase-orders', { params: { take: 100 } }),
        axios.get('/api/v1/suppliers'),
        axios.get('/api/v1/products', { params: { limit: 500 } }),
      ]);
      setLowStock(lowRes.data ?? []);
      setHistory(historyRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
      setProducts(productsRes.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load ordering data.');
    } finally {
      setLoading(false);
    }
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', qtyOrdered: '1' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  async function savePo() {
    const cleanLines = lines
      .map((line) => ({ ...line, qtyOrdered: line.qtyOrdered.trim() }))
      .filter((line) => line.productId && line.qtyOrdered);
    if (!supplierId) {
      showToast({ kind: 'error', message: 'Supplier is required.' });
      return;
    }
    if (!cleanLines.length) {
      showToast({ kind: 'error', message: 'At least one line is required.' });
      return;
    }
    const parsedLines = cleanLines.map((line) => ({
      productId: line.productId,
      qtyOrdered: Number(line.qtyOrdered),
    }));
    if (parsedLines.some((line) => !Number.isInteger(line.qtyOrdered) || line.qtyOrdered <= 0)) {
      showToast({ kind: 'error', message: 'Line quantities must be whole numbers greater than 0.' });
      return;
    }
    try {
      const payload = {
        supplierId,
        shipToScope,
        orderType,
        status,
        externalOrderRef: externalOrderRef.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: parsedLines,
      };
      if (editPoId) {
        await axios.patch(`/api/v1/purchase-orders/${editPoId}`, payload);
        showToast({ kind: 'success', message: 'Purchase order updated' });
      } else {
        await axios.post('/api/v1/purchase-orders', payload);
        showToast({ kind: 'success', message: 'Purchase order created' });
      }
      setCreateOpen(false);
      setEditPoId(null);
      setSupplierId('');
      setShipToScope('WAREHOUSE');
      setOrderType('EMAIL');
      setStatus('PLACED');
      setExternalOrderRef('');
      setNotes('');
      setLines([{ productId: '', qtyOrdered: '1' }]);
      loadAll();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to save purchase order.';
      showToast({ kind: 'error', message });
    }
  }

  function openEdit(po: PurchaseOrder) {
    setEditPoId(po.id);
    setSupplierId(po.supplierId);
    setShipToScope(po.shipToScope);
    setOrderType(po.orderType);
    setStatus(po.status === 'DRAFT' ? 'DRAFT' : 'PLACED');
    setExternalOrderRef(po.externalOrderRef ?? '');
    setNotes(po.notes ?? '');
    setLines(
      po.lines.map((line) => ({
        productId: line.productId,
        qtyOrdered: String(line.qtyOrdered),
      })),
    );
    setCreateOpen(true);
  }

  async function cancelPo(po: PurchaseOrder) {
    try {
      await axios.post(`/api/v1/purchase-orders/${po.id}/cancel`);
      showToast({ kind: 'success', message: 'Purchase order cancelled' });
      loadAll();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to cancel purchase order.';
      showToast({ kind: 'error', message });
    }
  }

  async function downloadOrderForm(po: PurchaseOrder) {
    try {
      const response = await axios.get(`/api/v1/purchase-orders/${po.id}/export-form`, {
        params: { format: 'csv' },
      });
      const data = response.data?.data ?? '';
      const filename = response.data?.filename ?? `purchase-order-${po.id}.csv`;
      const contentType = response.data?.contentType ?? 'text/csv;charset=utf-8;';
      const blob = new Blob(['\uFEFF', data], { type: contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to download order form.';
      showToast({ kind: 'error', message });
    }
  }

  if (!canAccess) {
    return (
      <section>
        <header className="section-header">
          <div>
            <h2>Ordering</h2>
            <p>Not authorized.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="ordering-page">
      <header className="section-header">
        <div>
          <h2>Ordering</h2>
          <p>Create and track vendor purchase orders.</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)}>
          New PO
        </button>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}
      {loading ? <div className="muted">Loading ordering data...</div> : null}

      <div className="card card-stack">
        <div className="card-title">Low Stock</div>
        {lowStock.length === 0 ? (
          <div className="muted">No low stock items at current par levels.</div>
        ) : (
          <ul className="activity">
            {lowStock.map((item) => {
              const expanded = Boolean(lowStockExpanded[item.productId]);
              return (
                <li key={item.productId}>
                  <button
                    type="button"
                    className="line-item-button"
                    onClick={() =>
                      setLowStockExpanded((prev) => ({
                        ...prev,
                        [item.productId]: !prev[item.productId],
                      }))
                    }
                  >
                    <strong>{item.productName}</strong>
                    <span className="muted">{expanded ? 'Hide' : 'Details'}</span>
                  </button>
                  {expanded ? (
                    <div className="card-stack">
                      <div className="muted">Scope: {item.scope}</div>
                      <div className="muted">
                        On hand: {item.onHandBase} base | Par: {item.parBase} base | Shortage: {item.shortageBase} base
                      </div>
                      <div className="muted">
                        Suggested order: {item.suggestedOrderQty} {item.orderingUnitLabel}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card card-stack">
        <div className="card-title">Order History</div>
        {history.length === 0 ? (
          <div className="muted">No purchase orders yet.</div>
        ) : (
          <ul className="activity">
            {history.map((po) => {
              const expanded = Boolean(historyExpanded[po.id]);
              return (
                <li key={po.id}>
                  <button
                    type="button"
                    className="line-item-button"
                    onClick={() => setHistoryExpanded((prev) => ({ ...prev, [po.id]: !prev[po.id] }))}
                  >
                    <strong>{po.supplier.name}</strong>
                    <span className="muted">{po.status}</span>
                  </button>
                  <div className="muted">
                    {new Date(po.createdAt).toLocaleString()} | {po.shipToScope} | {po.lines.length} lines
                  </div>
                  {expanded ? (
                    <div className="card-stack">
                      <div className="muted">
                        Created by: {po.createdBy?.name || po.createdBy?.email || 'Unknown'} | Type: {po.orderType}
                      </div>
                      {po.externalOrderRef ? <div className="muted">External Ref: {po.externalOrderRef}</div> : null}
                      {po.notes ? <div className="muted">Notes: {po.notes}</div> : null}
                      <div className="table-wrapper">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Ordered</th>
                              <th>Received</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.lines.map((line) => (
                              <tr key={line.id}>
                                <td>
                                  <button
                                    type="button"
                                    className="line-item-button"
                                    onClick={() => setSelectedProductId(line.productId)}
                                  >
                                    <strong>{line.product.name}</strong>
                                    <span className="muted">View</span>
                                  </button>
                                </td>
                                <td>
                                  {line.qtyOrdered} {line.product.orderingUnitLabel}
                                </td>
                                <td>
                                  {line.qtyReceived} {line.product.orderingUnitLabel}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="pill-row">
                        {po.status === 'DRAFT' || po.status === 'PLACED' ? (
                          <button type="button" className="ghost-button" onClick={() => openEdit(po)}>
                            Edit PO
                          </button>
                        ) : null}
                        <button type="button" className="ghost-button" onClick={() => downloadOrderForm(po)}>
                          Download order form
                        </button>
                        {po.status !== 'CANCELLED' && po.status !== 'RECEIVED' ? (
                          <button type="button" className="ghost-button" onClick={() => cancelPo(po)}>
                            Cancel PO
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ModalShell
        open={createOpen}
        title={editPoId ? 'Edit Purchase Order' : 'Create Purchase Order'}
        onClose={() => {
          setCreateOpen(false);
          setEditPoId(null);
        }}
      >
        <div className="form card-stack">
          <SearchableSelect
            label="Supplier"
            placeholder="Select supplier"
            value={supplierId}
            onChange={setSupplierId}
            options={supplierOptions}
            required
          />
          <label>
            Ship To Scope
            <input value={shipToScope} onChange={(e) => setShipToScope(e.target.value)} />
          </label>
          <label>
            Order Type
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'EMAIL' | 'API')}>
              <option value="EMAIL">EMAIL</option>
              <option value="API">API</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PLACED')}>
              <option value="DRAFT">DRAFT</option>
              <option value="PLACED">PLACED</option>
            </select>
          </label>
          <label>
            External Ref (optional)
            <input value={externalOrderRef} onChange={(e) => setExternalOrderRef(e.target.value)} />
          </label>
          <label>
            Notes (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="card-stack">
            <strong>PO Lines</strong>
            {lines.map((line, index) => (
              <div key={index} className="line-row">
                <SearchableSelect
                  label="Product"
                  placeholder="Select product"
                  value={line.productId}
                  onChange={(value) => updateLine(index, { productId: value })}
                  options={products.map((product) => ({
                    value: product.id,
                    label: product.name,
                    subtitle: product.orderingUnitLabel,
                  }))}
                  required
                />
                <label>
                  Qty Ordered
                  <input
                    type="number"
                    min="1"
                    step={1}
                    value={line.qtyOrdered}
                    onChange={(e) => updateLine(index, { qtyOrdered: e.target.value })}
                  />
                </label>
                <div className="line-actions">
                  <button type="button" onClick={() => removeLine(index)} disabled={lines.length <= 1}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLine}>
              Add line
            </button>
          </div>

          <div className="card-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setCreateOpen(false);
                setEditPoId(null);
              }}
            >
              Cancel
            </button>
            <button type="button" onClick={savePo}>
              {editPoId ? 'Save PO' : 'Create PO'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ProductDetailsModal
        open={Boolean(selectedProductId)}
        product={
          selectedProductId
            ? productById.get(selectedProductId) ?? {
                id: selectedProductId,
                name: history
                  .flatMap((po) => po.lines)
                  .find((line) => line.productId === selectedProductId)?.product.name ?? selectedProductId,
              }
            : null
        }
        readOnly
        onClose={() => setSelectedProductId(null)}
      />
    </section>
  );
}
