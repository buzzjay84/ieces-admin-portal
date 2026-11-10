const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const printing = require('./print.cjs')
const bsp = require('./bsp/main.cjs')

const ownsInstanceLock = app.requestSingleInstanceLock()
if (!ownsInstanceLock) app.quit()
app.on('second-instance', () => {
  const target = BrowserWindow.getAllWindows().find(w => w.getParentWindow() === win && (w.isVisible() || w.isMinimized())) || win
  if (!target || target.isDestroyed()) return
  if (target.isMinimized()) target.restore()
  target.show()
  target.focus()
})

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Disable auto download if you want to prompt the user before downloading
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

const storage = require('./secure-store.cjs').createSecureStore(require('electron').safeStorage)

// ── Window ──
let win

function createApplicationMenu() {
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForUpdatesManual()
        },
        { type: 'separator' },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function checkForUpdatesManual() {
  if (isDev) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Update checks are disabled in development mode.',
    })
    return
  }

  // Trigger manual check and inform renderer
  win?.webContents.send('update:checking')
  autoUpdater.checkForUpdates().catch((err) => {
    dialog.showErrorBox('Update Check Error', err?.message || 'Failed to check for updates.')
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'default',
    title: 'IECES Admin Portal',
    show: false
  })

  createApplicationMenu()

  // Open external links (target="_blank") in the user's default browser
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.webContents.openDevTools()

    const loadDevServer = async () => {
      try {
        await win.loadURL('http://localhost:5173')
      } catch (err) {
        console.log('Dev server not ready, retrying in 1s...')
        setTimeout(loadDevServer, 1000)
      }
    }

    loadDevServer()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    // Auto check on launch in production
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })
}

app.whenReady().then(() => {
  if (!ownsInstanceLock) return
  try {
    storage.read(path.join(app.getPath('userData'), 'ieces-data', 'ieces.json'))
    bsp.migrateLocalStorage()
    printing.cleanupPrintPreviewDir()
    createWindow()
  } catch (err) {
    dialog.showErrorBox('Local records unavailable', err.message)
    app.quit()
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── Auto Updater Events ──
autoUpdater.on('checking-for-update', () => {
  win?.webContents.send('update:checking')
})

autoUpdater.on('update-available', (info) => {
  win?.webContents.send('update:available', info)
})

autoUpdater.on('update-not-available', (info) => {
  win?.webContents.send('update:not-available', info)
})

autoUpdater.on('update-downloaded', (info) => {
  win?.webContents.send('update:downloaded', info)
})

autoUpdater.on('error', (err) => {
  win?.webContents.send('update:error', err?.message || err)
})

// ── IPC Handlers ──

ipcMain.handle('app:getVersion', () => app.getVersion())

// Print preview / printing (shared with SwiSS and Tax-E)
printing.register(() => win)
app.on('will-quit', printing.cleanupPrintPreviewDir)

// Updater IPC
ipcMain.handle('update:check', () => autoUpdater.checkForUpdates())
ipcMain.handle('update:quitAndInstall', () => autoUpdater.quitAndInstall())

ipcMain.handle('bsp:open', e => {
  if (e.sender !== win?.webContents) throw new Error('Only the portal can open BSP Registration.');
  return bsp.open(win);
});
ipcMain.handle('bsp:close', e => {
  if (e.sender === win?.webContents) bsp.close();
});
