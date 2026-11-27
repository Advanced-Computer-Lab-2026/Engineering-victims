const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { recordTransaction } = require('../services/walletService');

/**
 * Req 89 demo wallets.
 *
 * Nothing in Sprint 1 moves money yet (refunds are req 102, wallet payments
 * req 92), and the database cannot be edited during evaluation, so the history
 * is seeded. Each event goes through walletService in date order, so every
 * balance and every "resulting balance" is computed, never typed by hand.
 *
 * The story behind each row follows the extra-hours flow in the workbook: a
 * request (EHR-...) is paid through the gateway (PAY-...), later cancelled and
 * refunded to the wallet (credit), and the wallet then pays a later request
 * (debit). Amounts are whole credit hours at PRICE_PER_HOUR.
 *
 * Every Advising Student has a wallet history so the demo wallet is populated
 * for each account.
 */
const PRICE_PER_HOUR = 2500;
const hours = (count) => count * PRICE_PER_HOUR;

const WALLET_HISTORY = {
  // Awaiting a payment choice with money already in the wallet, so req 91/92
  // have a student who can actually choose "pay from wallet".
  'hana.mahmoud@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(3), requestReference: 'EHR-2026-0003', paymentReference: 'PAY-3C81A2', description: 'Refund for cancelled extra-hours request (3 hours)', occurredAt: '2026-02-18T10:15:00Z' },
    { type: 'Refund', amount: hours(1), requestReference: 'EHR-2026-0009', paymentReference: 'PAY-4D1F07', description: 'Refund for a course removed after approval (1 hour)', occurredAt: '2026-04-06T12:40:00Z' },
  ],
  // Credits and debits both, ending at a partial balance.
  'karim.emad@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(4), requestReference: 'EHR-2026-0002', paymentReference: 'PAY-2B77E0', description: 'Refund for cancelled extra-hours request (4 hours)', occurredAt: '2026-02-10T09:05:00Z' },
    { type: 'Payment', amount: hours(3), requestReference: 'EHR-2026-0014', paymentReference: 'PAY-9A02C4', description: 'Wallet payment for approved extra hours (3 hours)', occurredAt: '2026-09-24T14:20:00Z' },
  ],
  // Spent down to exactly zero, so a zero balance with history is covered.
  'mariam.said@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(2), requestReference: 'EHR-2026-0005', paymentReference: 'PAY-5E0B19', description: 'Refund for cancelled extra-hours request (2 hours)', occurredAt: '2026-03-02T11:00:00Z' },
    { type: 'Payment', amount: hours(2), requestReference: 'EHR-2026-0016', paymentReference: 'PAY-A61D33', description: 'Wallet payment for approved extra hours (2 hours)', occurredAt: '2026-09-21T08:45:00Z' },
  ],
  'tamer.lotfy@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(3), requestReference: 'EHR-2026-0007', paymentReference: 'PAY-7F3A21', description: 'Refund for cancelled extra-hours request (3 hours)', occurredAt: '2026-03-15T13:30:00Z' },
    { type: 'Payment', amount: hours(1), requestReference: 'EHR-2026-0015', paymentReference: 'PAY-B2C940', description: 'Wallet payment for approved extra hours (1 hour)', occurredAt: '2026-09-23T16:10:00Z' },
    { type: 'Refund', amount: hours(1), requestReference: 'EHR-2026-0015', paymentReference: 'PAY-B2C940', description: 'Refund after the extra-hours request was cancelled (1 hour)', occurredAt: '2026-09-27T10:00:00Z' },
  ],
  'yasmin.adly@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(2), requestReference: 'EHR-2026-0004', paymentReference: 'PAY-4A9920', description: 'Refund for cancelled extra-hours request (2 hours)', occurredAt: '2026-02-25T15:50:00Z' },
    { type: 'Payment', amount: hours(1), requestReference: 'EHR-2026-0011', paymentReference: 'PAY-6C0E58', description: 'Wallet payment for approved extra hours (1 hour)', occurredAt: '2026-05-04T09:30:00Z' },
  ],
  'salma.ibrahim@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(1), requestReference: 'EHR-2026-0010', paymentReference: 'PAY-8E47B1', description: 'Refund for cancelled extra-hours request (1 hour)', occurredAt: '2026-04-20T10:25:00Z' },
  ],
  'omar.nabil@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(2), requestReference: 'EHR-2026-0006', paymentReference: 'PAY-6B3D02', description: 'Refund for cancelled extra-hours request (2 hours)', occurredAt: '2026-03-09T12:00:00Z' },
    // Spent down to zero afterwards, so he is also the student whose approved
    // extra-hours request (EHR-DEMO-010) cannot be paid from the wallet.
    { type: 'Payment', amount: hours(2), requestReference: 'EHR-2026-0025', paymentReference: 'PAY-7B4C11', description: 'Wallet payment for approved extra hours (2 hours)', occurredAt: '2026-10-15T09:00:00Z' },
  ],
  'laila.hassan@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(2), requestReference: 'EHR-2026-0017', paymentReference: 'PAY-17A4D2', description: 'Refund for cancelled extra-hours request (2 hours)', occurredAt: '2026-10-04T10:20:00Z' },
  ],
  'rana.adel@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(3), requestReference: 'EHR-2026-0018', paymentReference: 'PAY-18B5E3', description: 'Refund for cancelled extra-hours request (3 hours)', occurredAt: '2026-02-11T09:10:00Z' },
    { type: 'Payment', amount: hours(1), requestReference: 'EHR-2026-0019', paymentReference: 'PAY-19C6F4', description: 'Wallet payment for approved extra hours (1 hour)', occurredAt: '2026-09-10T12:30:00Z' },
  ],
  'ahmed.sherif@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(2), requestReference: 'EHR-2026-0020', paymentReference: 'PAY-20D7A5', description: 'Refund for cancelled extra-hours request (2 hours)', occurredAt: '2026-03-20T14:00:00Z' },
  ],
  'nour.elsayed@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(1), requestReference: 'EHR-2026-0021', paymentReference: 'PAY-21E8B6', description: 'Refund for cancelled extra-hours request (1 hour)', occurredAt: '2026-04-01T11:35:00Z' },
  ],
  'dina.mostafa@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(2), requestReference: 'EHR-2026-0022', paymentReference: 'PAY-22F9C7', description: 'Refund for cancelled extra-hours request (2 hours)', occurredAt: '2026-10-22T08:50:00Z' },
  ],
  'hassan.rifaat@student.guc.edu.eg': [
    { type: 'Refund', amount: hours(3), requestReference: 'EHR-2026-0023', paymentReference: 'PAY-23A1D8', description: 'Refund for cancelled extra-hours request (3 hours)', occurredAt: '2026-01-14T13:15:00Z' },
    { type: 'Payment', amount: hours(2), requestReference: 'EHR-2026-0024', paymentReference: 'PAY-24B2E9', description: 'Wallet payment for approved extra hours (2 hours)', occurredAt: '2026-05-10T15:40:00Z' },
  ],
};

