
<div align="center">
  <h1>⚡ なつServer (Natsu Server)</h1>
  <p><b>The Ultimate Lightweight & Portable Local Development Environment.</b></p>
  <p><i>Lebih dari sekadar web server. Ini adalah asisten pribadimu untuk mendevelop aplikasi PHP & Laravel dengan kecepatan penuh, tanpa biaya lisensi!</i></p>

  ![Python](https://img.shields.io/badge/Made_with-Python_3-blue?style=for-the-badge&logo=python)
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

---

## 🛠️ Arsitektur & Teknologi di Balik Layar

Aplikasi GUI ini tidak menggunakan *browser engine* yang berat (seperti Electron), melainkan ditulis menggunakan **Python (CustomTkinter)** dan berjalan murni mengandalkan *subprocess* bawaan sistem operasi.

*   **GUI & Process Manager:** Python 3 (CustomTkinter, Threading, Pystray)
*   **Web Server:** Nginx (Super ringan & cepat)
*   **Database:** MariaDB (Open Source & drop-in replacement untuk MySQL)
*   **PHP:** Thread Safe Edition

---

## 📂 Struktur Direktori Bersih

Semua kebutuhan sistem tersimpan rapi dalam satu folder utama. Kamu bebas memindahkannya ke *Drive* D:, *Flashdisk*, atau komputer lain.

```text
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

## 🚀 Cara Instalasi & Penggunaan

### Opsi 1: Untuk Pengguna Umum (Portable / Plug & Play)

1. Unduh file rilis terbaru di halaman **[Releases](https://www.google.com/search?q=%23)**.
2. Ekstrak file `.zip` tersebut di mana saja (disarankan di `C:\` atau `D:\`).
3. Klik kanan pada **`なつServer.exe`** lalu pilih **Run as Administrator** (Wajib agar sistem bisa menulis Virtual Host ke sistem Windows).
4. Klik **START** dan selamat menikmati *ngoding* tanpa hambatan!

### Opsi 2: Untuk Developer (Build dari Source Code)

Jika kamu ingin ikut mengembangkan aplikasi GUI ini:

1. *Clone* repositori ini: `git clone https://github.com/username/natsu-server.git`
2. Unduh manual *engine* Nginx, PHP, MariaDB, dan letakkan ke dalam folder `/bin/` sesuai struktur direktori.
3. Instal *library* Python yang dibutuhkan:
```cmd
pip install customtkinter pystray Pillow

```


4. Jalankan aplikasi via terminal: `python app/main.py`
5. Untuk *compile* ulang menjadi `.exe`:
```cmd
python -m PyInstaller --onefile --noconsole --name "なつServer" main.py

```



---

## 🤝 Kontribusi

Punya ide untuk membuat なつServer menjadi lebih baik? *Pull Requests* sangat dipersilakan! Mari kita bangun alat *development* lokal yang gratis dan tangguh untuk ekosistem *developer* Indonesia.

## 📝 Lisensi

Proyek ini didistribusikan di bawah lisensi **MIT License**. Gratis sepenuhnya untuk digunakan pada proyek personal maupun komersial (*freelance*). Bebas tanpa syarat!
