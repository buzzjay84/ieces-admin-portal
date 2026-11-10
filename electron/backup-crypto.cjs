const { randomBytes, scrypt, createCipheriv, createDecipheriv } = require('node:crypto');
const { promisify } = require('node:util');
const deriveKey = promisify(scrypt);
const FORMAT = 'ieces-bsp-backup-v1';

async function encryptBackup(text, password) {
  if (typeof password !== 'string' || password.length < 12) throw Error('Use a backup password with at least 12 characters.');
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await deriveKey(password, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return JSON.stringify({ format: FORMAT, salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}
async function decryptBackup(text, password) {
  const data = JSON.parse(text);
  if (data?.format !== FORMAT) return text; // Existing plaintext backups remain importable.
  if (typeof password !== 'string' || !password) throw Error('Enter the backup password.');
  try {
    const salt = Buffer.from(data.salt, 'base64'), iv = Buffer.from(data.iv, 'base64'), tag = Buffer.from(data.tag, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw Error('Invalid backup');
    const key = await deriveKey(password, salt, 32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch { throw Error('Incorrect password or damaged encrypted backup. No records were changed.'); }
}
module.exports = { encryptBackup, decryptBackup, FORMAT };
