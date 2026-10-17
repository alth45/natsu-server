(() => {
  'use strict';

  // ---- Tipe window.api didefinisikan lokal (tanpa import) ----
  // tsconfig.renderer.json memakai module:none agar outputnya script
  // browser biasa (tanpa exports/require). Jadi tidak boleh ada
  // `import`/`export` di file ini.
  interface ConfirmOptions {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    title?: string;
    message?: string;
    buttons?: string[];
  }
  interface NatsuApi {
    onLog(cb: (msg: string) => void): void;
    startServer(): Promise<{ ok: boolean; error?: string }>;
    stopServer(): Promise<{ ok: boolean }>;
    openWeb(): Promise<{ ok: boolean }>;
    openDb(): Promise<{ ok: boolean; msg: string }>;
    openFolder(): Promise<{ ok: boolean; msg: string }>;
    openTerminal(): Promise<{ ok: boolean }>;
    shareLive(p: string): Promise<{ ok: boolean }>;
    toggleMail(e: boolean): Promise<{ ok: boolean; enabled: boolean }>;
    openMailUi(): Promise<{ ok: boolean }>;
    createLaravel(p: string): Promise<{ ok: boolean; hostsMsg?: string }>;
    confirm(o: ConfirmOptions): Promise<boolean>;
    quitApp(): Promise<{ ok: boolean }>;
    listPhpVersions(): Promise<{ ok: boolean; versions: { id: string; label: string; dir: string; detected: string }[]; activeId: string; error?: string }>;
    setPhpVersion(id: string): Promise<{ ok: boolean; activeId?: string; needsRestart?: boolean; error?: string }>;
    getPhpVersion(): Promise<{ ok: boolean; version?: string; error?: string }>;
    getHttpsStatus(): Promise<{ ok: boolean; enabled: boolean; certCount: number; error?: string }>;
    setHttpsEnabled(e: boolean): Promise<{ ok: boolean; enabled: boolean; needsRestart?: boolean; error?: string }>;
  }
  // window.api di-inject via preload contextBridge. Tidak pakai `declare`
  // karena modifier itu tidak boleh di dalam IIFE (TS1184).
  const api: NatsuApi | undefined = (window as unknown as { api?: NatsuApi }).api;

  let isRunning = false;
  let logVisible = true;
  const $ = (id: string): HTMLElement | null => document.getElementById(id);
  const $req = (id: string): HTMLElement => {
    const el = $(id);
    if (!el) throw new Error('Missing #' + id);
    return el;
  };
  const statusLabel = $req('status-label');
  const consoleBox = $req('console');
  const btnStart = $req('btn-start') as HTMLButtonElement;
  const btnStop = $req('btn-stop') as HTMLButtonElement;
  const btnOpenWeb = $req('btn-open-web') as HTMLButtonElement;
  const btnTools = $req('btn-tools') as HTMLButtonElement;
  const btnWeb = $req('btn-web') as HTMLButtonElement;
  const btnDb = $req('btn-db') as HTMLButtonElement;
  const btnFolder = $req('btn-folder') as HTMLButtonElement;
  const btnTerminal = $req('btn-terminal') as HTMLButtonElement;
  const btnNgrok = $req('btn-ngrok') as HTMLButtonElement;
  const btnLaravel = $req('btn-laravel') as HTMLButtonElement;
  const mailSwitch = $req('mail-switch') as HTMLInputElement;
  const btnMailUi = $req('btn-mail-ui') as HTMLButtonElement;
  const btnQuit = $req('btn-quit') as HTMLButtonElement;
  // Opsi A — PHP switcher + HTTPS (opsional: jangan matikan seluruh UI bila absen)
  const phpSelect = $('php-select') as HTMLSelectElement | null;
  const phpRefresh = $('php-refresh') as HTMLButtonElement | null;
  const phpHint = $('php-hint');
  const httpsSwitch = $('https-switch') as HTMLInputElement | null;
  const httpsHint = $('https-hint');
  const startHint = $('start-hint');
  const toggleLogBtn = $req('toggle-log') as HTMLButtonElement;
  const ctxMenu = $req('context-menu');
  const modalOverlay = $req('modal-overlay');
  const modalTitle = $req('modal-title');
  const modalText = $req('modal-text');
  const modalInput = $req('modal-input') as HTMLInputElement;
  const modalOk = $req('modal-ok') as HTMLButtonElement;
  const modalCancel = $req('modal-cancel') as HTMLButtonElement;

  const MAX = 800;
  let buf: string[] = [];
  let scheduled = false;
  let count = 0;
  let auto = true;
  const logCard: Element | null = consoleBox.closest('.log-card');
  const clearBtn = $req('clear-log') as HTMLButtonElement;
  const autoBtn = $req('autoscroll-toggle') as HTMLButtonElement;

  type LogKind = 'error' | 'warn' | 'success' | 'dim' | '';
  function classify(msg: string): LogKind {
    if (/error|failed|gagal|traceback|exception/i.test(msg)) return 'error';
    if (/warn|peringatan/i.test(msg)) return 'warn';
    if (/\u2713|berhasil|started|menjalankan|online/i.test(msg)) return 'success';
    if (/^={3,}|^-{3,}/.test(msg.trim())) return 'dim';
    return '';
  }
  function line(msg: string): HTMLDivElement {
    const d = document.createElement('div');
    const k = classify(msg);
    d.className = 'log-line' + (k ? ' ' + k : '');
    d.textContent = msg;
    return d;
  }
  function flush(): void {
    scheduled = false;
    if (!buf.length) return;
    const frag = document.createDocumentFragment();
    for (const l of buf) frag.appendChild(line(l));
    buf = [];
    consoleBox.appendChild(frag);
    count += frag.childNodes.length || 0;
    while (count > MAX && consoleBox.firstChild) { consoleBox.removeChild(consoleBox.firstChild); count--; }
    if (auto) consoleBox.scrollTop = consoleBox.scrollHeight;
  }
  function print(msg: unknown): void {
    const text = String(msg).replace(/^\s+|\s+$/g, '');
    if (!text) return;
    for (const l of text.split(/\r?\n/)) { if (l.trim()) buf.push(l); }
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  }
  function clearConsole(): void {
    buf = []; count = 0;
    consoleBox.replaceChildren(line('\u00A0'));
    count = 1;
  }
  consoleBox.addEventListener('scroll', () => {
    const atBottom = consoleBox.scrollHeight - consoleBox.scrollTop - consoleBox.clientHeight < 24;
    if (atBottom !== auto) {
      auto = atBottom;
      autoBtn.classList.toggle('off', !auto);
      autoBtn.title = 'Auto-Scroll: ' + (auto ? 'ON' : 'OFF');
    }
  }, { passive: true });
  clearBtn.addEventListener('click', clearConsole);
  autoBtn.addEventListener('click', () => {
    auto = !auto;
    autoBtn.classList.toggle('off', !auto);
    autoBtn.title = 'Auto-Scroll: ' + (auto ? 'ON' : 'OFF');
    if (auto) consoleBox.scrollTop = consoleBox.scrollHeight;
  });
  function attachRipple(el: Element): void {
    el.addEventListener('pointerdown', (ev) => {
      // Jangan ganggu tombol kecil header log (toggle/show-hide, clear, autoscroll):
      // mereka butuh click bersih tanpa span tambahan.
      if ((el as HTMLElement).closest('.log-actions')) return;
      const e = ev as PointerEvent;
      const btn = el as HTMLButtonElement;
      if (btn.disabled) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const r = document.createElement('span');
      r.className = 'ripple';
      r.style.width = r.style.height = size + 'px';
      r.style.left = (e.clientX - rect.left - size / 2) + 'px';
      r.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(r);
      r.addEventListener('animationend', () => r.remove());
    });
  }
  document.querySelectorAll('.side-btn, .action-btn, .modal-btn').forEach(attachRipple);
  function needApi(): NatsuApi | null {
    if (!api) {
      print('\n[!] Bridge preload belum siap (window.api kosong). Rebuild + restart Electron.');
      return null;
    }
    return api;
  }
  if (api?.onLog) api.onLog((m) => print(m));
  function setStatus(text: string, cls: string): void {
    const t = statusLabel.querySelector('.status-text');
    if (t) t.textContent = text;
    statusLabel.className = 'status-pill ' + cls;
    if (logCard) logCard.classList.toggle('running', cls === 'online');
  }
  function promptDialog(title: string, text: string, placeholder = ''): Promise<string | null> {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalText.textContent = text;
      modalInput.value = '';
      modalInput.placeholder = placeholder;
      modalOverlay.classList.remove('hidden');
      setTimeout(() => modalInput.focus(), 50);
      const cleanup = (r: string | null): void => {
        modalOverlay.classList.add('hidden');
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        modalInput.removeEventListener('keydown', onKey);
        resolve(r);
      };
      const onOk = (): void => cleanup(modalInput.value);
      const onCancel = (): void => cleanup(null);
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      modalInput.addEventListener('keydown', onKey);
    });
  }
  async function startAll(): Promise<void> {
    const a = needApi();
    if (!a) return;
    setStatus('MENYALAKAN...', 'starting');
    print('\n--- Inisiasi Proses ---');
    try {
      const res = await a.startServer();
      if (res.ok) {
        isRunning = true;
        setStatus('ONLINE (80, 3306)', 'online');
        btnStart.disabled = true; btnStop.disabled = false;
        btnWeb.disabled = false; btnOpenWeb.disabled = false;
        print('\n[+] Sistem Siap Digunakan!');
      } else {
        setStatus('ERROR!', 'error');
        print('\n[!] GAGAL START: ' + res.error);
      }
    } catch (e) {
      setStatus('ERROR!', 'error');
      print('\n[!] GAGAL START: ' + String(e));
    }
  }
  async function stopAll(): Promise<void> {
    const a = needApi();
    if (!a) return;
    setStatus('MEMATIKAN...', 'starting');
    try {
      await a.stopServer();
    } catch (e) {
      print('\n[!] Gagal stop: ' + String(e));
    }
    isRunning = false;
    setStatus('OFFLINE', 'offline');
    btnStart.disabled = false; btnStop.disabled = true;
    btnWeb.disabled = true; btnOpenWeb.disabled = true;
    print('\n[-] Semua Service Telah Dihentikan.');
  }
  btnStart.addEventListener('click', () => void startAll());
  btnStop.addEventListener('click', () => void stopAll());
  btnOpenWeb.addEventListener('click', () => {
    void (async () => { const a = needApi(); if (!a) return; try { await a.openWeb(); print('> Browser dibuka.'); } catch (e) { print('[!] ' + String(e)); } })();
  });
  btnTools.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = btnTools.getBoundingClientRect();
    ctxMenu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    ctxMenu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 220) + 'px';
    ctxMenu.classList.remove('hidden');
  });
  btnWeb.addEventListener('click', () => {
    void (async () => { const a = needApi(); if (!a) return; try { await a.openWeb(); print('> Browser dibuka.'); } catch (e) { print('[!] ' + String(e)); } })();
  });
  btnDb.addEventListener('click', () => {
    void (async () => { const a = needApi(); if (!a) return; try { const r = await a.openDb(); print(r.msg); } catch (e) { print('[!] ' + String(e)); } })();
  });
  btnFolder.addEventListener('click', () => {
    void (async () => { const a = needApi(); if (!a) return; try { const r = await a.openFolder(); print(r.msg || '> Folder www dibuka.'); } catch (e) { print('[!] ' + String(e)); } })();
  });
  btnTerminal.addEventListener('click', () => { const a = needApi(); if (!a) return; void a.openTerminal().catch((e) => print('[!] ' + String(e))); });
  btnNgrok.addEventListener('click', () => {
    void (async () => {
      const a = needApi();
      if (!a) return;
      if (!isRunning) { print('\n[!] Jalankan START dulu!'); return; }
      const name = await promptDialog('Share Live via Ngrok', 'Nama folder project (kosongkan=default):');
      if (name !== null) void a.shareLive(name.trim().toLowerCase());
    })();
  });
  btnLaravel.addEventListener('click', () => {
    void (async () => {
      const a = needApi();
      if (!a) return;
      if (!isRunning) { print('\n[!] Jalankan START dulu agar DB otomatis!'); return; }
      const name = await promptDialog('Auto-Install Laravel', 'Nama project (huruf kecil, tanpa spasi):');
      if (name && name.trim()) {
        const clean = name.replace(/ /g, '_').toLowerCase();
        print('\n> Instalasi Laravel: ' + clean + '...');
        btnLaravel.disabled = true;
        try {
          const res = await a.createLaravel(clean);
          if (res.ok) {
            print('\n[*] Mendaftarkan domain...');
            if (res.hostsMsg) print(res.hostsMsg);
          }
        } catch (e) { print('[!] ' + String(e)); }
        btnLaravel.disabled = false;
      }
    })();
  });
  mailSwitch.addEventListener('change', () => {
    void (async () => {
      const a = needApi();
      if (!a) { mailSwitch.checked = !mailSwitch.checked; return; }
      const en = mailSwitch.checked;
      btnMailUi.disabled = !en;
      try {
        await a.toggleMail(en);
      } catch (e) { print('[!] ' + String(e)); }
    })();
  });
  // ---------- Opsi A: PHP switcher + HTTPS ----------
  // Seluruh blok ini defensif: bila elemen absen (HTML lama), lewati tanpa
  // melempar agar handler toggle-log & context-menu di bawah tetap terpasang.
  let envLoading = false;
  let activePhpId = '';
  let httpsOn = false;
  function refreshStartHint(): void {
    if (!startHint) return;
    const parts: string[] = ['Jalankan semua service'];
    if (activePhpId) parts[0] = 'PHP ' + activePhpId.replace(/^php/i, '') + ' • Jalankan service';
    startHint.textContent = (httpsOn ? 'HTTP+HTTPS • ' : '') + parts[0];
  }
  async function loadPhpList(spin = false): Promise<void> {
    if (!phpSelect || !phpRefresh) return;
    const a = needApi();
    if (!a) return;
    if (envLoading) return;
    envLoading = true;
    phpSelect.disabled = true;
    phpRefresh.disabled = true;
    if (spin) phpRefresh.classList.add('spinning');
    try {
      const r = await a.listPhpVersions();
      phpSelect.replaceChildren();
      if (!r.ok || !r.versions.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = r.error ? 'Gagal: ' + r.error : 'Tidak ada PHP di bin/';
        phpSelect.appendChild(o);
        if (phpHint) {
          phpHint.textContent = 'Tambah folder bin/phpXX berisi php.exe + php-cgi.exe';
          phpHint.className = 'env-hint warn';
        }
        return;
      }
      activePhpId = r.activeId;
      for (const v of r.versions) {
        const o = document.createElement('option');
        o.value = v.id;
        o.textContent = v.label + (v.detected ? '  (v' + v.detected + ')' : '');
        if (v.id === r.activeId) o.selected = true;
        phpSelect.appendChild(o);
      }
      const hit = r.versions.find((v) => v.id === r.activeId);
      if (phpHint) {
        phpHint.textContent = hit ? hit.dir : '';
        phpHint.className = 'env-hint ok';
        phpHint.title = hit?.dir ?? '';
      }
      // Tampilkan versi runtime juga
      void a.getPhpVersion().then((vr) => {
        if (vr.ok && vr.version && hit && phpHint) phpHint.textContent = hit.label + ' v' + vr.version;
      }).catch(() => undefined);
    } catch (e) {
      print('\n[!] Gagal load PHP: ' + String(e));
    } finally {
      phpSelect.disabled = false;
      phpRefresh.disabled = false;
      phpRefresh.classList.remove('spinning');
      envLoading = false;
      refreshStartHint();
    }
  }
  async function loadHttpsStatus(): Promise<void> {
    if (!httpsSwitch) {
      refreshStartHint();
      return;
    }
    const a = needApi();
    if (!a) return;
    try {
      const s = await a.getHttpsStatus();
      httpsOn = s.enabled;
      httpsSwitch.checked = s.enabled;
      if (httpsHint) {
        if (s.enabled) {
          httpsHint.textContent = s.certCount ? 'HTTPS ON • https://*.test :443' : 'HTTPS ON • sertifikat belum ada!';
          httpsHint.className = 'env-hint ' + (s.certCount ? 'ok' : 'warn');
        } else {
          httpsHint.textContent = 'HTTP :80';
          httpsHint.className = 'env-hint';
        }
      }
    } catch (e) {
      print('\n[!] Gagal cek HTTPS: ' + String(e));
    } finally {
      refreshStartHint();
    }
  }
  phpSelect?.addEventListener('change', () => {
    if (!phpSelect) return;
    const a = needApi();
    if (!a) return;
    const sel = phpSelect;
    void (async () => {
      const id = sel.value;
      if (!id || id === activePhpId) return;
      const prev = activePhpId;
      print('\n[*] Ganti PHP ke ' + id + '...');
      sel.disabled = true;
      try {
        const r = await a.setPhpVersion(id);
        if (r.ok && r.activeId) {
          activePhpId = r.activeId;
          print('[+] PHP aktif: ' + r.activeId + (r.needsRestart ? ' (service sempat di-restart otomatis)' : ''));
          if (r.needsRestart && isRunning) {
            isRunning = false;
            setStatus('OFFLINE', 'offline');
            btnStart.disabled = false; btnStop.disabled = true;
            btnWeb.disabled = true; btnOpenWeb.disabled = true;
            print('[*] Server dihentikan otomatis — klik START untuk jalan dengan ' + r.activeId + '.');
          }
          await loadPhpList();
        } else {
          print('\n[!] Gagal ganti PHP: ' + (r.error ?? 'unknown'));
          sel.value = prev;
        }
      } catch (e) {
        print('\n[!] Gagal ganti PHP: ' + String(e));
        sel.value = prev;
      } finally {
        sel.disabled = false;
      }
    })();
  });
  phpRefresh?.addEventListener('click', () => { void loadPhpList(true); });
  httpsSwitch?.addEventListener('change', () => {
    if (!httpsSwitch) return;
    const a = needApi();
    if (!a) { httpsSwitch.checked = httpsOn; return; }
    const sw = httpsSwitch;
    void (async () => {
      const en = sw.checked;
      sw.disabled = true;
      print(en ? '\n[*] Mengaktifkan HTTPS (generate sertifikat bila perlu)...' : '\n[*] Menonaktifkan HTTPS...');
      try {
        const r = await a.setHttpsEnabled(en);
        if (r.ok) {
          httpsOn = r.enabled;
          sw.checked = r.enabled;
          print(r.enabled ? '[+] HTTPS AKTIF — akses via https://namaproject.test' : '[*] Kembali ke http://namaproject.test');
          if (r.needsRestart && isRunning) {
            isRunning = false;
            setStatus('OFFLINE', 'offline');
            btnStart.disabled = false; btnStop.disabled = true;
            btnWeb.disabled = true; btnOpenWeb.disabled = true;
            print('[*] Server dihentikan otomatis — klik START agar config SSL termuat.');
          }
          await loadHttpsStatus();
        } else {
          print('\n[!] Gagal HTTPS: ' + (r.error ?? 'butuh mkcert/openssl'));
          sw.checked = httpsOn;
        }
      } catch (e) {
        print('\n[!] Gagal HTTPS: ' + String(e));
        sw.checked = httpsOn;
      } finally {
        sw.disabled = false;
      }
    })();
  });
  void loadPhpList();
  void loadHttpsStatus();
  btnMailUi.addEventListener('click', () => { const a = needApi(); if (!a) return; void a.openMailUi().catch((e) => print('[!] ' + String(e))); });
  btnQuit.addEventListener('click', () => {
    print('\n> Menutup aplikasi...');
    const a = needApi();
    if (!a) return;
    void a.quitApp().catch((e) => print('[!] ' + String(e)));
  });
  function toggleLog(): void {
    const wrap = document.querySelector('.console-wrap');
    const card = document.querySelector('.log-card');
    if (!wrap) {
      print('[!] .console-wrap tidak ditemukan.');
      return;
    }
    if (logVisible) {
      wrap.classList.add('hidden-log');
      if (card) card.classList.add('log-collapsed');
      toggleLogBtn.classList.add('collapsed');
      toggleLogBtn.title = 'Tampilkan Log';
      logVisible = false;
    } else {
      wrap.classList.remove('hidden-log');
      if (card) card.classList.remove('log-collapsed');
      toggleLogBtn.classList.remove('collapsed');
      toggleLogBtn.title = 'Sembunyikan Log';
      logVisible = true;
      if (auto) consoleBox.scrollTop = consoleBox.scrollHeight;
    }
  }
  toggleLogBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLog();
  });
  // Klik kanan: tampilkan menu kustom. Hentikan propagasi agar handler
  // document click di bawah tidak langsung menutupnya kembali.
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
    ctxMenu.classList.remove('hidden');
  });
  // Klik kiri di mana saja menutup menu — kecuali klik di dalam menu itu sendiri.
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && ctxMenu.contains(t)) return;
    if (!ctxMenu.classList.contains('hidden')) ctxMenu.classList.add('hidden');
  });
  ctxMenu.addEventListener('click', (e) => e.stopPropagation());
  ctxMenu.querySelectorAll('.ctx-item').forEach((item) => {
    item.addEventListener('click', () => {
      void (async () => {
        const action = (item as HTMLElement).dataset.action;
        ctxMenu.classList.add('hidden');
        if (action === 'toggle-log') toggleLog();
        else if (action === 'about') {
          const a = needApi();
          if (!a) return;
          try {
            await a.confirm({ type: 'info', title: 'About', message: 'natsuServer v1.0\nModern Dev Server\nBuilt with Electron' });
          } catch (e) { print('[!] ' + String(e)); }
        } else if (action === 'exit') {
          print('\n> Menutup aplikasi...');
          const a = needApi();
          if (!a) return;
          void a.quitApp().catch((e) => print('[!] ' + String(e)));
        } else if (action === 'dashboard' || action === 'settings') {
          print(action + ' clicked');
        }
      })();
    });
  });
})();

