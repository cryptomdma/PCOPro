import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/ConfirmDialog';
import { StatusBadge } from './ui/StatusBadge';
import { RequestDetailsModal, RequestDetailsSource } from './RequestDetailsModal';
import { ModalShell } from './ui/ModalShell';
import { SearchableSelect } from './ui/SearchableSelect';

type TransferDirection = 'ISSUE' | 'RETURN';
type TransferRequestStatus =
  | 'OPEN'
  | 'SUBMITTED'
  | 'FINALIZED'
  | 'ACK_PENDING'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'CANCELED'
  | 'DISPUTED';

type TransferRequest = {
  id: string;
  technicianId: string;
  direction: TransferDirection;
  status: TransferRequestStatus;
  reason?: string;
  createdAt: string;
  finalizedAt?: string;
  acknowledgedAt?: string;
  disputeNote?: string;
  _count?: { lines: number };
  technician?: { id: string; name: string; licenseNumber?: string | null };
};

type TransferRequestDetail = {
  id: string;
  technicianId: string;
  direction: TransferDirection;
  status: TransferRequestStatus;
  reason?: string;
  lines: Array<{ id: string; productId: string; quantity: number; unitLabel: string }>;
};

type Product = {
  id: string;
  name: string;
  checkoutUnitLabel: string;
  trackingUnitLabel: string;
};

type EditableLine = {
  productId: string;
  quantityInput: string;
  unitLabel: string;
};

const unitOptionsFor = (product?: Product) => {
  const options = [product?.checkoutUnitLabel, product?.trackingUnitLabel].filter(Boolean) as string[];
  return Array.from(new Set(options));
};

const editableStatuses: TransferRequestStatus[] = ['OPEN', 'SUBMITTED'];

