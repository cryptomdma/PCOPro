import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/ConfirmDialog';
import { ModalShell } from './ui/ModalShell';
import { StatusBadge } from './ui/StatusBadge';

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
  technician?: { id: string; name: string };
};

type TransferRequestDetail = TransferRequest & {
  lines?: Array<{
    id: string;
    productId: string;
    product?: { name: string; category?: string | null };
    quantity: number;
    unitLabel: string;
  }>;
};

export function OrdersView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [openRequests, setOpenRequests] = useState<TransferRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<TransferRequest[]>([]);
  const [detail, setDetail] = useState<TransferRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    refreshQueues();
  }, [user]);

  const ackPending = useMemo(() => openRequests.filter((r) => r.status === 'ACK_PENDING'), [openRequests]);
  const ackPendingForUser = useMemo(() => {
    if (user?.role === 'TECH' && user.technicianId) {
      return ackPending.filter((r) => r.technicianId === user.technicianId);
    }
    return ackPending;
  }, [ackPending, user]);
  const closedHistory = useMemo(
    () => historyRequests.filter((r) => !['SUBMITTED', 'ACK_PENDING', 'DISPUTED', 'OPEN'].includes(r.status)),
    [historyRequests],
  );

  function handleError(context: string, err: any, fallback: string) {
    const message = err?.response?.data?.message || fallback;
    if (import.meta.env.DEV) {
      console.error(context, err?.response?.data ?? err);
    }
    setError(message);
    showToast({ kind: 'error', message });
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
    const isTechForRequest = user?.role === 'TECH' && user.technicianId === req.technicianId;
    return {
      canFinalize: req.status === 'SUBMITTED' && isWarehouseRole,
      canAcknowledge: req.status === 'ACK_PENDING' && isTechForRequest,
      canDispute: req.status === 'ACK_PENDING' && isTechForRequest,
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
      const res = await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/finalize`);
      setDetail(res.data);
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
      const res = await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/acknowledge`);
      setDetail(res.data);
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
      const res = await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/dispute`, { note });
      setDetail(res.data);
      await refreshQueues();
      showToast({ kind: 'success', message: 'Dispute submitted' });
    } catch (err: any) {
      handleError('dispute failed', err, 'Failed to dispute');
    } finally {
      setActionBusy(false);
    }
  }

  async function openDetail(request: TransferRequest) {
    setDetail(request);
    setDetailLoading(true);
    try {
      const res = await axios.get<TransferRequestDetail>(`/api/v1/transfer-requests/${request.id}`);
      setDetail(res.data);
    } catch (err: any) {
      handleError('load detail failed', err, 'Failed to load request detail');
    } finally {
      setDetailLoading(false);
    }
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
                      Tech: {req.technician?.name ?? req.technicianId} | Lines: {req._count?.lines ?? 0}
                    </div>
                  </div>
                  <div className="pill-row">
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
                    <div className="muted">Tech: {req.technician?.name ?? req.technicianId}</div>
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
                <div className="muted">Tech: {req.technician?.name ?? req.technicianId}</div>
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

      <ModalShell open={Boolean(detail)} title="Request Detail" onClose={() => setDetail(null)}>
        {detail ? (
          <div className="card-stack">
            <div className="card-row">
              <strong>{detail.direction}</strong>
              <StatusBadge status={detail.status} />
            </div>
            <div className="muted">Technician: {detail.technician?.name ?? detail.technicianId}</div>
            {detail.reason ? <div className="muted">Reason: {detail.reason}</div> : null}
            {detailLoading ? <div className="muted">Loading lines...</div> : null}
            {detail.lines && detail.lines.length > 0 ? (
              <div className="card-stack">
                <strong>Lines</strong>
                {detail.lines.map((line) => (
                  <div key={line.id} className="card-row">
                    <span>
                      {line.product?.name ?? 'Unknown product'}
                      {line.product?.category ? <span className="muted"> · {line.product.category}</span> : null}
                      {line.product?.name ? null : <span className="muted"> · {line.productId}</span>}
                    </span>
                    <span>
                      {line.quantity} {line.unitLabel}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {detail.disputeNote ? <div className="muted">Dispute note: {detail.disputeNote}</div> : null}
          </div>
        ) : null}
      </ModalShell>
    </section>
  );
}
