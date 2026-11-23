// Req 126: the export must ask for the same rows the history page displays.
// Plain Node test runner, no extra tooling:
//   npm test        (or: node --test src/lib/scheduleHistoryQuery.test.mjs)
// Node 22.18+/24 loads the .ts module directly by stripping its types.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canExportScheduleHistory, scheduleHistoryQuery } from './scheduleHistoryQuery.ts';

describe('schedule history query', () => {
  it('is empty when no filter or search is active', () => {
    assert.equal(scheduleHistoryQuery(), '');
    assert.equal(scheduleHistoryQuery({ action: '', startDate: '', endDate: '', search: '   ' }), '');
  });

  it('carries every active filter and the trimmed search, encoded', () => {
    assert.equal(
      scheduleHistoryQuery({ action: 'Reopened', startDate: '2026-10-01', endDate: '2026-10-31', search: '  omar.advisor@guc.edu.eg ' }),
      '?action=Reopened&startDate=2026-10-01&endDate=2026-10-31&search=omar.advisor%40guc.edu.eg'
    );
  });

  it('keeps a single filter on its own', () => {
    assert.equal(scheduleHistoryQuery({ search: '64-40078' }), '?search=64-40078');
    assert.equal(scheduleHistoryQuery({ endDate: '2026-10-05' }), '?endDate=2026-10-05');
  });
});

describe('when export is offered', () => {
  const applied = { action: '', startDate: '', endDate: '', search: '' };
  const ready = { applied, rowCount: 3, isLoading: false, isExporting: false, hasError: false };

  it('is offered for a loaded, non-empty list', () => {
    assert.equal(canExportScheduleHistory(ready), true);
  });

  it('is not offered before the first load, for an empty result, while loading or exporting, or after a load error', () => {
    assert.equal(canExportScheduleHistory({ ...ready, applied: null }), false);
    assert.equal(canExportScheduleHistory({ ...ready, rowCount: 0 }), false);
    assert.equal(canExportScheduleHistory({ ...ready, isLoading: true }), false);
    assert.equal(canExportScheduleHistory({ ...ready, isExporting: true }), false);
    assert.equal(canExportScheduleHistory({ ...ready, hasError: true }), false);
  });
});
