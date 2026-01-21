import { useMemo } from 'react';
import { SearchableSelect } from './SearchableSelect';

type Option = {
  value: string;
  label: string;
  subtitle?: string;
};

type Props = {
  label: string;
  placeholder?: string;
  values: string[];
  options: Option[];
  onChange: (values: string[]) => void;
};

export function MultiSearchableSelect({ label, placeholder, values, options, onChange }: Props) {
  const selectedOptions = useMemo(() => {
    const selected = new Map(options.map((opt) => [opt.value, opt]));
    return values.map((value) => selected.get(value) ?? { value, label: value });
  }, [options, values]);

  function addValue(value: string) {
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
  }

  function removeValue(value: string) {
    onChange(values.filter((item) => item !== value));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="multi-select">
      <SearchableSelect label={label} placeholder={placeholder} value="" onChange={addValue} options={options} />
      {values.length ? (
        <div className="chip-scroll">
          <div className="chip-row">
            {selectedOptions.map((opt) => (
              <span key={opt.value} className="chip">
                {opt.label}
                <button type="button" aria-label={`Remove ${opt.label}`} onClick={() => removeValue(opt.value)}>
                  X
                </button>
              </span>
            ))}
            <button type="button" className="chip-clear" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
