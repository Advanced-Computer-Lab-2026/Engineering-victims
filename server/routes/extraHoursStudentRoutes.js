const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Student = require('../models/Student');
const Request = require('../models/ExtraHoursRequest');

router.use(authenticate, requireRole('Student'));
router.get('/', async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Use a valid page number.' });
  try {
    const user = await User.findById(req.user.userId).select('email role isActive').lean();
    if (!user?.isActive || user.role !== 'Student') return res.status(403).json({ message: 'An active Student account is required.' });
    const student = await Student.findOne({ email: user.email }).select('studentType isActive').lean();
    if (!student) return res.status(404).json({ message: 'No student record is linked to this account.' });
    if (!student.isActive || student.studentType !== 'Advising Student') return res.status(403).json({ message: 'Extra-hours requests are only available to active Advising Students.' });
    const { page } = parsed.data, limit = 20;
    const filter = { student: student._id, decision: 'Approved' };
    const [rows, total] = await Promise.all([
      Request.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('term', 'academicYear season').lean(),
      Request.countDocuments(filter),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ requests: rows.map((row) => ({ id: row._id, reference: row.reference,
      term: row.term ? `${row.term.academicYear} ${row.term.season}` : 'Term unavailable',
      decision: row.decision, decidedAt: row.decidedAt, settlementStatus: row.settlementStatus,
      requestedHours: row.requestedHours, totalCost: row.totalCost, currency: row.currency,
      items: row.items.map((item) => ({ courseId: item.course, code: item.code, name: item.name,
        creditHours: item.creditHours, requestedHours: item.requestedHours, classification: item.classification,
        ratePerHour: item.ratePerHour, subtotal: item.subtotal })),
    })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { res.status(500).json({ message: 'Could not load your approved extra-hours requests.' }); }
});
module.exports = router;
