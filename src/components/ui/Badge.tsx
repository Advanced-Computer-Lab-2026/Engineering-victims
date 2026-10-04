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
  neutral: 'bg-slate-800/80 text-slate-300 ring-slate-700/70',
  indigo: 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  rose: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
  sky: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
};

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  indigo: 'bg-indigo-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  sky: 'bg-sky-400',
};

const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', dot = false, icon = null, className = '', children }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${TONES[tone]} ${className}`}
  >
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} aria-hidden />}
    {icon}
    {children}
  </span>
);

export default Badge;
