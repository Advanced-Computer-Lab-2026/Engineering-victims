import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
    'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 hover:bg-indigo-500 active:translate-y-px disabled:hover:bg-indigo-600',
  secondary:
    'bg-slate-800/80 text-slate-200 ring-1 ring-inset ring-slate-700 hover:bg-slate-700/80 hover:text-white active:translate-y-px',
  ghost: 'text-slate-300 hover:bg-slate-800/70 hover:text-white active:translate-y-px',
  danger: 'bg-rose-600/90 text-white hover:bg-rose-500 active:translate-y-px',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-4 py-3 text-sm gap-2',
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
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {isLoading ? 'Working...' : children}
    </button>
  );
};

export default CustomButton;
