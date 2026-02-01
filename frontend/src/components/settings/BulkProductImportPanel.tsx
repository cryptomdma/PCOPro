import { useState } from 'react';
import axios from 'axios';

type BulkImportResult = {
  rowsRead: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  createdCount?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  created?: number;
  mode?: string;
  dryRun?: boolean;
  initialPostedCount?: number;
  initialSkippedCount?: number;
  idempotencyKeys?: string[];
  failures?: Array<{ rowIndex: number; identifier: string; field?: string; rawValue?: string; reason: string }>;
  updatedSample?: string[];
  createdSample?: string[];
  message?: string;
};

export function BulkProductImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<'upsert' | 'initial_load'>('upsert');

  async function uploadCsv(dryRun: boolean) {
    if (!file) {
      setError('Select a CSV file first.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`/api/v1/products/bulk-import?mode=${mode}&dryRun=${dryRun}`, formData);
      setResult(response.data);
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.rowsRead !== undefined) {
        setResult(data);
      } else {
        setResult(null);
      }
      setError(data?.message || 'Bulk import failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <h4>Bulk Product Import</h4>
      <p className="muted">Upsert products with a preview step, or run an initial load for new products only.</p>
      <div className="card-row">
        <label className="muted">
          <input
            type="radio"
            name="bulk-import-mode"
            checked={mode === 'upsert'}
            onChange={() => setMode('upsert')}
          />{' '}
          Upsert Products (metadata only)
        </label>
        <label className="muted">
          <input
            type="radio"
            name="bulk-import-mode"
            checked={mode === 'initial_load'}
            onChange={() => setMode('initial_load')}
          />{' '}
          Initial Load (create + optional initial stock for new products)
        </label>
      </div>
      <p className="muted">
        Headers: productId | sku | name | epa | defaultCostPerBase | category | productType | baseType |
        trackingUnitLabel | checkoutUnitLabel | orderingUnitLabel | trackingToBase | checkoutToBase | orderingToBase
        {mode === 'initial_load' ? ' | initialQty | initialScope | asOfDate' : ''}.
      </p>
      <p className="muted">
        Examples: category = Chemical, Ant Bait, PPE, Equipment; productType = Ant Bait, Roach Bait, Repellent, Aerosol,
        Dust, Granule. baseType = MASS | VOLUME | COUNT.
      </p>
      <div className="card-row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => uploadCsv(true)} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Preview'}
        </button>
        <button type="button" onClick={() => uploadCsv(false)} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Apply'}
        </button>
      </div>
      {error ? <div className="error-panel">{error}</div> : null}
      {result ? (
        <div className="card-stack">
          {result.message ? <div className="muted">{result.message}</div> : null}
          <div className="muted">
            Mode: {result.mode ?? mode} {result.dryRun ? '(preview)' : ''} | Rows: {result.rowsRead} | Created:{' '}
            {result.created ?? result.createdCount ?? 0} | Updated: {result.updated ?? result.updatedCount} | Skipped:{' '}
            {result.skipped ?? result.skippedCount} | Failed: {result.failed ?? result.failedCount}
          </div>
          {result.initialPostedCount !== undefined ? (
            <div className="muted">
              Initial stock posted: {result.initialPostedCount} | Initial stock skipped: {result.initialSkippedCount ?? 0}
            </div>
          ) : null}
          {result.updatedSample?.length ? (
            <div className="muted">Updated sample: {result.updatedSample.join(', ')}</div>
          ) : null}
          {result.createdSample?.length ? (
            <div className="muted">Created sample: {result.createdSample.join(', ')}</div>
          ) : null}
          {result.idempotencyKeys?.length ? (
            <div className="muted">Idempotency sample: {result.idempotencyKeys.join(', ')}</div>
          ) : null}
          {result.failures?.length ? (
            <textarea
              readOnly
              rows={Math.min(10, result.failures.length + 1)}
              value={result.failures
                .map((failure) => {
                  const fieldInfo = failure.field ? ` | ${failure.field}` : '';
                  const rawInfo = failure.rawValue ? ` = "${failure.rawValue}"` : '';
                  return `Row ${failure.rowIndex} (${failure.identifier}${fieldInfo}${rawInfo}): ${failure.reason}`;
                })
                .join('\n')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
