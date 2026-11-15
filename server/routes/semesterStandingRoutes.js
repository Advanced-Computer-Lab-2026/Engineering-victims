const router = require('express').Router();
const mongoose = require('mongoose');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Standing = require('../models/SemesterStanding');
const { finalizeStanding, evaluateStandings } = require('../services/probationService');

router.use(authenticate, requireRole('Coordinator', 'Administrator'));
router.use(async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role isActive');
    if (!user?.isActive || !['Coordinator', 'Administrator'].includes(user.role)) {
      return res.status(403).json({ message: 'Active academic administration access is required.' });
    }
    res.set('Cache-Control', 'no-store');
    next();
  } catch { res.status(500).json({ message: 'Could not verify academic administration access.' }); }
});
router.get('/:studentId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.studentId)) return res.status(400).json({ message: 'Invalid student ID.' });
  try {
    const history = await Standing.find({ student: req.params.studentId }).sort({ ordinal: 1 }).lean();
    const evaluation = evaluateStandings(history);
    res.json({ history, summary: { consecutiveProbationSemesters: evaluation.count,
      isProbation: evaluation.latest?.standing === 'Probation', standing: evaluation.latest?.standing || null } });
  } catch { res.status(500).json({ message: 'Could not load semester standings.' }); }
});
router.post('/:studentId/:termId/finalize', async (req, res) => {
  if (![req.params.studentId, req.params.termId].every(mongoose.isValidObjectId)) {
    return res.status(400).json({ message: 'Valid student and term IDs are required.' });
  }
  try {
    const record = await finalizeStanding({ studentId: req.params.studentId, termId: req.params.termId,
      cumulativeGpa: req.body.cumulativeGpa, expectedRevision: req.body.expectedRevision, actorId: req.user.userId });
    res.json({ standing: record, message: 'Semester standing finalized. Probation checks and any warning email are queued.' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Could not finalize semester standing.' });
  }
});
module.exports = router;
