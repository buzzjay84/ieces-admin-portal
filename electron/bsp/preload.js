const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bsp', {
  cloudStart: cfg => ipcRenderer.invoke('cloud:start', cfg),
  cloudInitialize: text => ipcRenderer.invoke('cloud:initialize', text),
  onCloudChange: callback => {
    const listener = (_e, update) => callback(update);
    ipcRenderer.on('cloud:changed', listener);
    return () => ipcRenderer.removeListener('cloud:changed', listener);
  },
  appVersion: () => ipcRenderer.sendSync('app:version'),
  load: () => ipcRenderer.sendSync('store:load'),
  save: text => ipcRenderer.sendSync('store:save', text),
  dataPath: () => ipcRenderer.invoke('store:path'),
  saveFile: (name, text, filters, encoding) => ipcRenderer.invoke('file:save', { name, text, filters, encoding }),
  openFile: filters => ipcRenderer.invoke('file:open', { filters }),
  print: settings => ipcRenderer.invoke('print', settings),
  printPrinters: () => ipcRenderer.invoke('print:printers'),
  printPreview: settings => ipcRenderer.invoke('print:preview', settings),
  printSavePDF: settings => ipcRenderer.invoke('print:savePDF', settings),

  // online registrations (Supabase)
  sbSession: () => ipcRenderer.invoke('sb:session'),
  sbWatch: cfg => ipcRenderer.invoke('sb:watch', cfg),
  onRegistrationChange: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('sb:changed', listener);
    return () => ipcRenderer.removeListener('sb:changed', listener);
  },
  sbSignIn: (cfg, email, password) => ipcRenderer.invoke('sb:signIn', { cfg, email, password }),
  sbSignOut: () => ipcRenderer.invoke('sb:signOut'),
  sbRest: (cfg, method, query, body) => ipcRenderer.invoke('sb:rest', { cfg, method, query, body }),
});
