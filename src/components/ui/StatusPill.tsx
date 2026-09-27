import React from 'react';
import { Clock, Loader2, MinusCircle } from 'lucide-react';
import Badge, { type BadgeTone } from './Badge';

type AccountState = 'active' | 'inactive';

interface StatusPillProps {
  /** Active or inactive account, which drives the enable/disable action. */
  state: AccountState;
  /** Optional workflow status shown alongside, e.g. "Schedule Assigned". */
  workflowStatus?: string | null;
  className?: string;
}

const ACCOUNT_TONE: Record<AccountState, BadgeTone> = {
  active: 'emerald',
  inactive: 'rose',
};

/** Workflow statuses grouped by intent, so colours mean the same thing everywhere. */
const WORKFLOW_TONE: Array<{ match: RegExp; tone: BadgeTone }> = [
  { match: /not started|draft/i, tone: 'neutral' },
  { match: /ready for student review|ready to process|open/i, tone: 'sky' },
  { match: /pending|awaiting|change request pending/i, tone: 'amber' },
  { match: /processed|completed|approved/i, tone: 'emerald' },
  { match: /withdrawn|expired|rejected|cancelled|refunded/i, tone: 'rose' },
];

const workflowToneFor = (status: string): BadgeTone =>
  WORKFLOW_TONE.find((entry) => entry.match.test(status))?.tone ?? 'indigo';

const StatusPill: React.FC<StatusPillProps> = ({ state, workflowStatus, className = '' }) => {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <Badge tone={ACCOUNT_TONE[state]} dot>
        <span className="sr-only">Account status: </span>
        {state === 'active' ? 'Active' : 'Inactive'}
      </Badge>
      {workflowStatus && (
        <Badge tone={workflowToneFor(workflowStatus)} className="gap-1">
          {workflowStatus === 'Not Started' ? (
            <MinusCircle className="h-3 w-3" aria-hidden />
          ) : workflowStatus === 'Pending Approval' || workflowStatus === 'Awaiting Payment Choice' ? (
            <Clock className="h-3 w-3" aria-hidden />
          ) : (
            <Loader2 className="h-3 w-3" aria-hidden />
          )}
          {workflowStatus}
        </Badge>
      )}
    </span>
  );
};

export default StatusPill;
