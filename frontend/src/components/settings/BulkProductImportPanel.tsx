import { useState } from 'react';
import axios from 'axios';

type BulkImportResult = {
  rowsRead: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  failures?: Array<{ rowIndex: number; identifier: string; reason: string }>;
  updated?: string[];
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
      <div className="card-row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={uploadCsv} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {error ? <div className="error-panel">{error}</div> : null}
      {result ? (
        <div className="card-stack">
          <div className="muted">
            Rows: {result.rowsRead} | Updated: {result.updatedCount} | Skipped: {result.skippedCount} | Failed:{' '}
            {result.failedCount}
          </div>
          {result.updated?.length ? <div className="muted">Updated sample: {result.updated.join(', ')}</div> : null}
          {result.failures?.length ? (
            <textarea
              readOnly
              rows={Math.min(10, result.failures.length + 1)}
              value={result.failures
                .map((failure) => `Row ${failure.rowIndex} (${failure.identifier}): ${failure.reason}`)
                .join('\n')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
