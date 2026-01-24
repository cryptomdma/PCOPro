import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import { ModalShell } from '../ui/ModalShell';
import { formatProductType } from './productType';
import { useAuth } from '../../auth';
import { getStockDisplay } from '../../utils/stockDisplay';

export type ProductDetails = {
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

export function ProductDetailsModal({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: ProductDetails | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [parBase, setParBase] = useState<number | null>(null);
  const [parInput, setParInput] = useState('');
  const [parSaving, setParSaving] = useState(false);
  const [parError, setParError] = useState<string | null>(null);
  const locationScope = 'WAREHOUSE';
  const canEditPar = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const showPar = user?.role !== 'TECH';

  const stock = getStockDisplay({
    role: user?.role,
    onHandBase: product?.balances?.onHandBase ?? 0,
    trackingToBase: product?.trackingToBase ?? null,
    trackingUnitLabel: product?.trackingUnitLabel ?? null,
  });

  const parTracking = useMemo(() => {
    if (!parBase || !product?.trackingToBase) return null;
    return Math.round((parBase / product.trackingToBase) * 100) / 100;
  }, [parBase, product?.trackingToBase]);

  useEffect(() => {
    if (!open || !product || !showPar) return;
    setParError(null);
    axios
      .get<{ productId: string; locationScope: string; parBase: number }[]>('/api/v1/par-levels', {
        params: { locationScope },
      })
      .then((res) => {
        const match = res.data.find((row) => row.productId === product.id);
        const nextBase = match?.parBase ?? null;
        setParBase(nextBase);
        if (nextBase !== null && product.trackingToBase) {
          setParInput(String(Math.round((nextBase / product.trackingToBase) * 100) / 100));
        } else {
          setParInput('');
        }
      })
      .catch((err) => {
        setParError(err?.response?.data?.message || 'Unable to load par level.');
        setParBase(null);
        setParInput('');
      });
  }, [open, product, showPar]);

  async function savePar() {
    if (!product || !product.trackingToBase) return;
    const parsed = Number(parInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setParError('Par must be a number greater than or equal to 0.');
      return;
    }
    setParError(null);
    setParSaving(true);
    try {
      const response = await axios.put<{ productId: string; locationScope: string; parBase: number }[]>(
        '/api/v1/par-levels',
        {
          locationScope,
          items: [{ productId: product.id, parQty: parsed, unitBasis: 'TRACKING' }],
        },
      );
      const updated = response.data.find((row) => row.productId === product.id);
      const nextBase = updated?.parBase ?? Math.round(parsed * product.trackingToBase);
      setParBase(nextBase);
    } catch (err: any) {
      setParError(err?.response?.data?.message || 'Unable to save par level.');
    } finally {
      setParSaving(false);
    }
  }

  return (
    <ModalShell open={open} title={product?.name ?? 'Product'} onClose={onClose}>
      {product ? (
        <div className="card-stack">
          <div>
            <div className="muted">Product ID</div>
            <div>{product.id}</div>
          </div>
          <div>
            <div className="muted">On-hand</div>
            <div>{stock.label}</div>
          </div>
          {showPar ? (
            <div>
              <div className="muted">Par (WAREHOUSE)</div>
              <div>{parTracking !== null && product?.trackingUnitLabel ? `${parTracking} ${product.trackingUnitLabel}` : '-'}</div>
              {canEditPar ? (
                <div className="card-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={parInput}
                    onChange={(e) => setParInput(e.target.value)}
                    placeholder="Set par"
                  />
                  <button type="button" onClick={savePar} disabled={parSaving}>
                    {parSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : null}
              {parError ? <div className="muted">{parError}</div> : null}
            </div>
          ) : null}
          <div>
            <div className="muted">Type</div>
            <div>{formatProductType(product.productType)}</div>
          </div>
          <div>
            <div className="muted">EPA</div>
            <div>{product.epaRegNo ?? 'N/A'}</div>
          </div>
          <div>
            <div className="muted">Description</div>
            <div>{product.description || 'No description provided.'}</div>
          </div>
          <div>
            <div className="muted">Category</div>
            <div>{product.category || 'N/A'}</div>
          </div>
          <div>
            <div className="muted">QR Code</div>
            <div className="qr-preview">
              <QRCodeCanvas value={`MGPC:prod:${product.id}`} size={160} />
            </div>
          </div>
        </div>
      ) : (
        <div className="muted">Product not found.</div>
      )}
    </ModalShell>
  );
}
