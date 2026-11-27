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
    'bg-primary text-on-primary shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98] disabled:hover:brightness-100',
  secondary:
    'bg-white text-gray-700 ring-2 ring-inset ring-gray-200 hover:bg-gray-50 active:scale-[0.98]',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98]',
  // Destructive action that lives outside a filled primary slot, e.g. sign out.
  'danger-ghost':
    'text-gray-600 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]',
  danger: 'bg-error text-on-error shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98]',
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
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
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
