
<div align="center">
  <h1>⚡ なつServer (Natsu Server)</h1>
  <p><b>The Ultimate Lightweight & Portable Local Development Environment.</b></p>
  <p><i>Lebih dari sekadar web server. Ini adalah asisten pribadimu untuk mendevelop aplikasi PHP & Laravel dengan kecepatan penuh, tanpa biaya lisensi!</i></p>

  ![Electron](https://img.shields.io/badge/GUI-Electron_31-47848F?style=for-the-badge&logo=electron)
  ![Python](https://img.shields.io/badge/Backend-Python_3-blue?style=for-the-badge&logo=python)
  ![Nginx](https://img.shields.io/badge/Server-Nginx-green?style=for-the-badge&logo=nginx)
  ![MariaDB](https://img.shields.io/badge/Database-MariaDB-white?style=for-the-badge&logo=mariadb)
  ![Open Source](https://img.shields.io/badge/License-Free_&_Open_Source-red?style=for-the-badge)
</div>

---

## 💡 Mengapa Memilih なつServer?
Bosan dengan aplikasi *local server* yang memakan banyak RAM, meninggalkan *registry* sampah di Windows, atau mengharuskanmu membayar lisensi berbayar untuk fitur premium? 

**なつServer** hadir sebagai solusi *Open Source* yang dirancang khusus untuk para *freelancer*, mahasiswa, dan *developer* yang membutuhkan lingkungan pengembangan (XAMPP/Laragon *alternative*) yang **100% Portable**, sangat ringan, namun memiliki fitur kelas *Enterprise*. Cukup taruh di Flashdisk, dan kamu bisa *ngoding* di komputer mana saja!

## ✨ Fitur Unggulan (Premium Features for Free)

*   **🪄 Zero-Config Auto Virtual Host**
    Lupakan repotnya mengedit file `hosts` Windows atau `nginx.conf` secara manual. Cukup buat folder baru di dalam direktori `www/` (misal: `www/proyekku`), dan なつServer akan otomatis membuatkan domain lokal **`http://proyekku.test`** untukmu!
*   **🚀 1-Click Laravel Auto-Installer**
    Dilengkapi dengan integrasi Composer cerdas. Cukup klik satu tombol, masukkan nama proyek, dan なつServer akan otomatis:
    * Mengunduh file Laravel terbaru.
    * Mengarahkan *Virtual Host* secara spesifik ke folder `/public`.
    * Membuatkan *Database* MySQL kosong secara otomatis.
*   **💻 Quick Terminal (Smart Path Injection)**
    Buka *Command Prompt* langsung dari aplikasi tanpa perlu mengatur *Environment Variables* Windows. Perintah `php`, `composer`, dan `mysql` langsung siap digunakan. Sistem Windows utamamu akan tetap bersih!
*   **🌍 Live Share to Internet (Ngrok Integrated)**
    Ingin memamerkan proyek lokalmu ke klien atau melakukan *testing* di *smartphone*? Klik tombol "Share Live", dan なつServer akan menyuntikkan *Host Header* yang tepat dan memberikanmu URL publik detik itu juga.
*   **👻 Silent Background Mode (System Tray)**
    Tidak akan menuh-menuhin *Taskbar*. Tekan tombol silang, dan aplikasi akan bersembunyi dengan manis di pojok jam Windows sambil terus melayani *request* servermu.
*   **📬 Built-in Mail Catcher**
    Fitur baru khas Laragon! Tangkap semua email yang dikirim aplikasi PHP/Laravel-mu secara lokal (SMTP port `1025`) dan baca lewat web UI di **`http://127.0.0.1:8025`** — tanpa perlu akun SMTP eksternal atau khawatir email tes terkirim ke orang sungguhan.

---

## 🛠️ Arsitektur & Teknologi di Balik Layar

Sejak **Electron Edition**, GUI dashboard ditulis ulang dari CustomTkinter/Tkinter menjadi **Electron** dengan tema gelap modern ala GitHub (`#0d1117`). Backend layanan tetap bertumpu pada *subprocess* bawaan sistem operasi yang diatur oleh *process manager* Python.

*   **GUI Dashboard:** Electron 31 (Main process + Preload `contextBridge` + Renderer HTML/CSS/JS)
*   **Backend Service & Process Manager:** Python 3 (`apps/process_manager.py` — Nginx/PHP-CGI/MariaDB, vHost generator, Mail Catcher via `aiosmtpd`)
*   **Web Server:** Nginx (Super ringan & cepat)
*   **Database:** MariaDB (Open Source & drop-in replacement untuk MySQL)
*   **PHP:** Thread Safe Edition (mode `php-cgi`)

---

## 📂 Struktur Proyek & Direktori Runtime

Repo ini berisi source code GUI + backend. Saat dijalankan secara *portable*, semua kebutuhan sistem tersimpan rapi dalam satu folder utama yang bebas kamu pindahkan ke *Drive* D:, *Flashdisk*, atau komputer lain.

```text
natsu-server/                 # Repo ini (source code)
├── apps/
│   ├── main.py               # Launcher/Bridge: cek Node.js -> jalankan Electron (+ sidecar --mail)
│   ├── process_manager.py    # Backend: start/stop services, vHost, Laravel installer, Mail Catcher
│   └── ui/                   # Aset UI pendukung
├── electron-app/             # GUI Electron Edition
│   ├── package.json
│   └── src/
│       ├── main/             # main.js (window, tray, IPC) + server-manager.js
│       ├── preload/          # preload.js (bridge aman renderer <-> main)
│       └── renderer/         # index.html, styles.css, renderer.js
├── config/                   # Template konfigurasi dinamis (nginx.conf, my.ini, php.ini)
└── ...                       # Folder runtime tambahan saat dipakai: bin/, data/, logs/, www/

Runtime (hasil ekstrak rilis portable):
MyLocalServer/
│
├── なつServer.exe        <-- Aplikasi Utama (Klik ini untuk mulai)
│
├── bin/                    # Inti server (Nginx, PHP, MariaDB, Ngrok, HeidiSQL)
├── config/                 # Template konfigurasi dinamis
├── data/                   # Tempat database MySQL tersimpan
├── logs/                   # Log error sistem
└── www/                    # 📁 Taruh semua folder project web kamu di sini!
```

---

## 🚀 Cara Instalasi & Penggunaan (BAGI YANG MAU NGOPREK)

### Opsi 1: Untuk Pengguna Umum (Portable / Plug & Play)

1. Unduh file rilis terbaru di halaman **[Releases](https://www.google.com/search?q=%23)**.
2. Ekstrak file `.zip` tersebut di mana saja (disarankan di `C:\` atau `D:\`).
3. Klik kanan pada **`なつServer.exe`** lalu pilih **Run as Administrator** (Wajib agar sistem bisa menulis Virtual Host ke sistem Windows).
4. Klik **START** dan selamat menikmati *ngoding* tanpa hambatan!

### Opsi 2: Untuk Developer (Build dari Source Code)

Jika kamu ingin ikut mengembangkan aplikasi ini, kamu butuh **Node.js (untuk GUI Electron)** dan **Python 3 (untuk backend process manager)**.

1. *Clone* repositori ini: `git clone https://github.com/username/natsu-server.git`
2. Unduh manual *engine* Nginx, PHP, MariaDB, dan letakkan ke dalam folder `/bin/` sesuai struktur direktori.
Download Bahan Engine (Wajib Versi Portable/ZIP):
Unduh semua bahan di bawah ini dan ekstrak ke dalam folder /bin/ sesuai dengan nama foldernya.

| Komponen | Deskripsi | Link Unduhan | Target Ekstrak |
|---|---|---|---|
| **Nginx** | Web Server | [Nginx for Windows (ZIP)](https://nginx.org/en/download.html) | `/bin/nginx/` |
| **PHP** | PHP 8.x Thread Safe | [PHP 8.x TS (ZIP)](https://windows.php.net/download/) | `/bin/php/` |
| **MariaDB** | Database | [MariaDB Windows (ZIP)](https://mariadb.org/download/?t=mariadb&p=mariadb&r=11.4.5&os=windows&cpu=x86_64&pkg=zip) | `/bin/mysql/` |
| **HeidiSQL** | DB Manager | [HeidiSQL Portable (ZIP)](https://www.heidisql.com/download.php?download=portable-64) | `/bin/heidisql/` |
| **Ngrok** | Live Share | [Ngrok for Windows (ZIP)](https://ngrok.com/download) | `/bin/ngrok/` |
| **Composer** | Laravel Installer | [composer.phar](https://getcomposer.org/download/) | `/bin/php/composer.phar` |

3. Instal *library* Python yang dibutuhkan (untuk backend & Mail Catcher):
```cmd
pip install aiosmtpd
```

4. Jalankan aplikasi lewat launcher (launcher akan otomatis mengecek Node.js dan menjalankan `npm install` bila perlu):
```cmd
python apps/main.py            # meluncurkan GUI Electron
python apps/main.py --mail     # + Mail Catcher sidecar (SMTP :1025, UI :8025)
```

Atau langsung dari folder Electron:
```cmd
cd electron-app
npm install
npm start                      # atau: npm run dev (dengan DevTools)
```

5. Untuk *build* installer Windows (`.exe` via electron-builder, target NSIS):
```cmd
cd electron-app
npm run dist
```


---

## 🤝 Kontribusi

Punya ide untuk membuat なつServer menjadi lebih baik? *Pull Requests* sangat dipersilakan! Mari kita bangun alat *development* lokal yang gratis dan tangguh untuk ekosistem *developer* Indonesia.

## 📝 Lisensi

Proyek ini berada di bawah lisensi **MIT License**.
Artinya, perangkat lunak ini bebas dan gratis sepenuhnya untuk digunakan pada proyek personal maupun komersial, dimodifikasi, serta didistribusikan ulang, dengan syarat tetap menyertakan atribusi lisensi asli. 

Lihat file [LICENSE](LICENSE) untuk informasi hukum selengkapnya.
