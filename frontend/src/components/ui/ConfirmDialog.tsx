import { createContext, useContext, useMemo, useState } from 'react';
import { ModalShell } from './ModalShell';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmState = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const value = useMemo<ConfirmContextValue>(() => {
    return {
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setState({ options, resolve });
        }),
    };
  }, []);

  function close(result: boolean) {
    if (!state) return;
    state.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ModalShell
        open={Boolean(state)}
        title={state?.options.title || 'Confirm'}
        onClose={() => close(false)}
        actions={
          <div className="confirm-actions">
            <button type="button" className="ghost-button" onClick={() => close(false)}>
              {state?.options.cancelLabel || 'Cancel'}
            </button>
            <button type="button" onClick={() => close(true)}>
              {state?.options.confirmLabel || 'Confirm'}
            </button>
          </div>
        }
      >
        <p>{state?.options.message}</p>
      </ModalShell>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
