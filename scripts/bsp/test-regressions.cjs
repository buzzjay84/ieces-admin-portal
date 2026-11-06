const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let source = readFileSync('src/app.js', 'utf8');
source = source.slice(0, source.lastIndexOf('\nrender();'));
let saveOK = true, patchCalls = 0;
const element = { innerHTML: '', textContent: '', scrollIntoView() {}, classList: { add() {}, remove() {}, toggle() {} } };
const context = {
 console, setTimeout: () => 1, clearTimeout() {}, alert() {}, confirm: () => true,
 document: { addEventListener() {}, querySelectorAll: () => [], querySelector: selector => selector.startsWith('[data-unit-for') ? null : element, getElementById: () => element },
 window: { scrollTo() {}, bsp: { load: () => null, save: () => saveOK, sbRest: async () => { patchCalls++; return { data: [{ id: 'site-1' }] }; } } },
 assert,
};
vm.createContext(context); vm.runInContext(source, context);
vm.runInContext(readFileSync('src/registration.js', 'utf8'), context);
(async () => {
 vm.runInContext(`
 assert.equal(toWords(1.999), 'Two Pesos Only');
 assert.equal(toWords(50.25), 'Fifty Pesos and Twenty-Five Centavos Only');
 online.unitChoices = { 'site-1': '' };
 const row = {id:'site-1', reg_type:'scout', surname:'Test', given_name:'Scout', sponsor:'School', unit_type:'Kawan', unit_no:'1'};
 online.rows = [row];
 `, context);
 saveOK = false;
 await vm.runInContext(`onlineTake('site-1', true)`, context);
 vm.runInContext(`assert.equal(db.units.length, 0); assert.equal(db.settings.nextReceipt, 1); assert.equal(online.importing, false);`, context);
 assert.equal(patchCalls, 0, 'Failed saves must not acknowledge website submissions');
 saveOK = true;
 await vm.runInContext(`onlineTake('site-1', false)`, context);
 vm.runInContext(`assert.ok(online.rows.some(r => r.id === 'site-1'), 'Imported unpaid learners remain available for payment');`, context);
 vm.runInContext(`assert.equal(db.units.length, 1); assert.equal(db.units[0].scouts.length, 1); online.rows = [row];`, context);
 await vm.runInContext(`onlineTake('site-1', false)`, context);
 vm.runInContext(`assert.equal(db.units[0].scouts.length, 1);`, context);
 context.window.bsp.sbRest = async () => { throw Error('Network failure'); };
 await vm.runInContext('onlineRefresh()', context);
 vm.runInContext(`assert.equal(online.loading, false); assert.equal(online.error, 'Network failure'); assert.equal(online.unitChoices['site-1'], '');`, context);
 vm.runInContext(`
 db.units = [{id:'u1',scouts:[{id:'s1',payment:{receiptNo:'AR-00001',amountPaid:50}}]}];
 db.adults = [{id:'a1',payment:{receiptNo:'AR-00002',amountPaid:60}}];
 db.settings.nextReceipt = 1;
 const nextScout = {id:'s2',payment:{amountPaid:50}};
 db.units[0].scouts.push(nextScout); issueReceiptIfNeeded(nextScout);
 assert.equal(nextScout.payment.receiptNo,'AR-00003');
 assert.equal(db.settings.nextReceipt,4);
 db.settings.nextReceipt = '5';
 const nextAdult = {payment:{amountPaid:60}};
 issueReceiptIfNeeded(nextAdult); assert.equal(nextAdult.payment.receiptNo,'AR-00005');
 render = () => {}; toast = () => {};
 const originalDb = db;
 `, context);
 let importedText = JSON.stringify({units:[{id:'backup-unit',scouts:[]}],adults:[]});
 let alerts = [];
 context.alert = message => alerts.push(message);
 context.window.bsp.openFile = async () => importedText;
 saveOK = false;
 await vm.runInContext('actions.importJSON()', context);
 vm.runInContext('assert.equal(db,originalDb)', context);
 assert(alerts.at(-1).includes('Could not save backup to disk'));
 saveOK = true; alerts = [];
 importedText = JSON.stringify({units:[{}],adults:[]});
 await vm.runInContext('actions.importJSON()', context);
 vm.runInContext('assert.equal(db,originalDb)', context);
 assert(alerts.at(-1).includes('Not a BSP backup file'));
 let savedText;
 context.window.bsp.save = text => { savedText = text; return true; };
 context.window.bsp.load = () => savedText;
 importedText = JSON.stringify({units:[{id:'backup-unit',scouts:[]}],adults:[]});
 await vm.runInContext('actions.importJSON()', context);
 vm.runInContext(`assert.equal(db.units[0].id,'backup-unit')`, context);
 vm.runInContext(`db.units = [{id:'delete-unit',scouts:[{id:'delete-scout',onlineId:'site-delete',surname:'Test',given:'Scout',payment:{receiptNo:'AR-DELETE',amountPaid:50}}]}]`, context);
 await vm.runInContext(`actions.deleteOnlinePaid({id:'delete-scout',unit:'delete-unit'})`, context);
 vm.runInContext(`assert.equal(db.units[0].scouts.length,1)`, context);
 let rejectDeletion;
 context.window.bsp.sbRest = () => new Promise((_resolve, reject) => { rejectDeletion = reject; });
 const deleting = vm.runInContext(`actions.deleteOnlinePaid({id:'delete-scout',unit:'delete-unit'})`, context);
 vm.runInContext(`db.adults.push({id:'concurrent-edit'});`, context);
 await vm.runInContext(`actions.deleteOnlinePaid({id:'delete-scout',unit:'delete-unit'})`, context);
 rejectDeletion(Error('Test failure'));
 await deleting;
 vm.runInContext(`assert.equal(db.units[0].scouts.length,1); assert.ok(db.adults.some(adult => adult.id === 'concurrent-edit'));`, context);
 context.window.bsp.sbRest = async () => ({data:[{id:'site-delete'}]});
 await vm.runInContext(`actions.deleteOnlinePaid({id:'delete-scout',unit:'delete-unit'})`, context);
 vm.runInContext(`assert.equal(db.units[0].scouts.length,0)`, context);
 // A late response must not repopulate registrations after sign-out.
 context.window.bsp.sbSignOut = async () => true;
 let finishRefresh;
 context.window.bsp.sbRest = async (_cfg, method, query) => {
   if (method !== 'GET') return { data: [] };
   assert(query.includes('status=in.(pending,imported)'), 'Refresh includes imported unpaid registrations');
   return new Promise(resolve => { finishRefresh = resolve; });
 };
 vm.runInContext(`online.email = 'test@example.invalid'; db.units = []; db.adults = [];`, context);
 const lateRefresh = vm.runInContext('onlineRefresh()', context);
 await vm.runInContext('actions.onlineSignOut()', context);
 finishRefresh({ data: [{ id: 'stale-registration' }] });
 await lateRefresh;
 vm.runInContext(`assert.equal(online.email, null); assert.equal(online.rows, null); assert.equal(online.loading, false);`, context);

 // Events queued while importing are fetched as soon as the import finishes.
 let queuedGets = 0;
 context.window.bsp.sbRest = async (_cfg, method) => {
   if (method === 'GET') { queuedGets++; return { data: [] }; }
   return { data: [{ id: 'queued-registration' }] };
 };
 vm.runInContext(`online.email = 'test@example.invalid'; online.rows = [{ id:'queued-registration', reg_type:'adult', role:'UL_TROOP', surname:'Queued', given_name:'Test' }]; onlineRefreshPending = true;`, context);
 await vm.runInContext(`onlineTake('queued-registration', false)`, context);
 assert.equal(queuedGets, 1, 'Import completion drains queued updates');
 console.log('PASS: unpaid import visibility, queued live updates, and stale response after sign-out.');
 console.log('PASS: paid registration deletion and rollback on online failure.');
 console.log('PASS: receipt number collisions, legacy counters, failed/invalid backup safety, and valid restore.');
 console.log('PASS: receipt rounding, import rollback, duplicate retry, network recovery, unit choice retention.');
})().catch(err => { console.error(err); process.exitCode = 1; });

