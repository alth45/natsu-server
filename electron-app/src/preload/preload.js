/**
 * preload.js — Menjembatani renderer (aman, contextIsolation aktif) ke main process.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Log stream dari backend
  onLog: (callback) => ipcRenderer.on('log', (_e, msg) => callback(msg)),

  // Kontrol server
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),

  // Aksi sidebar
  openWeb: () => ipcRenderer.invoke('app:openWeb'),
  openDb: () => ipcRenderer.invoke('app:openDb'),
  openFolder: () => ipcRenderer.invoke('app:openFolder'),
  openTerminal: () => ipcRenderer.invoke('app:openTerminal'),
  shareLive: (projectName) => ipcRenderer.invoke('app:shareLive', projectName),
  toggleMail: (enabled) => ipcRenderer.invoke('app:toggleMail', enabled),
  openMailUi: () => ipcRenderer.invoke('app:openMailUi'),
  createLaravel: (projectName) => ipcRenderer.invoke('app:createLaravel', projectName),

  // Dialog & aplikasi
  confirm: (opts) => ipcRenderer.invoke('app:confirm', opts),
  quitApp: () => ipcRenderer.invoke('app:quit'),
});
