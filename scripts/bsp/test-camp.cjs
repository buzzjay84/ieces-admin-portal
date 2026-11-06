const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let source = readFileSync('src/app.js', 'utf8');
source = source.slice(0, source.lastIndexOf('\nrender();'));
const element = { innerHTML: '', textContent: '', scrollIntoView() {}, classList: { add() {}, remove() {}, toggle() {} } };
const context = {
  console, setTimeout: () => 1, clearTimeout() {}, alert() {}, confirm: () => true, assert, TextEncoder, btoa,
  document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => element },
  window: { scrollTo() {}, bsp: { load: () => null, save: () => true, sbRest: async () => ({ data: [{ id: 'x' }] }) } },
};
vm.createContext(context); vm.runInContext(source, context);
(async () => {
  vm.runInContext(`
  let printed = [];
  doPrint = (html, options) => printed.push({ html, options });
  render = () => {}; toast = () => {};
  db.settings.rates.camp = 150; db.settings.campDate = 'December 12–14, 2026';
  assert.equal(fullName({ surname: 'Cruz', given: 'Juan', ext: 'Jr.', mi: 'M' }), 'Cruz, Juan Jr. M.');
  assert.equal(fullNameFwd({ surname: 'Cruz', given: 'Juan', ext: 'Jr.', mi: 'M' }), 'Juan M. Cruz Jr.');
  assert.equal(nameExt(' jr '), 'Jr.'); assert.equal(nameExt('iii'), 'III');
  assert.equal(mi('d.s'), 'D.S'); assert.equal(fullName({ surname: 'Cruz', given: 'Ana', mi: 'D.r.' }), 'Cruz, Ana D.R.');
  const u = { id: 'u1', sponsor: 'School', unitType: 'Kawan', unitNo: '1', scouts: [] };
  const campControls = { id: 'controls', grade: 'Grade 4', payment: { amountPaid: 50 } };
  assert.ok(campCell(campControls).includes('data-act="campPay"'), 'Not joined: payment also joins the camp');
  assert.ok(!campCell(campControls).includes('data-act="campLeave"'), 'Not joined: nothing to leave yet');
  campControls.camp = { joined: true };
  assert.ok(campCell(campControls).includes('data-act="campPay"'));
  assert.ok(campCell(campControls).includes('data-act="campLeave"'), 'Joined but unpaid: can leave without paying');
  campControls.camp.amountPaid = 50;
  assert.ok(campCell(campControls).includes('Camp paid'));
  assert.ok(!campCell(campControls).includes('data-act="campPay"'), 'Paid: do not offer another payment');
  db.units.push(u); route = { view: 'unit', id: 'u1' };

  // Show unpaid eligible learners even when they have not joined camp.
  const unpaid = { id: 'unpaid', surname: 'Unpaid <test>', given: 'Camper', grade: 'Grade 5', payment: { amountPaid: 50 }, camp: { joined: true } };
  const paid = { id: 'paid', surname: 'PaidOnly', given: 'Camper', camp: { joined: true, amountPaid: 150 } };
  const notJoined = { id: 'notJoined', surname: 'NotJoined', given: 'Learner', payment: {} };
  const excluded = { id: 'excluded', surname: 'ExcludedSned', given: 'Learner', grade: 'SNED', payment: {} };
  u.scouts.push(unpaid, paid, notJoined, excluded);
  assert.equal(computeSummary().camp.joined - computeSummary().camp.paidCount, 1);
  assert.ok(viewSummary().includes('aria-expanded="false"'));
  actions.toggleUnpaidCampers();
  const unpaidHtml = viewSummary().split('<div id="unpaid-campers"')[1].split('<h3>')[1].split('</table>')[0];
  assert.ok(viewSummary().includes('aria-expanded="true"'));
  assert.ok(unpaidHtml.includes('Unpaid &lt;test&gt;'));
  assert.ok(!unpaidHtml.includes('PaidOnly'));
  assert.ok(unpaidHtml.includes('NotJoined'));
  assert.ok(!unpaidHtml.includes('ExcludedSned'));
  assert.ok(viewSummary().includes('aria-controls="unpaid-campers">2</button>'));
  assert.ok(unpaidHtml.includes('data-act="openUnit" data-id="u1"'));
  unpaid.camp.amountPaid = 150;
  notJoined.camp = { joined: true, amountPaid: 150 };
  assert.ok(viewSummary().includes('All eligible learners have a camp payment recorded.'));
  actions.toggleUnpaidCampers();
  u.scouts = [];

  // leaving an unpaid camp join clears it without touching registration payment
  const leaver = { id: 'leaver', surname: 'Leaver', given: 'Camper', grade: 'Grade 4', payment: { amountPaid: 50 }, camp: { joined: true } };
  u.scouts.push(leaver);
  actions.campLeave({ id: 'leaver' });
  assert.ok(!leaver.camp, 'camp leave clears the camp property');
  assert.equal(paidOf(leaver), 50, 'registration payment is untouched');
  u.scouts = u.scouts.filter(s => s !== leaver);

  // registration + camp paid together: one receipt with both lines
  const both = { id: 'both', surname: 'Both', given: 'Paid', payment: {}, camp: { joined: true } };
  u.scouts.push(both);
  actions.payScout({ id: 'both', camp: '1' });
  assert.equal(both.camp.receiptNo, both.payment.receiptNo);
  assert.equal(campPaidOf(both), 150);
  const combined = scoutReceipt(u, both);
  assert.equal(combined.paid, 200);
  assert.equal(combined.items.length, 2);
  assert.equal(unitReceipts(u).length, 1, 'shared receipt prints once');

  // registration already paid, camp paid later: the camp fee gets its own receipt
  const later = { id: 'later', surname: 'Later', given: 'Camper', payment: {} };
  u.scouts.push(later);
  markScoutPaid(later);
  // cancelling the receipt preview records nothing
  const counterBefore = db.settings.nextReceipt;
  actions.campPay({ id: 'later' });
  assert.equal(campPaidOf(later), 0, 'camp payment waits for printing');
  assert.equal(db.settings.nextReceipt, counterBefore, 'cancelled preview keeps the receipt counter');
  actions.campPay({ id: 'later' });
  const joined = printed.at(-1);
  assert.ok(joined.html.includes('December 12–14, 2026 (tentative)'));
  assert.ok(!joined.html.includes('Scout registration fee'), 'camp-only receipt excludes registration');
  assert.ok(joined.html.includes('Boy Scout Camping fee'));
  joined.options.onPrinted();
  assert.notEqual(later.camp.receiptNo, later.payment.receiptNo, 'camp payment has its own receipt');
  assert.equal(db.settings.nextReceipt, counterBefore + 1, 'camp uses a new receipt number');
  assert.equal(scoutReceipt(u, later).paid, 50);
  assert.equal(campReceipt(u, later).paid, 150);
  assert.equal(unitReceipts(u).length, 3);

  // reprint combines both paid fees without changing their original receipt numbers
  const split = { id: 'split', surname: 'Split', given: 'Camper', payment: {} };
  u.scouts.push(split);
  markScoutPaid(split); payCamp(split);
  const splitCampNo = split.camp.receiptNo;
  assert.notEqual(splitCampNo, split.payment.receiptNo);
  assert.ok(campCell(split).includes('data-act="campReceipt"'));
  actions.reprintScout({ unit: 'u1', id: 'split' });
  const reprint = printed.at(-1);
  assert.equal(split.camp.receiptNo, splitCampNo, 'reprint preserves separate receipts');
  assert.ok(reprint.html.includes('Scout registration fee') && reprint.html.includes('Boy Scout Camping fee'));
  assert.ok(reprint.html.includes(splitCampNo), 'combined reprint references the original camp receipt');
  assert.ok(reprint.html.includes(peso(200)), 'combined reprint totals both payments');
  reprint.options.onPrinted();
  assert.ok(split.payment.receiptPrintedAt && split.camp.receiptPrintedAt, 'printing records both included payments');
  assert.equal(unitReceipts(u).filter(r => r.recordId === 'split').length, 2);
  actions.campReceipt({ id: 'split' });
  assert.ok(printed.at(-1).html.includes(splitCampNo));
  assert.ok(!printed.at(-1).html.includes('Scout registration fee'));

  actions.reprintScout({ unit: 'u1', id: 'both' });
  assert.equal((printed.at(-1).html.match(/Boy Scout Camping fee/g) || []).length, 1, 'shared receipt includes camp only once');

  // undoing a separate camp payment keeps the registration paid
  actions.campUnpay({ id: 'split' });
  assert.ok(!split.camp); assert.equal(paidOf(split), 50);
  actions.reprintScout({ unit: 'u1', id: 'split' });
  assert.ok(!printed.at(-1).html.includes('Boy Scout Camping fee'), 'registration-only reprint excludes camp');
  u.scouts = u.scouts.filter(x => x !== split);

  // receipt numbers never collide with camp receipts
  const next = { id: 'next', payment: { amountPaid: 50 } };
  issueReceiptIfNeeded(next);
  assert.ok(![both.payment.receiptNo, later.payment.receiptNo, later.camp.receiptNo].includes(next.payment.receiptNo));

  const spare = { id: 'spare', surname: 'Spare', given: 'Camper', payment: {}, camp: { joined: true } };
  u.scouts.push(spare);
  payCamp(spare); const spareNo = spare.camp.receiptNo, spareCounter = db.settings.nextReceipt;
  actions.campUnpay({ id: 'spare' });
  assert.ok(!spare.camp, 'camp undo reverts to not joined');
  assert.equal(db.settings.nextReceipt, spareCounter - 1, 'unprinted latest receipt number is reused');
  payCamp(spare); assert.equal(spare.camp.receiptNo, spareNo);
  delete spare.camp;

  // undoing a combined payment voids the camp fee too, keeping the learner on the camp list
  actions.unpayScout({ id: 'both' });
  assert.equal(campPaidOf(both), 0); assert.ok(!campJoined(both), 'undo reverts the learner to not joined');
  assert.equal(computeSummary().camp.joined, 1);

  // "Mark all unpaid scouts as paid" must never charge the camp fee
  const bulk = ['b1', 'b2', 'b3'].map(id => ({ id, surname: id, given: 'Bulk', payment: {} }));
  u.scouts.push(...bulk);
  actions.payAllScouts();
  assert.ok(bulk.every(s => paidOf(s) === 50 && !s.camp), 'bulk registration payment leaves camp untouched');
  u.scouts = u.scouts.filter(s => !bulk.includes(s));

  // a collected camp fee stays counted if the grade later changes to SNED
  later.grade = 'SNED';
  assert.equal(computeSummary().camp.paid, 150);
  assert.ok(learnersBySection('camp').some(x => x.section === 'SNED'));
  later.grade = '';
  assert.equal(computeSummary().camp.paid, 150);
  `, context);
  // online import with the camp toggle combines both fees on one receipt
  vm.runInContext(`
  online.rows = [{ id: 'site-camp', reg_type: 'scout', surname: 'Web', given_name: 'Camper', sponsor: 'School', unit_type: 'Kawan', unit_no: '1' }];
  online.unitChoices = { 'site-camp': 'u1' }; online.campChoices = { 'site-camp': true };
  db.campIntents['site-camp'] = true;
  `, context);
  await vm.runInContext(`onlineTake('site-camp', true)`, context);
  vm.runInContext(`
  const web = db.units.flatMap(x => x.scouts).find(s => s.onlineId === 'site-camp');
  assert.equal(web.camp.receiptNo, web.payment.receiptNo);
  assert.ok(!db.campIntents['site-camp'], 'intent cleared after import');
  assert.ok(printed.at(-1).html.includes('Boy Scout Camping fee'));
  `, context);
  // SNED learners cannot join; lists group by scout section then grade level
  let saved;
  context.window.bsp.saveFile = async (name, text, _filters, encoding) => { saved = { name, text, encoding }; return name; };
  vm.runInContext(`
  const kab = { id: 'kab', surname: 'Kab', given: 'One', grade: 'Grade 2 – Rose', sex: 'M', payment: {} };
  const boy = { id: 'boy', surname: 'Boy', given: 'Two', grade: '5-Rizal', sex: 'F', payment: {} };
  const sned = { id: 'sned', surname: 'Sned', given: 'Three', grade: 'SNED', payment: {} };
  u.scouts.push(kab, boy, sned); route = { view: 'unit', id: 'u1' };
  actions.campJoin({ id: 'kab' }); actions.campJoin({ id: 'boy' }); actions.campJoin({ id: 'sned' });
  assert.ok(!campJoined(sned), 'SNED learners cannot join the camp');
  assert.ok(campCell(sned).includes('not included'));
  applyCampChoice(sned, true, false); assert.ok(!campJoined(sned));
  assert.deepEqual(learnersBySection('camp').map(x => x.section), ['Kab Scouts', 'Boy Scouts', 'Other']);
  assert.deepEqual(learnersBySection('camp')[1].grades.map(g => [g.grade, g.list[0].section]), [['Grade 5', 'Rizal']]);
  assert.ok(learnersBySection('registration').some(x => x.section === 'SNED'), 'SNED learners stay on the registration list');
  assert.ok(!learnersBySection('camp').some(x => x.section === 'SNED'));
  assert.equal(gradeParts('Kindergarten').level, 'Kinder'); assert.equal(scoutSection('Grade 3'), 'Kab Scout'); assert.equal(scoutSection('Grade 4'), 'Boy Scout');
  printLearnerList('camp');
  assert.ok(printed.at(-1).html.includes('KAB SCOUTS') && printed.at(-1).html.includes('BOY SCOUTS') && !printed.at(-1).html.includes('Sned'));
  xlsxLearnerList('registration');
  `, context);
  await new Promise(r => setImmediate(r));
  assert.equal(saved.encoding, 'base64');
  const zip = Buffer.from(saved.text, 'base64');
  assert.equal(zip.readUInt32LE(0), 0x04034B50, 'xlsx is a zip archive');
  const text = zip.toString('utf8');
  for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'name="Kab Scouts"', 'name="Boy Scouts"', 'name="SNED"']) assert.ok(text.includes(part), part);
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'bsp-test-registration-list.xlsx'), zip);
  vm.runInContext(`
    window.bsp.cloudStart = () => {};
    const reservedScout = {id:'reserved',surname:'Reserved',given:'Camper',grade:'Grade 2',payment:{amountPaid:50,receiptNo:'AR-OLD'}};
    u.scouts.push(reservedScout); route = {view:'unit',id:'u1'};
    const cloudCounter = db.settings.nextReceipt;
    actions.campPay({id:reservedScout.id});
    const reservedNo = db.receiptReservations[db.settings.schoolYear+':'+reservedScout.id].receiptNo;
    assert.equal(campPaidOf(reservedScout),0,'A cancelled cloud preview records no camp payment');
    assert.equal(db.settings.nextReceipt,cloudCounter+1,'The camp receipt number is reserved before printing');
    db.settings.nextReceipt=cloudCounter;
    assert.notEqual(nextReceiptNo(),reservedNo,'Other payments cannot take a reserved camp receipt');
    actions.campPay({id:reservedScout.id});
    assert.ok(printed.at(-1).html.includes(reservedNo),'Retry reuses the same reserved receipt');
    printed.at(-1).options.onPrinted();
    assert.equal(reservedScout.camp.receiptNo,reservedNo);
    assert.equal(campPaidOf(reservedScout),150);
    assert.ok(!db.receiptReservations[db.settings.schoolYear+':'+reservedScout.id]);
  `, context);
  console.log('PASS: camp registration, combined and camp-only receipts, receipt numbering, undo, summary, online camp toggle, SNED exclusion, section lists, and xlsx export.');
})().catch(err => { console.error(err); process.exitCode = 1; });
