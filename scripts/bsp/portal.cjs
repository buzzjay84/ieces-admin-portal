const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
app.setPath('userData', process.env.BSP_TEST_DATA_DIR);
app.setPath('appData', app.getPath('userData'));
require('./cloud-fixture.cjs')(app.getPath('userData'));
const loadURL = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = function(url, ...args) {
  return url === 'http://localhost:5173' ? this.loadFile(path.join(__dirname, '../../dist/index.html')) : loadURL.call(this, url, ...args);
};
app.on('browser-window-created', (_event, win) => { win.webContents.openDevTools = () => {}; });
require('../../electron/main.cjs');
app.whenReady().then(async () => {
  try {
    const portal = BrowserWindow.getAllWindows()[0];
    if (portal.webContents.isLoading()) await new Promise(resolve => portal.webContents.once('did-finish-load', resolve));
    await portal.webContents.executeJavaScript('window.ipc.bsp.open()');
    const workspace = BrowserWindow.getAllWindows().find(w => w !== portal);
    assert.ok(workspace);
    assert.equal(workspace.getParentWindow(), portal);
    assert.equal(await workspace.webContents.executeJavaScript('document.querySelector("h1").textContent'), 'Summary of Registration Fees');
    assert.ok(workspace.isMenuBarVisible(), 'Desktop menus remain available');
    workspace.minimize();
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'second-instance.cjs')], { env: process.env, stdio: 'pipe' });
      const timeout = setTimeout(() => { child.kill(); reject(Error('Second portal failed to exit')); }, 10000);
      child.on('error', reject);
      child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error(`Second portal exited ${code}`)); });
    });
    for (let i = 0; i < 40 && workspace.isMinimized(); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(workspace.isMinimized(), false, 'Second launch restores BSP workspace');
    assert.equal(BrowserWindow.getAllWindows().length, 2, 'Second portal cannot open another writer');
    const closed = new Promise(resolve => workspace.once('closed', resolve));
    await portal.webContents.executeJavaScript('window.ipc.bsp.close()');
    await closed;
    console.log('PASS: portal IPC launch, parent window, desktop menus, single-instance protection, restore, and close.');
    app.exit(0);
  } catch (err) { console.error(err); app.exit(1); }
});
