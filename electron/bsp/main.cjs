const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const storage = require('../secure-store.cjs').createSecureStore(require('electron').safeStorage);
const backupCrypto = require('../backup-crypto.cjs');
const { execFile } = require('child_process');

// Electron's getPrintersAsync() reports isDefault based on printer enumeration order on
// Windows, not the printer actually set as default in Windows settings. Ask Windows directly.
// Cached briefly so opening the print dialog repeatedly doesn't spawn PowerShell every time.
let defaultPrinterCache = { name: null, at: 0 };
function getSystemDefaultPrinterName() {
  if (Date.now() - defaultPrinterCache.at < 60000) return Promise.resolve(defaultPrinterCache.name);
  return new Promise(resolve => {
    if (process.platform !== 'win32') { defaultPrinterCache = { name: null, at: Date.now() }; return resolve(null); }
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "(Get-CimInstance -ClassName Win32_Printer -Filter 'Default=true' | Select-Object -First 1 -ExpandProperty Name)",
    ], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      defaultPrinterCache = { name: err ? null : stdout.trim() || null, at: Date.now() };
      resolve(defaultPrinterCache.name);
    });
  });
}
const DATA_FILE = path.join(app.getPath('userData'), 'bsp-data.json');
let workspace;

function migrateLocalStorage() {
  storage.read(DATA_FILE);
  if (fs.existsSync(SESSION_FILE)) session = JSON.parse(storage.read(SESSION_FILE));
  for (const name of fs.readdirSync(app.getPath('userData'))) {
    if (/^bsp-recovery-.*\.json$/.test(name)) storage.read(path.join(app.getPath('userData'), name));
  }
}

async function open(parent) {
  if (workspace && !workspace.isDestroyed()) {
    if (workspace.isMinimized()) workspace.restore();
    workspace.show(); workspace.focus(); return;
  }
  await app.whenReady();
  migrateLocalStorage();
  require('./inherit-records.cjs').inheritStandaloneRecords(
    path.join(app.getPath('appData'), 'BSP Registration', 'bsp-data.json'), DATA_FILE, storage);
  const win = new BrowserWindow({
    parent,
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'BSP Registration',
    icon: path.join(__dirname, 'src', 'assets', 'bsp-logo.png'),
    backgroundColor: '#f4f2ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  workspace = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed', () => { workspace = null; cloud.stop(); stopRegistrationLive?.(); });
  try { await win.loadFile(path.join(__dirname, 'src', 'index.html')); }
  catch (err) { if (!win.isDestroyed()) win.destroy(); throw err; }
}

ipcMain.on('app:version', e => { e.returnValue = app.getVersion(); });

/* ---- data storage: one JSON file in the user's AppData folder ---- */

ipcMain.on('store:load', e => {
  try { e.returnValue = cloud.read(); }
  catch (err) { console.error(err); e.returnValue = null; }
});
ipcMain.on('store:save', async (e, text) => {
  lastSaveError = '';
  try {
    const ok = await cloud.save(text);
    e.returnValue = { ok, error: ok ? '' : lastSaveError };
  }
  catch (err) { cloudNotify({ status: 'error', message: err.message }); e.returnValue = { ok: false, error: err.message }; }
});

ipcMain.handle('store:path', () => DATA_FILE);

/* ---- save a file (backup / CSV) through a native dialog ---- */

ipcMain.handle('file:save', async (e, { name, text, filters, encoding }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name),
    filters,
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, encoding === 'base64' ? Buffer.from(text, 'base64') : text, encoding === 'base64' ? undefined : 'utf8');
  return filePath;
});

ipcMain.handle('file:open', async (e, { filters }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (canceled || !filePaths[0]) return null;
  const text = fs.readFileSync(filePaths[0], 'utf8');
  return text.startsWith('IECES-ENC-v1\n') ? storage.read(filePaths[0]) : text;
});

/* ---- Supabase (online registrations from the school website) ----
   Plain REST calls from the main process; the session is kept in AppData. */

