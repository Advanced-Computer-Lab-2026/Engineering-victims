import React from 'react';

type CardTone = 'default' | 'raised' | 'flat';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** Adds a soft top highlight, used for panels that sit above the gradient. */
  sheen?: boolean;
}

const TONES: Record<CardTone, string> = {
  // Translucent so the page gradient reads through the surface.
  default: 'bg-slate-900/60 border-slate-800/80',
  raised: 'bg-slate-900/80 border-slate-700/80 shadow-lg shadow-black/30',
  flat: 'bg-slate-900/40 border-slate-800/60',
};

const Card: React.FC<CardProps> = ({ tone = 'default', sheen = false, className = '', children, ...props }) => (
  <div
    className={`rounded-2xl border backdrop-blur-sm ${TONES[tone]} ${
      sheen ? 'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-slate-400/40 before:to-transparent' : ''
    } relative overflow-hidden ${className}`}
    {...props}
  >
    {children}
  </div>
);

export default Card;
