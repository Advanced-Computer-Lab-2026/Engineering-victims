const mongoose = require('mongoose');

/**
 * Req 89: one row of wallet history.
 *
 * The workbook names exactly two kinds of movement: refund credits (req 102
 * refunds a paid extra-hours charge back to the wallet) and payment debits
 * (req 91 pays an approved extra-hours request from the wallet). Whether a row
 * adds or removes money follows from its type, so it is not stored twice.
 */
const TYPES = ['Refund', 'Payment'];
const DIRECTION = { Refund: 'Credit', Payment: 'Debit' };

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    type: { type: String, enum: { values: TYPES, message: 'Type must be Refund or Payment.' }, required: true },
    amount: { type: Number, required: true, min: [0.01, 'Amount must be greater than zero.'] },
    /** The wallet balance straight after this row was applied. */
    balanceAfter: { type: Number, required: true, min: 0 },
    /** The extra-hours request the money belongs to, e.g. EHR-2026-0012. */
    requestReference: { type: String, trim: true, default: null },
    /** The payment it came from or went to, e.g. PAY-5A21C7. */
    paymentReference: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: '' },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
module.exports.TYPES = TYPES;
module.exports.DIRECTION = DIRECTION;
