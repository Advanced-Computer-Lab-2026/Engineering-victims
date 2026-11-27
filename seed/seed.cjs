/**
 * Manual re-seed — **destructive**, and now the routine way to rebuild.
 *
 * The server no longer seeds itself on every boot: it calls seedIfEmpty(),
 * which leaves an already-initialized database untouched so a restart cannot
 * wipe work in progress (nodemon restarts on every save, so this used to happen
 * constantly). This script always calls the destructive seed() directly, which
 * is what makes it a clean slate. Both paths share that one seed(), so the
 * database can never end up with a different (or smaller) set of accounts
 * depending on which entry point was used:
 *
 *   node seed/seed.cjs
 */
const path = require('path');

// Resolved inside server/node_modules so these are the same module instances
// server/config/seedData.js uses; otherwise mongoose would connect in one copy
// while the models queried a second, unconnected copy.
const dotenv = require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv'));
const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));
const { seed } = require('../server/config/seedData');

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

/** "12 (9 Pending, 1 Approved, 1 Rejected, 1 Withdrawn)" — the request mix at a glance. */
const formatSlotChanges = (result) => {
  if (typeof result === 'number') return String(result);
  const mix = ['Approved', 'Rejected', 'Withdrawn']
    .filter((status) => result[status] > 0)
    .map((status) => `${result[status]} ${status}`)
    .join(', ');
  return `${result.created} (${result.Pending} Pending${mix ? `, ${mix}` : ''})`;
};

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not found in server/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for seeding...');

  const result = await seed();
  console.log(
    `Seeded ${result.users} users, ${result.students} students and ${result.notifications} notifications`,
  );
  console.log(`   Advisors: ${result.advisors}, terms: ${result.terms}`);
  console.log(
    `   Offerings: ${result.offerings}, slots: ${result.slots}, schedule groups: ${result.groups}, student schedule rows: ${result.schedules + result.advisingSchedules} (normal: ${result.schedules}, advising: ${result.advisingSchedules}; ${result.grouped} normal students grouped)`,
  );
  console.log(
    `   Slot-change requests: ${formatSlotChanges(result.slotChangeRequests)}, exit-exam requests: ${result.exitExamRequests}, semester standings: ${result.semesterStandings}`,
  );
  console.log(`   Mandatory-course removal requests: ${result.mandatoryRemovalRequests}`);
  console.log(
    `   Full course slots: ${result.fullSlots}, saved advising drafts: ${result.advisingDrafts}, history records: ${result.scheduleActivityLogs}, swap requests: the lazy seeder's`,
  );
  console.log(
    `   Extra-hours requests: ${result.extraHoursRequests} (display-only), ${result.extraHoursPayments.settled} settled with payment or deferred-charge records, ${result.extraHoursPayments.awaiting} awaiting a payment choice and ${result.extraHoursPayments.pending} still Pending (${result.extraHoursPayments.addedRows} draft rows added).`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
