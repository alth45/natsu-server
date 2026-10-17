import os
import subprocess
import time
import socket
import sys
import threading
import json
import itertools
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from email import message_from_bytes
from email.header import decode_header
from aiosmtpd.controller import Controller
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime
from http.server import ThreadingHTTPServer   
import mimetypes


# ==========================================
# DATA & LOGIKA MAIL CATCHER (TERTANAM)
# ==========================================
# EMAILS_DB dibatasi ukurannya (deque) agar penggunaan memori tetap konstan
# dan insert di posisi teratas berjalan O(1), bukan O(n) seperti list biasa.
MAX_EMAILS = 200
EMAILS_DB = deque(maxlen=MAX_EMAILS)
EMAIL_ID_COUNTER = itertools.count(1)   # id unik monotonik, bebas tabrakan
DB_LOCK = threading.Lock()              # aman untuk akses lintas thread (SMTP vs HTTP)

def get_decoded_header(header_value):
    """Membaca subjek email yang di-encode atau mengandung emoji"""
    if not header_value: return ""
    decoded = decode_header(header_value)
    parts = []
    for text, charset in decoded:
        if isinstance(text, bytes):
            parts.append(text.decode(charset or 'utf-8', errors='ignore'))
        else:
            parts.append(text)
    return "".join(parts)



class SmtpHandler:
    """Mesin penangkap SMTP yang berjalan native di Python"""
    async def handle_DATA(self, server, session, envelope):
        msg = message_from_bytes(envelope.content)
        subject = get_decoded_header(msg.get('subject', ''))
        body_text = ""
        body_html = ""
        
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                payload = None
                if content_type == 'text/plain':
                    payload = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    body_text = payload
                elif content_type == 'text/html':
                    payload = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    body_html = payload
                if payload is not None:
                    # Tidak perlu lanjut memindai jika kedua versi sudah lengkap
                    if body_text and body_html:
                        break
        else:
            body_text = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
            
        email_data = {
            "id": next(EMAIL_ID_COUNTER),
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "from": envelope.mail_from,
            "to": ", ".join(envelope.rcpt_tos),
            "subject": subject,
            "text": body_text,
            "html": body_html
        }
        with DB_LOCK:
            EMAILS_DB.appendleft(email_data)  # Taruh di paling atas (O(1))
            total = len(EMAILS_DB)
        print(f"> [Mail Catcher] Masuk: {email_data['from']} | Subjek: {subject} | Total: {total}")
        sys.stdout.flush()
        return '250 OK'

# Template HTML Tertanam Langsung di String Python (Tidak butuh file .html)
# Tambahkan di atas class WebApiHandler
HTML_UI_CACHE = None

def load_html_ui():
    global HTML_UI_CACHE
    if HTML_UI_CACHE is None:
        # Sesuaikan path dengan lokasi file mail_ui.html
        html_path = os.path.join(os.path.dirname(__file__), './ui/mail_ui.html')
        if os.path.exists(html_path):
            with open(html_path, 'r', encoding='utf-8') as f:
                HTML_UI_CACHE = f.read()
        else:
            # fallback jika file tidak ditemukan
            HTML_UI_CACHE = "<h1>File mail_ui.html tidak ditemukan</h1>"
    return HTML_UI_CACHE