/** Rebuilds every wallet from WALLET_HISTORY. Returns the number of rows written. */
const seedWallets = async (students) => {
  await Wallet.deleteMany({});
  await WalletTransaction.deleteMany({});

  const studentByEmail = new Map(students.map((student) => [student.email, student]));
  let count = 0;

  for (const [email, events] of Object.entries(WALLET_HISTORY)) {
    const student = studentByEmail.get(email);
    if (!student) throw new Error(`Wallet seed references an unknown student: ${email}`);
    if (student.studentType !== 'Advising Student') {
      throw new Error(`Wallet seed gives a wallet to ${email}, who is not an Advising Student.`);
    }

    // Sequential on purpose: each row's resulting balance depends on the last.
    const ordered = [...events].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    for (const event of ordered) {
      await recordTransaction(student._id, { ...event, occurredAt: new Date(event.occurredAt) }, { notifications: false });
      count += 1;
    }
  }

  return count;
};

/**
 * Adds demo histories only for students without an existing wallet, preserving
 * wallets and transactions already created through the live application.
 */
const seedMissingWallets = async (students) => {
  const studentByEmail = new Map(students.map((student) => [student.email, student]));
  let count = 0;

  for (const [email, events] of Object.entries(WALLET_HISTORY)) {
    const student = studentByEmail.get(email);
    if (!student) throw new Error(`Wallet seed references an unknown student: ${email}`);
    if (student.studentType !== 'Advising Student') {
      throw new Error(`Wallet seed gives a wallet to ${email}, who is not an Advising Student.`);
    }

    const existing = await Wallet.findOne({ student: student._id }).select('_id').lean();
    if (existing) continue;

    const ordered = [...events].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    for (const event of ordered) {
      await recordTransaction(student._id, { ...event, occurredAt: new Date(event.occurredAt) }, { notifications: false });
      count += 1;
    }
  }

  return count;
};

module.exports = { seedWallets, seedMissingWallets, WALLET_HISTORY, PRICE_PER_HOUR };
