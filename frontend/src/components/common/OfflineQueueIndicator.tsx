import { useEffect, useState } from 'react';

export function OfflineQueueIndicator() {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    function handle() {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', handle);
    window.addEventListener('offline', handle);
    return () => {
      window.removeEventListener('online', handle);
      window.removeEventListener('offline', handle);
    };
  }, []);

  // Placeholder queue size; would read from IndexedDB in production
  useEffect(() => {
    const timer = setInterval(() => setPending((p) => (p + 1) % 4), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`badge ${online ? 'online' : 'offline'}`} title="Offline queue status">
      {online ? 'Online' : 'Offline'} • {pending} queued
    </div>
  );
}
