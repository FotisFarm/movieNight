const crypto = require('crypto');

/**
 * Hashes a plain-text password using scrypt with a random 16-byte salt.
 * Output format: "salt:derivedKeyHex"
 */
function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plain-text password against a stored "salt:derivedKeyHex" hash.
 * Uses timingSafeEqual to prevent timing attacks.
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  try {
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const testBuffer = crypto.scryptSync(password, salt, keyBuffer.length);
    return crypto.timingSafeEqual(keyBuffer, testBuffer);
  } catch (_) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
