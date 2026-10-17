import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

export const HTTPS_PORT = 443;
export const CERT_DIRNAME = 'certs';

export function certDir(baseDir: string): string {
  return path.join(baseDir, 'config', CERT_DIRNAME);
}

export function certPaths(baseDir: string): { dir: string; key: string; crt: string } {
  const dir = certDir(baseDir);
  return { dir, key: path.join(dir, 'natsu.key'), crt: path.join(dir, 'natsu.crt') };
}

export function hasCert(baseDir: string): boolean {
  const { key, crt } = certPaths(baseDir);
  try {
    return fs.existsSync(key) && fs.existsSync(crt) && fs.statSync(key).size > 0 && fs.statSync(crt).size > 0;
  } catch {
    return false;
  }
}

function tryMkcert(baseDir: string): boolean {
  try {
    const { crt, key } = certPaths(baseDir);
    fs.mkdirSync(certDir(baseDir), { recursive: true });
    // mkcert -install (sekali saja, butuh admin) lalu generate wildcard lokal
    spawnSync('mkcert', ['-install'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
    const r = spawnSync(
      'mkcert',
      ['-key-file', key, '-cert-file', crt, 'localhost', '127.0.0.1', '::1', '*.test'],
      { windowsHide: true, timeout: 30000, encoding: 'utf8' }
    );
    return r.status === 0 && hasCert(baseDir);
  } catch {
    return false;
  }
}

function tryOpenssl(baseDir: string, domains: string[]): boolean {
  try {
    const { crt, key, dir } = certPaths(baseDir);
    fs.mkdirSync(dir, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', 'DNS:*.test', ...domains.map((d) => 'DNS:' + d)].join(',');
    // Self-signed 10 tahun via openssl; butuh openssl di PATH atau bin/openssl/
    const tryBins = ['openssl', path.join(baseDir, 'bin', 'openssl', 'openssl.exe')];
    const cfg = '[req]\ndistinguished_name=dn\nreq_extensions=ext\n[dn]\n[ext]\nsubjectAltName=' + san + '\n';
    const cfgPath = path.join(dir, 'openssl-san.cnf');
    fs.writeFileSync(cfgPath, cfg);
    for (const bin of tryBins) {
      try {
        const r = spawnSync(
          bin,
          ['req', '-x509', '-nodes', '-days', '3650', '-newkey', 'rsa:2048', '-keyout', key, '-out', crt, '-subj', '/CN=natsuServer Local', '-config', cfgPath],
          { windowsHide: true, timeout: 30000, encoding: 'utf8' }
        );
        if (r.status === 0 && hasCert(baseDir)) {
          try {
            fs.unlinkSync(cfgPath);
          } catch {
            /* biarkan */
          }
          return true;
        }
      } catch {
        /* coba binary berikutnya */
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Generate sertifikat lokal.
 * Urutan: mkcert (trusted, butuh install sekali) -> openssl (self-signed).
 * Return: { ok, tool } — tool = 'mkcert' | 'openssl' | 'none'.
 */
export function ensureCert(baseDir: string, domains: string[]): { ok: boolean; tool: string } {
  if (hasCert(baseDir)) return { ok: true, tool: 'existing' };
  if (tryMkcert(baseDir)) return { ok: true, tool: 'mkcert' };
  if (tryOpenssl(baseDir, domains)) return { ok: true, tool: 'openssl' };
  return { ok: false, tool: 'none' };
}

/** Blok SSL yang di-inject ke tiap vhost + server localhost bila HTTPS aktif. */
export function sslBlockForVhost(baseDir: string): string {
  const { crt, key } = certPaths(baseDir);
  const c = crt.replace(/\\/g, '/');
  const k = key.replace(/\\/g, '/');
  return `\n    listen ${HTTPS_PORT} ssl;\n    ssl_certificate "${c}";\n    ssl_certificate_key "${k}";\n`;
}

export function sslBlockForLocalhost(baseDir: string): string {
  const { crt, key } = certPaths(baseDir);
  const c = crt.replace(/\\/g, '/');
  const k = key.replace(/\\/g, '/');
  return `\n        listen ${HTTPS_PORT} ssl;\n        ssl_certificate "${c}";\n        ssl_certificate_key "${k}";\n`;
}
