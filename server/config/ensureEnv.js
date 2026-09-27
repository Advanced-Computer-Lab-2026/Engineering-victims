/**
 * Guarantees the server has a usable configuration before dotenv loads.
 *
 * If server/.env is missing it is created from .env.example, and if that file
 * is missing too, a default is written - including a MONGODB_URI pointing at a
 * local MongoDB. A random JWT secret is generated when the placeholder is still
 * in place, so tokens are never signed with a well-known key.
 *
 * Existing files are never overwritten.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/university_schedule';
const DEFAULT_PORT = '5000';
const PLACEHOLDER_SECRET = 'your_super_secret_jwt_key_here';

const readValue = (contents, key) => {
  const match = contents && contents.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : undefined;
};

const envPath = path.join(__dirname, '.env');
const examplePath = path.join(__dirname, '.env.example');

function ensureEnvFile() {
  if (fs.existsSync(envPath)) return false;

  let contents = '';
  if (fs.existsSync(examplePath)) {
    contents = fs.readFileSync(examplePath, 'utf8');
  } else {
    contents = [
      `PORT=${DEFAULT_PORT}`,
      `MONGODB_URI=${DEFAULT_MONGO_URI}`,
      `JWT_SECRET=${PLACEHOLDER_SECRET}`,
      'NODE_ENV=development',
      '',
    ].join('\n');
  }

  if (!readValue(contents, 'PORT')) contents = `PORT=${DEFAULT_PORT}\n${contents}`;
  if (!readValue(contents, 'MONGODB_URI')) contents += `\nMONGODB_URI=${DEFAULT_MONGO_URI}\n`;

  if (readValue(contents, 'JWT_SECRET') === PLACEHOLDER_SECRET) {
    contents = contents.replace(
      /^JWT_SECRET=.*$/m,
      `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`
    );
  }

  try {
    fs.writeFileSync(envPath, contents, { flag: 'wx' });
  } catch (err) {
    // Another process won the race, or the file appeared in the meantime.
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  return true;
}

module.exports = { ensureEnvFile, DEFAULT_MONGO_URI };
