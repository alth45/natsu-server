import { contextBridge, ipcRenderer } from 'electron';
import type { NatsuApi, ConfirmOptions } from '../types/ipc';

const api: NatsuApi = {
  onLog: (cb) => { ipcRenderer.on('log', (_e, msg: string) => cb(msg)); },
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  openWeb: () => ipcRenderer.invoke('app:openWeb'),
  openDb: () => ipcRenderer.invoke('app:openDb'),
  openFolder: () => ipcRenderer.invoke('app:openFolder'),
  openTerminal: () => ipcRenderer.invoke('app:openTerminal'),
  shareLive: (p: string) => ipcRenderer.invoke('app:shareLive', p),
  toggleMail: (e: boolean) => ipcRenderer.invoke('app:toggleMail', e),
  openMailUi: () => ipcRenderer.invoke('app:openMailUi'),
  createLaravel: (p: string) => ipcRenderer.invoke('app:createLaravel', p),
  confirm: (o: ConfirmOptions) => ipcRenderer.invoke('app:confirm', o),
  quitApp: () => ipcRenderer.invoke('app:quit'),
};

contextBridge.exposeInMainWorld('api', api);
