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
  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface-variant" aria-hidden>
      {icon ?? <Inbox className="h-5 w-5" />}
    </span>
    <div className="space-y-1">
      <p className="text-body font-semibold text-on-surface">{title}</p>
      {description && <p className="max-w-sm text-caption leading-relaxed text-on-surface-variant">{description}</p>}
    </div>
    {action && (
      <CustomButton variant="secondary" size="sm" onClick={action.onClick} className="mt-1">
        {action.label}
      </CustomButton>
    )}
  </div>
);

export default EmptyState;
