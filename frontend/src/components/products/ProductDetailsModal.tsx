import { QRCodeCanvas } from 'qrcode.react';
import { ModalShell } from '../ui/ModalShell';
import { formatProductType } from './productType';

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
  const stock = getStockDisplay({
    role: user?.role,
    onHandBase: product?.balances?.onHandBase ?? 0,
    trackingToBase: product?.trackingToBase ?? null,
    trackingUnitLabel: product?.trackingUnitLabel ?? null,
  });

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
