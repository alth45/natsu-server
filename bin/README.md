# bin/ — Tempat Binary Portable (tinggal drop di sini!)

Semua engine di sini **TIDAK ikut di-commit** ke git (lihat `.gitignore`) —
folder & `.gitkeep` hanya menjaga struktur. Unduh arsip resmi, ekstrak,
lalu tempatkan isinya persis seperti pola di bawah.

## Struktur yang diharapkan

```
bin/
├── nginx/
│   └── nginx.exe            + isi folder conf/ (bawaan zip nginx)
├── mysql/
│   └── bin/
│       ├── mysqld.exe
│       ├── mysql.exe
│       ├── mysql_install_db.exe
│       └── ... (dll, libmysql.dll, dll — ikut zip MariaDB)
├── php/                     ← PHP default (wajib)
│   ├── php.exe
│   ├── php-cgi.exe
│   ├── php.ini              (opsional — config/template dipakai bila kosong)
│   └── composer.phar        (opsional — untuk tombol Laravel)
├── php83/                   ← versi tambahan (opsional, pola php* )
│   ├── php.exe
│   └── php-cgi.exe
├── ngrok/
│   └── ngrok.exe            (opsional — tombol Share Live)
├── heidisql/
│   └── heidisql.exe         (opsional — tombol DB Manager)
├── openssl/
│   └── openssl.exe          (opsional — fallback HTTPS bila mkcert absen)
└── mkcert/
    └── mkcert.exe           (opsional — HTTPS trusted; cek juga PATH)
```

## Link unduhan

| Komponen   | Unduh dari                                        | Taruh di         |
| ---------- | ------------------------------------------------- | ---------------- |
| Nginx      | https://nginx.org/en/download.html (Windows ZIP)  | `bin/nginx/`     |
| PHP 8.x TS | https://windows.php.net/download/ (x64 Thread Safe) | `bin/php/` (+ `bin/php83/`, dst.) |
| MariaDB    | https://mariadb.org/download/ (Windows ZIP)       | `bin/mysql/` (folder `bin/` bawaan zip ikut di dalam) |
| ngrok      | https://ngrok.com/download                        | `bin/ngrok/`     |
| HeidiSQL   | https://www.heidisql.com/download.php (Portable)  | `bin/heidisql/`  |
| composer.phar | https://getcomposer.org/download/               | `bin/php/composer.phar` |
| mkcert     | https://github.com/FiloSottile/mkcert/releases     | `bin/mkcert/`    |

## Catatan

- **PHP versi ganda**: buat folder `bin/phpXX` (contoh `php82`, `php83`)
  berisi `php.exe` + `php-cgi.exe` — otomatis muncul di dropdown Environment.
- **HTTPS**: toggle Environment → pakai `bin/mkcert/mkcert.exe` dulu, lalu
  `bin/openssl/openssl.exe`, baru mkcert/openssl di PATH.
- Semua folder di atas sudah dibuatkan; cukup salin isi ZIP ke dalamnya.
