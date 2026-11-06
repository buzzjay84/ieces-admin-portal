const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/app.js', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const calls = [];
  let reply, saveOk = true;
  const ctx = vm.createContext({ console, assert, alert() {}, setTimeout: () => 1, clearTimeout() {},
    document: { addEventListener() {}, getElementById: () => ({ scrollIntoView() {} }) },
    window: { bsp: { load: () => null, save: () => saveOk,
      sbRest: async (cfg, method, query, body) => {
        calls.push({ method, query, body });
        if (query !== 'rpc/bsp_publish_fees') return { data: [{ id: 'website-1' }] };
        return new Promise(resolve => { reply = resolve });
      } } } });
  vm.runInContext(source.slice(0, source.lastIndexOf('\nrender();')), ctx);
  vm.runInContext(`render = () => {}; toast = () => {}; online.email = 'admin@example.invalid';
    db.settings.rates = { scout: 72.35, teacher: 83.10, lay: 120, camp: 210.29 };`, ctx);
  return { run: code => vm.runInContext(code, ctx), calls, failSave: () => { saveOk = false; },
    reply: result => reply(result), success: () => reply({ data: [{ sponsor: 'Isabela East Central Elementary School', updated_at: '2026-10-21T01:00:00Z' }] }) };
}
(async () => {
  let app = setup();
  await app.run('syncWebsiteFees()');
  assert.equal(app.calls.length, 0, 'Startup never publishes defaults without a saved/publish request');
  app.run('db.settings.websiteFeesPending = true; online.email = null');
  await app.run('syncWebsiteFees()');
  assert.equal(app.calls.length, 0, 'Signed-out requests stay queued');
  app.run("online.email = 'admin@example.invalid'; db.settings.schoolYear = '2026'");
  const first = app.run('syncWebsiteFees()');
  assert.equal(app.calls[0].body.p_rates.camp, 210.29);
  assert.equal(app.calls[0].body.p_rates.scout, 72.35);
  assert.equal(app.calls[0].body.p_current_sy, '2026');
  assert.equal('signName' in app.calls[0].body, false);
  app.success(); await first;
  assert.equal(app.run('db.settings.websiteFeesPending'), false);

  app = setup();
  app.run('db.settings.websiteFeesPending = true');
  const failed = app.run('syncWebsiteFees()');
  app.reply({ error: 'offline' }); await failed;
  assert.equal(app.run('db.settings.websiteFeesPending'), true);
  assert.match(app.run('online.feeSyncError'), /offline/);
  const retry = app.run('syncWebsiteFees()');
  app.success(); await retry;
  assert.equal(app.run('online.feeSyncError'), '');

  app = setup();
  app.run('db.settings.websiteFeesPending = true');
  const old = app.run('syncWebsiteFees()');
  app.run('db.settings.rates.scout = 96.75');
  await app.run('syncWebsiteFees()');
  assert.equal(app.calls.length, 1, 'Concurrent publication is serialized');
  app.success(); await old; await tick();
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].body.p_rates.scout, 96.75, 'Newer fee save is not lost');
  app.success(); await tick();
  assert.equal(app.run('db.settings.websiteFeesPending'), false);

  app = setup();
  app.run('db.settings.websiteFeesPending = true');
  const stale = app.run('syncWebsiteFees()');
  app.run('online = { ...online, email: null }');
  app.success(); await stale;
  assert.equal(app.run('db.settings.websiteFeesPending'), true, 'Sign-out ignores a late publish confirmation');
  assert.equal(app.run('db.settings.websiteFeesPublishedAt'), undefined);

  app = setup();
  app.failSave();
  app.run('actions.publishWebsiteFees()');
  assert.equal(app.calls.length, 0, 'Failed local save never publishes');
  for (const invalid of [-1, 0.001, Infinity]) {
    app.run(`db.settings.rates.scout = ${invalid}`);
    assert.throws(() => app.run('websiteFeePayload()'), /two decimal/);
  }

  app = setup();
  app.run(`online.rows = [{ id: 'website-1', reg_type: 'scout', surname: 'Camper', given_name: 'Test',
    sponsor: db.settings.defaultSponsor, grade_section: 'Grade 2 – Elang', camp_requested: true }];`);
  assert.equal(app.run("campChoice('website-1')"), true);
  await app.run("onlineTake('website-1', false)");
  assert.equal(app.run('db.units.flatMap(u => u.scouts).length'), 1);
  assert.equal(app.run('db.units[0].scouts[0].camp.joined'), true);
  assert.equal(app.run('paidOf(db.units[0].scouts[0])'), 0);
  assert.equal(app.run('campPaidOf(db.units[0].scouts[0])'), 0);
  await app.run("onlineTake('website-1', false)");
  assert.equal(app.run('db.units.flatMap(u => u.scouts).length'), 1, 'Import retry reuses camper');
  app.run("online.campChoices = {'website-1': false}");
  assert.equal(app.run("campChoice('website-1')"), false, 'Explicit coordinator choice overrides website intent');
  console.log('PASS: published fee values, pending/retry queue, concurrent saves, sign-out, disk failure, validation, and camping import without payment.');
})().catch(error => { console.error(error); process.exitCode = 1; });