const SESSION_FILE = path.join(app.getPath('userData'), 'supabase-session.json');
let session = null;
let authGeneration = 0, tokenRefresh;

function storeSession(s) {
  if (s) storage.write(SESSION_FILE, JSON.stringify(s));
  else fs.rmSync(SESSION_FILE, { force: true });
  session = s;
}

async function authRequest(cfg, grant, body) {
  validateConfig(cfg);
  const generation = authGeneration;
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Sign-in failed (${res.status})`);
  if (generation !== authGeneration) throw new Error('Sign-in changed while authenticating.');
  storeSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, email: data.user?.email, url: cfg.url });
  return session;
}

async function freshToken(cfg, force = false) {
  validateConfig(cfg);
  if (!session) throw new Error('Not signed in');
  if (session.url && session.url !== cfg.url) throw Error('The Supabase project changed. Sign in to that project before connecting.');
  const generation = authGeneration;
  if (force || !session.expires_at || session.expires_at - 60 < Date.now() / 1000) {
    try {
      if (!tokenRefresh) tokenRefresh = authRequest(cfg, 'refresh_token', { refresh_token: session.refresh_token }).finally(() => { tokenRefresh = null; });
      await tokenRefresh;
    }
    catch (err) { if (generation === authGeneration) storeSession(null); throw new Error('Session expired or changed. Please sign in again.'); }
  }
  return session.access_token;
}

let stopRegistrationLive;
function validateConfig(cfg) {
  const url = new URL(cfg.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || typeof cfg.key !== 'string' || !cfg.key.trim()) {
    throw Error('Use an HTTPS Supabase project URL and a publishable key.');
  }
}
ipcMain.handle('sb:watch', (e, cfg) => {
  validateConfig(cfg);
  stopRegistrationLive?.();
  const stop = require('./registration-live').watchRegistrations(cfg, () => freshToken(cfg), update => {
    if (!e.sender.isDestroyed()) e.sender.send('sb:changed', update);
  });
  stopRegistrationLive = stop;
  e.sender.once('destroyed', stop);
  return true;
});
ipcMain.handle('sb:session', () => (session ? { email: session.email } : null));
ipcMain.handle('sb:signOut', () => { authGeneration++; cloud.stop(); stopRegistrationLive?.(); stopRegistrationLive = null; storeSession(null); return true; });
ipcMain.handle('sb:signIn', async (e, { cfg, email, password }) => {
  authGeneration++; cloud.stop();
  try { const s = await authRequest(cfg, 'password', { email, password }); return { email: s.email }; }
  catch (err) { return { error: err.message }; }
});

async function sbRest(cfg, method = 'GET', query, body) {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await freshToken(cfg, attempt > 0);
      const res = await fetch(`${cfg.url}/rest/v1/${query}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && attempt === 0) continue;
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: (data && (data.message || data.hint)) || `Request failed (${res.status})`, code: data?.code };
      return { data };
    }
  } catch (err) {
    return { error: err.message };
  }
}

ipcMain.handle('sb:rest', (_e, { cfg, method, query, body }) => sbRest(cfg, method, query, body));
let cloudSender, lastSaveError = '';
function cloudNotify(update) {
  if (update.status === 'error') lastSaveError = update.message;
  if (cloudSender && !cloudSender.isDestroyed()) cloudSender.send('cloud:changed', update);
}
const cloud = require('./cloud-workspace.cjs').createCloudWorkspace({ file: DATA_FILE, request: sbRest, notify: cloudNotify, storage });
ipcMain.handle('backup:encrypt', (_e, { text, password }) => backupCrypto.encryptBackup(text, password));
ipcMain.handle('backup:decrypt', (_e, { text, password }) => backupCrypto.decryptBackup(text, password));
ipcMain.handle('cloud:start', (e, cfg) => { cloudSender = e.sender; return cloud.start(cfg); });
ipcMain.handle('cloud:initialize', (_e, text) => cloud.initialize(text));

