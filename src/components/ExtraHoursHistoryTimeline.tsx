import React from 'react';
import type { HistoryEvent } from '../lib/extraHoursFinanceService';

/** Req 95: the status and decision history of one extra-hours request, oldest first. */
const ExtraHoursHistoryTimeline: React.FC<{ events: HistoryEvent[]; decision?: string; settlementStatus?: string; responseNote?: string | null }> = ({ events, decision, settlementStatus, responseNote }) => (
  <div className="space-y-3">
    {(decision || settlementStatus) && <p className="text-sm text-slate-300">
      {decision && <>Coordinator decision: <span className="font-semibold text-white">{decision}</span></>}
      {decision && settlementStatus && ' · '}
      {settlementStatus && <>Current status: <span className="font-semibold text-white">{settlementStatus}</span></>}
    </p>}
    {responseNote && <p className="whitespace-pre-wrap text-sm text-slate-300">Coordinator note: {responseNote}</p>}
    {events.length === 0 ? <p className="text-sm text-slate-400">No history has been recorded for this request yet.</p>
      : <ol className="space-y-3 border-l border-slate-700 pl-4">
        {events.map((event, index) => <li key={`${event.action}-${event.at}-${index}`} className="text-sm">
          <p className="font-medium text-slate-100">{event.label}</p>
          <p className="text-xs text-slate-400">{new Date(event.at).toLocaleString()}{event.actor ? ` · ${event.actor.name} (${event.actor.role})` : ''}</p>
          {event.note && <p className="mt-1 whitespace-pre-wrap break-words text-slate-300">{event.note}</p>}
        </li>)}
      </ol>}
  </div>
);
export default ExtraHoursHistoryTimeline;
