#!/usr/bin/env node
/**
 * Creates any missing environment files so the app runs with zero manual setup.
 *
 * - server/.env  : MONGODB_URI, PORT, JWT_SECRET (a random secret is generated)
 * - .env         : VITE_API_PROXY_TARGET (points the Vite dev proxy at the API)
 *
 * Existing files are never overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'server');

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/university_schedule';
const DEFAULT_PORT = 5000;

const created = [];
const patched = [];

const readIfPresent = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

const readValue = (contents, key) => {
  const match = contents?.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : undefined;
};

// --- server/.env -----------------------------------------------------------
const serverEnvExample = readIfPresent(join(serverDir, '.env.example'));
const serverEnvPath = join(serverDir, '.env');
let serverEnv = readIfPresent(serverEnvPath);

if (!serverEnv) {
  serverEnv = serverEnvExample
    ? serverEnvExample
    : [
        `PORT=${DEFAULT_PORT}`,
        `MONGODB_URI=${DEFAULT_MONGO_URI}`,
        'JWT_SECRET=your_super_secret_jwt_key_here',
        'NODE_ENV=development',
        '',
      ].join('\n');

  if (readValue(serverEnv, 'JWT_SECRET') === 'your_super_secret_jwt_key_here') {
    serverEnv = serverEnv.replace(
      /^JWT_SECRET=.*$/m,
      `JWT_SECRET=${randomBytes(32).toString('hex')}`
    );
  }
  if (!readValue(serverEnv, 'MONGODB_URI')) {
    serverEnv += `MONGODB_URI=${DEFAULT_MONGO_URI}\n`;
    patched.push('server/.env: added MONGODB_URI');
  }

  writeFileSync(serverEnvPath, serverEnv);
  created.push('server/.env');
}

// --- .env (client) ---------------------------------------------------------
const clientEnvPath = join(root, '.env');
const port = readValue(serverEnv, 'PORT') || String(DEFAULT_PORT);

if (!existsSync(clientEnvPath)) {
  writeFileSync(
    clientEnvPath,
    [
      '# Dev-only: where the Vite dev server proxies /api requests.',
      `VITE_API_PROXY_TARGET=http://localhost:${port}`,
      '# Absolute backend URL for production builds. Leave empty in development.',
      'VITE_API_URL=',
      '',
    ].join('\n')
  );
  created.push('.env');
}

const mongoUri = readValue(serverEnv, 'MONGODB_URI');

console.log('[setup] environment ready');
if (created.length) console.log(`[setup] created: ${created.join(', ')}`);
if (patched.length) console.log(`[setup] patched: ${patched.join(', ')}`);
if (!created.length && !patched.length) console.log('[setup] nothing to do, env files already exist');
console.log(`[setup] client  -> http://localhost:${process.env.CLIENT_PORT || 5173}`);
console.log(`[setup] server  -> http://localhost:${port}`);
console.log(`[setup] mongodb -> ${mongoUri || 'not configured'}`);
