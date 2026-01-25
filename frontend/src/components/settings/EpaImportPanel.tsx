import { useState } from 'react';
import axios from 'axios';

export function EpaImportPanel() {
  const [epaFile, setEpaFile] = useState<File | null>(null);
  const [epaResult, setEpaResult] = useState<any | null>(null);
  const [epaError, setEpaError] = useState<string | null>(null);
  const [epaUploading, setEpaUploading] = useState(false);

  async function uploadEpaCsv() {
    if (!epaFile) {
      setEpaError('Select a CSV file first.');
      return;
    }
    setEpaError(null);
    setEpaUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', epaFile);
      const response = await axios.post('/api/v1/products/epa-import', formData);
      setEpaResult(response.data);
    } catch (err: any) {
      setEpaError(err?.response?.data?.message || 'EPA import failed.');
      setEpaResult(null);
    } finally {
      setEpaUploading(false);
    }
  }

  return (
    <div className="card">
      <h4>EPA Import</h4>
      <p className="muted">Upload a CSV to update EPA numbers for existing products.</p>
      <div className="card-row">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setEpaFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" onClick={uploadEpaCsv} disabled={epaUploading}>
          {epaUploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {epaError ? <div className="error-panel">{epaError}</div> : null}
      {epaResult ? (
        <div className="card-stack">
          <div className="muted">
            Rows: {epaResult.rowsRead} | Updated: {epaResult.updatedCount} | Skipped: {epaResult.skippedCount} | Failed:{' '}
            {epaResult.failedCount}
          </div>
          {epaResult.failures?.length ? (
            <textarea
              readOnly
              rows={Math.min(8, epaResult.failures.length + 1)}
              value={epaResult.failures
                .map((failure: any) => `Row ${failure.rowIndex} (${failure.identifier}): ${failure.reason}`)
                .join('\n')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
