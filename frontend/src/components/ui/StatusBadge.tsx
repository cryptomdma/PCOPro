export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return <span className={`status-badge status-${key}`}>{status}</span>;
}
