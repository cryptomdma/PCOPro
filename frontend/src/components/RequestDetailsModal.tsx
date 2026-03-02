import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ModalShell } from './ui/ModalShell';
import { StatusBadge } from './ui/StatusBadge';
import { ProductDetailsModal } from './products/ProductDetailsModal';
import { useAuth } from '../auth';
import { getStockDisplay } from '../utils/stockDisplay';

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
  disputeStatus?: 'NONE' | 'OPEN' | 'MANAGER_RESPONDED' | 'RESOLVED';
  disputeReason?: 'MISSING_ITEM' | 'WRONG_QTY' | 'WRONG_PRODUCT' | 'DAMAGED' | 'OTHER' | null;
  technicianId: string;
  technician?: { id: string; name: string; licenseNumber?: string | null };
  reason?: string;
  pickupDate?: string;
  fulfillmentNote?: string | null;
  changeRequestPayload?: {
    direction?: string;
    reason?: string;
    pickupDate?: string;
    lines?: Array<{ productId: string; quantity: number; unitLabel: string }>;
  } | null;
  createdAt: string;
  finalizedAt?: string;
  acknowledgedAt?: string;
  disputeNote?: string;
  disputePhotoPath?: string | null;
  disputeOpenedAt?: string | null;
  disputeResolutionNote?: string | null;
  disputeResolvedAt?: string | null;
  lines?: Array<{ id: string; productId: string; quantity: number; unitLabel: string }>;
};

type CheckoutRequestDetail = {
  id: string;
  status: string;
  requestDate: string;
  technicianId: string;
  technician?: { id: string; name: string; technicianId?: string; technician?: { licenseNumber?: string | null } };
  lines?: Array<{ id: string; productId: string; qtyRequested: number; qtyIssued?: number; checkoutUnitLabel: string }>;
};

type ProductSummary = {
  id: string;
  name: string;
  category?: string | null;
  epaRegNo?: string | null;
  description?: string | null;
  productType?: string | null;
  trackingUnitLabel?: string;
  trackingToBase?: number;
  balances?: { onHandBase: number } | null;
};

