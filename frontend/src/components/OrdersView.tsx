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
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'CHANGE_REQUESTED'
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
  disputeStatus?: 'NONE' | 'OPEN' | 'MANAGER_RESPONDED' | 'RESOLVED';
  disputeReason?: 'MISSING_ITEM' | 'WRONG_QTY' | 'WRONG_PRODUCT' | 'DAMAGED' | 'OTHER' | null;
  disputeResolutionNote?: string | null;
  reason?: string;
  pickupDate: string;
  fulfillmentNote?: string | null;
  createdAt: string;
  finalizedAt?: string;
  acknowledgedAt?: string;
  _count?: { lines: number };
  technician?: { id: string; name: string; licenseNumber?: string | null };
};

type TransferRequestDetail = {
  id: string;
  technicianId: string;
  direction: TransferDirection;
  status: TransferRequestStatus;
  reason?: string;
  pickupDate: string;
  changeRequestPayload?: {
    direction?: TransferDirection;
    reason?: string;
    pickupDate?: string;
    lines?: Array<{ productId: string; quantity: number; unitLabel: string }>;
  } | null;
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

const editableStatuses: TransferRequestStatus[] = ['OPEN', 'SUBMITTED', 'APPROVAL_PENDING', 'APPROVED', 'CHANGE_REQUESTED'];

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

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
  const [editPickupDate, setEditPickupDate] = useState('');
  const [noteByRequest, setNoteByRequest] = useState<Record<string, string>>({});
  const [showDisputesOnly, setShowDisputesOnly] = useState(false);

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
    () =>
      historyRequests.filter((r) => !['SUBMITTED', 'ACK_PENDING', 'DISPUTED', 'OPEN', 'APPROVAL_PENDING', 'APPROVED', 'CHANGE_REQUESTED'].includes(r.status)),
    [historyRequests],
  );
  const nonTechRole = user?.role === 'WAREHOUSE' || user?.role === 'MANAGER' || user?.role === 'ADMIN';
  const disputeMatches = (request: TransferRequest) =>
    request.disputeStatus && request.disputeStatus !== 'NONE';
  const filteredOpenRequests = useMemo(
    () => (showDisputesOnly && nonTechRole ? openRequests.filter(disputeMatches) : openRequests),
    [openRequests, showDisputesOnly, nonTechRole],
  );
  const filteredAckPending = useMemo(
    () => (showDisputesOnly && nonTechRole ? ackPendingForUser.filter(disputeMatches) : ackPendingForUser),
    [ackPendingForUser, showDisputesOnly, nonTechRole],
  );
  const filteredHistory = useMemo(
    () => (showDisputesOnly && nonTechRole ? closedHistory.filter(disputeMatches) : closedHistory),
    [closedHistory, showDisputesOnly, nonTechRole],
  );

  const technicianLabelFor = (req: TransferRequest) => {
    const name = req.technician?.name ?? 'Unknown technician';
    const license = req.technician?.licenseNumber ? `Lic #${req.technician.licenseNumber}` : 'Lic # missing';
    return `${name} | ${license}`;
  };

  const statusLabelFor = (req: TransferRequest) => {
    if (user?.role !== 'TECH') return req.status;
    if (req.status === 'APPROVAL_PENDING') return 'Awaiting Approval';
    if (req.status === 'APPROVED' || req.status === 'CHANGE_REQUESTED') return 'Order In Progress';
    if (req.status === 'ACK_PENDING') return 'Ready for Pickup';
    if (req.status === 'ACKNOWLEDGED') return 'Picked Up';
    return req.status;
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
      canEdit: editable && (isWarehouseRole || isTechOwner),
      canRequestChangesEdit: isTechOwner && req.status === 'APPROVED',
      canFinalize: (req.status === 'SUBMITTED' || req.status === 'OPEN' || req.status === 'APPROVED') && isWarehouseRole,
      canAcknowledge: req.status === 'ACK_PENDING' && isRecipient,
      canDispute:
        isRecipient &&
        (req.status === 'ACK_PENDING' || req.status === 'FINALIZED') &&
        req.disputeStatus !== 'OPEN' &&
        req.disputeStatus !== 'MANAGER_RESPONDED',
      canSendBack: editable && isWarehouseRole,
      canCancelByTech: editable && isTechOwner,
      canCancelRefuseByWarehouse: editable && isWarehouseRole,
      canApprove: req.status === 'APPROVAL_PENDING' && isWarehouseRole,
      canDeny: req.status === 'APPROVAL_PENDING' && isWarehouseRole,
      canApproveChanges: req.status === 'CHANGE_REQUESTED' && isWarehouseRole,
      canDenyChanges: req.status === 'CHANGE_REQUESTED' && isWarehouseRole,
    };
  }

  function requestNoteValue(id: string) {
    return noteByRequest[id] ?? '';
  }

  function setRequestNote(id: string, value: string) {
    setNoteByRequest((prev) => ({ ...prev, [id]: value }));
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
      await axios.post(`/api/v1/transfer-requests/${id}/finalize`, {
        fulfillmentNote: requestNoteValue(id).trim() || undefined,
      });
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
      await axios.post(`/api/v1/transfer-requests/${id}/acknowledge`);
      await refreshQueues();
      showToast({ kind: 'success', message: 'Acknowledged receipt' });
    } catch (err: any) {
      handleError('acknowledge failed', err, 'Failed to acknowledge');
    } finally {
      setActionBusy(false);
    }
  }

  async function sendBack(id: string) {
    const ok = await confirm({
      title: 'Send back request',
      message: 'This returns the request to technician edits.',
      confirmLabel: 'Send back',
    });
    if (!ok) return;
    setError(null);
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/send-back`, { note: requestNoteValue(id).trim() || undefined });
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
      message: `${label} this request?`,
      confirmLabel: label,
    });
    if (!ok) return;
    setError(null);
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/cancel`, { action, note: requestNoteValue(id).trim() || undefined });
      await refreshQueues();
      showToast({ kind: 'success', message: `Request ${label.toLowerCase()}d` });
    } catch (err: any) {
      handleError(`${label} failed`, err, `Failed to ${label.toLowerCase()} request`);
    } finally {
      setActionBusy(false);
    }
  }

  async function approve(id: string) {
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/approve`, {
        note: requestNoteValue(id).trim() || undefined,
        fulfillmentNote: requestNoteValue(id).trim() || undefined,
      });
      await refreshQueues();
      showToast({ kind: 'success', message: 'Request approved' });
    } catch (err: any) {
      handleError('approve failed', err, 'Failed to approve request');
    } finally {
      setActionBusy(false);
    }
  }

  async function deny(id: string) {
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/deny`, { note: requestNoteValue(id).trim() || undefined });
      await refreshQueues();
      showToast({ kind: 'success', message: 'Request denied' });
    } catch (err: any) {
      handleError('deny failed', err, 'Failed to deny request');
    } finally {
      setActionBusy(false);
    }
  }

  async function approveChanges(id: string) {
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/approve-changes`, {
        note: requestNoteValue(id).trim() || undefined,
        fulfillmentNote: requestNoteValue(id).trim() || undefined,
      });
      await refreshQueues();
      showToast({ kind: 'success', message: 'Change request approved' });
    } catch (err: any) {
      handleError('approve changes failed', err, 'Failed to approve changes');
    } finally {
      setActionBusy(false);
    }
  }

  async function denyChanges(id: string) {
    setActionBusy(true);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/deny-changes`, { note: requestNoteValue(id).trim() || undefined });
      await refreshQueues();
      showToast({ kind: 'success', message: 'Change request denied' });
    } catch (err: any) {
      handleError('deny changes failed', err, 'Failed to deny changes');
    } finally {
      setActionBusy(false);
    }
  }

  async function openEdit(id: string) {
    setError(null);
    try {
      const res = await axios.get<TransferRequestDetail>(`/api/v1/transfer-requests/${id}`);
      const detail = res.data;
      const pending = detail.status === 'CHANGE_REQUESTED' ? detail.changeRequestPayload : null;
      const previewLines = Array.isArray(pending?.lines) && pending?.lines.length ? pending.lines : detail.lines;
      setEditRequest(detail);
      setEditDirection((pending?.direction as TransferDirection | undefined) ?? detail.direction);
      setEditReason(pending?.reason ?? detail.reason ?? '');
      setEditPickupDate(toLocalInput(pending?.pickupDate ?? detail.pickupDate));
      setEditLines(
        previewLines.map((line) => ({
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
        pickupDate: new Date(editPickupDate).toISOString(),
        lines: parsedLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitLabel: line.unitLabel,
        })),
      });
      await refreshQueues();
      const isTechChangeRequest = user?.role === 'TECH' && editRequest.status === 'APPROVED';
      showToast({ kind: 'success', message: isTechChangeRequest ? 'Change request submitted' : 'Request updated' });
      setEditRequest(null);
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
          <h2>Requests</h2>
          <p>Track approvals, fulfillments, and acknowledgments.</p>
        </div>
        {nonTechRole ? (
          <label className="products-toggle">
            <input
              type="checkbox"
              checked={showDisputesOnly}
              onChange={(e) => setShowDisputesOnly(e.target.checked)}
            />
            Disputes
          </label>
        ) : null}
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      <div className="grid">
        <div className="card-stack">
          <h4>Open Queue</h4>
          <ul className="activity">
            {filteredOpenRequests.map((req) => {
              const actions = availableActions(req);
              return (
                <li key={req.id} className="clickable" onClick={() => openDetail(req)}>
                  <div className="card-stack">
                    <div className="card-row">
                      <strong>{req.direction}</strong>
                      <div className="pill-row">
                        <StatusBadge status={req.status} />
                        {req.disputeStatus === 'OPEN' || req.disputeStatus === 'MANAGER_RESPONDED' ? (
                          <span className="badge warning">DISPUTE</span>
                        ) : null}
                        {req.disputeStatus === 'RESOLVED' ? <span className="badge info">DISPUTE RESOLVED</span> : null}
                      </div>
                    </div>
                    {user?.role === 'TECH' ? <div className="muted">State: {statusLabelFor(req)}</div> : null}
                    <div className="muted">
                      Tech: {technicianLabelFor(req)} | Pickup: {new Date(req.pickupDate).toLocaleString()}
                    </div>
                    <div className="muted">Lines: {req._count?.lines ?? 0}</div>
                    {req.fulfillmentNote ? <div className="muted">Fulfillment note: {req.fulfillmentNote}</div> : null}
                  </div>
                  <label onClick={(e) => e.stopPropagation()}>
                    Fulfillment / action note
                    <textarea
                      rows={2}
                      value={requestNoteValue(req.id)}
                      onChange={(e) => setRequestNote(req.id, e.target.value)}
                      placeholder="Optional note"
                    />
                  </label>
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
                    {actions.canApprove ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); approve(req.id); }} disabled={actionBusy}>
                        Approve
                      </button>
                    ) : null}
                    {actions.canDeny ? (
                      <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); deny(req.id); }} disabled={actionBusy}>
                        Deny
                      </button>
                    ) : null}
                    {actions.canApproveChanges ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); approveChanges(req.id); }} disabled={actionBusy}>
                        Approve Changes
                      </button>
                    ) : null}
                    {actions.canDenyChanges ? (
                      <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); denyChanges(req.id); }} disabled={actionBusy}>
                        Deny Changes
                      </button>
                    ) : null}
                    {actions.canSendBack ? (
                      <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); sendBack(req.id); }} disabled={actionBusy}>
                        Send Back
                      </button>
                    ) : null}
                    {actions.canCancelByTech ? (
                      <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); cancelRequest(req.id, 'CANCEL'); }} disabled={actionBusy}>
                        Cancel
                      </button>
                    ) : null}
                    {actions.canCancelRefuseByWarehouse ? (
                      <>
                        <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); cancelRequest(req.id, 'CANCEL'); }} disabled={actionBusy}>
                          Cancel
                        </button>
                        <button type="button" className="ghost-button" onClick={(e) => { e.stopPropagation(); cancelRequest(req.id, 'REFUSE'); }} disabled={actionBusy}>
                          Refuse
                        </button>
                      </>
                    ) : null}
                    {actions.canFinalize ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); finalize(req.id); }} disabled={actionBusy}>
                        Finalize
                      </button>
                    ) : null}
                    {actions.canAcknowledge ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); acknowledge(req.id); }} disabled={actionBusy}>
                        Acknowledge
                      </button>
                    ) : null}
                    {actions.canDispute ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); openDetail(req); }} disabled={actionBusy}>
                        Dispute / Report Problem
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {filteredOpenRequests.length === 0 ? <li>No open requests</li> : null}
          </ul>
        </div>
        <div className="card-stack">
          <h4>Pending Acknowledgments</h4>
          <ul className="activity">
            {filteredAckPending.map((req) => {
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
                      <button type="button" onClick={(e) => { e.stopPropagation(); acknowledge(req.id); }} disabled={actionBusy}>
                        Confirm receipt
                      </button>
                    ) : null}
                    {actions.canDispute ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); openDetail(req); }} disabled={actionBusy}>
                        Dispute / Report Problem
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {filteredAckPending.length === 0 ? <li>No pending acknowledgments</li> : null}
          </ul>
        </div>
      </div>

      <div className="card-stack">
        <h4>History</h4>
        <ul className="activity">
          {filteredHistory.map((req) => (
            <li key={req.id} className="clickable" onClick={() => openDetail(req)}>
              <div className="card-stack">
                <div className="card-row">
                  <strong>{req.direction}</strong>
                  <div className="pill-row">
                    <StatusBadge status={req.status} />
                    {req.disputeStatus === 'OPEN' || req.disputeStatus === 'MANAGER_RESPONDED' ? (
                      <span className="badge warning">DISPUTE</span>
                    ) : null}
                    {req.disputeStatus === 'RESOLVED' ? <span className="badge info">DISPUTE RESOLVED</span> : null}
                  </div>
                </div>
                <div className="muted">Tech: {technicianLabelFor(req)}</div>
                <div className="muted">
                  Created {new Date(req.createdAt).toLocaleString()}
                  {req.finalizedAt ? ` | Finalized ${new Date(req.finalizedAt).toLocaleString()}` : ''}
                  {req.acknowledgedAt ? ` | Acknowledged ${new Date(req.acknowledgedAt).toLocaleString()}` : ''}
                </div>
                {req.fulfillmentNote ? <div className="muted">Fulfillment note: {req.fulfillmentNote}</div> : null}
              </div>
            </li>
          ))}
          {filteredHistory.length === 0 ? <li>No history yet</li> : null}
        </ul>
      </div>

      <RequestDetailsModal
        open={Boolean(selectedSource)}
        source={selectedSource}
        onUpdated={() => refreshQueues()}
        onClose={() => setSelectedSource(null)}
      />

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
              Pickup Date
              <input type="datetime-local" value={editPickupDate} onChange={(e) => setEditPickupDate(e.target.value)} required />
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
                {user?.role === 'TECH' && editRequest.status === 'APPROVED' ? 'Request Changes' : 'Save changes'}
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
