const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const test of ['test-cloud-workspace.cjs', 'test-inherit-records.cjs', 'test-regressions.cjs', 'test-camp.cjs', 'test-school-year.cjs', 'test-receipt-sync.cjs', 'test-website-fees.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'bsp', test)], {
    cwd: path.join(__dirname, '../electron/bsp'), stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const fs = require('node:fs');
const os = require('node:os');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ieces-bsp-test-'));
const env = { ...process.env, BSP_TEST_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let status = 0;
for (const script of ['workspace.cjs', 'registration.cjs', 'preview.cjs', 'portal.cjs']) {
  const result = spawnSync(require('electron'), [path.join(__dirname, 'bsp', script)], { env, stdio: 'inherit', timeout: 60000 });
  if (result.status !== 0) { status = result.status ?? 1; break; }
}
if (path.dirname(path.resolve(dataDir)) !== path.resolve(os.tmpdir()) || !path.basename(dataDir).startsWith('ieces-bsp-test-')) throw new Error('Unexpected test data path');
fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
process.exit(status);
