import * as path from 'path';
import * as fs from 'fs';
import { spawnSync, execFileSync } from 'child_process';
import type { PhpVersionInfo } from '../types/ipc';

const SETTINGS_FILE = 'natsu-settings.json';
const DEFAULT_PHP_ID = 'php';

export interface NatsuSettings {
  phpId: string;
  httpsEnabled: boolean;
}

export function settingsPath(baseDir: string): string {
  return path.join(baseDir, 'config', SETTINGS_FILE);
}

export function loadSettings(baseDir: string): NatsuSettings {
  const fallback: NatsuSettings = { phpId: DEFAULT_PHP_ID, httpsEnabled: false };
  try {
    const p = settingsPath(baseDir);
    if (!fs.existsSync(p)) return fallback;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8') as string) as Partial<NatsuSettings>;
    return {
      phpId: typeof raw.phpId === 'string' && raw.phpId ? raw.phpId : fallback.phpId,
      httpsEnabled: raw.httpsEnabled === true,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(baseDir: string, s: NatsuSettings): void {
  fs.mkdirSync(path.join(baseDir, 'config'), { recursive: true });
  fs.writeFileSync(settingsPath(baseDir), JSON.stringify(s, null, 2));
}

function labelFor(id: string): string {
  const m = id.match(/(\d)(\d+)/);
  if (m) return 'PHP ' + m[1] + '.' + m[2];
  if (/^php$/i.test(id)) return 'PHP (default)';
  return id;
}

function detectVersion(exe: string): string {
  try {
    const out = execFileSync(exe, ['-v'], { windowsHide: true, timeout: 5000 }).toString();
    const m = out.match(/PHP\s+(\d+\.\d+\.\d+[^\s]*)/i);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/** Scan bin/php* — dukung layout lama bin/php maupun bin/php81, bin/php82, ... */
export function scanPhpVersions(baseDir: string, activeId: string): PhpVersionInfo[] {
  const binDir = path.join(baseDir, 'bin');
  const out: PhpVersionInfo[] = [];
  if (!fs.existsSync(binDir)) return out;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(binDir);
  } catch {
    return out;
  }
  const cands = entries
    .filter((n) => /^php/i.test(n))
    .filter((n) => {
      try {
        return fs.statSync(path.join(binDir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b));
  for (const name of cands) {
    const dir = path.join(binDir, name);
    const exe = path.join(dir, 'php.exe');
    const cgi = path.join(dir, 'php-cgi.exe');
    if (!fs.existsSync(exe) || !fs.existsSync(cgi)) continue;
    const composer = path.join(dir, 'composer.phar');
    out.push({
      id: name,
      dir,
      exe,
      cgi,
      composer,
      label: labelFor(name),
      detected: detectVersion(exe),
      active: name === activeId,
    });
  }
  // Pastikan selalu ada minimal 1 entri (layout lama bin/php)
  if (!out.length) {
    const dir = path.join(binDir, 'php');
    out.push({
      id: DEFAULT_PHP_ID,
      dir,
      exe: path.join(dir, 'php.exe'),
      cgi: path.join(dir, 'php-cgi.exe'),
      composer: path.join(dir, 'composer.phar'),
      label: 'PHP (default)',
      detected: '',
      active: true,
    });
  }
  return out;
}

/** Ambil info PHP aktif; fallback ke entri default bila settings menunjuk folder hilang. */
export function resolveActivePhp(baseDir: string, settings: NatsuSettings): PhpVersionInfo {
  const list = scanPhpVersions(baseDir, settings.phpId);
  const hit = list.find((v) => v.id === settings.phpId);
  if (hit) return hit;
  const first = list[0];
  if (first) return { ...first, active: true };
  const dir = path.join(baseDir, 'bin', 'php');
  return {
    id: DEFAULT_PHP_ID,
    dir,
    exe: path.join(dir, 'php.exe'),
    cgi: path.join(dir, 'php-cgi.exe'),
    composer: path.join(dir, 'composer.phar'),
    label: 'PHP (default)',
    detected: '',
    active: true,
  };
}

export function quickPhpVersion(exe: string): string {
  return detectVersion(exe);
}

export function phpVersionSync(exe: string): { ok: boolean; version: string } {
  try {
    const r = spawnSync(exe, ['-v'], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
    const out = String(r.stdout ?? '');
    const m = out.match(/PHP\s+(\d+\.\d+\.\d+[^\s]*)/i);
    if (m) return { ok: true, version: m[1] };
    return { ok: false, version: '' };
  } catch {
    return { ok: false, version: '' };
  }
}
