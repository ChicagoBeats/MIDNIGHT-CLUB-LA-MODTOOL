const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mclaPS3', {
  open: () => ipcRenderer.invoke('ps3:open'),
  save: (bytes) => ipcRenderer.invoke('ps3:save', bytes)
});