export function RequestDetailsModal({
  open,
  source,
  onUpdated,
  onClose,
}: {
  open: boolean;
  source: RequestDetailsSource | null;
  onUpdated?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferDetail, setTransferDetail] = useState<TransferRequestDetail | null>(null);
  const [checkoutDetail, setCheckoutDetail] = useState<CheckoutRequestDetail | null>(null);
  const [productById, setProductById] = useState<Record<string, ProductSummary>>({});
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<'MISSING_ITEM' | 'WRONG_QTY' | 'WRONG_PRODUCT' | 'DAMAGED' | 'OTHER'>('MISSING_ITEM');
  const [disputeNote, setDisputeNote] = useState('');
  const [disputePhoto, setDisputePhoto] = useState<File | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [disputeBusy, setDisputeBusy] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    setLoading(true);
    setError(null);
    setTransferDetail(null);
    setCheckoutDetail(null);
    setDisputeOpen(false);
    setDisputeReason('MISSING_ITEM');
    setDisputeNote('');
    setDisputePhoto(null);
    setResolutionNote('');
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

  useEffect(() => {
    if (!open || !selectedProductId) return;
    if (productById[selectedProductId]) return;
    axios
      .get<ProductSummary>(`/api/v1/products/${selectedProductId}`)
      .then((res) => {
        setProductById((prev) => ({ ...prev, [res.data.id]: res.data }));
      })
      .catch(() => undefined);
  }, [open, selectedProductId, productById]);

  const technicianLabel = useMemo(() => {
    const name =
      source?.technicianName ??
      transferDetail?.technician?.name ??
      checkoutDetail?.technician?.name ??
      'Unknown technician';
    const license =
      transferDetail?.technician?.licenseNumber ??
      checkoutDetail?.technician?.technician?.licenseNumber ??
      null;
    const licenseLabel = license ? `Lic #${license}` : 'Lic # missing';
    return `${name} | ${licenseLabel}`;
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

  const selectedProduct = selectedProductId ? productById[selectedProductId] : null;
  const isTechOwner = user?.role === 'TECH' && transferDetail?.technicianId === user?.technicianId;
  const isNonTech = user?.role !== 'TECH';
  const canOpenDispute =
    Boolean(
      transferDetail &&
        isTechOwner &&
        (transferDetail.status === 'ACK_PENDING' || transferDetail.status === 'FINALIZED') &&
        transferDetail.disputeStatus !== 'OPEN' &&
        transferDetail.disputeStatus !== 'MANAGER_RESPONDED',
    );
  const canResolveDispute = Boolean(
    transferDetail &&
      isNonTech &&
      (transferDetail.disputeStatus === 'OPEN' || transferDetail.disputeStatus === 'MANAGER_RESPONDED'),
  );

  async function reloadTransferDetail() {
    if (!source || source.type !== 'transfer') return;
    const id = source.transferGroupId ?? source.requestId;
    const res = await axios.get<TransferRequestDetail>(`/api/v1/transfer-requests/${id}`);
    setTransferDetail(res.data);
    await onUpdated?.();
  }

  async function submitDispute() {
    if (!transferDetail) return;
    if (disputeReason === 'OTHER' && !disputeNote.trim()) {
      setError('Dispute note is required when reason is OTHER.');
      return;
    }
    setDisputeBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('reason', disputeReason);
      if (disputeNote.trim()) {
        form.append('note', disputeNote.trim());
      }
      if (disputePhoto) {
        form.append('photo', disputePhoto);
      }
      await axios.post(`/api/v1/transfer-requests/${transferDetail.id}/dispute`, form);
      setDisputeOpen(false);
      setDisputeNote('');
      setDisputePhoto(null);
      await reloadTransferDetail();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit dispute');
    } finally {
      setDisputeBusy(false);
    }
  }

  async function resolveDispute() {
    if (!transferDetail || !resolutionNote.trim()) {
      setError('Resolution note is required.');
      return;
    }
    setDisputeBusy(true);
    setError(null);
    try {
      await axios.post(`/api/v1/transfer-requests/${transferDetail.id}/dispute/resolve`, {
        resolutionNote: resolutionNote.trim(),
      });
      setResolutionNote('');
      await reloadTransferDetail();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to resolve dispute');
    } finally {
      setDisputeBusy(false);
    }
  }

  return (
    <ModalShell open={open} title="Request Details" onClose={onClose}>
      {loading ? <div className="muted">Loading details...</div> : null}
      {error ? <div className="error-panel">{error}</div> : null}

      {transferDetail ? (
        <div className="card-stack">
          {transferDetail.status === 'CHANGE_REQUESTED' ? (
            <div className="result-panel">
              <h4>Pending Change Request</h4>
              <p>Review these proposed changes before approving or denying.</p>
            </div>
          ) : null}
          <div className="muted">Technician: {technicianLabel}</div>
          <div className="muted">Date: {formattedEventAt}</div>
          <div className="card-row">
            <strong>{transferDetail.direction}</strong>
            <StatusBadge status={transferDetail.status} />
          </div>
          <div className="muted">Created: {new Date(transferDetail.createdAt).toLocaleString()}</div>
          {transferDetail.pickupDate ? (
            <div className="muted">
              Pickup Date:{' '}
              {new Date(
                transferDetail.status === 'CHANGE_REQUESTED'
                  ? transferDetail.changeRequestPayload?.pickupDate ?? transferDetail.pickupDate
                  : transferDetail.pickupDate,
              ).toLocaleString()}
            </div>
          ) : null}
          {transferDetail.finalizedAt ? (
            <div className="muted">Finalized: {new Date(transferDetail.finalizedAt).toLocaleString()}</div>
          ) : null}
          {transferDetail.acknowledgedAt ? (
            <div className="muted">Acknowledged: {new Date(transferDetail.acknowledgedAt).toLocaleString()}</div>
          ) : null}
          <div className="muted">
            Reason: {transferDetail.status === 'CHANGE_REQUESTED' ? transferDetail.changeRequestPayload?.reason ?? transferDetail.reason ?? 'N/A' : transferDetail.reason ?? 'N/A'}
          </div>
          {transferDetail.fulfillmentNote ? <div className="muted">Fulfillment note: {transferDetail.fulfillmentNote}</div> : null}
          {transferDetail.disputeStatus && transferDetail.disputeStatus !== 'NONE' ? (
            <div className="result-panel">
              <h4>Dispute</h4>
              <div className="muted">Status: {transferDetail.disputeStatus}</div>
              {transferDetail.disputeReason ? <div className="muted">Reason: {transferDetail.disputeReason}</div> : null}
              {transferDetail.disputeOpenedAt ? (
                <div className="muted">Opened: {new Date(transferDetail.disputeOpenedAt).toLocaleString()}</div>
              ) : null}
              {transferDetail.disputeNote ? <div className="muted">Note: {transferDetail.disputeNote}</div> : null}
              {transferDetail.disputePhotoPath ? (
                <div className="card-stack">
                  <div className="muted">Attached Photo</div>
                  <img
                    src={`/api/v1/transfer-requests/${transferDetail.id}/dispute-photo`}
                    alt="Dispute evidence"
                    style={{ width: '100%', maxWidth: 320, borderRadius: 12, border: '1px solid var(--border)' }}
                  />
                </div>
              ) : null}
              {transferDetail.disputeResolutionNote ? (
                <div className="muted">Resolution: {transferDetail.disputeResolutionNote}</div>
              ) : null}
              {transferDetail.disputeResolvedAt ? (
                <div className="muted">Resolved: {new Date(transferDetail.disputeResolvedAt).toLocaleString()}</div>
              ) : null}
            </div>
          ) : null}

          {canOpenDispute ? (
            <div className="card-stack">
              {!disputeOpen ? (
                <button type="button" onClick={() => setDisputeOpen(true)}>
                  Dispute / Report Problem
                </button>
              ) : (
                <div className="card-stack">
                  <h4>Report Problem</h4>
                  <label>
                    Reason
                    <select
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value as typeof disputeReason)}
                      disabled={disputeBusy}
                    >
                      <option value="MISSING_ITEM">Missing Item</option>
                      <option value="WRONG_QTY">Wrong Qty</option>
                      <option value="WRONG_PRODUCT">Wrong Product</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label>
                    Note {disputeReason === 'OTHER' ? '(required)' : '(optional)'}
                    <textarea
                      rows={3}
                      value={disputeNote}
                      onChange={(e) => setDisputeNote(e.target.value)}
                      disabled={disputeBusy}
                    />
                  </label>
                  <label>
                    Photo (optional)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setDisputePhoto(e.target.files?.[0] ?? null)}
                      disabled={disputeBusy}
                    />
                  </label>
                  <div className="pill-row">
                    <button type="button" onClick={submitDispute} disabled={disputeBusy}>
                      {disputeBusy ? 'Submitting...' : 'Submit Dispute'}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setDisputeOpen(false)} disabled={disputeBusy}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {canResolveDispute ? (
            <div className="card-stack">
              <h4>Resolve Dispute</h4>
              <label>
                Resolution note
                <textarea rows={3} value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
              </label>
              <button type="button" onClick={resolveDispute} disabled={disputeBusy || !resolutionNote.trim()}>
                {disputeBusy ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          ) : null}

          {(transferDetail.status === 'CHANGE_REQUESTED'
            ? transferDetail.changeRequestPayload?.lines ?? transferDetail.lines
            : transferDetail.lines
          )?.length ? (
            <div className="card-stack">
              <strong>Lines</strong>
              {(transferDetail.status === 'CHANGE_REQUESTED'
                ? transferDetail.changeRequestPayload?.lines ?? transferDetail.lines
                : transferDetail.lines
              ).map((line, idx) => {
                const product = productById[line.productId];
                const stock = getStockDisplay({
                  role: user?.role,
                  onHandBase: product?.balances?.onHandBase ?? 0,
                  trackingToBase: product?.trackingToBase ?? null,
                  trackingUnitLabel: product?.trackingUnitLabel ?? null,
                });
                return (
                  <div key={(line as any).id ?? `${line.productId}-${idx}`} className="card-stack">
                    <div className="card-row">
                      <button
                        type="button"
                        className="line-item-button"
                        onClick={() => {
                          setSelectedProductId(line.productId);
                        }}
                      >
                        <span>
                          {product?.name ?? line.productId}
                          {product?.category ? <span className="muted"> | {product.category}</span> : null}
                        </span>
                        <span className="muted">{'>'}</span>
                      </button>
                      <span>
                        {line.quantity} {line.unitLabel}
                      </span>
                    </div>
                    <div className="muted">On-hand: {stock.label}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
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
                const stock = getStockDisplay({
                  role: user?.role,
                  onHandBase: product?.balances?.onHandBase ?? 0,
                  trackingToBase: product?.trackingToBase ?? null,
                  trackingUnitLabel: product?.trackingUnitLabel ?? null,
                });
                return (
                  <div key={line.id} className="card-stack">
                    <div className="card-row">
                      <button
                        type="button"
                        className="line-item-button"
                        onClick={() => {
                          setSelectedProductId(line.productId);
                        }}
                      >
                        <span>
                          {product?.name ?? line.productId}
                          {product?.category ? <span className="muted"> | {product.category}</span> : null}
                        </span>
                        <span className="muted">{'>'}</span>
                      </button>
                      <span>
                        {quantity} {line.checkoutUnitLabel}
                      </span>
                    </div>
                    <div className="muted">On-hand: {stock.label}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <ProductDetailsModal open={Boolean(selectedProductId)} product={selectedProduct} onClose={() => setSelectedProductId(null)} />
    </ModalShell>
  );
}
