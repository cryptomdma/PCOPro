import { QRCodeCanvas } from 'qrcode.react';
import { ModalShell } from '../ui/ModalShell';

export type ProductDetails = {
  id: string;
  name: string;
  category?: string | null;
  epaRegNo?: string | null;
  description?: string | null;
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
  return (
    <ModalShell open={open} title={product?.name ?? 'Product'} onClose={onClose}>
      {product ? (
        <div className="card-stack">
          <div>
            <div className="muted">Product ID</div>
            <div>{product.id}</div>
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
