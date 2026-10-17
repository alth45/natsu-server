(() => {
  'use strict';
  let isRunning = false;
  let logVisible = true;
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error('Missing #' + id);
    return el;
  };
  const statusLabel = $('status-label');
  const consoleBox = $('console');
  const btnStart = $('btn-start') as HTMLButtonElement;
  const btnStop = $('btn-stop') as HTMLButtonElement;
  const btnOpenWeb = $('btn-open-web') as HTMLButtonElement;
  const btnTools = $('btn-tools') as HTMLButtonElement;
  const btnWeb = $('btn-web') as HTMLButtonElement;
  const btnDb = $('btn-db') as HTMLButtonElement;
  const btnFolder = $('btn-folder') as HTMLButtonElement;
  const btnTerminal = $('btn-terminal') as HTMLButtonElement;
  const btnNgrok = $('btn-ngrok') as HTMLButtonElement;
  const btnLaravel = $('btn-laravel') as HTMLButtonElement;
  const mailSwitch = $('mail-switch') as HTMLInputElement;
  const btnMailUi = $('btn-mail-ui') as HTMLButtonElement;
  const btnQuit = $('btn-quit') as HTMLButtonElement;
  const toggleLogBtn = $('toggle-log') as HTMLButtonElement;
  const ctxMenu = $('context-menu');
  const modalOverlay = $('modal-overlay');
  const modalTitle = $('modal-title');
  const modalText = $('modal-text');
  const modalInput = $('modal-input') as HTMLInputElement;
  const modalOk = $('modal-ok') as HTMLButtonElement;
  const modalCancel = $('modal-cancel') as HTMLButtonElement;

  const MAX = 800;
  let buf: string[] = [];
  let scheduled = false;
  let count = 0;
  let auto = true;
  const logCard: Element | null = consoleBox.closest('.log-card');
  const clearBtn = $('clear-log') as HTMLButtonElement;
  const autoBtn = $('autoscroll-toggle') as HTMLButtonElement;

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
  if (window.api?.onLog) window.api.onLog((m) => print(m));
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
    setStatus('MENYALAKAN...', 'starting');
    print('\n--- Inisiasi Proses ---');
    const res = await window.api.startServer();
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
  }
  async function stopAll(): Promise<void> {
    setStatus('MEMATIKAN...', 'starting');
    await window.api.stopServer();
    isRunning = false;
    setStatus('OFFLINE', 'offline');
    btnStart.disabled = false; btnStop.disabled = true;
    btnWeb.disabled = true; btnOpenWeb.disabled = true;
    print('\n[-] Semua Service Telah Dihentikan.');
  }
  btnStart.addEventListener('click', () => void startAll());
  btnStop.addEventListener('click', () => void stopAll());
  btnOpenWeb.addEventListener('click', () => {
    void (async () => { await window.api.openWeb(); print('> Browser dibuka.'); })();
  });
  btnTools.addEventListener('click', () => {
    const rect = btnTools.getBoundingClientRect();
    ctxMenu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    ctxMenu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 220) + 'px';
    ctxMenu.classList.remove('hidden');
  });
  btnWeb.addEventListener('click', () => {
    void (async () => { await window.api.openWeb(); print('> Browser dibuka.'); })();
  });
  btnDb.addEventListener('click', () => {
    void (async () => { const r = await window.api.openDb(); print(r.msg); })();
  });
  btnFolder.addEventListener('click', () => {
    void (async () => { const r = await window.api.openFolder(); print(r.msg || '> Folder www dibuka.'); })();
  });
  btnTerminal.addEventListener('click', () => { void window.api.openTerminal(); });
  btnNgrok.addEventListener('click', () => {
    void (async () => {
      if (!isRunning) { print('\n[!] Jalankan START dulu!'); return; }
      const name = await promptDialog('Share Live via Ngrok', 'Nama folder project (kosongkan=default):');
      if (name !== null) void window.api.shareLive(name.trim().toLowerCase());
    })();
  });
  btnLaravel.addEventListener('click', () => {
    void (async () => {
      if (!isRunning) { print('\n[!] Jalankan START dulu agar DB otomatis!'); return; }
      const name = await promptDialog('Auto-Install Laravel', 'Nama project (huruf kecil, tanpa spasi):');
      if (name && name.trim()) {
        const clean = name.replace(/ /g, '_').toLowerCase();
        print('\n> Instalasi Laravel: ' + clean + '...');
        btnLaravel.disabled = true;
        const res = await window.api.createLaravel(clean);
        if (res.ok) {
          print('\n[*] Mendaftarkan domain...');
          if (res.hostsMsg) print(res.hostsMsg);
        }
        btnLaravel.disabled = false;
      }
    })();
  });
  mailSwitch.addEventListener('change', () => {
    void (async () => {
      const en = mailSwitch.checked;
      btnMailUi.disabled = !en;
      await window.api.toggleMail(en);
    })();
  });
  btnMailUi.addEventListener('click', () => { void window.api.openMailUi(); });
  btnQuit.addEventListener('click', () => {
    print('\n> Menutup aplikasi...');
    void window.api.quitApp();
  });
  function toggleLog(): void {
    const wrap = consoleBox.closest('.console-wrap');
    if (!wrap) return;
    if (logVisible) {
      wrap.classList.add('hidden-log');
      toggleLogBtn.classList.add('collapsed');
      logVisible = false;
    } else {
      wrap.classList.remove('hidden-log');
      toggleLogBtn.classList.remove('collapsed');
      logVisible = true;
      if (auto) consoleBox.scrollTop = consoleBox.scrollHeight;
    }
  }
  toggleLogBtn.addEventListener('click', toggleLog);
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
    ctxMenu.classList.remove('hidden');
  });
  document.addEventListener('click', () => ctxMenu.classList.add('hidden'));
  ctxMenu.querySelectorAll('.ctx-item').forEach((item) => {
    item.addEventListener('click', () => {
      void (async () => {
        const action = (item as HTMLElement).dataset.action;
        ctxMenu.classList.add('hidden');
        if (action === 'toggle-log') toggleLog();
        else if (action === 'about') {
          await window.api.confirm({ type: 'info', title: 'About', message: 'natsuServer v1.0\nModern Dev Server\nBuilt with Electron' });
        } else if (action === 'exit') {
          print('\n> Menutup aplikasi...');
          void window.api.quitApp();
        } else if (action === 'dashboard' || action === 'settings') {
          print(action + ' clicked');
        }
      })();
    });
  });
})();

