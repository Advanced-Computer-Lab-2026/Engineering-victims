const mongoose = require('mongoose');

/**
 * Req 89: one wallet per Advising Student.
 *
 * The balance is stored rather than summed from the transactions on every read,
 * but it is only ever changed by walletService.recordTransaction, which writes
 * the matching transaction at the same time. That keeps the stored balance and
 * the history's "resulting balance" column in agreement.
 */
const walletSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    balance: { type: Number, default: 0, min: [0, 'A wallet balance cannot be negative.'] },
    currency: { type: String, default: 'EGP', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