/* ---- printing: native print dialog ---- */

const PRINT_PAPERS = { Folio: [8.5, 13], A4: [210 / 25.4, 297 / 25.4], Letter: [8.5, 11], Legal: [8.5, 14] };
let printQueue = Promise.resolve();
function printJob(e, settings, task) {
  const run = printQueue.then(async () => {
    let printWindow;
    let wc;
    const dims = PRINT_PAPERS[settings.paper || 'A4'];
    if (!dims) return { ok: false, reason: 'Unsupported paper size' };
    const landscape = settings.orientation === 'landscape';
    let key;
    try {
      if (typeof settings.html !== 'string' || !settings.html.trim()) {
        return { ok: false, reason: 'There is no document to print.' };
      }
      // A modal dialog makes the application document inert. Render the form in
      // its own document so neither modal state nor preview canvas reaches print.
      printWindow = new BrowserWindow({ show: false, webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        backgroundThrottling: false,
      } });
      wc = printWindow.webContents;
      const css = fs.readFileSync(path.join(__dirname, 'src', 'style.css'), 'utf8');
      const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>${css}</style></head><body><div id="print">${settings.html}</div></body></html>`;
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(document));
      key = await wc.insertCSS(`@page { size: ${landscape ? dims[1] : dims[0]}in ${landscape ? dims[0] : dims[1]}in !important; margin: 0.25in 0.35in !important; }`, { cssOrigin: 'user' });
      return await task(wc, { width: dims[0], height: dims[1] }, landscape);
    } catch (err) { return { ok: false, reason: err.message }; }
    finally {
      if (key && wc && !wc.isDestroyed()) await wc.removeInsertedCSS(key);
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    }
  });
  printQueue = run.catch(() => {});
  return run;
}
ipcMain.handle('print:printers', async e => {
  try {
    const printers = await e.sender.getPrintersAsync();
    const defaultName = await getSystemDefaultPrinterName();
    return { ok: true, printers: defaultName ? printers.map(p => ({ ...p, isDefault: p.name === defaultName })) : printers };
  } catch (err) { return { ok: false, reason: err.message }; }
});
ipcMain.handle('print:preview', (e, settings = {}) => printJob(e, settings, async (wc, pageSize, landscape) => {
  const pdf = await wc.printToPDF({ printBackground: true, preferCSSPageSize: false, pageSize, landscape });
  return { ok: true, base64: pdf.toString('base64') };
}));
ipcMain.handle('print:savePDF', (e, settings = {}) => printJob(e, settings, async (wc, pageSize, landscape) => {
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    defaultPath: 'BSP-registration.pdf', filters: [{ name: 'PDF document', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { ok: true, canceled: true };
  const pdf = await wc.printToPDF({ printBackground: true, preferCSSPageSize: false, pageSize, landscape });
  fs.writeFileSync(filePath, pdf);
  return { ok: true };
}));
ipcMain.handle('print', (e, settings = {}) => printJob(e, settings, async (wc, paper, landscape) => {
  await cloud.confirmPrint();
  const printers = await wc.getPrintersAsync();
  if (settings.printer && !printers.some(p => p.name === settings.printer)) return { ok: false, reason: 'Select an installed printer.' };
  const copies = Number(settings.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 999) return { ok: false, reason: 'Copies must be between 1 and 999.' };
  return new Promise(resolve => wc.print({
    silent: true, deviceName: settings.printer || '', printBackground: true, landscape,
    color: settings.color !== 'grayscale', copies, collate: true,
    pageSize: { width: Math.round(paper.width * 25400), height: Math.round(paper.height * 25400) },
    margins: { marginType: 'custom', top: 24, bottom: 24, left: 34, right: 34 },
  }, (ok, reason) => resolve({ ok, reason })));
}));

module.exports = { open, migrateLocalStorage, close: () => { workspace?.close(); } };
