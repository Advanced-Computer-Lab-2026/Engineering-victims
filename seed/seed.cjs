/**
 * Manual re-seed.
 *
 * Delegates to the same seed() the server runs on boot, so the database can
 * never end up with a different (or smaller) set of accounts depending on which
 * entry point was used:
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

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not found in server/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for seeding...');

  const result = await seed();
  console.log(
    `✅ Seeded ${result.users} users, ${result.students} students and ${result.notifications} notifications`,
  );
  console.log(`   Advisors: ${result.advisors}, terms: ${result.terms}`);
  console.log(
    `   Offerings: ${result.offerings}, slots: ${result.slots}, schedule groups: ${result.groups}, student schedules: ${result.schedules} (${result.grouped} students in groups)`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
