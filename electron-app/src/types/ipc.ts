/**
 * Shared IPC contract — dipakai oleh main, preload, dan renderer.
 * Satu sumber kebenaran untuk channel & payload agar tidak typo string.
 */

export interface ConfirmOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  title?: string;
  message?: string;
  buttons?: string[];
}

export interface OkResult {
  ok: boolean;
}

export interface StartResult extends OkResult {
  error?: string;
}

export interface OpenDbResult extends OkResult {
  msg: string;
}

export interface OpenFolderResult extends OkResult {
  msg: string;
}

export interface ToggleMailResult extends OkResult {
  enabled: boolean;
}

export interface CreateLaravelResult extends OkResult {
  hostsMsg?: string;
}

export interface PhpVersionInfo {
  id: string;
  dir: string;
  exe: string;
  cgi: string;
  composer: string;
  label: string;
  detected: string;
  active: boolean;
}

export interface PhpListResult extends OkResult {
  versions: PhpVersionInfo[];
  activeId: string;
  error?: string;
}

export interface PhpSetResult extends OkResult {
  activeId?: string;
  needsRestart?: boolean;
  error?: string;
}

export interface PhpVersionResult extends OkResult {
  version?: string;
  error?: string;
}

export interface HttpsStatusResult extends OkResult {
  enabled: boolean;
  certCount: number;
  domains: string[];
  tool: string;
  error?: string;
}

export interface HttpsToggleResult extends OkResult {
  enabled: boolean;
  needsRestart?: boolean;
  error?: string;
}

/** API yang di-expose preload ke window.api */
export interface NatsuApi {
  onLog(callback: (msg: string) => void): void;
  startServer(): Promise<StartResult>;
  stopServer(): Promise<OkResult>;
  openWeb(): Promise<OkResult>;
  openDb(): Promise<OpenDbResult>;
  openFolder(): Promise<OpenFolderResult>;
  openTerminal(): Promise<OkResult>;
  shareLive(projectName: string): Promise<OkResult>;
  toggleMail(enabled: boolean): Promise<ToggleMailResult>;
  openMailUi(): Promise<OkResult>;
  createLaravel(projectName: string): Promise<CreateLaravelResult>;
  confirm(opts: ConfirmOptions): Promise<boolean>;
  quitApp(): Promise<OkResult>;
  // Opsi A — PHP switcher + Auto-HTTPS
  listPhpVersions(): Promise<PhpListResult>;
  setPhpVersion(id: string): Promise<PhpSetResult>;
  getPhpVersion(): Promise<PhpVersionResult>;
  getHttpsStatus(): Promise<HttpsStatusResult>;
  setHttpsEnabled(enabled: boolean): Promise<HttpsToggleResult>;
}
