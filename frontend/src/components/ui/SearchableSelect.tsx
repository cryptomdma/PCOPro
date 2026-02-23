import { useEffect, useMemo, useRef, useState } from 'react';

type Option = {
  value: string;
  label: string;
  subtitle?: string;
};

type Props = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  required?: boolean;
};

export function SearchableSelect({ label, placeholder, value, onChange, options, required }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const selected = options.find((opt) => opt.value === value);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term) ||
        (opt.subtitle || '').toLowerCase().includes(term),
    );
  }, [options, query]);

  function selectOption(next: Option) {
    onChange(next.value);
    setQuery('');
    setOpen(false);
    requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
      triggerRef.current?.focus();
    });
  }

  useEffect(() => {
    if (!open) return;

    function closeMenu() {
      setOpen(false);
      setQuery('');
    }

    function handlePointerDown(event: PointerEvent | MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      closeMenu();
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="searchable-select">
      <span>{label}</span>
      <button
        type="button"
        className="searchable-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        ref={triggerRef}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
      >
        <span>{selected ? selected.label : placeholder || 'Select'}</span>
        <span className="muted">{selected?.subtitle ?? ''}</span>
      </button>
      {required ? <input className="sr-only" required value={value} onChange={() => undefined} /> : null}
      {open && (
        <>
          <div
            className="ss-backdrop"
            onPointerDown={(e) => {
              e.preventDefault();
              setOpen(false);
              setQuery('');
            }}
          />
          <div className="ss-panel" ref={panelRef}>
            <input
              autoFocus
              className="searchable-input"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                  setQuery('');
                  triggerRef.current?.focus();
                }
                if (e.key === 'Enter') {
                  const term = query.trim();
                  if (!term) return;
                  const next = filtered[0];
                  if (next) {
                    e.preventDefault();
                    selectOption(next);
                  }
                }
              }}
            />
            <div className="ss-list">
              {filtered.length ? (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="searchable-option"
                    onPointerUp={() => selectOption(opt)}
                    onClick={() => selectOption(opt)}
                  >
                    <div>{opt.label}</div>
                    {opt.subtitle ? <div className="muted">{opt.subtitle}</div> : null}
                  </button>
                ))
              ) : (
                <div className="muted">No matches</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
