#!/usr/bin/env node
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { spawn } = require('child_process');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '..'), serverDir = path.join(root, 'server');
const req = createRequire(path.join(serverDir, 'package.json'));
const mongoose = req('mongoose');
const { MongoMemoryReplSet } = req('mongodb-memory-server-core');
const localEnv = fs.existsSync(path.join(serverDir, '.env')) ? req('dotenv').parse(fs.readFileSync(path.join(serverDir, '.env'))) : {};
const children = [];
let repl, stopping = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill();
  await mongoose.disconnect();
  if (repl) await repl.stop();
  process.exit(code);
}
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
async function main() {
  const clientPort = Number(process.env.EXTRA_HOURS_CLIENT_PORT || 5174), apiPort = Number(process.env.EXTRA_HOURS_API_PORT || 5001);
  if (![clientPort, apiPort].every((port) => Number.isInteger(port) && port > 1024 && port < 65536) || clientPort === apiPort) throw new Error('Use two different valid dev ports above 1024.');
  const testKey = process.env.STRIPE_SECRET_KEY || localEnv.STRIPE_SECRET_KEY || '';
  if (testKey && !/^(sk_test_|rk_test_|rkcs_test_)/.test(testKey)) throw new Error('Only Stripe test keys may be used in this fixture.');
  console.log('Starting an isolated replica set. Existing project data and .env files are unchanged.');
  if (!process.env.MONGOMS_SYSTEM_BINARY) console.log('Set MONGOMS_SYSTEM_BINARY to an installed mongod executable to avoid the first-run MongoDB binary download.');
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const dbName = `extra_hours_dev_${crypto.randomUUID().replace(/-/g, '')}`;
  const uri = repl.getUri(dbName);
  await mongoose.connect(uri);
  const { seedExtraHoursPaymentFixture } = req('./seed/extraHoursPaymentFixture');
  await seedExtraHoursPaymentFixture();
  await mongoose.disconnect();
  const env = { ...process.env, PORT: String(apiPort), MONGODB_URI: uri, JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    STRIPE_SECRET_KEY: testKey, STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || localEnv.STRIPE_WEBHOOK_SECRET || '',
    PAYMENT_APP_ORIGIN: `http://localhost:${clientPort}`, CLIENT_PORT: String(clientPort), VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    VITE_API_URL: '', MAIL_USER: '', MAIL_PASS: '', NODE_ENV: 'development' };
  const start = (script, args, cwd) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', (error) => { console.error(error.message); void stop(1); });
    child.on('exit', () => { if (!stopping) void stop(1); });
  };
  start(path.join(serverDir, 'server.js'), [], serverDir);
  start(path.join(root, 'node_modules/vite/bin/vite.js'), ['--port', String(clientPort), '--strictPort'], root);
  console.log(`\nExtra-hours test website: http://localhost:${clientPort}`);
  console.log('Password for every fixture account: ExtraHoursTest2006');
  console.log('Wallet: wallet.extra-hours@student.guc.edu.eg — EGP 3000; request EGP 2400.');
  console.log('Stripe: stripe.extra-hours@student.guc.edu.eg — separate approved request.');
  console.log('Insufficient: insufficient.extra-hours@student.guc.edu.eg — EGP 100; payment must be blocked.');
  console.log('Coordinator: coordinator.extra-hours@guc.edu.eg; Advisor: advisor.extra-hours@guc.edu.eg.');
  console.log(`Stripe test key: ${testKey ? 'configured' : 'not configured; wallet testing still works'}.`);
  console.log(`Forward Stripe events to http://localhost:${apiPort}/api/payments/stripe/webhook.`);
  console.log('Restart this command for fresh accounts, requests and wallet balances. Ctrl+C stops the disposable database.\n');
}
main().catch((error) => { console.error('Extra-hours dev setup failed:', error.message); void stop(1); });
