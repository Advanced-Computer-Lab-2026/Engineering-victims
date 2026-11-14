jest.mock('../models/Wallet', () => ({ deleteMany: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/WalletTransaction', () => ({ deleteMany: jest.fn() }));
jest.mock('../services/walletService', () => ({ recordTransaction: jest.fn() }));

const Wallet = require('../models/Wallet');
const { recordTransaction } = require('../services/walletService');
const { WALLET_HISTORY, seedMissingWallets } = require('../config/walletSeed');

const queryFor = (load) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn(load),
});

beforeEach(() => {
  jest.clearAllMocks();
});

it('adds histories only for missing Advising Student wallets and is repeatable', async () => {
  const existingWallets = new Set(['hana.mahmoud@student.guc.edu.eg']);
  const students = Object.keys(WALLET_HISTORY).map((email) => ({
    _id: email,
    email,
    studentType: 'Advising Student',
  }));
  Wallet.findOne.mockImplementation(({ student }) =>
    queryFor(async () => (existingWallets.has(student) ? { _id: `wallet-${student}` } : null))
  );
  recordTransaction.mockImplementation(async (studentId) => {
    existingWallets.add(studentId);
  });

  const expectedNewTransactions = Object.entries(WALLET_HISTORY)
    .filter(([email]) => email !== 'hana.mahmoud@student.guc.edu.eg')
    .reduce((count, [, events]) => count + events.length, 0);

  await expect(seedMissingWallets(students)).resolves.toBe(expectedNewTransactions);
  expect(recordTransaction).toHaveBeenCalledTimes(expectedNewTransactions);
  await expect(seedMissingWallets(students)).resolves.toBe(0);
  expect(recordTransaction).toHaveBeenCalledTimes(expectedNewTransactions);
});
