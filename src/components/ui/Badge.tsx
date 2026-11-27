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
  neutral: 'bg-surface-container text-on-surface-variant ring-outline-variant',
  indigo: 'bg-primary-container text-on-primary-container ring-primary-container',
  emerald: 'bg-success-container text-on-success-container ring-success-container',
  amber: 'bg-warning-container text-on-warning-container ring-warning-container',
  rose: 'bg-error-container text-on-error-container ring-error-container',
  sky: 'bg-info-container text-on-info-container ring-info-container',
};

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-on-surface-variant',
  indigo: 'bg-primary',
  emerald: 'bg-success',
  amber: 'bg-warning',
  rose: 'bg-error',
  sky: 'bg-info',
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
