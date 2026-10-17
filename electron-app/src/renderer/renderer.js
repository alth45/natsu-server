/**
 * renderer.js — Logika GUI Electron (padanan apps/main.py CustomTkinter)
 * Semua aksi dipanggil lewat window.api (preload bridge).
 */
(() => {
  'use strict';

  // ---------- State ----------
  let isRunning = false;
  let logVisible = true;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const statusLabel = $('status-label');
  const consoleBox = $('console');
  const btnStart = $('btn-start');
  const btnStop = $('btn-stop');
  const btnOpenWeb = $('btn-open-web');
  const btnTools = $('btn-tools');
  const btnWeb = $('btn-web');
  const btnDb = $('btn-db');
  const btnFolder = $('btn-folder');
  const btnTerminal = $('btn-terminal');
  const btnNgrok = $('btn-ngrok');
  const btnLaravel = $('btn-laravel');
  const mailSwitch = $('mail-switch');
  const btnMailUi = $('btn-mail-ui');
  const btnQuit = $('btn-quit');
  const toggleLogBtn = $('toggle-log');
  const ctxMenu = $('context-menu');
  const modalOverlay = $('modal-overlay');
  const modalTitle = $('modal-title');
  const modalText = $('modal-text');
  const modalInput = $('modal-input');
  const modalOk = $('modal-ok');
  const modalCancel = $('modal-cancel');

  // ---------- Helper Log (pengganti redirect stdout) ----------
  // Buffer log: DOM di-flush per animation frame, bukan per baris.
  // Menghindari reflow sinkron & pengulangan scrollHeight pada setiap pesan IPC.
  const MAX_LOG_LINES = 800;           // batas jumlah baris di terminal
  let logBuffer = [];
  let logFlushScheduled = false;
  let logLineCount = 0;
  let autoScroll = true;               // pause saat user scroll ke atas

  const logCard = consoleBox.closest('.log-card');
  const clearLogBtn = $('clear-log');
  const autoscrollBtn = $('autoscroll-toggle');

  // Klasifikasi pesan → aksen warna baris (konsisten dgn server-manager/main.js)
  function classifyLog(msg) {
    if (/error|failed|gagal|traceback|exception/i.test(msg)) return 'error';
    if (/warn|peringatan/i.test(msg)) return 'warn';
    if (/✓|berhasil|started|menjalankan|online/i.test(msg)) return 'success';
    if (/^={3,}|^-{3,}/.test(msg.trim())) return 'dim';
    return '';
  }

  function makeLogLine(msg) {
    const div = document.createElement('div');
    div.className = 'log-line' + (classifyLog(msg) ? ' ' + classifyLog(msg) : '');
    div.textContent = msg;
    return div;
  }

  function flushLog() {
    logFlushScheduled = false;
    if (!logBuffer.length) return;
    // Satu DocumentFragment → satu reflow per frame
    const frag = document.createDocumentFragment();
    for (const line of logBuffer) frag.appendChild(makeLogLine(line));
    logBuffer = [];
    consoleBox.appendChild(frag);
    // Pangkas dari depan secara O(1) (firstChild), bukan slice string
    logLineCount += frag.childNodes.length || 0;
    while (logLineCount > MAX_LOG_LINES && consoleBox.firstChild) {
      consoleBox.removeChild(consoleBox.firstChild);
      logLineCount--;
    }
    if (autoScroll) consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  function print(msg) {
    const text = String(msg).replace(/^\s+|\s+$/g, '');
    if (!text) return;
    // Satu pesan IPC bisa memuat beberapa baris (batch) → pecah dulu
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) logBuffer.push(line);
    }
    if (!logFlushScheduled) {
      logFlushScheduled = true;
      requestAnimationFrame(flushLog);
    }
  }

  function clearConsole() {
    logBuffer = [];
    logLineCount = 0;
    consoleBox.replaceChildren(makeLogLine('\u00A0'));
    logLineCount = 1;
  }

  // Auto-scroll pause/resume: jangan lompat ke bawah jika user membaca log lama
  consoleBox.addEventListener('scroll', () => {
    const atBottom = consoleBox.scrollHeight - consoleBox.scrollTop - consoleBox.clientHeight < 24;
    if (atBottom !== autoScroll) {
      autoScroll = atBottom;
      autoscrollBtn.classList.toggle('off', !autoScroll);
      autoscrollBtn.title = 'Auto-Scroll: ' + (autoScroll ? 'ON' : 'OFF');
    }
  }, { passive: true });

  clearLogBtn.addEventListener('click', clearConsole);
  autoscrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll;
    autoscrollBtn.classList.toggle('off', !autoScroll);
    autoscrollBtn.title = 'Auto-Scroll: ' + (autoScroll ? 'ON' : 'OFF');
    if (autoScroll) consoleBox.scrollTop = consoleBox.scrollHeight;
  });

  // ---------- Animasi Ripple (sentuhan) pada semua tombol ----------
  function attachRipple(el) {
    el.addEventListener('pointerdown', (e) => {
      if (el.disabled) return;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      el.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }
  document.querySelectorAll('.side-btn, .action-btn, .modal-btn').forEach(attachRipple);

  if (window.api && window.api.onLog) {
    window.api.onLog((msg) => print(msg));
  }

  function setStatus(text, cls) {
    statusLabel.querySelector('.status-text').textContent = text;
    statusLabel.className = 'status-pill ' + cls;
    // Indikator "hidup" pada titik terminal saat server online
    if (logCard) logCard.classList.toggle('running', cls === 'online');
  }

  // ---------- Modal Prompt (pengganti CTkInputDialog) ----------
  function promptDialog(title, text, placeholder = '') {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalText.textContent = text;
      modalInput.value = '';
      modalInput.placeholder = placeholder;
      modalOverlay.classList.remove('hidden');
      setTimeout(() => modalInput.focus(), 50);

      const cleanup = (result) => {
        modalOverlay.classList.add('hidden');
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        modalInput.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onOk = () => cleanup(modalInput.value);
      const onCancel = () => cleanup(null);
      const onKey = (e) => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      modalInput.addEventListener('keydown', onKey);
    });
  }

  // ---------- Kontrol Server ----------
  async function startAll() {
    setStatus('MENYALAKAN...', 'starting');
    print('\n--- Inisiasi Proses ---');
    const res = await window.api.startServer();
    if (res.ok) {
      isRunning = true;
      setStatus('ONLINE (80, 3306)', 'online');
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnWeb.disabled = false;
      btnOpenWeb.disabled = false;
      print('\n[+] Sistem Siap Digunakan!');
    } else {
      setStatus('ERROR!', 'error');
      print(`\n[!] GAGAL START: ${res.error}`);
    }
  }

  async function stopAll() {
    setStatus('MEMATIKAN...', 'starting');
    await window.api.stopServer();
    isRunning = false;
    setStatus('OFFLINE', 'offline');
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnWeb.disabled = true;
    btnOpenWeb.disabled = true;
    print('\n[-] Semua Service Telah Dihentikan.');
  }

  btnStart.addEventListener('click', startAll);
  btnStop.addEventListener('click', stopAll);
  btnOpenWeb.addEventListener('click', async () => {
    await window.api.openWeb();
    print('> Browser dibuka.');
  });
  btnTools.addEventListener('click', () => {
    // Munculkan context menu di posisi tombol Quick Tools
    const rect = btnTools.getBoundingClientRect();
    ctxMenu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    ctxMenu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 220) + 'px';
    ctxMenu.classList.remove('hidden');
  });

  // ---------- Sidebar Actions ----------
  btnWeb.addEventListener('click', async () => {
    await window.api.openWeb();
    print('> Browser dibuka.');
  });

  btnDb.addEventListener('click', async () => {
    const res = await window.api.openDb();
    print(res.msg);
  });

  btnFolder.addEventListener('click', async () => {
    const res = await window.api.openFolder();
    print(res.msg || '> Folder "www" dibuka.');
  });

  btnTerminal.addEventListener('click', () => window.api.openTerminal());

  btnNgrok.addEventListener('click', async () => {
    if (!isRunning) {
      print('\n[!] Peringatan: Mohon jalankan server (START) terlebih dahulu sebelum membuka jalur ke internet!');
      return;
    }
    const name = await promptDialog(
      '🌍 Share Live via Ngrok',
      'Masukkan nama folder project yang ingin di-share\n(Contoh: library). Kosongkan jika ingin share default localhost:'
    );
    if (name !== null) {
      window.api.shareLive(name.trim().toLowerCase());
    }
  });

  btnLaravel.addEventListener('click', async () => {
    if (!isRunning) {
      print('\n[!] Peringatan: Mohon jalankan (START) server terlebih dahulu agar sistem bisa otomatis membuat database!');
      return;
    }
    const name = await promptDialog(
      '🚀 Auto-Install Laravel',
      'Masukkan nama project Laravel (Gunakan huruf kecil & tanpa spasi):'
    );
    if (name && name.trim()) {
      const cleanName = name.replace(/ /g, '_').toLowerCase();
      print(`\n> Menyiapkan instalasi Laravel: ${cleanName}...`);
      btnLaravel.disabled = true;
      const res = await window.api.createLaravel(cleanName);
      if (res.ok) {
        print('\n[*] Mendaftarkan domain lokal ke sistem Windows...');
        if (res.hostsMsg) print(res.hostsMsg);
      }
      btnLaravel.disabled = false;
    }
  });

  mailSwitch.addEventListener('change', async () => {
    const enabled = mailSwitch.checked;
    btnMailUi.disabled = !enabled;
    await window.api.toggleMail(enabled);
  });

  btnMailUi.addEventListener('click', () => window.api.openMailUi());

  btnQuit.addEventListener('click', () => {
    print('\n> Menutup aplikasi secara permanen...');
    window.api.quitApp();
  });

  // ---------- Toggle Log (show/hide, animasi collapse) ----------
  function toggleLogVisibility() {
    const wrap = consoleBox.closest('.console-wrap');
    if (logVisible) {
      wrap.classList.add('hidden-log');
      toggleLogBtn.classList.add('collapsed');
      logVisible = false;
    } else {
      wrap.classList.remove('hidden-log');
      toggleLogBtn.classList.remove('collapsed');
      logVisible = true;
      if (autoScroll) consoleBox.scrollTop = consoleBox.scrollHeight;
    }
  }
  toggleLogBtn.addEventListener('click', toggleLogVisibility);

  // ---------- Context Menu (klik kanan) ----------
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
    ctxMenu.classList.remove('hidden');
  });
  document.addEventListener('click', () => ctxMenu.classList.add('hidden'));

  ctxMenu.querySelectorAll('.ctx-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      ctxMenu.classList.add('hidden');
      switch (action) {
        case 'dashboard': print('Dashboard clicked'); break;
        case 'settings': print('Settings clicked'); break;
        case 'toggle-log': toggleLogVisibility(); break;
        case 'about':
          await window.api.confirm({
            type: 'info',
            title: 'About',
            message: 'なつServer v1.0\nModern Development Server\nBuilt with Electron',
          });
          break;
        case 'exit':
          print('\n> Menutup aplikasi secara permanen...');
          window.api.quitApp();
          break;
      }
    });
  });
})();
