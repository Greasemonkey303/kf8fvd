import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const KEY_B64 = process.env.ENCRYPTION_KEY || '';
if (!KEY_B64) {
  // Do not throw during import; runtime will fail when encrypt/decrypt used without key.
  // eslint-disable-next-line no-console
  console.warn('ENCRYPTION_KEY not set; encryption functions will fail at runtime');
}

const KEY = Buffer.from(KEY_B64, 'base64'); // expected 32 bytes for AES-256

export function encrypt(plaintext: string): string {
  if (KEY.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64)');
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(ciphertextB64: string): string {
  if (KEY.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64)');
  const data = Buffer.from(ciphertextB64, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function generateKeyBase64(): string {
  return randomBytes(32).toString('base64');
}

export default { encrypt, decrypt, generateKeyBase64 };
