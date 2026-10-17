# なつServer — Electron Edition

GUI dashboard development server (Nginx + PHP-CGI + MySQL/MariaDB) yang di-rewrite
dari **CustomTkinter/Tkinter** menjadi **Electron**.

> Versi Tkinter lama dibackup di: `../backup/main_tkinter.py.bak`

## Struktur

```
electron-app/
├── package.json
└── src/
    ├── main/
    │   ├── main.js            # Main process: window, tray, IPC handlers
    │   └── server-manager.js  # Port dari process_manager.py (backend service)
    ├── preload/
    │   └── preload.js         # Bridge aman renderer <-> main (contextBridge)
    └── renderer/
        ├── index.html         # Layout dashboard (sidebar + cards + log terminal)
        ├── styles.css         # Tema modern dark (#0d1117 ala GitHub)
        └── renderer.js        # Logika UI (start/stop, ngrok, laravel, mail catcher)
```

## Menjalankan

```bash
cd electron-app
npm install
npm start          # atau: npm run dev (dengan DevTools)
```

Dari root proyek juga bisa lewat launcher Python lama:

```bash
python apps/main.py            # meluncurkan GUI Electron
python apps/main.py --mail     # + Mail Catcher sidecar (SMTP :1025, UI :8025)
```

## Fitur (padanan versi Tkinter)

| Fitur | Tkinter (lama) | Electron (baru) |
|---|---|---|
| Window utama | CTk 780x620 fixed | BrowserWindow 780x620 non-resizable |
| Sidebar buttons | CTkButton | HTML/CSS buttons |
| START / STOP services | ServerManager (Python) | server-manager.js (Node child_process) |
| Terminal log | CTkTextbox + redirect stdout | IPC `log` event stream |
| Toggle show/hide log | grid_remove() | CSS class toggle |
| Context menu klik kanan | tk.Menu | custom HTML context menu |
| Input dialog (ngrok/laravel) | CTkInputDialog | modal HTML |
| System Tray | pystray | Electron `Tray` (close => hide ke tray) |
| About dialog | messagebox | dialog.showMessageBox |
| Mail Catcher switch | aiosmtpd thread | sidecar Python (`apps/main.py --mail`) |

## Catatan

- Aplikasi ini ditujukan untuk **Windows** (nginx.exe, php-cgi.exe, mysqld.exe, taskkill).
  Tersedia fallback SIGTERM untuk pengembangan di Linux/macOS.
- SMTP Mail Catcher tetap memakai backend Python (`process_manager.py`) karena
  library `aiosmtpd`; aktifkan dengan switch Mail Catcher pada mode sidecar.