class WebApiHandler(BaseHTTPRequestHandler):
    # Cache level-kelas: hasil serialisasi & isi file statis cukup dibaca sekali.
    _emails_cache = (None, None)      # (versi_db, payload_bytes)
    _static_cache = {}                # path -> (mtime, full_response_bytes)

    # Logging per-request dinonaktifkan agar tidak memblokir/membanjiri stdout
    def log_message(self, format, *args):
        pass

    def _send_cached(self, payload, content_type):
        """Kirim respons lengkap (header + body) dari cache tanpa re-serialisasi."""
        self.send_response(200)
        self.send_header('Content-type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        try:
            # API endpoint — di-cache; hanya diserialisasi ulang saat EMAILS_DB berubah
            if self.path == '/api/emails':
                with DB_LOCK:
                    version = len(EMAILS_DB)
                    cached_ver, cached_payload = WebApiHandler._emails_cache
                    if cached_ver != version:
                        cached_payload = json.dumps(list(EMAILS_DB)).encode('utf-8')
                        WebApiHandler._emails_cache = (version, cached_payload)
                self._send_cached(cached_payload, 'application/json')
                return

            # Root path → sajikan ui/index.html
            if self.path == '/':
                index_path = os.path.join(os.path.dirname(__file__), 'ui', 'index.html')
                if os.path.exists(index_path):
                    self._send_static(index_path)
                else:
                    self.send_response(404)
                    self.end_headers()
                return

            # Semua request ke /ui/... → sajikan file dari folder ui
            if self.path.startswith('/ui/'):
                # Ambil nama file (misal: /ui/style.css → style.css)
                relative_path = self.path[4:]  # hilangkan '/ui/'
                base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui')
                file_path = os.path.normpath(os.path.join(base_dir, relative_path))

                # Pastikan file masih di dalam folder ui (keamanan)
                if not file_path.startswith(base_dir):
                    self.send_response(403)
                    self.end_headers()
                    return

                if os.path.isfile(file_path):
                    self._send_static(file_path)
                else:
                    self.send_response(404)
                    self.end_headers()
                return

            # Path lain → 404
            self.send_response(404)
            self.end_headers()

        except Exception as e:
            print(f"[!] WebAPI Error: {e}")
            self.send_response(500)
            self.end_headers()

    def _send_static(self, file_path):
        """Sajikan file statis dengan cache byte penuh, invalidasi via mtime."""
        mtime = os.path.getmtime(file_path)
        entry = WebApiHandler._static_cache.get(file_path)
        if entry is None or entry[0] != mtime:
            with open(file_path, 'rb') as f:
                content = f.read()
            content_type, _ = mimetypes.guess_type(file_path)
            header = (
                b'HTTP/1.1 200 OK\r\n'
                b'Content-type: ' + (content_type or 'application/octet-stream').encode() + b'\r\n'
                b'Content-Length: ' + str(len(content)).encode() + b'\r\n'
                b'\r\n'
            )
            entry = (mtime, header + content)
            WebApiHandler._static_cache[file_path] = entry
        _, payload = entry
        self.wfile.write(payload)

# ==========================================
# KELAS SERVER MANAGER UTAMA
# ==========================================
class ServerManager:
    def __init__(self):
        if getattr(sys, 'frozen', False):
            self.base_dir = os.path.dirname(sys.executable)
        else:
            self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        self.CREATE_NO_WINDOW = 0x08000000
        self.nginx_exe = os.path.join(self.base_dir, 'bin', 'nginx', 'nginx.exe')
        self.php_cgi = os.path.join(self.base_dir, 'bin', 'php', 'php-cgi.exe')
        self.mysql_exe = os.path.join(self.base_dir, 'bin', 'mysql', 'bin', 'mysqld.exe')
        self.mysql_init = os.path.join(self.base_dir, 'bin', 'mysql', 'bin', 'mysql_install_db.exe')
        self.processes = {}
    
    def is_port_in_use(self, port):
        # Timeout eksplisit 2s: pada koneksi localhost ini sangat aman, dan
        # mencegah thread mengambang lama saat sistem IPv6 tidak stabil.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.0)
            return s.connect_ex(('127.0.0.1', port)) == 0

    def is_port_free(self, host, port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((host, port))
                return True
            except OSError:
                return False
    

    def generate_configs(self):
        print("[*] Mengonfigurasi file sistem...")
        base_dir_nginx = self.base_dir.replace('\\', '/')
        templates = {
            'nginx.conf.template': 'nginx.conf',
            'my.ini.template': 'my.ini'
        }
        template_dir = os.path.join(self.base_dir, 'config', 'templates')
        output_dir = os.path.join(self.base_dir, 'config')

        for tpl_file, out_file in templates.items():
            tpl_path = os.path.join(template_dir, tpl_file)
            out_path = os.path.join(output_dir, out_file)
            if os.path.exists(tpl_path):
                with open(tpl_path, 'r') as file:
                    content = file.read()
                content = content.replace('{BASE_DIR}', base_dir_nginx)
                with open(out_path, 'w') as file:
                    file.write(content)
                print(f"    -> {out_file} berhasil di-generate.")

    def generate_vhosts(self):
        print("[*] Memindai folder proyek untuk Virtual Host...")
        www_dir = os.path.join(self.base_dir, 'www')
        vhost_dir = os.path.join(self.base_dir, 'config', 'vhosts')
        
        os.makedirs(vhost_dir, exist_ok=True)
        domains_found = []

        if os.path.exists(www_dir):
            for item in os.listdir(www_dir):
                item_path = os.path.join(www_dir, item)
                if os.path.isdir(item_path):
                    domain_name = f"{item}.test"
                    domains_found.append(domain_name)
                    
                    public_dir = os.path.join(item_path, 'public')
                    artisan_file = os.path.join(item_path, 'artisan')
                    
                    if os.path.isdir(public_dir) and os.path.isfile(artisan_file):
                        document_root = public_dir.replace('\\', '/')
                        nginx_try_files = "try_files $uri $uri/ /index.php?$query_string;"
                        print(f"    -> Deteksi Laravel: {domain_name} diotomatiskan ke folder /public")
                    else:
                        document_root = item_path.replace('\\', '/')
                        nginx_try_files = "try_files $uri $uri/ =404;"

                    vhost_content = f"""
server {{
    listen 80;
    server_name {domain_name};
    root "{document_root}";
    index index.php index.html index.htm;
    location / {{
        {nginx_try_files}
    }}
    location ~ \\.php$ {{
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include "{self.base_dir.replace('\\', '/')}/bin/nginx/conf/fastcgi_params";
    }}
}}
"""
                    conf_path = os.path.join(vhost_dir, f"{item}.conf")
                    # Hanya tulis ulang jika kontennya berubah — menghemat I/O
                    # dan mencegah reload config yang tidak perlu pada nginx.
                    needs_write = True
                    if os.path.exists(conf_path):
                        try:
                            with open(conf_path, 'r') as cf:
                                needs_write = cf.read() != vhost_content
                        except OSError:
                            pass
                    if needs_write:
                        with open(conf_path, 'w') as f:
                            f.write(vhost_content)
        print(f"    -> Ditemukan {len(domains_found)} domain kustom.")
        return domains_found

    def update_windows_hosts(self, domains):
        if not domains: return 
        hosts_path = r"C:\Windows\System32\drivers\etc\hosts"
        try:
            with open(hosts_path, 'r') as f:
                lines = f.readlines()
            # Kumpulkan seluruh isi file sekali (O(n)), lalu cek keanggotaan
            # domain via lookup O(1) — bukan nested loop O(n×m) seperti sebelumnya.
            existing_tokens = set()
            for line in lines:
                for token in line.split():
                    existing_tokens.add(token)
            new_entries = []
            for domain in domains:
                if domain not in existing_tokens:
                    new_entries.append(f"127.0.0.1 {domain} # MyLocalServer\n")
            if new_entries:
                with open(hosts_path, 'a') as f:
                    f.writelines(new_entries)
                print(f"[*] Berhasil menyuntikkan {len(new_entries)} domain baru ke Windows hosts.")
        except PermissionError:
            raise Exception("AKSES DITOLAK! File hosts dilindungi Windows.\nTutup aplikasi ini, lalu jalankan terminal/CMD sebagai 'Run as Administrator'.")

    def init_database(self):
        db_dir = os.path.join(self.base_dir, 'data', 'mysql')
        if not os.path.exists(db_dir) or not os.listdir(db_dir):
            print("[*] Database kosong, melakukan instalasi awal sistem database...")
            init_cmd = [self.mysql_init, f"--datadir={db_dir}"]
            subprocess.run(init_cmd, creationflags=self.CREATE_NO_WINDOW)
            print("    -> Database berhasil diinisialisasi.")

    def start_services(self):
        print("[*] Mengecek ketersediaan Port...")
        ports_to_check = {
            80: "Nginx/Web server lain",
            3306: "MYSQL / Mariadb Lain",
            9000: "PHP_CGI"
        }
        # Semua port dicek paralel; pada koneksi localhost timeout 2s sudah
        # jauh lebih dari cukup, memangkas waktu start-up dari ~6s -> ~2s.
        with ThreadPoolExecutor(max_workers=len(ports_to_check)) as pool:
            results = dict(zip(ports_to_check.keys(),
                               pool.map(self.is_port_in_use, ports_to_check.keys())))
        for port, app_name in ports_to_check.items():
            if results[port]:
                raise Exception(f"PORT {port} BENTROK! Sedang dipakai oleh {app_name}.")

        self.generate_configs()
        active_domains = self.generate_vhosts()
        self.update_windows_hosts(active_domains)
        self.init_database()

        print("[*] Menjalankan Service...")

        env = os.environ.copy()
        env['PHP_FCGI_MAX_REQUESTS'] = '0'
        
        self.processes['php'] = subprocess.Popen(
            [self.php_cgi, '-b', '127.0.0.1:9000'],
            env=env,
            creationflags=self.CREATE_NO_WINDOW,
            cwd=os.path.join(self.base_dir, 'bin', 'php')
        )
        print("    -> PHP-CGI berjalan di port 9000.")

        mysql_conf = os.path.join(self.base_dir, 'config', 'my.ini')
        self.processes['mysql'] = subprocess.Popen(
            [self.mysql_exe, f'--defaults-file={mysql_conf}'],
            creationflags=self.CREATE_NO_WINDOW,
            cwd=os.path.join(self.base_dir, 'bin', 'mysql', 'bin')
        )
        print("    -> MySQL/MariaDB berjalan di port 3306.")

        nginx_conf = os.path.join(self.base_dir, 'config', 'nginx.conf')
        self.processes['nginx'] = subprocess.Popen(
            [self.nginx_exe, '-c', nginx_conf],
            creationflags=self.CREATE_NO_WINDOW,
            cwd=os.path.join(self.base_dir, 'bin', 'nginx')
        )
        print("    -> Nginx berjalan di port 80.")

        self.is_running = True
        return True

    def create_laravel_project(self, project_name):
        www_dir = os.path.join(self.base_dir, 'www')
        project_dir = os.path.join(www_dir, project_name)
        php_exe = os.path.join(self.base_dir, 'bin', 'php', 'php.exe')
        composer_phar = os.path.join(self.base_dir, 'bin', 'php', 'composer.phar')

        if not os.path.exists(composer_phar):
            print("[!] Error: composer.phar tidak ditemukan di folder bin/php/!")
            return False
        if os.path.exists(project_dir):
            print(f"[!] Error: Folder dengan nama '{project_name}' sudah ada di dalam www!")
            return False

        print(f"[*] Memulai instalasi Laravel untuk proyek: {project_name}")
        cmd = [php_exe, composer_phar, "create-project", "laravel/laravel", project_dir]

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=self.CREATE_NO_WINDOW,
                cwd=self.base_dir
            )
            for line in process.stdout:
                print(line.strip())
            process.wait()

            if process.returncode == 0:
                print(f"\n[+] Sukses! Laravel berhasil diinstal di: {project_name}")
                self.create_database(project_name)
                return True
            else:
                print(f"\n[!] Instalasi Laravel gagal dengan kode error: {process.returncode}")
                return False
        except Exception as e:
            print(f"[!] Terjadi kesalahan fatal sistem: {e}")
            return False

    def create_database(self, db_name):
        clean_db_name = db_name.replace('-', '_')
        print(f"[*] Membuat database MySQL otomatis: '{clean_db_name}'...")
        mysql_exe = os.path.join(self.base_dir, 'bin', 'mysql', 'bin', 'mysql.exe')
        cmd = [mysql_exe, "-u", "root", "-e", f"CREATE DATABASE IF NOT EXISTS `{clean_db_name}`;"]
        try:
            subprocess.run(cmd, creationflags=self.CREATE_NO_WINDOW)
            print(f"[+] Database '{clean_db_name}' berhasil disiapkan!")
        except Exception as e:
            print(f"[!] Gagal membuat database: {e}")
    
    def open_terminal(self):
        www_dir = os.path.join(self.base_dir, 'www')
        php_dir = os.path.join(self.base_dir, 'bin', 'php')
        mysql_dir = os.path.join(self.base_dir, 'bin', 'mysql', 'bin')
        env = os.environ.copy()
        env['PATH'] = f"{php_dir};{mysql_dir};" + env.get('PATH', '')
        print("> Membuka Quick Terminal...")
        try:
            subprocess.Popen(
                ['cmd.exe'],
                env=env,
                cwd=www_dir,
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        except Exception as e:
            print(f"[!] Gagal membuka terminal: {e}")

    
    

    # --- FITUR MAIL CATCHER TERTANAM (NATIVE THREADING) ---
    def toggle_mail_catcher(self, is_enabled):
        if is_enabled:
            # Cek port hanya sebelum start
            if not self.is_port_free('127.0.0.1', 8025):
                print("[!] Port 8025 sedang dipakai! UI Mail Catcher tidak bisa berjalan.")
                return
            print("\n> Memulai service Mail Catcher...")
            try:
                # Gunakan ThreadingHTTPServer untuk performa
                self.http_server = ThreadingHTTPServer(('127.0.0.1', 8025), WebApiHandler)
                self.http_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
                self.http_thread.start()

                self.smtp_controller = Controller(SmtpHandler(), hostname='127.0.0.1', port=1025)
                self.smtp_controller.start()
                print("[*] Mail Catcher Aktif! | UI Server: http://127.0.0.1:8025")
            except Exception as e:
                print(f"[!] Error menyalakan Mail Catcher: {e}")
        else:
            # Saat matikan, tidak perlu cek port
            print("\n[*] Mematikan service Mail Catcher...")
            if hasattr(self, 'http_server') and self.http_server:
                self.http_server.shutdown()
                self.http_server.server_close()   # Tutup socket
                self.http_server = None
            if hasattr(self, 'smtp_controller') and self.smtp_controller:
                try:
                    self.smtp_controller.stop()
                except AssertionError:
                    pass
                self.smtp_controller = None
            print("[*] Service Mail Catcher dimatikan.")
    
    def share_live(self, project_name=""):
        ngrok_exe = os.path.join(self.base_dir, 'bin', 'ngrok', 'ngrok.exe')
        if not os.path.exists(ngrok_exe):
            print("[!] Error: ngrok.exe tidak ditemukan di folder bin/ngrok/")
            return
        if project_name:
            domain = f"{project_name}.test"
            print(f"> Membuka jalur Ngrok untuk project Laravel: {domain} ...")
            cmd = ['cmd.exe', '/k', ngrok_exe, 'http', '80', f'--host-header={domain}']
        else:
            print("> Membuka jalur Ngrok untuk localhost default ...")
            cmd = ['cmd.exe', '/k', ngrok_exe, 'http', '80']
        try:
            subprocess.Popen(
                cmd,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
                cwd=os.path.join(self.base_dir, 'bin', 'ngrok')
            )
        except Exception as e:
            print(f"[!] Gagal membuka koneksi Ngrok: {e}")

    def stop_services(self):
        """Menghentikan semua service dengan aman dan memastikan tidak ada Zombie Process"""
        print("\n[*] Menghentikan Service...")

        # 1. Matikan Nginx secara halus terlebih dahulu (graceful shutdown)
        try:
            subprocess.run([self.nginx_exe, '-s', 'quit'], creationflags=self.CREATE_NO_WINDOW, cwd=os.path.join(self.base_dir, 'bin', 'nginx'))
        except Exception:
            pass

        # 2. Amankan penutupan Mail Catcher
        if hasattr(self, 'http_server') and self.http_server is not None:
            threading.Thread(target=self.http_server.shutdown, daemon=True).start()
        if hasattr(self, 'smtp_controller') and self.smtp_controller is not None:
            try:
                self.smtp_controller.stop()
                print("[*] Mail Catcher otomatis dimatikan.")
            except AssertionError:
                pass

        self.is_running = False

        # 3. SAPU BERSIH (Brute-force Kill Anti-Zombie) — jalankan paralel via
        # subprocess agar tidak spawn shell cmd.exe & tidak serial menunggu
        # masing-masing taskkill selesai (hemat ratusan ms saat shutdown).
        print("[*] Memastikan memori bersih dari sisa proses...")
        kill_jobs = []
        for image in ("nginx.exe", "php-cgi.exe", "mysqld.exe"):
            try:
                kill_jobs.append(subprocess.Popen(
                    ["taskkill", "/f", "/im", image],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=self.CREATE_NO_WINDOW,
                ))
            except OSError:
                pass  # taskkill tidak tersedia (non-Windows) → lewati
        for job in kill_jobs:
            try:
                job.wait(timeout=5)
            except Exception:
                pass
        print("    -> Mesin Web, Database, dan PHP telah dibunuh total.")

if __name__ == "__main__":
    server = ServerManager()
    try:
        server.start_services()
        print("\n[+] SEMUA SERVER MENYALA!")
        print("Tekan CTRL+C di terminal ini untuk mematikan server.")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        server.stop_services()
        print("[+] SERVER BERHASIL DIMATIKAN. Sampai jumpa!")