const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/app.js', 'utf8');
const calls = [];
let server = { ar_no: null, receipt_printed_at: '2026-10-01T02:00:00.000Z', camp_ar_no: null, camp_receipt_printed_at: null, camp_requested: null };
const ctx = vm.createContext({ console, document: { addEventListener() {} }, window: { bsp: {
  load: () => null, save: () => true,
  sbRest: async (_cfg, method, query, body) => {
    calls.push({ query, body });
    if (query.includes('camp_receipt_printed_at=is.null')) { if (server.camp_receipt_printed_at) return { data: [] }; }
    else if (query.includes('receipt_printed_at=is.null')) { if (server.receipt_printed_at) return { data: [] }; }
    Object.assign(server, body);
    return { data: [{ id: 'site-1', ...server }] };
  },
} }, assert });
vm.runInContext(source.slice(0, source.lastIndexOf('\nrender();')), ctx);
(async () => {
  vm.runInContext(`online.email = 'test@example.invalid';
    const learner = { id:'local-1', onlineId:'site-1', payment:{receiptNo:'AR-1', amountPaid:50}, camp:{} };
    db.units = [{scouts:[learner]}];`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.ar_no, 'AR-1');
  assert.equal(server.receipt_printed_at, '2026-10-01T02:00:00.000Z');
  assert.equal(server.camp_ar_no, null);
  assert.equal(server.camp_requested, false, 'Not in the camp roster yet');
  assert(!('receipt_printed_at' in calls[0].body));
  vm.runInContext(`learner.payment.receiptPrintedAt = '2026-10-16T01:00:00.000Z'`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.receipt_printed_at, '2026-10-01T02:00:00.000Z', 'Reprints from another installation preserve server first print');
  assert(calls.at(-1).query.includes('receipt_printed_at=is.null'));
  vm.runInContext('learner.payment.amountPaid = 0', ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.ar_no, null);
  assert.equal(server.receipt_printed_at, '2026-10-01T02:00:00.000Z', 'Older unpaid records cannot erase server print history');
  server = { ar_no: null, receipt_printed_at: null, camp_ar_no: null, camp_receipt_printed_at: null, camp_requested: null };
  vm.runInContext('learner.payment.amountPaid = 50', ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.receipt_printed_at, '2026-10-16T01:00:00.000Z');

  // A coordinator adding the learner to the camp roster (joined, not yet paid) syncs as
  // "in the camp, unpaid" — distinct from a learner who never joined the camp at all.
  vm.runInContext(`learner.camp = { joined: true };`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.camp_requested, true, 'Joining the camp roster syncs even before payment');
  assert.equal(server.camp_ar_no, null, 'Not paid yet');

  // Camping fee paid under its own receipt (not shared with registration) syncs its own AR/print time.
  vm.runInContext(`learner.camp = { joined: true, receiptNo: 'AR-2', amountPaid: 100 };`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.camp_ar_no, 'AR-2');
  assert.equal(server.camp_requested, true);
  assert.equal(server.camp_receipt_printed_at, null, 'Camp AR syncs before the camp receipt has printed');
  vm.runInContext(`learner.camp.receiptPrintedAt = '2026-10-20T03:00:00.000Z';`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.camp_receipt_printed_at, '2026-10-20T03:00:00.000Z');
  server.camp_receipt_printed_at = '2026-10-01T00:00:00.000Z'; // simulate an earlier first print recorded elsewhere
  vm.runInContext(`learner.camp.receiptPrintedAt = '2026-10-22T00:00:00.000Z';`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.camp_receipt_printed_at, '2026-10-01T00:00:00.000Z', 'Camp reprints preserve the server first print');
  vm.runInContext('learner.camp.amountPaid = 0', ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.camp_ar_no, null, 'Voiding the camp payment clears its AR number');
  assert.equal(server.camp_requested, true, 'Still in the camp roster, just unpaid');

  // Leaving the camp (coordinator removes the learner) clears the roster flag too.
  vm.runInContext(`delete learner.camp;`, ctx);
  await vm.runInContext('syncLearnerReceipts()', ctx);
  assert.equal(server.camp_requested, false);

  console.log('PASS: AR sync, legacy timestamp preservation, conditional first print, unpaid backup safety, and camp roster/receipt sync.');
})().catch(err => { console.error(err); process.exitCode = 1; });
