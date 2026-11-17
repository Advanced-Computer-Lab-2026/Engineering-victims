const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const finance = require('../services/extraHoursFinanceService');

// Reqs 98-102, 127: extra-hours financial records for Coordinators and Administrators.
router.use(authenticate, requireRole('Coordinator', 'Administrator'));
// Recheck the current account; a stale token does not keep staff access.
router.use(async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role isActive').lean();
    if (!user?.isActive || !['Coordinator', 'Administrator'].includes(user.role)) return res.status(403).json({ message: 'An active Coordinator or Administrator account is required.' });
    res.set('Cache-Control', 'no-store'); next();
  } catch { res.status(500).json({ message: 'Could not verify staff access.' }); }
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value)));
const filters = z.object({
  search: z.string().trim().max(80).default(''),
  from: day.optional(), to: day.optional(),
  settlementOption: z.enum(finance.OPTIONS).optional(),
  status: z.enum(finance.STATUSES).optional(),
});
// Dates are whole days: "from" starts at 00:00, "to" ends at 23:59:59.999.
const toQuery = ({ search, from, to, settlementOption, status }) => ({ search, settlementOption, status,
  from: from ? new Date(`${from}T00:00:00.000`) : undefined, to: to ? new Date(`${to}T23:59:59.999`) : undefined });
const parse = (schema, req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ message: 'Use a valid search (up to 80 characters), dates (YYYY-MM-DD), settlement option and status.' }); return null; }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) { res.status(400).json({ message: 'The "from" date must be on or before the "to" date.' }); return null; }
  return parsed.data;
};
const handle = (fallback, action) => async (req, res) => {
  try { await action(req, res); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : fallback }); }
};

router.get('/options', (req, res) => res.json({ settlementOptions: finance.OPTIONS, statuses: finance.STATUSES }));

// Req 98 list + Req 99 search + Req 100 filter.
router.get('/', handle('Could not load extra-hours financial records.', async (req, res) => {
  const data = parse(filters.extend({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict(), req, res);
  if (!data) return;
  res.json(await finance.listRecords(toQuery(data), { page: data.page, limit: data.limit }));
}));

// Req 127: export the currently searched/filtered records as CSV.
router.get('/export', handle('Could not export extra-hours financial records.', async (req, res) => {
  const data = parse(filters.strict(), req, res);
  if (!data) return;
  const records = await finance.exportRecords(toQuery(data));
  const stamp = new Date().toISOString().slice(0, 10);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="extra-hours-financial-records-${stamp}.csv"` });
  res.send(finance.toCsv(records));
}));

// Req 101: one record's details.
router.get('/:kind/:id', handle('Could not load the financial record.', async (req, res) => {
  res.json(await finance.recordDetails(req.params.kind, req.params.id));
}));

// Req 102: refund a paid charge or cancel an unpaid deferred charge.
router.post('/:kind/:id/reverse', handle('Could not complete the refund or cancellation. Nothing was changed.', async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(5).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Give a reason of 5 to 1000 characters for cancelling this request.' });
  res.json(await finance.reverseRecord(req.params.kind, req.params.id, req.user.userId, parsed.data.reason));
}));

module.exports = router;
