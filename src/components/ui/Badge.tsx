import React from 'react';

export type BadgeTone = 'neutral' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky';

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  /** Renders a leading dot, used for status pills that read at a glance. */
  dot?: boolean;
  /** Renders a leading icon, used when a pill should read as a labelled glyph. */
  icon?: React.ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-300',
  indigo: 'bg-blue-50 text-blue-700 ring-blue-200',
  emerald: 'bg-green-50 text-green-700 ring-green-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-red-50 text-red-700 ring-red-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
};

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-gray-500',
  indigo: 'bg-blue-500',
  emerald: 'bg-green-500',
  amber: 'bg-amber-500',
  rose: 'bg-red-500',
  sky: 'bg-sky-500',
};

const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', dot = false, icon = null, className = '', children }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium ring-1 ring-inset whitespace-nowrap ${TONES[tone]} ${className}`}
  >
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} aria-hidden />}
    {icon}
    {children}
  </span>
);

export default Badge;
