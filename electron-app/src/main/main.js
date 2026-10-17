/**
 * main.js — Electron Main Process
 * Padanan dari apps/main.py (CustomTkinter) yang di-rewrite ke Electron.
 * - Membuat BrowserWindow dengan tema dark (#0d1117)
 * - System Tray (pengganti pystray): close => hide ke tray
 * - IPC handlers untuk seluruh aksi backend (start/stop/ngrok/laravel/dsb)
 */
const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const ServerManager = require('./server-manager');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let mailCatcherOn = false;

// Log dikumpulkan (coalescing) lalu dikirim sekali per tick ke renderer.
// Mengurangi jumlah pesan IPC & reflow saat start-up (banyak baris log sekaligus).
let pendingLogs = [];
let logFlushTimer = null;
const LOG_FLUSH_MS = 50;

function flushLogs() {
  logFlushTimer = null;
  if (!pendingLogs.length) return;
  const batch = pendingLogs.join('\n');
  pendingLogs = [];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', batch);
  } else {
    console.log(batch);
  }
}

const server = new ServerManager((msg) => {
  // Redirect semua log backend ke terminal log di renderer
  pendingLogs.push(String(msg));
  if (logFlushTimer === null) {
    logFlushTimer = setTimeout(flushLogs, LOG_FLUSH_MS);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 620,
    resizable: false,
    backgroundColor: '#0d1117',
    title: 'なつServer - Unix Edition',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Close button => sembunyikan ke Tray (perilaku sama dengan on_closing versi Tkinter)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'なつServer is Running',
          content: 'Aplikasi disembunyikan ke System Tray (pojok kanan bawah).',
        });
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log', '\n> Aplikasi disembunyikan ke System Tray (Pojok kanan bawah).');
      }
    }
  });
}

function createTrayIcon() {
  // Gambar ikon tray dibuat secara programatik (PNG 64x64, kotak merah di latar gelap),
  // padanan dari create_tray_icon() pada versi Python (PIL ImageDraw).
  const pngPath = path.join(app.getPath('userData'), 'tray-icon.png');
  try {
    const { createCanvas } = require('canvas'); // opsional, jika tersedia
    const canvas = createCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ff2d20';
    ctx.fillRect(16, 16, 32, 32);
    fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
    return nativeImage.createFromPath(pngPath);
  } catch (e) {
    // Fallback: buat Buffer BMP sederhana (16x16) tanpa dependensi eksternal
    const w = 16, h = 16, bpp = 32;
    const dataSize = w * h * (bpp / 8);
    const headerSize = 14 + 40;
    const buf = Buffer.alloc(headerSize + dataSize);
    buf.write('BM', 0);
    buf.writeUInt32LE(headerSize + dataSize, 2);
    buf.writeUInt32LE(headerSize, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(w, 18);
    buf.writeInt32LE(-h, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(bpp, 28);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const off = headerSize + (y * w + x) * 4;
        const inSquare = x >= 4 && x <= 11 && y >= 4 && y <= 11;
        buf[off] = inSquare ? 0x20 : 0x18;     // B
        buf[off + 1] = inSquare ? 0x2d : 0x18; // G
        buf[off + 2] = inSquare ? 0xff : 0x18; // R
        buf[off + 3] = 0xff;                    // A
      }
    }
    return nativeImage.createFromBuffer(buf, { width: w, height: h });
  }
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('なつServer is Running');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Tampilkan Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('log', '> Dashboard dibuka kembali.');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Matikan Server & Keluar',
      click: () => quitApp(),
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
  });
}

function quitApp() {
  isQuitting = true;
  server.logger = () => {};
  try {
    if (server.isRunning) server.stopServices();
  } catch (e) { /* ignore */ }
  if (tray) { tray.destroy(); tray = null; }
  app.quit();
}

// ==================== IPC HANDLERS ====================
ipcMain.handle('server:start', async () => {
  try {
    await server.startServices();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('server:stop', async () => {
  server.stopServices();
  return { ok: true };
});

ipcMain.handle('app:openWeb', () => {
  shell.openExternal('http://localhost');
  return { ok: true };
});

ipcMain.handle('app:openDb', () => {
  const heidiPath = path.join(server.baseDir, 'bin', 'heidisql', 'heidisql.exe');
  if (fs.existsSync(heidiPath)) {
    const { spawn } = require('child_process');
    spawn(heidiPath, [], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true, msg: '> HeidiSQL dibuka.' };
  }
  return { ok: false, msg: '[!] HeidiSQL tidak ditemukan.' };
});

ipcMain.handle('app:openFolder', async () => {
  const wwwPath = path.join(server.baseDir, 'www');
  if (fs.existsSync(wwwPath)) {
    const err = await shell.openPath(wwwPath);
    return err ? { ok: false, msg: `[!] ${err}` } : { ok: true, msg: "> Folder 'www' dibuka." };
  }
  return { ok: false, msg: '[!] Folder www tidak ditemukan.' };
});

ipcMain.handle('app:openTerminal', () => {
  server.openTerminal();
  return { ok: true };
});

ipcMain.handle('app:shareLive', (_e, projectName) => {
  server.shareLive((projectName || '').trim().toLowerCase());
  return { ok: true };
});

ipcMain.handle('app:toggleMail', (_e, enabled) => {
  mailCatcherOn = !!enabled;
  server.toggleMailCatcher(mailCatcherOn);
  return { ok: true, enabled: mailCatcherOn };
});

ipcMain.handle('app:openMailUi', () => {
  shell.openExternal('http://127.0.0.1:8025');
  return { ok: true };
});

ipcMain.handle('app:createLaravel', async (_e, projectName) => {
  const name = String(projectName || '').replace(/ /g, '_').toLowerCase();
  const success = await server.createLaravelProject(name);
  if (success) {
    let hostsMsg = '';
    try {
      const domains = server.generateVhosts();
      server.updateWindowsHosts(domains);
      hostsMsg = `\n[+] SELESAI! Silakan akses: http://${name}.test di browser.`;
    } catch (e) {
      hostsMsg = `[!] Info: Gagal mendaftarkan domain otomatis. ${e.message}`;
    }
    return { ok: true, hostsMsg };
  }
  return { ok: false };
});

ipcMain.handle('app:confirm', async (_e, opts) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: opts.type || 'info',
    title: opts.title || 'なつServer',
    message: opts.message || '',
    buttons: opts.buttons || ['OK'],
  });
  return res.response === 0;
});

ipcMain.handle('app:quit', () => {
  quitApp();
  return { ok: true };
});

// ==================== APP LIFECYCLE ====================
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Di Windows aplikasi tetap hidup di tray; hanya keluar saat isQuitting
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});
