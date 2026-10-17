import { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import ServerManager from './server-manager';
import type { ConfirmOptions } from '../types/ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let mailOn = false;
let pending: string[] = [];
let timer: NodeJS.Timeout | null = null;
const FLUSH_MS = 50;

function flush(): void {
  timer = null;
  if (!pending.length) return;
  const batch = pending.join('\n');
  pending = [];
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log', batch);
  else console.log(batch);
}
const server = new ServerManager((m) => {
  pending.push(String(m));
  if (timer === null) timer = setTimeout(flush, FLUSH_MS);
});
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 780, height: 620, resizable: false,
    backgroundColor: '#0d1117', title: 'natsuServer',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      tray?.displayBalloon({ title: 'natsuServer is Running', content: 'Disembunyikan ke Tray.' });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log', '\n> Disembunyikan ke Tray.');
    }
  });
}
function trayIcon(): NativeImage {
  const png = path.join(app.getPath('userData'), 'tray-icon.png');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas } = require('canvas') as { createCanvas: (w: number, h: number) => { getContext: (k: string) => { fillStyle: string; fillRect: (...a: number[]) => void }; toBuffer: (k: string) => Buffer } };
    const cv = createCanvas(64, 64);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ff2d20'; ctx.fillRect(16, 16, 32, 32);
    fs.writeFileSync(png, cv.toBuffer('image/png'));
    return nativeImage.createFromPath(png);
  } catch {
    const w = 16, h = 16;
    const head = 14 + 40;
    const buf = Buffer.alloc(head + w * h * 4);
    buf.write('BM', 0);
    buf.writeUInt32LE(buf.length, 2);
    buf.writeUInt32LE(head, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(w, 18);
    buf.writeInt32LE(-h, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(32, 28);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const off = head + (y * w + x) * 4;
      const sq = x >= 4 && x <= 11 && y >= 4 && y <= 11;
      buf[off] = sq ? 0x20 : 0x18; buf[off+1] = sq ? 0x2d : 0x18;
      buf[off+2] = sq ? 0xff : 0x18; buf[off+3] = 0xff;
    }
    return nativeImage.createFromBuffer(buf, { width: w, height: h });
  }
}
function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('natsuServer is Running');
  const menu = Menu.buildFromTemplate([
    { label: 'Tampilkan Dashboard', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Matikan & Keluar', click: () => quitApp() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow?.show());
}
function quitApp(): void {
  isQuitting = true;
  server.logger = () => undefined;
  try { if (server.isRunning) server.stopServices(); } catch { /* ignore */ }
  if (tray) { tray.destroy(); tray = null; }
  app.quit();
}
ipcMain.handle('server:start', async () => {
  try { await server.startServices(); return { ok: true }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
});
ipcMain.handle('server:stop', async () => { server.stopServices(); return { ok: true }; });
ipcMain.handle('app:openWeb', () => { void shell.openExternal('http://localhost'); return { ok: true }; });
ipcMain.handle('app:openDb', () => {
  const hp = path.join(server.baseDir, 'bin', 'heidisql', 'heidisql.exe');
  if (fs.existsSync(hp)) { spawn(hp, [], { detached: true, stdio: 'ignore' }).unref(); return { ok: true, msg: '> HeidiSQL dibuka.' }; }
  return { ok: false, msg: '[!] HeidiSQL tidak ditemukan.' };
});
ipcMain.handle('app:openFolder', async () => {
  const wp = path.join(server.baseDir, 'www');
  if (fs.existsSync(wp)) {
    const err = await shell.openPath(wp);
    return err ? { ok: false, msg: '[!] ' + err } : { ok: true, msg: "> Folder 'www' dibuka." };
  }
  return { ok: false, msg: '[!] Folder www tidak ditemukan.' };
});
ipcMain.handle('app:openTerminal', () => { server.openTerminal(); return { ok: true }; });
ipcMain.handle('app:shareLive', (_e, name: unknown) => { server.shareLive(String(name ?? '').trim().toLowerCase()); return { ok: true }; });
ipcMain.handle('app:toggleMail', (_e, en: unknown) => { mailOn = !!en; server.toggleMailCatcher(mailOn); return { ok: true, enabled: mailOn }; });
ipcMain.handle('app:openMailUi', () => { void shell.openExternal('http://127.0.0.1:8025'); return { ok: true }; });
ipcMain.handle('app:createLaravel', async (_e, pn: unknown) => {
  const name = String(pn ?? '').replace(/ /g, '_').toLowerCase();
  const ok = await server.createLaravelProject(name);
  if (ok) {
    let hostsMsg = '';
    try {
      const doms = server.generateVhosts();
      server.updateWindowsHosts(doms);
      hostsMsg = '\n[+] SELESAI! Akses: http://' + name + '.test';
    } catch (e) { hostsMsg = '[!] Gagal hosts: ' + (e as Error).message; }
    return { ok: true, hostsMsg };
  }
  return { ok: false };
});
ipcMain.handle('app:confirm', async (_e, opts: ConfirmOptions) => {
  const r = await dialog.showMessageBox(mainWindow as BrowserWindow, { type: opts.type ?? 'info', title: opts.title ?? 'natsuServer', message: opts.message ?? '', buttons: opts.buttons ?? ['OK'] });
  return r.response === 0;
});
ipcMain.handle('app:quit', () => { quitApp(); return { ok: true }; });
// Opsi A — PHP switcher
ipcMain.handle('php:list', () => {
  try {
    const { versions, activeId } = server.listPhpVersions();
    return { ok: true, versions, activeId };
  } catch (e) { return { ok: false, versions: [], activeId: '', error: (e as Error).message }; }
});
ipcMain.handle('php:set', (_e, id: unknown) => {
  try {
    const r = server.setPhpVersion(String(id ?? ''));
    return { ok: r.ok, activeId: r.activeId, needsRestart: r.needsRestart, error: r.error || undefined };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
});
ipcMain.handle('php:version', () => {
  try {
    const r = server.getPhpVersionString();
    return { ok: r.ok, version: r.version || undefined };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
});
// Opsi A — Auto-HTTPS
ipcMain.handle('https:status', () => {
  try {
    const s = server.getHttpsStatus();
    return { ok: true, enabled: s.enabled, certCount: s.certCount, domains: s.domains, tool: s.tool };
  } catch (e) { return { ok: false, enabled: false, certCount: 0, domains: [], tool: 'none', error: (e as Error).message }; }
});
ipcMain.handle('https:set', (_e, en: unknown) => {
  try {
    const r = server.setHttpsEnabled(!!en);
    return { ok: r.ok, enabled: r.enabled, needsRestart: r.needsRestart, error: r.error || undefined };
  } catch (e) { return { ok: false, enabled: false, error: (e as Error).message }; }
});
app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length===0) createWindow();
    else mainWindow?.show();
  });
});
app.on('window-all-closed', () => { if (process.platform!=='darwin' && isQuitting) app.quit(); });


