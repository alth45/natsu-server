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
}
