import React, { forwardRef } from 'react';

type CardTone = 'default' | 'raised' | 'flat';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const TONES: Record<CardTone, string> = {
  default: 'bg-surface-container-low border-outline-variant',
  raised: 'bg-surface-container border-outline-variant shadow-elevation-2',
  flat: 'bg-surface-container-low border-outline-variant',
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ tone = 'default', className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-lg border ${TONES[tone]} relative overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = 'Card';

export default Card;
