// Reqs 124-126: the one place the schedule activity history's filters become a
// query string, so the list and its CSV export always ask for the same rows.
// Kept free of browser/Vite imports so `node --test` can load it directly.

export type ScheduleActivityAction = 'Processed' | 'Reopened';

export interface ScheduleHistoryFilterParams {
  action?: ScheduleActivityAction | '';
  startDate?: string;
  endDate?: string;
  search?: string;
}

/** Returns "" or "?action=…&startDate=…&endDate=…&search=…" (empty values left out). */
export function scheduleHistoryQuery(params: ScheduleHistoryFilterParams = {}): string {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.search?.trim()) query.set('search', params.search.trim());
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** The filters that produced the rows on screen; null until the first load succeeds. */
export type AppliedScheduleHistoryFilters = Required<ScheduleHistoryFilterParams>;

/** Export is offered only for a loaded, non-empty, error-free list. */
export function canExportScheduleHistory(state: {
  applied: AppliedScheduleHistoryFilters | null;
  rowCount: number;
  isLoading: boolean;
  isExporting: boolean;
  hasError: boolean;
}): boolean {
  return Boolean(state.applied) && state.rowCount > 0 && !state.isLoading && !state.isExporting && !state.hasError;
}
