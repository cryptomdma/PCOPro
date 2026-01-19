import { useMemo, useRef, useState } from 'react';

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

  function handleSelect(next: Option) {
    onChange(next.value);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }

  return (
    <label className="searchable-select">
      {label}
      <button
        type="button"
        className="searchable-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        ref={triggerRef}
      >
        <span>{selected ? selected.label : placeholder || 'Select'}</span>
        <span className="muted">{selected?.subtitle ?? ''}</span>
      </button>
      {required ? <input className="sr-only" required value={value} onChange={() => undefined} /> : null}
      {open ? (
        <div className="searchable-panel">
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
                const next = filtered[0];
                if (next) {
                  e.preventDefault();
                  handleSelect(next);
                }
              }
            }}
          />
          <div className="searchable-list">
            {filtered.length ? (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="searchable-option"
                  onClick={() => handleSelect(opt)}
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
      ) : null}
    </label>
  );
}
