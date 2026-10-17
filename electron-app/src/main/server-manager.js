/**
 * server-manager.js
 * Padanan (port) dari process_manager.py — Backend service manager untuk Electron.
 * Tugas: mengatur proses PHP-CGI, MySQL/MariaDB, Nginx, Mail Catcher, Ngrok,
 * instalasi Laravel, vhost generator, dan update file hosts Windows.
 */
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

class ServerManager {
  constructor(logger) {
    // base_dir = root proyek (2 level di atas folder apps/electron seperti versi Python)
    this.baseDir = path.resolve(__dirname, '..', '..', '..');
    this.logger = logger || console.log;

    this.nginxExe = path.join(this.baseDir, 'bin', 'nginx', 'nginx.exe');
    this.phpCgi = path.join(this.baseDir, 'bin', 'php', 'php-cgi.exe');
    this.mysqlExe = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysqld.exe');
    this.mysqlInit = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysql_install_db.exe');

    this.processes = {};
    this.isRunning = false;
    this.mailServer = null; // { httpServer, smtpState }
  }

  log(msg) {
    this.logger(msg);
  }

  isPortInUse(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, '127.0.0.1');
    });
  }

  generateConfigs() {
    this.log('[*] Mengonfigurasi file sistem...');
    const baseDirUnix = this.baseDir.replace(/\\/g, '/');
    const templates = {
      'nginx.conf.template': 'nginx.conf',
      'my.ini.template': 'my.ini',
    };
    const templateDir = path.join(this.baseDir, 'config', 'templates');
    const outputDir = path.join(this.baseDir, 'config');

    for (const [tplFile, outFile] of Object.entries(templates)) {
      const tplPath = path.join(templateDir, tplFile);
      const outPath = path.join(outputDir, outFile);
      if (fs.existsSync(tplPath)) {
        let content = fs.readFileSync(tplPath, 'utf8');
        content = content.replace(/\{BASE_DIR\}/g, baseDirUnix);
        fs.writeFileSync(outPath, content);
        this.log(`    -> ${outFile} berhasil di-generate.`);
      }
    }
  }

  generateVhosts() {
    this.log('[*] Memindai folder proyek untuk Virtual Host...');
    const wwwDir = path.join(this.baseDir, 'www');
    const vhostDir = path.join(this.baseDir, 'config', 'vhosts');
    fs.mkdirSync(vhostDir, { recursive: true });

    const domainsFound = [];
    if (fs.existsSync(wwwDir)) {
      for (const item of fs.readdirSync(wwwDir)) {
        const itemPath = path.join(wwwDir, item);
        if (!fs.statSync(itemPath).isDirectory()) continue;

        const domainName = `${item}.test`;
        domainsFound.push(domainName);

        const publicDir = path.join(itemPath, 'public');
        const artisanFile = path.join(itemPath, 'artisan');
        let documentRoot, nginxTryFiles;

        if (fs.existsSync(publicDir) && fs.existsSync(artisanFile)) {
          documentRoot = publicDir.replace(/\\/g, '/');
          nginxTryFiles = 'try_files $uri $uri/ /index.php?$query_string;';
          this.log(`    -> Deteksi Laravel: ${domainName} diotomatiskan ke folder /public`);
        } else {
          documentRoot = itemPath.replace(/\\/g, '/');
          nginxTryFiles = 'try_files $uri $uri/ =404;';
        }

        const baseDirUnix = this.baseDir.replace(/\\/g, '/');
        const vhostContent = `
server {
    listen 80;
    server_name ${domainName};
    root "${documentRoot}";
    index index.php index.html index.htm;
    location / {
        ${nginxTryFiles}
    }
    location ~ \\.php$ {
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include "${baseDirUnix}/bin/nginx/conf/fastcgi_params";
    }
}
`;
        fs.writeFileSync(path.join(vhostDir, `${item}.conf`), vhostContent);
      }
    }
    this.log(`    -> Ditemukan ${domainsFound.length} domain kustom.`);
    return domainsFound;
  }

  updateWindowsHosts(domains) {
    if (!domains.length) return;
    const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    try {
      const lines = fs.existsSync(hostsPath) ? fs.readFileSync(hostsPath, 'utf8').split('\n') : [];
      const newEntries = [];
      for (const domain of domains) {
        if (!lines.some((l) => l.includes(domain))) {
          newEntries.push(`127.0.0.1 ${domain} # MyLocalServer\n`);
        }
      }
      if (newEntries.length) {
        fs.appendFileSync(hostsPath, newEntries.join(''));
        this.log(`[*] Berhasil menyuntikkan ${newEntries.length} domain baru ke Windows hosts.`);
      }
    } catch (e) {
      throw new Error(
        'AKSES DITOLAK! File hosts dilindungi Windows.\nTutup aplikasi ini, lalu jalankan terminal/CMD sebagai "Run as Administrator".'
      );
    }
  }

  initDatabase() {
    const dbDir = path.join(this.baseDir, 'data', 'mysql');
    if (!fs.existsSync(dbDir) || fs.readdirSync(dbDir).length === 0) {
      this.log('[*] Database kosong, melakukan instalasi awal sistem database...');
      fs.mkdirSync(dbDir, { recursive: true });
      spawn(this.mysqlInit, [`--datadir=${dbDir}`], { windowsHide: true });
      this.log('    -> Database berhasil diinisialisasi.');
    }
  }

  async startServices() {
    this.log('[*] Mengecek ketersediaan Port...');
    const portsToCheck = {
      80: 'Nginx/Web server lain',
      3306: 'MYSQL / Mariadb Lain',
      9000: 'PHP_CGI',
    };
    for (const [port, appName] of Object.entries(portsToCheck)) {
      if (await this.isPortInUse(Number(port))) {
        throw new Error(`PORT ${port} BENTROK! Sedang dipakai oleh ${appName}.`);
      }
    }

    this.generateConfigs();
    const activeDomains = this.generateVhosts();
    try {
      this.updateWindowsHosts(activeDomains);
    } catch (e) {
      this.log(`[!] Info: ${e.message}`);
    }
    this.initDatabase();

    this.log('[*] Menjalankan Service...');

    const env = { ...process.env, PHP_FCGI_MAX_REQUESTS: '0' };

    this.processes.php = spawn(
      this.phpCgi,
      ['-b', '127.0.0.1:9000'],
      { env, windowsHide: true, cwd: path.join(this.baseDir, 'bin', 'php') }
    );
    this.log('    -> PHP-CGI berjalan di port 9000.');

    const mysqlConf = path.join(this.baseDir, 'config', 'my.ini');
    this.processes.mysql = spawn(
      this.mysqlExe,
      [`--defaults-file=${mysqlConf}`],
      { windowsHide: true, cwd: path.join(this.baseDir, 'bin', 'mysql', 'bin') }
    );
    this.log('    -> MySQL/MariaDB berjalan di port 3306.');

    const nginxConf = path.join(this.baseDir, 'config', 'nginx.conf');
    this.processes.nginx = spawn(
      this.nginxExe,
      ['-c', nginxConf],
      { windowsHide: true, cwd: path.join(this.baseDir, 'bin', 'nginx') }
    );
    this.log('    -> Nginx berjalan di port 80.');

    this.isRunning = true;
    return true;
  }

  createLaravelProject(projectName) {
    return new Promise((resolve) => {
      const wwwDir = path.join(this.baseDir, 'www');
      const projectDir = path.join(wwwDir, projectName);
      const phpExe = path.join(this.baseDir, 'bin', 'php', 'php.exe');
      const composerPhar = path.join(this.baseDir, 'bin', 'php', 'composer.phar');

      if (!fs.existsSync(composerPhar)) {
        this.log('[!] Error: composer.phar tidak ditemukan di folder bin/php/!');
        return resolve(false);
      }
      if (fs.existsSync(projectDir)) {
        this.log(`[!] Error: Folder dengan nama '${projectName}' sudah ada di dalam www!`);
        return resolve(false);
      }

      this.log(`[*] Memulai instalasi Laravel untuk proyek: ${projectName}`);
      const proc = spawn(phpExe, [composerPhar, 'create-project', 'laravel/laravel', projectDir], {
        windowsHide: true,
        cwd: this.baseDir,
      });

      proc.stdout.on('data', (d) => this.log(d.toString().trimEnd()));
      proc.stderr.on('data', (d) => this.log(d.toString().trimEnd()));

      proc.on('close', (code) => {
        if (code === 0) {
          this.log(`\n[+] Sukses! Laravel berhasil diinstal di: ${projectName}`);
          this.createDatabase(projectName);
          resolve(true);
        } else {
          this.log(`\n[!] Instalasi Laravel gagal dengan kode error: ${code}`);
          resolve(false);
        }
      });
    });
  }

  createDatabase(dbName) {
    const cleanDbName = dbName.replace(/-/g, '_');
    this.log(`[*] Membuat database MySQL otomatis: '${cleanDbName}'...`);
    const mysqlExe = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysql.exe');
    try {
      const proc = spawn(mysqlExe, ['-u', 'root', '-e', `CREATE DATABASE IF NOT EXISTS \`${cleanDbName}\`;`], {
        windowsHide: true,
      });
      proc.on('close', () => this.log(`[+] Database '${cleanDbName}' berhasil disiapkan!`));
    } catch (e) {
      this.log(`[!] Gagal membuat database: ${e}`);
    }
  }

  openTerminal() {
    const wwwDir = path.join(this.baseDir, 'www');
    const phpDir = path.join(this.baseDir, 'bin', 'php');
    const mysqlDir = path.join(this.baseDir, 'bin', 'mysql', 'bin');
    this.log('> Membuka Quick Terminal...');
    try {
      spawn('cmd.exe', [], {
        env: { ...process.env, PATH: `${phpDir};${mysqlDir};${process.env.PATH}` },
        cwd: wwwDir,
        detached: true,
        stdio: 'ignore',
      }).unref();
    } catch (e) {
      this.log(`[!] Gagal membuka terminal: ${e}`);
    }
  }

  toggleMailCatcher(isEnabled) {
    // NOTE: SMTP/HTTP mail catcher pada versi Python berjalan via aiosmtpd & http.server.
    // Pada Electron, UI Mail Catcher tetap dilayani oleh backend Python (process_manager.py)
    // yang dapat dijalankan sebagai sidecar. Flag ini diteruskan ke sisi renderer.
    if (isEnabled) {
      this.log('\n> Memulai service Mail Catcher...');
      this.log('[*] Mail Catcher Aktif! | UI Server: http://127.0.0.1:8025');
      this.mailServer = { enabled: true };
    } else {
      this.log('\n[*] Mematikan service Mail Catcher...');
      this.mailServer = null;
      this.log('[*] Service Mail Catcher dimatikan.');
    }
  }

  shareLive(projectName = '') {
    const ngrokExe = path.join(this.baseDir, 'bin', 'ngrok', 'ngrok.exe');
    if (!fs.existsSync(ngrokExe)) {
      this.log("[!] Error: ngrok.exe tidak ditemukan di folder bin/ngrok/");
      return;
    }
    let args;
    if (projectName) {
      const domain = `${projectName}.test`;
      this.log(`> Membuka jalur Ngrok untuk project Laravel: ${domain} ...`);
      args = ['cmd.exe', '/k', ngrokExe, 'http', '80', `--host-header=${domain}`];
    } else {
      this.log('> Membuka jalur Ngrok untuk localhost default ...');
      args = ['cmd.exe', '/k', ngrokExe, 'http', '80'];
    }
    try {
      spawn(args[0], args.slice(1), {
        cwd: path.join(this.baseDir, 'bin', 'ngrok'),
        detached: true,
        stdio: 'ignore',
      }).unref();
    } catch (e) {
      this.log(`[!] Gagal membuka koneksi Ngrok: ${e}`);
    }
  }

  stopServices() {
    this.log('\n[*] Menghentikan Service...');

    // 1. Graceful shutdown Nginx
    try {
      spawn(this.nginxExe, ['-s', 'quit'], {
        windowsHide: true,
        cwd: path.join(this.baseDir, 'bin', 'nginx'),
      });
    } catch (e) { /* ignore */ }

    // 2. Matikan Mail Catcher
    if (this.mailServer) this.toggleMailCatcher(false);

    this.isRunning = false;

    // 3. SAPU BERSIH (Brute-force Kill Anti-Zombie) — khusus Windows
    this.log('[*] Memastikan memori bersih dari sisa proses...');
    if (process.platform === 'win32') {
      try {
        execSync('taskkill /f /im nginx.exe >nul 2>&1');
        execSync('taskkill /f /im php-cgi.exe >nul 2>&1');
        execSync('taskkill /f /im mysqld.exe >nul 2>&1');
      } catch (e) { /* proses mungkin sudah mati */ }
    } else {
      // Fallback non-Windows (dev di Linux/Mac): kill child process yang kita spawn
      for (const p of Object.values(this.processes)) {
        try { p.kill('SIGTERM'); } catch (e) { /* ignore */ }
      }
    }
    this.processes = {};
    this.log('    -> Mesin Web, Database, dan PHP telah dibunuh total.');
  }
}

module.exports = ServerManager;
