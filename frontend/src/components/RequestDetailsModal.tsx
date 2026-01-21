import { useEffect, useState } from 'react';
import axios from 'axios';
import { ModalShell } from './ui/ModalShell';
import { StatusBadge } from './ui/StatusBadge';

export type RequestDetailsSource = {
  type: 'checkout' | 'transfer';
  requestId: string;
  transferGroupId?: string | null;
  technicianName?: string | null;
  eventAt?: string | null;
};

type TransferRequestDetail = {
  id: string;
  direction: string;
  status: string;
  technicianId: string;
  technician?: { id: string; name: string };
  reason?: string;
  createdAt: string;
  finalizedAt?: string;
  acknowledgedAt?: string;
  disputeNote?: string;
  lines?: Array<{ id: string; productId: string; quantity: number; unitLabel: string }>;
};

type CheckoutRequestDetail = {
  id: string;
  status: string;
  requestDate: string;
  technicianId: string;
  technician?: { id: string; name: string; technicianId?: string };
  lines?: Array<{ id: string; productId: string; qtyRequested: number; qtyIssued?: number; checkoutUnitLabel: string }>;
};

export function RequestDetailsModal({
  open,
  source,
  onClose,
}: {
  open: boolean;
  source: RequestDetailsSource | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferDetail, setTransferDetail] = useState<TransferRequestDetail | null>(null);
  const [checkoutDetail, setCheckoutDetail] = useState<CheckoutRequestDetail | null>(null);

  useEffect(() => {
    if (!open || !source) return;
    setLoading(true);
    setError(null);
    setTransferDetail(null);
    setCheckoutDetail(null);
    const id = source.transferGroupId ?? source.requestId;

    const load = async () => {
      if (source.type === 'transfer') {
        const res = await axios.get<TransferRequestDetail>(`/api/v1/transfer-requests/${id}`);
        setTransferDetail(res.data);
      } else {
        const res = await axios.get<CheckoutRequestDetail>(`/api/v1/checkout/${id}`);
        setCheckoutDetail(res.data);
      }
    };

    load()
      .catch((err: any) => {
        const message = err?.response?.data?.message || 'Failed to load request details';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [open, source]);

  return (
    <ModalShell open={open} title="Request Details" onClose={onClose}>
      {loading ? <div className="muted">Loading details...</div> : null}
      {error ? <div className="error-panel">{error}</div> : null}

      {transferDetail ? (
        <div className="card-stack">
          <div className="card-row">
            <strong>{transferDetail.direction}</strong>
            <StatusBadge status={transferDetail.status} />
          </div>
          <div className="muted">Technician: {transferDetail.technician?.name ?? transferDetail.technicianId}</div>
          {transferDetail.reason ? <div className="muted">Reason: {transferDetail.reason}</div> : null}
          {transferDetail.lines && transferDetail.lines.length > 0 ? (
            <div className="card-stack">
              <strong>Lines</strong>
              {transferDetail.lines.map((line) => (
                <div key={line.id} className="card-row">
                  <span>{line.productId}</span>
                  <span>
                    {line.quantity} {line.unitLabel}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {transferDetail.disputeNote ? <div className="muted">Dispute note: {transferDetail.disputeNote}</div> : null}
        </div>
      ) : null}

      {checkoutDetail ? (
        <div className="card-stack">
          <div className="card-row">
            <strong>Checkout</strong>
            <StatusBadge status={checkoutDetail.status} />
          </div>
          <div className="muted">Technician: {checkoutDetail.technician?.name ?? checkoutDetail.technicianId}</div>
          <div className="muted">Requested: {new Date(checkoutDetail.requestDate).toLocaleString()}</div>
          {checkoutDetail.lines && checkoutDetail.lines.length > 0 ? (
            <div className="card-stack">
              <strong>Lines</strong>
              {checkoutDetail.lines.map((line) => (
                <div key={line.id} className="card-row">
                  <span>{line.productId}</span>
                  <span>
                    {line.qtyRequested} {line.checkoutUnitLabel}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
}
