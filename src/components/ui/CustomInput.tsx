import React, { useId } from 'react';

interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation or helper text rendered under the field. */
  hint?: string;
  error?: string;
  /** Icon rendered inside the field, on the left. */
  icon?: React.ReactNode;
}

const CustomInput: React.FC<CustomInputProps> = ({ label, hint, error, icon, className = '', id, ...props }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden>
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
          className={`w-full rounded-lg border bg-slate-900/70 text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 disabled:opacity-50 ${
            icon ? 'pl-9' : 'pl-3'
          } pr-3 py-2.5 text-sm ${
            error ? 'border-rose-500/70 focus:ring-rose-500/50 focus:border-rose-500' : 'border-slate-700 hover:border-slate-600'
          }`}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default CustomInput;
