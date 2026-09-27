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
      <label htmlFor={selectId} className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          {...props}
          className={`w-full appearance-none rounded-lg border bg-slate-900/70 py-2.5 pl-3 pr-9 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 ${
            isFiltered ? 'border-indigo-500/60 text-slate-100' : 'border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-900">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden
        />
      </div>
    </div>
  );
};

export default Select;
