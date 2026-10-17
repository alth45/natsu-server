import { spawn, exec } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';

export type LoggerFn = (msg: unknown) => void;
export interface MailState { enabled: boolean; }

export default class ServerManager {
  baseDir: string;
  logger: LoggerFn;
  nginxExe: string; phpCgi: string; mysqlExe: string; mysqlInit: string;
  processes: Partial<Record<'php'|'mysql'|'nginx', ChildProcess>> = {};
  isRunning = false;
  mailServer: MailState | null = null;

  constructor(logger?: LoggerFn) {
    // src/main/*.ts maupun dist/main/*.js sama-sama 3 level di bawah root proyek
    // (electron-app/src/main -> root, electron-app/dist/main -> root).
    this.baseDir = path.resolve(__dirname, '..', '..', '..');
    this.logger = logger ?? console.log;
    this.nginxExe = path.join(this.baseDir, 'bin', 'nginx', 'nginx.exe');
    this.phpCgi = path.join(this.baseDir, 'bin', 'php', 'php-cgi.exe');
    this.mysqlExe = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysqld.exe');
    this.mysqlInit = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysql_install_db.exe');
  }
  log(msg: unknown): void { this.logger(msg); }
  isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(500);
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('timeout', () => { s.destroy(); resolve(false); });
      s.once('error', () => { s.destroy(); resolve(false); });
      s.connect(port, '127.0.0.1');
    });
  }
  generateConfigs(): void {
    this.log('[*] Mengonfigurasi file sistem...');
    const unix = this.baseDir.replace(/\\/g, '/');
    const tpl: Record<string,string> = { 'nginx.conf.template':'nginx.conf', 'my.ini.template':'my.ini' };
    for (const [a,b] of Object.entries(tpl)) {
      const p1 = path.join(this.baseDir,'config','templates',a);
      const p2 = path.join(this.baseDir,'config',b);
      if (fs.existsSync(p1)) {
        fs.writeFileSync(p2, fs.readFileSync(p1,'utf8').replace(/\{BASE_DIR\}/g, unix));
        this.log('    -> ' + b + ' berhasil di-generate.');
      }
    }
  }
  generateVhosts(): string[] {
    this.log('[*] Memindai folder proyek untuk Virtual Host...');
    const wwwDir = path.join(this.baseDir, 'www');
    const vhostDir = path.join(this.baseDir, 'config', 'vhosts');
    fs.mkdirSync(vhostDir, { recursive: true });
    const unix = this.baseDir.replace(/\\/g, '/');
    const inc = `"${unix}/bin/nginx/conf/fastcgi_params"`;
    const found: string[] = [];
    if (fs.existsSync(wwwDir)) {
      for (const item of fs.readdirSync(wwwDir)) {
        const ip = path.join(wwwDir, item);
        try { if (!fs.statSync(ip).isDirectory()) continue; } catch { continue; }
        const domain = `${item}.test`;
        found.push(domain);
        const pub = path.join(ip, 'public');
        const art = path.join(ip, 'artisan');
        let root: string; let tryF: string;
        if (fs.existsSync(pub) && fs.existsSync(art)) {
          root = pub.replace(/\\/g, '/');
          tryF = 'try_files $uri $uri/ /index.php?$query_string;';
          this.log(`    -> Deteksi Laravel: ${domain} ke /public`);
        } else {
          root = ip.replace(/\\/g, '/');
          tryF = 'try_files $uri $uri/ =404;';
        }
        const content = `\nserver {\n    listen 80;\n    server_name ${domain};\n    root "${root}";\n    index index.php index.html index.htm;\n    location / {\n        ${tryF}\n    }\n    location ~ \\.php$ {\n        fastcgi_pass 127.0.0.1:9000;\n        fastcgi_index index.php;\n        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n        include ${inc};\n    }\n}\n`;
        const cp = path.join(vhostDir, `${item}.conf`);
        let need = true;
        try { if (fs.existsSync(cp) && fs.readFileSync(cp,'utf8')===content) need=false; } catch { /* tulis */ }
        if (need) fs.writeFileSync(cp, content);
      }
    }
    this.log(`    -> Ditemukan ${found.length} domain kustom.`);
    return found;
  }
  updateWindowsHosts(domains: string[]): void {
    if (!domains.length) return;
    const hp = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    try {
      const c: string = fs.existsSync(hp) ? fs.readFileSync(hp,'utf8') : '';
      const set = new Set<string>(c.split(/\s+/));
      const add: string[] = [];
      for (const d of domains) {
        if (!set.has(d)) { add.push(`127.0.0.1 ${d} # MyLocalServer\n`); set.add(d); }
      }
      if (add.length) {
        fs.appendFileSync(hp, add.join(''));
        this.log(`[*] Menyuntikkan ${add.length} domain ke hosts.`);
      }
    } catch {
      throw new Error('AKSES DITOLAK! Jalankan sebagai Administrator.');
    }
  }
  initDatabase(): void {
    const dbDir = path.join(this.baseDir, 'data', 'mysql');
    if (!fs.existsSync(dbDir) || fs.readdirSync(dbDir).length===0) {
      this.log('[*] Instalasi awal database...');
      fs.mkdirSync(dbDir, { recursive: true });
      spawn(this.mysqlInit, ['--datadir='+dbDir], { windowsHide: true });
      this.log('    -> Database diinisialisasi.');
    }
  }
  async startServices(): Promise<boolean> {
    this.log('[*] Mengecek ketersediaan Port...');
    const ports: Record<number,string> = { 80:'Nginx/Web', 3306:'MYSQL', 9000:'PHP_CGI' };
    const ent = Object.entries(ports);
    const res: boolean[] = await Promise.all(ent.map(([p]) => this.isPortInUse(Number(p))));
    for (let i=0;i<ent.length;i++) {
      if (res[i]) throw new Error('PORT ' + ent[i][0] + ' BENTROK! Dipakai ' + ent[i][1]);
    }
    this.generateConfigs();
    const doms: string[] = this.generateVhosts();
    try { this.updateWindowsHosts(doms); } catch (e) { this.log('[!] Info: ' + (e as Error).message); }
    this.initDatabase();
    this.log('[*] Menjalankan Service...');
    const env: NodeJS.ProcessEnv = { ...process.env, PHP_FCGI_MAX_REQUESTS: '0' };
    this.processes.php = spawn(this.phpCgi, ['-b','127.0.0.1:9000'], { env, windowsHide:true, cwd: path.join(this.baseDir,'bin','php') });
    this.log('    -> PHP-CGI di 9000.');
    this.processes.mysql = spawn(this.mysqlExe, ['--defaults-file='+path.join(this.baseDir,'config','my.ini')], { windowsHide:true, cwd: path.join(this.baseDir,'bin','mysql','bin') });
    this.log('    -> MySQL di 3306.');
    this.processes.nginx = spawn(this.nginxExe, ['-c', path.join(this.baseDir,'config','nginx.conf')], { windowsHide:true, cwd: path.join(this.baseDir,'bin','nginx') });
    this.log('    -> Nginx di 80.');
    this.isRunning = true;
    return true;
  }
  createLaravelProject(projectName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const wwwDir = path.join(this.baseDir, 'www');
      const projectDir = path.join(wwwDir, projectName);
      const phpExe = path.join(this.baseDir, 'bin', 'php', 'php.exe');
      const composer = path.join(this.baseDir, 'bin', 'php', 'composer.phar');
      if (!fs.existsSync(composer)) { this.log('[!] composer.phar tidak ditemukan!'); return resolve(false); }
      if (fs.existsSync(projectDir)) { this.log('[!] Folder sudah ada: ' + projectName); return resolve(false); }
      this.log('[*] Instalasi Laravel: ' + projectName);
      const proc: ChildProcess = spawn(phpExe, [composer, 'create-project', 'laravel/laravel', projectDir], { windowsHide: true, cwd: this.baseDir });
      proc.stdout?.on('data', (d: Buffer) => this.log(d.toString().trimEnd()));
      proc.stderr?.on('data', (d: Buffer) => this.log(d.toString().trimEnd()));
      proc.on('close', (code: number | null) => {
        if (code===0) { this.log('\n[+] Sukses Laravel: ' + projectName); this.createDatabase(projectName); resolve(true); }
        else { this.log('\n[!] Gagal Laravel kode: ' + code); resolve(false); }
      });
    });
  }
  createDatabase(dbName: string): void {
    const clean = dbName.replace(/-/g, '_');
    this.log("[*] Membuat database: '" + clean + "'...");
    const exe = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysql.exe');
    try {
      const p: ChildProcess = spawn(exe, ['-u','root','-e', 'CREATE DATABASE IF NOT EXISTS `' + clean + '`;'], { windowsHide: true });
      p.on('close', () => this.log("[+] Database '" + clean + "' siap!"));
    } catch (e) { this.log('[!] Gagal DB: ' + String(e)); }
  }
  openTerminal(): void {
    const wwwDir = path.join(this.baseDir, 'www');
    const phpDir = path.join(this.baseDir, 'bin', 'php');
    const myDir = path.join(this.baseDir, 'bin', 'mysql', 'bin');
    this.log('> Membuka Quick Terminal...');
    try {
      spawn('cmd.exe', [], { env: { ...process.env, PATH: phpDir + ';' + myDir + ';' + process.env.PATH }, cwd: wwwDir, detached: true, stdio: 'ignore' }).unref();
    } catch (e) { this.log('[!] Gagal terminal: ' + String(e)); }
  }
  toggleMailCatcher(on: boolean): void {
    if (on) {
      this.log('\n> Mail Catcher ON... | UI: http://127.0.0.1:8025');
      this.mailServer = { enabled: true };
    } else {
      this.log('\n[*] Mail Catcher OFF.');
      this.mailServer = null;
    }
  }
  shareLive(projectName = ''): void {
    const ngrok = path.join(this.baseDir, 'bin', 'ngrok', 'ngrok.exe');
    if (!fs.existsSync(ngrok)) { this.log('[!] ngrok.exe tidak ditemukan!'); return; }
    let args: string[];
    if (projectName) {
      const domain = projectName + '.test';
      this.log('> Ngrok untuk ' + domain + ' ...');
      args = ['cmd.exe', '/k', ngrok, 'http', '80', '--host-header=' + domain];
    } else {
      this.log('> Ngrok localhost ...');
      args = ['cmd.exe', '/k', ngrok, 'http', '80'];
    }
    try {
      spawn(args[0], args.slice(1), { cwd: path.join(this.baseDir,'bin','ngrok'), detached: true, stdio: 'ignore' }).unref();
    } catch (e) { this.log('[!] Gagal Ngrok: ' + String(e)); }
  }
  stopServices(): void {
    this.log('\n[*] Menghentikan Service...');
    try { spawn(this.nginxExe, ['-s','quit'], { windowsHide: true, cwd: path.join(this.baseDir,'bin','nginx') }); } catch { /* ignore */ }
    if (this.mailServer) this.toggleMailCatcher(false);
    this.isRunning = false;
    this.log('[*] Bersih-bersih proses...');
    if (process.platform==='win32') {
      const kills: string[] = ['taskkill /f /im nginx.exe >nul 2>&1','taskkill /f /im php-cgi.exe >nul 2>&1','taskkill /f /im mysqld.exe >nul 2>&1'];
      for (const c of kills) { try { exec(c, () => undefined); } catch { /* ignore */ } }
    } else {
      for (const p of Object.values(this.processes)) { try { p?.kill('SIGTERM'); } catch { /* ignore */ } }
    }
    this.processes = {};
    this.log('    -> Semua service dimatikan.');
  }
}


