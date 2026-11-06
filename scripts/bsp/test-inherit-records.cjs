const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inheritStandaloneRecords } = require('../../electron/bsp/inherit-records.cjs');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-inherit-test-'));
const source = path.join(folder, 'standalone.json');
const destination = path.join(folder, 'portal.json');
try {
  assert.equal(inheritStandaloneRecords(source, destination), false);
  const data = {
    units: [{ id: 'unit', scouts: [{ id: 'scout', onlineId: 'website-id', payment: { amountPaid: 50, receiptNo: 'AR-00169', receiptPrintedAt: '2026-10-20T04:00:00Z' }, camp: { amountPaid: 50, receiptNo: 'AR-00170' } }] }],
    adults: [], settings: { nextReceipt: 171 }, archives: { '2025': { units: [], adults: [] } },
  };
  const original = JSON.stringify(data);
  fs.writeFileSync(source, original);
  assert.equal(inheritStandaloneRecords(source, destination), true);
  assert.equal(fs.readFileSync(destination, 'utf8'), original, 'All payment, camp, receipt, archive, and counter values are inherited verbatim');
  assert.equal(fs.readFileSync(source, 'utf8'), original, 'Standalone data stays untouched');
  fs.writeFileSync(destination, '{"units":[],"adults":[]}');
  assert.equal(inheritStandaloneRecords(source, destination), false);
  assert.equal(fs.readFileSync(destination, 'utf8'), '{"units":[],"adults":[]}', 'Never overwrite existing portal records, even an empty workspace');
  fs.unlinkSync(destination);
  fs.writeFileSync(source, '{"units":[{}],"adults":[]}');
  assert.throws(() => inheritStandaloneRecords(source, destination), /invalid/);
  assert.equal(fs.existsSync(destination), false);
  fs.writeFileSync(source, 'broken JSON');
  assert.throws(() => inheritStandaloneRecords(source, destination), SyntaxError);
  assert.equal(fs.existsSync(destination), false);
  console.log('PASS: first-launch record inheritance preserves payments and receipts, skips existing data, and rejects invalid sources.');
} finally {
  if (path.dirname(path.resolve(folder)) !== path.resolve(os.tmpdir()) || !path.basename(folder).startsWith('bsp-inherit-test-')) throw Error('Unexpected test folder');
  fs.rmSync(folder, { recursive: true, force: true });
}
