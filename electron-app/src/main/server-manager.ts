import { spawn, exec } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { loadSettings, saveSettings, scanPhpVersions, resolveActivePhp, phpVersionSync } from './php-manager';
import type { PhpVersionInfo } from '../types/ipc';
import { ensureCert, sslBlockForVhost, sslBlockForLocalhost, hasCert, HTTPS_PORT } from './https-manager';

export type LoggerFn = (msg: unknown) => void;
export interface MailState { enabled: boolean; }

export default class ServerManager {
  baseDir: string;
  logger: LoggerFn;
  nginxExe: string; phpCgi: string; mysqlExe: string; mysqlInit: string;
  phpExe: string; phpDir: string; composerPhar: string; activePhpId: string;
  httpsEnabled: boolean;
  processes: Partial<Record<'php'|'mysql'|'nginx', ChildProcess>> = {};
  isRunning = false;
  mailServer: MailState | null = null;

  constructor(logger?: LoggerFn) {
    // src/main/*.ts maupun dist/main/*.js sama-sama 3 level di bawah root proyek
    // (electron-app/src/main -> root, electron-app/dist/main -> root).
    this.baseDir = path.resolve(__dirname, '..', '..', '..');
    this.logger = logger ?? console.log;
    this.nginxExe = path.join(this.baseDir, 'bin', 'nginx', 'nginx.exe');
    this.mysqlExe = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysqld.exe');
    this.mysqlInit = path.join(this.baseDir, 'bin', 'mysql', 'bin', 'mysql_install_db.exe');
    const s = loadSettings(this.baseDir);
    const active = resolveActivePhp(this.baseDir, s);
    this.activePhpId = active.id;
    this.phpDir = active.dir;
    this.phpExe = active.exe;
    this.phpCgi = active.cgi;
    this.composerPhar = active.composer;
    this.httpsEnabled = s.httpsEnabled === true;
  }
  refreshPhpPaths(): PhpVersionInfo {
    const a = resolveActivePhp(this.baseDir, { phpId: this.activePhpId, httpsEnabled: this.httpsEnabled });
    this.activePhpId = a.id; this.phpDir = a.dir; this.phpExe = a.exe; this.phpCgi = a.cgi; this.composerPhar = a.composer;
    return a;
  }
  listPhpVersions(): { versions: PhpVersionInfo[]; activeId: string } {
    let versions = scanPhpVersions(this.baseDir, this.activePhpId);
    if (!versions.some((v) => v.id === this.activePhpId) && versions.length) {
      this.activePhpId = versions[0].id;
      this.refreshPhpPaths();
      versions = scanPhpVersions(this.baseDir, this.activePhpId);
    }
    return { versions, activeId: this.activePhpId };
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
    // Template nginx utama: dukung {BASE_DIR} + {HTTPS_BLOCK} agar localhost ikut HTTPS
    const tpl: Record<string,string> = { 'nginx.conf.template':'nginx.conf', 'my.ini.template':'my.ini' };
    for (const [a,b] of Object.entries(tpl)) {
      const p1 = path.join(this.baseDir,'config','templates',a);
      const p2 = path.join(this.baseDir,'config',b);
      if (fs.existsSync(p1)) {
        let content = fs.readFileSync(p1,'utf8').replace(/\{BASE_DIR\}/g, unix);
        if (b === 'nginx.conf') {
          content = content.replace(/\{HTTPS_BLOCK\}/g, this.httpsEnabled ? sslBlockForLocalhost(this.baseDir) : '');
          // Fallback: template lama tanpa placeholder -> inject sebelum include vhosts
          if (this.httpsEnabled && !/\blisten\s+443\s+ssl\b/.test(content)) {
            content = content.replace(
              /include\s+"[^"]*config\/vhosts\/\*\.conf";/,
              sslBlockForLocalhost(this.baseDir).trim() + '\n\n    $&'
            );
          }
        }
        fs.writeFileSync(p2, content);
        this.log('    -> ' + b + ' berhasil di-generate.');
      }
    }
    if (this.httpsEnabled && !hasCert(this.baseDir)) {
      this.log('[!] Sertifikat HTTPS belum ada — gunakan tombol HTTPS untuk generate.');
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
        const content = `\nserver {\n    listen 80;${this.httpsEnabled ? sslBlockForVhost(this.baseDir) : ''}\n    server_name ${domain};\n    root "${root}";\n    index index.php index.html index.htm;\n    location / {\n        ${tryF}\n    }\n    location ~ \\.php$ {\n        fastcgi_pass 127.0.0.1:9000;\n        fastcgi_index index.php;\n        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n        include ${inc};\n    }\n}\n`;
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
    this.refreshPhpPaths();
    this.log('[*] Mengecek ketersediaan Port...');
    const ports: Record<number,string> = { 80:'Nginx/Web', 3306:'MYSQL', 9000:'PHP_CGI' };
    if (this.httpsEnabled) ports[HTTPS_PORT] = 'Nginx HTTPS';
    const ent = Object.entries(ports);
    const res: boolean[] = await Promise.all(ent.map(([p]) => this.isPortInUse(Number(p))));
    for (let i=0;i<ent.length;i++) {
      if (res[i]) throw new Error('PORT ' + ent[i][0] + ' BENTROK! Dipakai ' + ent[i][1]);
    }
    if (this.httpsEnabled && !hasCert(this.baseDir)) {
      throw new Error('HTTPS aktif tapi sertifikat belum ada. Matikan HTTPS atau generate sertifikat dulu via tombol HTTPS.');
    }
    this.generateConfigs();
    const doms: string[] = this.generateVhosts();
    try { this.updateWindowsHosts(doms); } catch (e) { this.log('[!] Info: ' + (e as Error).message); }
    this.initDatabase();
    this.log('[*] Menjalankan Service... (PHP: ' + this.activePhpId + (this.httpsEnabled ? ', HTTPS ON :443' : '') + ')');
    const env: NodeJS.ProcessEnv = { ...process.env, PHP_FCGI_MAX_REQUESTS: '0' };
    this.processes.php = spawn(this.phpCgi, ['-b','127.0.0.1:9000'], { env, windowsHide:true, cwd: this.phpDir });
    this.log('    -> PHP-CGI (' + this.activePhpId + ') di 9000.');
    this.processes.mysql = spawn(this.mysqlExe, ['--defaults-file='+path.join(this.baseDir,'config','my.ini')], { windowsHide:true, cwd: path.join(this.baseDir,'bin','mysql','bin') });
    this.log('    -> MySQL di 3306.');
    this.processes.nginx = spawn(this.nginxExe, ['-c', path.join(this.baseDir,'config','nginx.conf')], { windowsHide:true, cwd: path.join(this.baseDir,'bin','nginx') });
    this.log('    -> Nginx di 80' + (this.httpsEnabled ? ' + 443 (SSL).' : '.'));
    this.isRunning = true;
    return true;
  }
  createLaravelProject(projectName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const wwwDir = path.join(this.baseDir, 'www');
      const projectDir = path.join(wwwDir, projectName);
      this.refreshPhpPaths();
      const phpExe = this.phpExe;
      const composer = this.composerPhar;
      if (!fs.existsSync(composer)) { this.log('[!] composer.phar tidak ditemukan di ' + this.phpDir + '!'); return resolve(false); }
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
    this.refreshPhpPaths();
    const phpDir = this.phpDir;
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
  setPhpVersion(id: string): { ok: boolean; activeId: string; needsRestart: boolean; error: string } {
    const { versions } = this.listPhpVersions();
    const hit = versions.find((v) => v.id === id);
    if (!hit) return { ok: false, activeId: this.activePhpId, needsRestart: false, error: 'Versi PHP "' + id + '" tidak ditemukan di bin/.' };
    const wasRunning = this.isRunning;
    if (wasRunning) this.stopServices();
    this.activePhpId = hit.id;
    this.refreshPhpPaths();
    try {
      const cur = loadSettings(this.baseDir);
      saveSettings(this.baseDir, { phpId: this.activePhpId, httpsEnabled: cur.httpsEnabled });
    } catch { /* settings opsional */ }
    this.log('[*] PHP aktif diganti ke ' + hit.label + (hit.detected ? ' (v' + hit.detected + ')' : '') + ' @ ' + hit.dir);
    return { ok: true, activeId: this.activePhpId, needsRestart: wasRunning, error: '' };
  }
  getPhpVersionString(): { ok: boolean; version: string } {
    this.refreshPhpPaths();
    return phpVersionSync(this.phpExe);
  }
  getHttpsStatus(): { enabled: boolean; certCount: number; domains: string[]; tool: string } {
    const certOk = hasCert(this.baseDir);
    const doms = certOk ? this.generateVhostsSilent() : [];
    return { enabled: this.httpsEnabled, certCount: certOk ? 1 : 0, domains: doms, tool: certOk ? 'local' : 'none' };
  }
  private generateVhostsSilent(): string[] {
    try {
      const wwwDir = path.join(this.baseDir, 'www');
      if (!fs.existsSync(wwwDir)) return [];
      const out: string[] = [];
      for (const item of fs.readdirSync(wwwDir)) {
        try {
          if (fs.statSync(path.join(wwwDir, item)).isDirectory()) out.push(item + '.test');
        } catch { /* lewati */ }
      }
      return out;
    } catch {
      return [];
    }
  }
  setHttpsEnabled(en: boolean): { ok: boolean; enabled: boolean; needsRestart: boolean; error: string } {
    const wasRunning = this.isRunning;
    if (en) {
      const doms = this.generateVhosts();
      const r = ensureCert(this.baseDir, doms);
      if (!r.ok) {
        this.log('[!] Gagal generate sertifikat. Install mkcert (https://github.com/FiloSottile/mkcert) atau pastikan openssl tersedia.');
        return { ok: false, enabled: this.httpsEnabled, needsRestart: false, error: 'Gagal membuat sertifikat lokal (butuh mkcert/openssl).' };
      }
      this.log('[*] Sertifikat HTTPS siap via ' + r.tool + '.');
    }
    if (wasRunning) this.stopServices();
    this.httpsEnabled = en;
    try {
      const cur = loadSettings(this.baseDir);
      saveSettings(this.baseDir, { phpId: this.activePhpId, httpsEnabled: this.httpsEnabled });
    } catch { /* abaikan */ }
    this.log(en ? '[*] HTTPS AKTIF — vhost akan listen 443 SSL.' : '[*] HTTPS dimatikan — kembali ke HTTP :80.');
    return { ok: true, enabled: this.httpsEnabled, needsRestart: wasRunning, error: '' };
  }
}


