const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const controller = require('../controllers/calendarController');

router.use(authenticate, requireRole('Student'), controller.ownStudent);
router.get('/', controller.status);
router.post('/connect', controller.connect);
router.post('/complete', controller.complete);
router.post('/sync', controller.sync);
router.delete('/', controller.disconnect);
module.exports = router;
