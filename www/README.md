# www/ — Taruh semua folder project web kamu di sini!

Tiap **subfolder** di sini otomatis jadi virtual host:

```
www/
├── proyekku/        →  http://proyekku.test
├── toko/            →  http://toko.test
└── laravel-app/     →  http://laravel-app.test  (root ke folder /public)
```

- Project Laravel/Composer: root otomatis diarahkan ke `public/`.
- Isi database-nya lewat tombol **DB** (HeidiSQL) atau Quick Terminal (`mysql`).
- Folder ini di-ignore git kecuali README ini — project kamu tidak ikut ter-commit.