export function OrdersView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [openRequests, setOpenRequests] = useState<TransferRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<TransferRequest[]>([]);
  const [selectedSource, setSelectedSource] = useState<RequestDetailsSource | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editRequest, setEditRequest] = useState<TransferRequestDetail | null>(null);
  const [editLines, setEditLines] = useState<EditableLine[]>([]);
  const [editReason, setEditReason] = useState('');
  const [editDirection, setEditDirection] = useState<TransferDirection>('ISSUE');

  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    refreshQueues();
    loadProducts();
  }, [user]);

  const ackPending = useMemo(() => openRequests.filter((r) => r.status === 'ACK_PENDING'), [openRequests]);
  const ackPendingForUser = useMemo(() => {
    if (user?.technicianId) {
      return ackPending.filter((r) => r.technicianId === user.technicianId);
    }
    return ackPending;
  }, [ackPending, user]);
  const closedHistory = useMemo(
    () => historyRequests.filter((r) => !['SUBMITTED', 'ACK_PENDING', 'DISPUTED', 'OPEN'].includes(r.status)),
    [historyRequests],
  );

  const technicianLabelFor = (req: TransferRequest) => {
    const name = req.technician?.name ?? 'Unknown technician';
    const license = req.technician?.licenseNumber ? `Lic #${req.technician.licenseNumber}` : 'Lic # missing';
    return `${name} | ${license}`;
  };

  function handleError(context: string, err: any, fallback: string) {
    const message = err?.response?.data?.message || fallback;
    if (import.meta.env.DEV) {
      console.error(context, err?.response?.data ?? err);
    }
    setError(message);
    showToast({ kind: 'error', message });
  }

  async function loadProducts() {
    try {
      const res = await axios.get<Product[]>('/api/v1/products', { params: { limit: 300 } });
      setProducts(res.data);
    } catch {
      setProducts([]);
    }
  }

  async function fetchOpenRequests() {
    try {
      const res = await axios.get<TransferRequest[]>('/api/v1/transfer-requests');
      setOpenRequests(res.data);
    } catch (err: any) {
      handleError('load open requests failed', err, 'Failed to load requests');
    }
  }

  async function fetchHistoryRequests() {
    try {
      const res = await axios.get<TransferRequest[]>('/api/v1/transfer-requests', {
        params: { includeClosed: true, limit: 100 },
      });
      setHistoryRequests(res.data);
    } catch (err: any) {
      handleError('load history failed', err, 'Failed to load history');
    }
  }

  function refreshQueues() {
    return Promise.all([fetchOpenRequests(), fetchHistoryRequests()]);
  }

  function availableActions(req: TransferRequest) {
    const isWarehouseRole = ['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');
    const isTechOwner = Boolean(user?.role === 'TECH' && user?.technicianId && user.technicianId === req.technicianId);
    const isRecipient = Boolean(user?.technicianId && user.technicianId === req.technicianId);
    const editable = editableStatuses.includes(req.status);
    return {
      editable,
      canEdit: editable && (isWarehouseRole || isTechOwner),
      canFinalize: (req.status === 'SUBMITTED' || req.status === 'OPEN') && isWarehouseRole,
      canAcknowledge: req.status === 'ACK_PENDING' && isRecipient,
      canDispute: req.status === 'ACK_PENDING' && isRecipient,
      canSendBack: editable && isWarehouseRole,
      canCancelByTech: editable && isTechOwner,
      canCancelRefuseByWarehouse: editable && isWarehouseRole,
    };
  }

  async function finalize(id: string) {
    const ok = await confirm({
      title: 'Finalize transfer',
      message: 'Finalize this transfer and post the ledger entries?',
      confirmLabel: 'Finalize',
    });
    if (!ok) return;
    setError(null);
    setActionBusy(true);
    try {
      await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/finalize`);
      await refreshQueues();
      showToast({ kind: 'success', message: 'Transfer finalized' });
    } catch (err: any) {
      handleError('finalize failed', err, 'Failed to finalize');
    } finally {
      setActionBusy(false);
    }
  }

  async function acknowledge(id: string) {
    setError(null);
    setActionBusy(true);
    try {
      await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/acknowledge`);
      await refreshQueues();
      showToast({ kind: 'success', message: 'Acknowledged receipt' });
    } catch (err: any) {
      handleError('acknowledge failed', err, 'Failed to acknowledge');
    } finally {
      setActionBusy(false);
    }
  }

  async function dispute(id: string) {
    const note = prompt('Enter dispute note');
    if (!note) return;
    setError(null);
    setActionBusy(true);
    try {
      await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/dispute`, { note });
      await refreshQueues();
      showToast({ kind: 'success', message: 'Dispute submitted' });
    } catch (err: any) {
      handleError('dispute failed', err, 'Failed to dispute');
    } finally {
      setActionBusy(false);
    }
  }

  async function sendBack(id: string) {
    const ok = await confirm({
      title: 'Send back request',
      message: 'This returns the request to the technician for edits/resubmission.',
      confirmLabel: 'Send back',
    });
    if (!ok) return;
    const note = prompt('Optional send-back note') ?? undefined;
    setError(null);
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/send-back`, { note: note?.trim() || undefined });
      await refreshQueues();
      showToast({ kind: 'success', message: 'Request sent back' });
    } catch (err: any) {
      handleError('send back failed', err, 'Failed to send back request');
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelRequest(id: string, action: 'CANCEL' | 'REFUSE') {
    const label = action === 'REFUSE' ? 'Refuse' : 'Cancel';
    const ok = await confirm({
      title: `${label} request`,
      message: `${label} this open request?`,
      confirmLabel: label,
    });
    if (!ok) return;
    const note = prompt(`Optional ${label.toLowerCase()} note`) ?? undefined;
    setError(null);
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/cancel`, { action, note: note?.trim() || undefined });
      await refreshQueues();
      showToast({ kind: 'success', message: `Request ${label.toLowerCase()}d` });
    } catch (err: any) {
      handleError(`${label} failed`, err, `Failed to ${label.toLowerCase()} request`);
    } finally {
      setActionBusy(false);
    }
  }

  async function openEdit(id: string) {
    setError(null);
    try {
      const res = await axios.get<TransferRequestDetail>(`/api/v1/transfer-requests/${id}`);
      const detail = res.data;
      setEditRequest(detail);
      setEditDirection(detail.direction);
      setEditReason(detail.reason ?? '');
      setEditLines(
        detail.lines.map((line) => ({
          productId: line.productId,
          quantityInput: String(line.quantity),
          unitLabel: line.unitLabel,
        })),
      );
    } catch (err: any) {
      handleError('open edit failed', err, 'Failed to open request for editing');
    }
  }

  function updateEditLine(index: number, patch: Partial<EditableLine>) {
    setEditLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function onEditProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    const options = unitOptionsFor(product);
    const defaultUnit = options[0] ?? '';
    updateEditLine(index, { productId, unitLabel: defaultUnit });
  }

  function addEditLine() {
    setEditLines((prev) => [...prev, { productId: '', quantityInput: '1', unitLabel: '' }]);
  }

  function removeEditLine(index: number) {
    setEditLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function saveEdit() {
    if (!editRequest) return;
    const parsedLines = editLines
      .filter((line) => line.productId || line.unitLabel || line.quantityInput)
      .map((line) => ({ ...line, quantity: Number(line.quantityInput) }));
    if (!parsedLines.length) {
      showToast({ kind: 'error', message: 'At least one line is required' });
      return;
    }
    const invalid = parsedLines.find(
      (line) => !line.productId || !line.unitLabel || !Number.isFinite(line.quantity) || line.quantity <= 0,
    );
    if (invalid) {
      showToast({ kind: 'error', message: 'Each line needs product, unit, and quantity > 0' });
      return;
    }
    setActionBusy(true);
    try {
      await axios.put(`/api/v1/transfer-requests/${editRequest.id}`, {
        direction: editDirection,
        reason: editReason.trim() || undefined,
        lines: parsedLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitLabel: line.unitLabel,
        })),
      });
      await refreshQueues();
      setEditRequest(null);
      showToast({ kind: 'success', message: 'Request updated' });
    } catch (err: any) {
      handleError('save edit failed', err, 'Failed to save request edits');
    } finally {
      setActionBusy(false);
    }
  }

  function openDetail(request: TransferRequest) {
    setSelectedSource({
      type: 'transfer',
      requestId: request.id,
      transferGroupId: request.id,
      technicianName: request.technician?.name ?? null,
      eventAt: request.finalizedAt ?? request.createdAt,
    });
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Orders</h2>
          <p>Track requests, finalize issues, and acknowledge receipts.</p>
        </div>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      <div className="grid">
        <div className="card-stack">
          <h4>Open Queue</h4>
          <ul className="activity">
            {openRequests.map((req) => {
              const actions = availableActions(req);
              return (
                <li key={req.id} className="clickable" onClick={() => openDetail(req)}>
                  <div className="card-stack">
                    <div className="card-row">
                      <strong>{req.direction}</strong>
                      <StatusBadge status={req.status} />
                    </div>
                    <div className="muted">
                      Tech: {technicianLabelFor(req)} | Lines: {req._count?.lines ?? 0}
                    </div>
                  </div>
                  <div className="pill-row">
                    {actions.canEdit ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Edit
                      </button>
                    ) : null}
                    {actions.canSendBack ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendBack(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Send Back
                      </button>
                    ) : null}
                    {actions.canCancelByTech ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelRequest(req.id, 'CANCEL');
                        }}
                        disabled={actionBusy}
                      >
                        Cancel
                      </button>
                    ) : null}
                    {actions.canCancelRefuseByWarehouse ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelRequest(req.id, 'CANCEL');
                          }}
                          disabled={actionBusy}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelRequest(req.id, 'REFUSE');
                          }}
                          disabled={actionBusy}
                        >
                          Refuse
                        </button>
                      </>
                    ) : null}
                    {actions.canFinalize ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          finalize(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Finalize
                      </button>
                    ) : null}
                    {actions.canAcknowledge ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledge(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                    {actions.canDispute ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispute(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Dispute
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card-stack">
          <h4>Pending Acknowledgments</h4>
          <ul className="activity">
            {ackPendingForUser.map((req) => {
              const actions = availableActions(req);
              return (
                <li key={req.id} className="clickable" onClick={() => openDetail(req)}>
                  <div className="card-stack">
                    <div className="card-row">
                      <strong>{req.direction}</strong>
                      <StatusBadge status={req.status} />
                    </div>
                    <div className="muted">Tech: {technicianLabelFor(req)}</div>
                  </div>
                  <div className="pill-row">
                    {actions.canAcknowledge ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledge(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Confirm receipt
                      </button>
                    ) : null}
                    {actions.canDispute ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispute(req.id);
                        }}
                        disabled={actionBusy}
                      >
                        Dispute
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {ackPendingForUser.length === 0 ? <li>No pending acknowledgments</li> : null}
          </ul>
        </div>
      </div>

      <div className="card-stack">
        <h4>History</h4>
        <ul className="activity">
          {closedHistory.map((req) => (
            <li key={req.id} className="clickable" onClick={() => openDetail(req)}>
              <div className="card-stack">
                <div className="card-row">
                  <strong>{req.direction}</strong>
                  <StatusBadge status={req.status} />
                </div>
                <div className="muted">Tech: {technicianLabelFor(req)}</div>
                <div className="muted">
                  Created {new Date(req.createdAt).toLocaleString()}
                  {req.finalizedAt ? ` | Finalized ${new Date(req.finalizedAt).toLocaleString()}` : ''}
                  {req.acknowledgedAt ? ` | Acknowledged ${new Date(req.acknowledgedAt).toLocaleString()}` : ''}
                </div>
              </div>
            </li>
          ))}
          {closedHistory.length === 0 ? <li>No history yet</li> : null}
        </ul>
      </div>

      <RequestDetailsModal open={Boolean(selectedSource)} source={selectedSource} onClose={() => setSelectedSource(null)} />

      <ModalShell open={Boolean(editRequest)} title="Edit Request" onClose={() => setEditRequest(null)}>
        {editRequest ? (
          <div className="form card-stack">
            <label>
              Direction
              <select value={editDirection} onChange={(e) => setEditDirection(e.target.value as TransferDirection)}>
                <option value="ISSUE">Issue</option>
                <option value="RETURN">Return</option>
              </select>
            </label>
            <label>
              Reason (optional)
              <input value={editReason} onChange={(e) => setEditReason(e.target.value)} />
            </label>
            <div className="card-stack">
              <strong>Lines</strong>
              {editLines.map((line, idx) => {
                const product = products.find((p) => p.id === line.productId);
                const options = unitOptionsFor(product);
                return (
                  <div key={`${line.productId}-${idx}`} className="line-row">
                    <SearchableSelect
                      label="Product"
                      placeholder="Select product"
                      value={line.productId}
                      onChange={(value) => onEditProductChange(idx, value)}
                      options={products.map((p) => ({ value: p.id, label: p.name }))}
                      required
                    />
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantityInput}
                        onChange={(e) => updateEditLine(idx, { quantityInput: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Unit
                      <select
                        value={line.unitLabel}
                        onChange={(e) => updateEditLine(idx, { unitLabel: e.target.value })}
                        disabled={!product}
                        required
                      >
                        <option value="" disabled>
                          Select unit
                        </option>
                        {options.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={() => removeEditLine(idx)} disabled={editLines.length === 1}>
                      Remove
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={addEditLine}>
                Add line
              </button>
            </div>
            <div className="card-row">
              <button type="button" onClick={saveEdit} disabled={actionBusy}>
                Save changes
              </button>
              <button type="button" className="ghost-button" onClick={() => setEditRequest(null)} disabled={actionBusy}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </section>
  );
}
