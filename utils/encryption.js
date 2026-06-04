import crypto from 'crypto';

const ALGO = 'aes-256-cbc';

export function encrypt(text) {
  if (!text) return '';
  const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(textStr) {
  if (!textStr) return '';
  const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

  // Check if it's the new format with dynamic IV (iv:encrypted)
  if (textStr.includes(':')) {
    const parts = textStr.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    return decipher.update(encryptedText, 'hex', 'utf8') + decipher.final('utf8');
  }

  // Fallback to legacy static IV decryption
  const STATIC_IV = Buffer.from(process.env.ENCRYPTION_IV, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, STATIC_IV);
  return decipher.update(textStr, 'hex', 'utf8') + decipher.final('utf8');
}
