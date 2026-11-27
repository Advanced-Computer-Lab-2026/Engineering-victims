import React, { forwardRef } from 'react';

type CardTone = 'default' | 'raised' | 'flat';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const TONES: Record<CardTone, string> = {
  default: 'bg-surface border-outline-variant',
  raised: 'bg-surface border-outline-variant shadow-elevation-1',
  flat: 'bg-surface border-outline-variant',
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
