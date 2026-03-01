import { useAuth } from '../auth';
import { OfflineQueueIndicator } from './common/OfflineQueueIndicator';
import { BulkProductImportPanel } from './settings/BulkProductImportPanel';
import { EpaImportPanel } from './settings/EpaImportPanel';
import { SuppliersPanel } from './settings/SuppliersPanel';
import { UsersPanel } from './settings/UsersPanel';

export function SettingsView() {
  const { user } = useAuth();
  const canAccess = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  if (!canAccess) {
    return (
      <section>
        <header className="section-header">
          <div>
            <h2>Settings</h2>
            <p>Not authorized.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Settings</h2>
          <p>Initial setup and admin tools.</p>
        </div>
      </header>
      <div className="card-stack">
        <section className="card">
          <h3>Connection Status</h3>
          <p className="muted">Offline queue and sync indicator.</p>
          <OfflineQueueIndicator />
        </section>
        {user?.role === 'ADMIN' ? <UsersPanel /> : null}
        <SuppliersPanel />
        <BulkProductImportPanel />
        <EpaImportPanel />
      </div>
    </section>
  );
}
