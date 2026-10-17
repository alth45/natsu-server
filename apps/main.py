#!/usr/bin/env python3
"""
main.py — Launcher / Bridge (versi Electron)

GUI sudah di-rewrite dari CustomTkinter/Tkinter ke ELECTRON.
File Tkinter lama dibackup ke: backup/main_tkinter.py.bak

Skrip ini hanya bertugas:
 1. Mengecek apakah Node.js & dependensi Electron terinstal.
 2. Menjalankan aplikasi Electron (electron-app/).
 3. (Opsional) Menjalankan Mail Catcher backend Python sebagai sidecar,
    karena SMTP catcher (aiosmtpd) + UI mail tetap memakai process_manager.py.

Cara pakai:
    python main.py            # menjalankan dashboard Electron
    python main.py --mail     # menjalankan Mail Catcher headless juga (sidecar)
"""
import os
import sys
import subprocess
import shutil
import threading

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELECTRON_DIR = os.path.join(BASE_DIR, "electron-app")


def log(msg):
    print(f"[launcher] {msg}")


def check_node():
    node = shutil.which("node") or shutil.which("node.exe")
    if not node:
        log("ERROR: Node.js tidak ditemukan! Install dari https://nodejs.org")
        return False
    return True


def ensure_dependencies():
    """Jalankan `npm install` sekali jika node_modules belum ada."""
    node_modules = os.path.join(ELECTRON_DIR, "node_modules")
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        log("ERROR: npm tidak ditemukan!")
        return False
    if not os.path.isdir(node_modules):
        log("Menginstal dependensi Electron (npm install)... ini bisa memakan waktu.")
        result = subprocess.run([npm, "install", "--yes"], cwd=ELECTRON_DIR)
        return result.returncode == 0
    return True


def run_mail_catcher_sidecar():
    """Menjalankan Mail Catcher (SMTP 1025 + UI http://127.0.0.1:8025) via backend Python."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from process_manager import ServerManager
        server = ServerManager()
        server.toggle_mail_catcher(True)
        log("Mail Catcher sidecar aktif (SMTP :1025, UI :8025). Tekan Ctrl+C untuk berhenti.")
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        log(f"[!] Gagal menjalankan Mail Catcher sidecar: {e}")


def launch_electron():
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    electron_bin = os.path.join(ELECTRON_DIR, "node_modules", ".bin", "electron")
    log("Meluncurkan GUI Electron...")
    if os.path.exists(electron_bin) or os.path.exists(electron_bin + ".cmd"):
        target = electron_bin if os.path.exists(electron_bin) else electron_bin + ".cmd"
        subprocess.run([target, "."], cwd=ELECTRON_DIR)
    elif npx:
        subprocess.run([npx, "electron", "."], cwd=ELECTRON_DIR)
    else:
        log("ERROR: Electron belum terinstal. Jalankan: cd electron-app && npm install")


if __name__ == "__main__":
    if not check_node():
        sys.exit(1)
    if not ensure_dependencies():
        sys.exit(1)

    if "--mail" in sys.argv:
        t = threading.Thread(target=run_mail_catcher_sidecar, daemon=True)
        t.start()
        log("Mode sidecar Mail Catcher aktif. Menunggu 2 detik sebelum membuka Electron...")
        import time
        time.sleep(2)

    launch_electron()
