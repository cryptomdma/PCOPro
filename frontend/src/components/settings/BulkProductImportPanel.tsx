import { useState } from 'react';
import axios from 'axios';

type BulkImportResult = {
  rowsRead: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  failures?: Array<{ rowIndex: number; identifier: string; field?: string; rawValue?: string; reason: string }>;
  updatedSample?: string[];
  message?: string;
};

export function BulkProductImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadCsv() {
    if (!file) {
      setError('Select a CSV file first.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('/api/v1/products/bulk-import', formData);
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
      <h4>Bulk Product Update</h4>
      <p className="muted">Upload a CSV to update existing products (EPA, SKU, cost, category, type).</p>
      <p className="muted">
        Headers: productId | sku | name | epa | defaultCostPerBase | category | productType. Examples: category =
        Chemical, Ant Bait, PPE, Equipment; productType = Ant Bait, Roach Bait, Repellent, Aerosol, Dust, Granule.
      </p>
      <div className="card-row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={uploadCsv} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {error ? <div className="error-panel">{error}</div> : null}
      {result ? (
        <div className="card-stack">
          {result.message ? <div className="muted">{result.message}</div> : null}
          <div className="muted">
            Rows: {result.rowsRead} | Updated: {result.updated ?? result.updatedCount} | Skipped:{' '}
            {result.skipped ?? result.skippedCount} | Failed: {result.failed ?? result.failedCount}
          </div>
          {result.updatedSample?.length ? (
            <div className="muted">Updated sample: {result.updatedSample.join(', ')}</div>
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
