import { useEffect, useMemo, useState } from 'react';
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

type ProductSummary = {
  id: string;
  name: string;
  category?: string | null;
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
  const [productById, setProductById] = useState<Record<string, ProductSummary>>({});
  const [productsLoaded, setProductsLoaded] = useState(false);

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

  useEffect(() => {
    if (!open || productsLoaded) return;
    axios
      .get<ProductSummary[]>('/api/v1/products', { params: { limit: 500 } })
      .then((res) => {
        const map: Record<string, ProductSummary> = {};
        res.data.forEach((product) => {
          map[product.id] = product;
        });
        setProductById(map);
        setProductsLoaded(true);
      })
      .catch(() => {
        setProductsLoaded(true);
      });
  }, [open, productsLoaded]);

  const technicianLabel = useMemo(() => {
    return (
      source?.technicianName ??
      transferDetail?.technician?.name ??
      transferDetail?.technicianId ??
      checkoutDetail?.technician?.name ??
      checkoutDetail?.technicianId ??
      'Unknown'
    );
  }, [source, transferDetail, checkoutDetail]);

  const eventAt = useMemo(() => {
    return (
      source?.eventAt ??
      transferDetail?.finalizedAt ??
      transferDetail?.createdAt ??
      checkoutDetail?.requestDate ??
      null
    );
  }, [source, transferDetail, checkoutDetail]);

  const formattedEventAt = eventAt ? new Date(eventAt).toLocaleString() : 'Unknown time';

  return (
    <ModalShell open={open} title="Request Details" onClose={onClose}>
      {loading ? <div className="muted">Loading details...</div> : null}
      {error ? <div className="error-panel">{error}</div> : null}

      {transferDetail ? (
        <div className="card-stack">
          <div className="muted">Technician: {technicianLabel}</div>
          <div className="muted">Date: {formattedEventAt}</div>
          <div className="card-row">
            <strong>{transferDetail.direction}</strong>
            <StatusBadge status={transferDetail.status} />
          </div>
          <div className="muted">Created: {new Date(transferDetail.createdAt).toLocaleString()}</div>
          {transferDetail.finalizedAt ? (
            <div className="muted">Finalized: {new Date(transferDetail.finalizedAt).toLocaleString()}</div>
          ) : null}
          {transferDetail.acknowledgedAt ? (
            <div className="muted">Acknowledged: {new Date(transferDetail.acknowledgedAt).toLocaleString()}</div>
          ) : null}
          {transferDetail.reason ? <div className="muted">Reason: {transferDetail.reason}</div> : null}
          {transferDetail.lines && transferDetail.lines.length > 0 ? (
            <div className="card-stack">
              <strong>Lines</strong>
              {transferDetail.lines.map((line) => {
                const product = productById[line.productId];
                return (
                  <div key={line.id} className="card-row">
                    <span>
                      {product?.name ?? line.productId}
                      {product?.category ? <span className="muted"> | {product.category}</span> : null}
                    </span>
                    <span>
                      {line.quantity} {line.unitLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {transferDetail.disputeNote ? <div className="muted">Dispute note: {transferDetail.disputeNote}</div> : null}
        </div>
      ) : null}

      {checkoutDetail ? (
        <div className="card-stack">
          <div className="muted">Technician: {technicianLabel}</div>
          <div className="muted">Date: {formattedEventAt}</div>
          <div className="card-row">
            <strong>Checkout</strong>
            <StatusBadge status={checkoutDetail.status} />
          </div>
          <div className="muted">Requested: {new Date(checkoutDetail.requestDate).toLocaleString()}</div>
          {checkoutDetail.lines && checkoutDetail.lines.length > 0 ? (
            <div className="card-stack">
              <strong>Lines</strong>
              {checkoutDetail.lines.map((line) => {
                const product = productById[line.productId];
                const quantity = line.qtyIssued ?? line.qtyRequested;
                return (
                  <div key={line.id} className="card-row">
                    <span>
                      {product?.name ?? line.productId}
                      {product?.category ? <span className="muted"> | {product.category}</span> : null}
                    </span>
                    <span>
                      {quantity} {line.checkoutUnitLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
}
