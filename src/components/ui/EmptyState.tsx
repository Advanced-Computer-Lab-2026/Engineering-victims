import React from 'react';
import { Inbox } from 'lucide-react';
import CustomButton from './CustomButton';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Optional recovery action, so a dead end is never a dead end. */
  action?: { label: string; onClick: () => void };
}

/**
 * Shown whenever a list, search or table has nothing to display. Every one of
 * these states explains what happened and offers a way forward, which is the
 * "design for errors" non-functional requirement.
 */
const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/30 px-6 py-14 text-center">
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/80 text-slate-400" aria-hidden>
      {icon ?? <Inbox className="h-5 w-5" />}
    </span>
    <div className="space-y-1">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-slate-400">{description}</p>}
    </div>
    {action && (
      <CustomButton variant="secondary" size="sm" onClick={action.onClick} className="mt-1">
        {action.label}
      </CustomButton>
    )}
  </div>
);

export default EmptyState;
