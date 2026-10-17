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
  function print(msg) {
    consoleBox.textContent += String(msg) + '\n';
    consoleBox.scrollTop = consoleBox.scrollHeight;
  }

  if (window.api && window.api.onLog) {
    window.api.onLog((msg) => print(msg));
  }

  function setStatus(text, cls) {
    statusLabel.textContent = text;
    statusLabel.className = 'status ' + cls;
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
    setStatus('●  MENYALAKAN...', 'starting');
    print('\n--- Inisiasi Proses ---');
    const res = await window.api.startServer();
    if (res.ok) {
      isRunning = true;
      setStatus('●  ONLINE (80, 3306)', 'online');
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnWeb.disabled = false;
      print('\n[+] Sistem Siap Digunakan!');
    } else {
      setStatus('●  ERROR!', 'error');
      print(`\n[!] GAGAL START: ${res.error}`);
    }
  }

  async function stopAll() {
    setStatus('●  MEMATIKAN...', 'starting');
    await window.api.stopServer();
    isRunning = false;
    setStatus('●  OFFLINE', 'offline');
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnWeb.disabled = true;
    print('\n[-] Semua Service Telah Dihentikan.');
  }

  btnStart.addEventListener('click', startAll);
  btnStop.addEventListener('click', stopAll);

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
    if (enabled) {
      btnMailUi.disabled = false;
      btnMailUi.classList.add('active');
    } else {
      btnMailUi.disabled = true;
      btnMailUi.classList.remove('active');
    }
    await window.api.toggleMail(enabled);
  });

  btnMailUi.addEventListener('click', () => window.api.openMailUi());

  btnQuit.addEventListener('click', () => {
    print('\n> Menutup aplikasi secara permanen...');
    window.api.quitApp();
  });

  // ---------- Toggle Log (show/hide) ----------
  function toggleLogVisibility() {
    if (logVisible) {
      consoleBox.classList.add('hidden-log');
      toggleLogBtn.textContent = '▲';
      logVisible = false;
    } else {
      consoleBox.classList.remove('hidden-log');
      toggleLogBtn.textContent = '▼';
      logVisible = true;
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
