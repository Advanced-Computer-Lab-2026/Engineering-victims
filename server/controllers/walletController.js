const User = require('../models/User');
const Student = require('../models/Student');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

const serializeTransaction = (row) => ({
  id: row._id,
  type: row.type,
  direction: WalletTransaction.DIRECTION[row.type],
  amount: row.amount,
  balanceAfter: row.balanceAfter,
  requestReference: row.requestReference,
  paymentReference: row.paymentReference,
  description: row.description,
  occurredAt: row.occurredAt,
});

/**
 * Req 89: the signed-in Advising Student's wallet balance and history.
 *
 * There is no student id in the URL. The wallet is looked up from the token,
 * so a student can only ever read their own wallet and there is no parameter
 * that could point it at someone else's.
 */
exports.getMyWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('email').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // The login user and the directory record are linked by email, the same
    // way the profile page (FR 4.0) joins them.
    const student = await Student.findOne({ email: user.email }).select('studentType').lean();
    if (!student) {
      return res.status(404).json({ message: 'No student record is linked to this account.' });
    }
    if (student.studentType !== 'Advising Student') {
      return res.status(403).json({ message: 'The wallet is only available to Advising Students.' });
    }

    const wallet = await Wallet.findOne({ student: student._id }).lean();
    const transactions = wallet
      ? await WalletTransaction.find({ wallet: wallet._id }).sort({ occurredAt: -1, createdAt: -1 }).lean()
      : [];

    const totalFor = (type) =>
      transactions.filter((row) => row.type === type).reduce((sum, row) => sum + row.amount, 0);

    res.status(200).json({
      // A student who has never had a refund has no wallet document yet; that
      // is an empty wallet, not an error.
      wallet: {
        balance: wallet?.balance ?? 0,
        currency: wallet?.currency ?? 'EGP',
        updatedAt: wallet?.updatedAt ?? null,
      },
      summary: {
        totalCredits: totalFor('Refund'),
        totalDebits: totalFor('Payment'),
        count: transactions.length,
      },
      transactions: transactions.map(serializeTransaction),
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load your wallet', error: error.message });
  }
};
