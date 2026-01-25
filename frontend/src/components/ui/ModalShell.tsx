import { useEffect } from 'react';

export function ModalShell({
  open,
  title,
  onClose,
  children,
  actions,
  headerContent,
  sheetClassName,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  headerContent?: React.ReactNode;
  sheetClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;
  const sheetClass = ['modal-sheet', sheetClassName].filter(Boolean).join(' ');
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={sheetClass} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {headerContent ? (
            headerContent
          ) : (
            <>
              <div className="modal-title">{title}</div>
              <button type="button" onClick={onClose} className="ghost-button" aria-label="Close">
                X
              </button>
            </>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
