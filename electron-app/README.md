# なつServer — Electron Edition (TypeScript)

GUI dashboard development server (Nginx + PHP-CGI + MySQL/MariaDB) yang di-rewrite
dari **CustomTkinter/Tkinter** menjadi **Electron + TypeScript**.

## Struktur

```
electron-app/
├── package.json          # main: dist/main/main.js, scripts build via tsc
├── tsconfig.json         # strict TS -> dist/
├── scripts/
│   └── copy-assets.js    # copy index.html + styles.css -> dist/renderer/
└── src/
    ├── main/
    │   ├── main.ts            # Main process: window, tray, IPC handlers
    │   ├── server-manager.ts  # Backend service (PHP aktif + HTTPS aware)
    │   ├── php-manager.ts     # Opsi A: scan bin/php*, settings, detect version
    │   └── https-manager.ts   # Opsi A: mkcert/openssl, blok SSL vhost
    ├── preload/
    │   └── preload.ts         # Bridge aman renderer <-> main (contextBridge)
    ├── types/
    │   └── ipc.ts             # Kontrak IPC bersama (NatsuApi, result types)
    └── renderer/
        ├── index.html         # Layout dashboard + Environment section
        ├── styles.css         # Tema modern dark (#0d1117 ala GitHub)
        ├── renderer.ts        # Logika UI (+ PHP dropdown + HTTPS toggle)
        └── global.d.ts        # Deklarasi window.api
```

## Opsi A — PHP Switcher + Auto-HTTPS

### PHP Version Switcher
- Letakkan tiap versi di `bin/phpXX/` (contoh: `bin/php/`, `bin/php82/`, `bin/php83/`), masing-masing wajib ada `php.exe` + `php-cgi.exe` (+ `composer.phar` bila mau Laravel installer).
- Dropdown di sidebar otomatis scan folder tersebut, tampilkan label + versi terdeteksi (`php -v`).
- Pilihan tersimpan di `config/natsu-settings.json` (`{ phpId, httpsEnabled }`).
- Ganti versi saat server jalan → backend stop otomatis, user klik START lagi (path PHP-CGI, Laravel installer, dan Quick Terminal semuanya ikut versi aktif).

### Auto-HTTPS (*.test + localhost :443)
- Toggle HTTPS di sidebar. Saat ON pertama kali: backend generate `config/certs/natsu.key` + `natsu.crt` (wildcard `*.test`, `localhost`, `127.0.0.1`).
- Urutan tool: `mkcert` (trusted, butuh `mkcert -install` sekali sebagai admin) → fallback `openssl` (self-signed 10 tahun).
- Tiap vhost + server localhost otomatis dapat blok `listen 443 ssl`. Akses: `https://namaproject.test`.
- Catatan: bila pakai fallback openssl (self-signed), browser akan warning — klik Advanced → Proceed, atau install `mkcert` agar hijau trusted.

## Menjalankan

```bash
cd electron-app
npm install
npm start          # build (tsc) + electron .
npm run dev        # build + electron dengan DevTools
npm run typecheck  # cek tipe tanpa emit
```

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
