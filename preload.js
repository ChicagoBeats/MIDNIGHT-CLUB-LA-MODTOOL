const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mclaPS3', {
  open: () => ipcRenderer.invoke('save:open'),
  save: (bytes) => ipcRenderer.invoke('save:write', bytes),
  installMod: () => ipcRenderer.invoke('mod:install'),
  onModProgress: (cb) => ipcRenderer.on('mod:progress', (_e, p) => cb(p)),
  onProgress: (cb) => ipcRenderer.on('save:progress', (_e, p) => cb(p))
});
