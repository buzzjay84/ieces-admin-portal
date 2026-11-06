const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.setPath('userData', process.env.BSP_TEST_DATA_DIR);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, 'registration-preload.js'), contextIsolation: true, nodeIntegration: false,
  } });
  try {
    await win.loadFile(path.join(__dirname, '../../electron/bsp/src/index.html'));
    console.log(await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'registration-renderer.js'), 'utf8')));
    app.exit(0);
  } catch (err) { console.error(err); app.exit(1); }
});
