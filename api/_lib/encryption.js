/**
 * Encryption Utilities for Sensitive Data
 *
 * Uses AES-256-GCM encryption to protect sensitive data like OpenAI API keys.
 * Requires ENCRYPTION_KEY environment variable (32 bytes, 64 hex characters).
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Random IV (initialization vector) per encryption
 * - Authentication tag to detect tampering
 * - Base64 encoding for database storage
 */

import crypto from 'crypto';

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable not set. Generate with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
  }

  // Trim whitespace and newlines
  const trimmedKey = key.trim();

  if (trimmedKey.length !== 64) {
    throw new Error(`ENCRYPTION_KEY must be 64 hex characters (32 bytes). Current length: ${trimmedKey.length}. Generate with: node -e "console.log(crypto.randomBytes(32).toString('hex'))"`);
  }

  return Buffer.from(trimmedKey, 'hex');
}

/**
 * Encrypt sensitive data
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Base64-encoded encrypted data (format: iv:authTag:ciphertext)
 */
export function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Base64-encoded encrypted data
 * @returns {string} Decrypted plaintext
 */
export function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid auth tag length');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data - data may be corrupted or encryption key changed');
  }
}

/**
 * Check if data appears to be encrypted (has correct format)
 * @param {string} data - Data to check
 * @returns {boolean} True if data appears to be encrypted
 */
export function isEncrypted(data) {
  if (!data || typeof data !== 'string') {
    return false;
  }

  // Check for format: base64:base64:base64
  const parts = data.split(':');
  if (parts.length !== 3) {
    return false;
  }

  // Check if parts are valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every(part => base64Regex.test(part));
}

/**
 * Encrypt OpenAI API key (convenience wrapper)
 * @param {string} apiKey - OpenAI API key to encrypt
 * @returns {string} Encrypted API key
 */
export function encryptApiKey(apiKey) {
  if (!apiKey) {
    return null;
  }

  // Don't re-encrypt if already encrypted
  if (isEncrypted(apiKey)) {
    return apiKey;
  }

  return encrypt(apiKey);
}

/**
 * Decrypt OpenAI API key (convenience wrapper)
 * @param {string} encryptedKey - Encrypted API key
 * @returns {string} Decrypted API key
 */
export function decryptApiKey(encryptedKey) {
  if (!encryptedKey) {
    return null;
  }

  // If not encrypted (legacy data), return as-is
  if (!isEncrypted(encryptedKey)) {
    console.warn('⚠️  API key is not encrypted - consider running encryption migration');
    return encryptedKey;
  }

  return decrypt(encryptedKey);
}

/**
 * Generate a new encryption key (for setup)
 * Run: node -e "import('./api/_lib/encryption.js').then(m => console.log(m.generateEncryptionKey()))"
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
