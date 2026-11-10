const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const HEADER = Buffer.from('IECES-ENC-v1\n');

function createSecureStore(safeStorage) {
  function checkKeyStore() {
    if (!safeStorage.isEncryptionAvailable()
      || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw Error('The OS encryption key store is unavailable. Records have not been changed.');
    }
  }
  function write(file, text) {
    checkKeyStore();
    const encrypted = safeStorage.encryptString(text);
    if (safeStorage.decryptString(encrypted) !== text) throw Error('Encryption verification failed.');
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, Buffer.concat([HEADER, encrypted]), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, file);
    } finally { fs.rmSync(temp, { force: true }); }
  }
  function read(file) {
    if (!fs.existsSync(file)) return null;
    const bytes = fs.readFileSync(file);
    checkKeyStore();
    if (bytes.subarray(0, HEADER.length).equals(HEADER)) {
      return safeStorage.decryptString(bytes.subarray(HEADER.length));
    }
    const text = bytes.toString('utf8');
    JSON.parse(text); // Validate legacy data before replacing its only copy.
    write(file, text);
    return text;
  }
  return { read, write };
}
module.exports = { createSecureStore };
