const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ieces-security-'));
  env.IECES_SECURITY_TEST_DIR = folder;
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', timeout: 60000 });
  if (path.dirname(path.resolve(folder)) !== path.resolve(os.tmpdir()) || !path.basename(folder).startsWith('ieces-security-')) throw Error('Unexpected test path');
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(result.status ?? 1);
}
const { app, safeStorage } = require('electron');
const folder = process.env.IECES_SECURITY_TEST_DIR;
app.setPath('userData', folder);
app.whenReady().then(async () => {
  try {
    const { createSecureStore } = require('../electron/secure-store.cjs');
    const storage = createSecureStore(safeStorage);
    const file = path.join(folder, 'records.json');
    const text = JSON.stringify({ learner: 'Private learner', access_token: 'private-token' });
    fs.writeFileSync(file, text);
    assert.equal(storage.read(file), text, 'Legacy records migrate without changing values');
    const ciphertext = fs.readFileSync(file);
    assert.equal(ciphertext.includes('Private learner'), false);
    assert.equal(ciphertext.includes('private-token'), false);
    assert.equal(storage.read(file), text);
    const unavailable = createSecureStore({ isEncryptionAvailable: () => false });
    assert.throws(() => unavailable.write(file, 'replacement'), /unavailable/);
    assert.deepEqual(fs.readFileSync(file), ciphertext, 'Unavailable encryption must preserve records');
    const broken = createSecureStore({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret', encryptString() { throw Error('Key failure'); } });
    assert.throws(() => broken.write(file, text), /Key failure/);
    assert.deepEqual(fs.readFileSync(file), ciphertext);
    fs.writeFileSync(file, 'damaged JSON');
    assert.throws(() => storage.read(file), SyntaxError);
    assert.equal(fs.readFileSync(file, 'utf8'), 'damaged JSON');
    fs.writeFileSync(file, Buffer.concat([Buffer.from('IECES-ENC-v1\n'), Buffer.from('damaged ciphertext')]));
    assert.throws(() => storage.read(file));
    const { encryptBackup, decryptBackup } = require('../electron/backup-crypto.cjs');
    const password = 'test-password-123';
    const backup = await encryptBackup(text, password);
    assert.equal(backup.includes('Private learner'), false);
    assert.equal(await decryptBackup(backup, password), text);
    assert.notEqual(await encryptBackup(text, password), backup, 'Each backup has fresh salt and IV');
    await assert.rejects(encryptBackup(text, 'short'), /12 characters/);
    await assert.rejects(decryptBackup(backup, 'incorrect-password'), /Incorrect password/);
    const tampered = JSON.parse(backup); tampered.tag = Buffer.alloc(16).toString('base64');
    await assert.rejects(decryptBackup(JSON.stringify(tampered), password), /damaged/);
    assert.equal(await decryptBackup(text), text, 'Legacy backups remain importable');
    assert.equal(fs.readdirSync(folder).some(name => name.endsWith('.tmp')), false);
    console.log('PASS: OS encryption, plaintext migration, no plaintext records/tokens, failure preservation, password backups, wrong passwords, tamper rejection, and legacy imports.');
    app.exit(0);
  } catch (err) { console.error(err); app.exit(1); }
});
