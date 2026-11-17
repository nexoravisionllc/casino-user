import crypto from 'node:crypto';
import { promisify } from 'node:util';

/**
 * PBKDF2-SHA256 password hashing, compatible with hashes already stored by the
 * C# backend: {iterations}.{saltBase64}.{hashBase64}.
 */

const pbkdf2 = promisify(crypto.pbkdf2);

const SALT_SIZE = 16;
const KEY_SIZE = 32;
const ITERATIONS = 100_000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_SIZE);
  const hash = await pbkdf2(password, salt, ITERATIONS, KEY_SIZE, 'sha256');
  return `${ITERATIONS}.${salt.toString('base64')}.${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const s = String(stored ?? '');
  const a = s.indexOf('.');
  const b = s.indexOf('.', a + 1);
  if (a < 0 || b < 0) return false;

  const iterations = s.slice(0, a).trim();
  if (!/^\+?\d+$/.test(iterations) || Number(iterations) < 1) return false;

  const salt = Buffer.from(s.slice(a + 1, b), 'base64');
  const expected = Buffer.from(s.slice(b + 1), 'base64');
  if (expected.length === 0) return false;

  const actual = await pbkdf2(password, salt, Number(iterations), expected.length, 'sha256');
  return crypto.timingSafeEqual(actual, expected);
}
