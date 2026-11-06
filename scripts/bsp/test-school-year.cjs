const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let source = readFileSync('src/app.js', 'utf8');
source = source.slice(0, source.lastIndexOf('\nrender();'));
const element = { innerHTML: '', textContent: '', scrollIntoView() {}, classList: { add() {}, remove() {}, toggle() {} } };
let promptReply;
const context = {
  console, setTimeout: () => 1, clearTimeout() {}, alert() {}, confirm: () => true, prompt: () => promptReply, assert, TextEncoder, btoa,
  document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => element },
  window: { scrollTo() {}, bsp: { load: () => null, save: () => true, sbRest: async () => ({ data: [{ id: 'x' }] }) } },
};
vm.createContext(context); vm.runInContext(source, context);

vm.runInContext(`
render = () => {}; toast = () => {};
db.settings.schoolYear = '2026';
const u = { id: 'u1', sponsor: 'School', unitType: 'Kawan', unitNo: '1', scouts: [
  { id: 's1', surname: 'Cruz', given: 'Juan', mi: 'D', sex: 'M', cardNo: 'CARD-1', rank: 'Second Class', years: 2, grade: 'Grade 4', guardian: 'Maria Cruz', contact: '0917', payment: {} },
] };
db.units.push(u);
db.adults.push({ id: 'a1', surname: 'Santos', first: 'Pedro', role: 'UL' });
`, context);

// matchingArchivedScout should find nothing before any year is archived
assert.equal(vm.runInContext("matchingArchivedScout('Cruz', 'Juan')", context), null, 'nothing archived yet');

promptReply = '2027';
vm.runInContext('actions.startNewSchoolYear()', context);
assert.equal(vm.runInContext('db.settings.schoolYear', context), '2027', 'rolled over to the entered year');
assert.equal(vm.runInContext('db.settings.nextReceipt', context), 1, 'receipt counter restarts');
assert.equal(vm.runInContext('db.settings.websiteFeesPending', context), true, 'rollover queues the new school year for publishing to the website');
assert.equal(vm.runInContext('db.units.length', context), 0, 'active roster cleared');
assert.equal(vm.runInContext('db.adults.length', context), 0, 'active adults cleared');
assert.equal(vm.runInContext('db.archives["2026"].units[0].scouts[0].surname', context), 'Cruz', 'archived unit keeps the scout');
assert.equal(vm.runInContext('db.archives["2026"].adults[0].surname', context), 'Santos', 'archived adults preserved');

const match = vm.runInContext("matchingArchivedScout('cruz', 'JUAN')", context);
assert.ok(match, 'finds the archived scout case-insensitively');
assert.equal(match.year, '2026');
assert.equal(match.scout.cardNo, 'CARD-1');

// a second rollover with nothing registered yet should not error, and keeps the first archive
promptReply = '2028';
vm.runInContext('actions.startNewSchoolYear()', context);
assert.equal(vm.runInContext('db.settings.schoolYear', context), '2028');
assert.ok(vm.runInContext('db.archives["2026"] && db.archives["2027"]', context), 'both prior years stay archived');

// declining the prompt leaves everything untouched
promptReply = null;
vm.runInContext('actions.startNewSchoolYear()', context);
assert.equal(vm.runInContext('db.settings.schoolYear', context), '2028', 'cancelling the prompt does not change the year');

console.log('PASS: school year rollover archives units/adults, resets receipts, and returning learners are found by name.');
