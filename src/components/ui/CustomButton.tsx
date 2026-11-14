import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

interface CustomButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  /** Stretches to the container width. Off by default so buttons in a row agree in size. */
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary shadow-elevation-1 hover:brightness-110 active:translate-y-px disabled:hover:brightness-100',
  secondary:
    'bg-surface-container text-on-surface ring-1 ring-inset ring-outline-variant hover:bg-surface-container-high active:translate-y-px',
  ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:translate-y-px',
  // Destructive action that lives outside a filled primary slot, e.g. sign out.
  'danger-ghost':
    'text-on-surface-variant hover:bg-error-container hover:text-on-error-container active:translate-y-px',
  danger: 'bg-error text-on-error hover:brightness-110 active:translate-y-px',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-11 px-3 py-2 text-caption gap-1.5',
  md: 'min-h-11 px-4 py-2 text-body gap-2',
  lg: 'min-h-12 px-4 py-3 text-body gap-2',
};

const CustomButton: React.FC<CustomButtonProps> = ({
  children,
  variant = 'primary',
  size = 'lg',
  isLoading = false,
  fullWidth = false,
  icon,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
};

export default CustomButton;
