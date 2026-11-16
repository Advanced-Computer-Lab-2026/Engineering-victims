const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

/**
 * The only place a wallet balance changes.
 *
 * The balance update is a single conditional $inc, so a debit can never take
 * the balance below zero even if two payments arrive at once (req 92: a wallet
 * payment needs a sufficient balance). The transaction row is then written with
 * the balance that update produced.
 *
 * Sprint 2 reuses this for real refunds (req 102) and wallet payments (req 92);
 * in Sprint 1 only the seed calls it.
 */
const recordTransaction = async (
  studentId,
  { type, amount, requestReference = null, paymentReference = null, description = '', occurredAt = new Date() },
  { notifications = true, session = null } = {}
) => {
  if (!WalletTransaction.TYPES.includes(type)) {
    throw new Error(`Unknown wallet transaction type: ${type}`);
  }
  if (!(amount > 0)) {
    throw new Error('A wallet transaction needs an amount greater than zero.');
  }

  const isCredit = WalletTransaction.DIRECTION[type] === 'Credit';
  const filter = isCredit ? { student: studentId } : { student: studentId, balance: { $gte: amount } };

  const wallet = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { balance: isCredit ? amount : -amount } },
    // A first refund opens the wallet; a payment never does, because there is
    // nothing in a wallet that does not exist yet.
    { new: true, upsert: isCredit, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  );

  if (!wallet) {
    const error = new Error('Insufficient wallet balance for this payment.');
    error.status = 400;
    throw error;
  }

  const entry = {
    wallet: wallet._id,
    student: studentId,
    type,
    amount,
    balanceAfter: wallet.balance,
    requestReference,
    paymentReference,
    description,
    occurredAt,
    // Saved in the ledger write, so retries never repeat the balance mutation.
    notificationPending: notifications,
  };
  const transaction = session ? (await WalletTransaction.create([entry], { session }))[0] : await WalletTransaction.create(entry);

  return { wallet, transaction };
};

module.exports = { recordTransaction };
