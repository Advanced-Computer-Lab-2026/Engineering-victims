import React, { forwardRef } from 'react';

type CardTone = 'default' | 'raised' | 'flat';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const TONES: Record<CardTone, string> = {
  default: 'bg-white border-gray-200',
  raised: 'bg-white border-gray-200 shadow-lg shadow-gray-200/50',
  flat: 'bg-white border-gray-100',
};

/**
 * Card component with modern rounded corners and soft shadows.
 * See decisions/011-modern-dashboard-redesign.md.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ tone = 'default', className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-2xl border ${TONES[tone]} relative overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = 'Card';

export default Card;
