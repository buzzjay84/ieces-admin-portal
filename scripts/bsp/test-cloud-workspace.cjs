const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCloudWorkspace } = require('../../electron/bsp/cloud-workspace.cjs');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-cloud-test-'));
let remote = null, offline = false;
const initial = { units: [{ id: 'u', scouts: [{ id: 's', payment: { amountPaid: 50, receiptNo: 'AR-00171' } }] }], adults: [], settings: { nextReceipt: 172 }, archives: {} };
const request = async (_cfg, method, _query, body) => {
  if (offline) throw Error('Network offline');
  if (method === 'GET') return { data: remote ? [structuredClone(remote)] : [] };
  if ((remote?.revision || 0) !== body.p_expected_revision) return { error: 'Another app saved newer records' };
  remote = { revision: (remote?.revision || 0) + 1, document: structuredClone(body.p_document) };
  return { data: [structuredClone(remote)] };
};
const clients = [];
function client(name) {
  const events = [], file = path.join(folder, name + '.json');
  fs.writeFileSync(file, JSON.stringify(initial));
  const store = createCloudWorkspace({ file, request, notify: event => events.push(event) });
  clients.push(store);
  return { store, events, file };
}
(async () => {
  try {
    const a = client('portal'), b = client('standalone');
    await a.store.start({});
    assert.equal(a.events.at(-1).status, 'uninitialized');
    await a.store.initialize(JSON.stringify(initial));
    assert.deepEqual(remote.document, initial, 'Upload preserves existing payments and receipt numbers');
    a.store.read();
    await b.store.start({}); b.store.read();
    const edited = structuredClone(initial); edited.settings.nextReceipt = 173; edited.units[0].scouts[0].payment.receiptNo = 'AR-00172';
    assert.equal(await a.store.save(JSON.stringify(edited)), true);
    const stale = structuredClone(initial); stale.units = [];
    assert.equal(await b.store.save(JSON.stringify(stale)), false, 'Stale client cannot erase newer payments');
    assert.deepEqual(remote.document, edited);
    assert.equal(b.store.canPrint(), false, 'Conflict blocks receipt printing');
    assert.ok(fs.readdirSync(folder).some(name => name.startsWith('bsp-recovery-')));
    await b.store.start({});
    assert.deepEqual(JSON.parse(b.store.read()), edited);
    assert.equal(await b.store.save(JSON.stringify({ ...edited, units: [] })), true);
    await new Promise(resolve => setTimeout(resolve, 5200));
    assert.equal(a.events.at(-1).status, 'changed', 'Changes on another app reach the portal');
    assert.equal(JSON.parse(a.store.read()).units.length, 0);
    offline = true;
    assert.equal(await a.store.save(JSON.stringify(edited)), false);
    assert.equal(a.store.canPrint(), false);
    assert.equal(remote.document.units.length, 0, 'Network failure never claims an unconfirmed save');
    offline = false;
    await a.store.start({}); a.store.read(); await a.store.confirmPrint();
    a.store.stop();
    assert.equal(await a.store.save(JSON.stringify(edited)), false, 'Signed-out sessions cannot write');
    console.log('PASS: cloud migration, shared edits/deletes, CAS conflicts, receipt safety, recovery backups, network failure, reconnect, and sign-out.');
  } finally {
    clients.forEach(store => store.stop());
    assert.equal(path.dirname(path.resolve(folder)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('bsp-cloud-test-'));
    fs.rmSync(folder, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
