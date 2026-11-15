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
    <div className={`flex w-full flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden>
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
          className={`w-full rounded-lg border bg-surface-container-lowest py-3 text-on-surface placeholder:text-on-surface-variant transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${
            icon ? 'pl-9' : 'pl-3'
          } pr-3 text-body ${
            error ? 'border-error focus:border-error focus:ring-error' : 'border-outline hover:border-outline'
          }`}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-caption text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-caption text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default CustomInput;
