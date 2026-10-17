import type { NatsuApi } from '../types/ipc';

declare global {
  interface Window {
    api: NatsuApi;
  }
}

export {};
