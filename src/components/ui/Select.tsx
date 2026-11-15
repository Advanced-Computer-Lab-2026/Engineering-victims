import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: SelectOption[];
  /** Sentinel for "no filter applied", so the empty option is never ambiguous. */
  placeholder?: string;
}

const Select: React.FC<SelectProps> = ({ label, options, placeholder, className = '', id, value, ...props }) => {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const isFiltered = value !== undefined && value !== '';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={selectId} className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          {...props}
          className={`w-full appearance-none rounded-lg border bg-surface-container-lowest py-3 pl-3 pr-9 text-body text-on-surface transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary ${
            isFiltered ? 'border-primary' : 'border-outline hover:border-outline'
          }`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-surface-container">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
          aria-hidden
        />
      </div>
    </div>
  );
};

export default Select;
