import os
import subprocess
import time
import socket
import sys

class ServerManager:
    def __init__(self):
        # --- LOGIKA PATH PINTAR (ANTI-ERROR COMPILATION) ---
        if getattr(sys, 'frozen', False):
            # Jika dijalankan sebagai file .exe, base_dir adalah lokasi tempat .exe itu ditaruh
            self.base_dir = os.path.dirname(sys.executable)
        else:
            # Jika dijalankan sebagai script .py, base_dir mundur 1 langkah dari folder 'app'
            self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Windows flag agar CMD tidak muncul (Hidden Background Process)
        self.CREATE_NO_WINDOW = 0x08000000

        # Definisi path eksekusi program (.exe)
        self.nginx_exe = os.path.join(self.base_dir, 'bin', 'nginx', 'nginx.exe')
        self.php_cgi = os.path.join(self.base_dir, 'bin', 'php', 'php-cgi.exe')
        self.mysql_exe = os.path.join(self.base_dir, 'bin', 'mysql', 'bin', 'mysqld.exe')
        self.mysql_init = os.path.join(self.base_dir, 'bin', 'mysql', 'bin', 'mysql_install_db.exe')

        # Menyimpan referensi proses yang berjalan
        self.processes = {}
    
    def is_port_in_use(self, port):
        """Mengecek apakah port sedang dipakai dengan cara mencoba melakukan koneksi."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('127.0.0.1', port)) == 0

    def generate_configs(self):
        """Membaca template dan mengubah {BASE_DIR} menjadi path asli"""
        print("[*] Mengonfigurasi file sistem...")
        
        # Nginx butuh path dengan garis miring (forward slash) meskipun di Windows
        base_dir_nginx = self.base_dir.replace('\\', '/')

        # Path template dan output
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
                
                # Ganti placeholder {BASE_DIR} dengan lokasi folder asli
                content = content.replace('{BASE_DIR}', base_dir_nginx)

                with open(out_path, 'w') as file:
                    file.write(content)
                print(f"    -> {out_file} berhasil di-generate.")
            else:
                print(f"[!] Error: Template {tpl_file} tidak ditemukan!")

    #vhost ---------------------------------------------------------
    def generate_vhosts(self):
        """Memindai folder www dan membuat file konfigurasi Nginx cerdas untuk setiap folder"""
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
                    
                    # --- FITUR BARU: AUTO-DETEKSI LARAVEL ---
                    public_dir = os.path.join(item_path, 'public')
                    artisan_file = os.path.join(item_path, 'artisan')
                    
                    # Jika ada folder 'public' dan file 'artisan', maka ini adalah Laravel
                    if os.path.isdir(public_dir) and os.path.isfile(artisan_file):
                        document_root = public_dir.replace('\\', '/')
                        # Try files khusus untuk routing Laravel
                        nginx_try_files = "try_files $uri $uri/ /index.php?$query_string;"
                        print(f"    -> Deteksi Laravel: {domain_name} diotomatiskan ke folder /public")
                    else:
                        # Ini untuk project PHP biasa / HTML murni
                        document_root = item_path.replace('\\', '/')
                        nginx_try_files = "try_files $uri $uri/ =404;"
                    # ----------------------------------------

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
                    with open(conf_path, 'w') as f:
                        f.write(vhost_content)

        print(f"    -> Ditemukan {len(domains_found)} domain kustom.")
        return domains_found

    #call windows host
    
    def update_windows_hosts(self, domains):
        """Menambahkan domain baru ke file hosts milik Windows secara aman"""
        if not domains:
            return # Skip jika tidak ada domain

        hosts_path = r"C:\Windows\System32\drivers\etc\hosts"
        try:
            with open(hosts_path, 'r') as f:
                lines = f.readlines()

            new_entries = []
            for domain in domains:
                # Cek apakah domain sudah pernah ditambahkan sebelumnya
                if not any(domain in line for line in lines):
                    new_entries.append(f"127.0.0.1 {domain} # MyLocalServer\n")

            if new_entries:
                with open(hosts_path, 'a') as f:
                    f.writelines(new_entries)
                print(f"[*] Berhasil menyuntikkan {len(new_entries)} domain baru ke Windows hosts.")
                
        except PermissionError:
            # Jika user tidak membuka aplikasi sebagai Admin, Windows akan menolak akses
            raise Exception("AKSES DITOLAK! File hosts dilindungi Windows.\nTutup aplikasi ini, lalu jalankan terminal/CMD sebagai 'Run as Administrator'.")

    def init_database(self):
        """Inisialisasi MariaDB jika folder data/mysql masih kosong (pertama kali dijalankan)"""
        db_dir = os.path.join(self.base_dir, 'data', 'mysql')
        
        if not os.path.exists(db_dir) or not os.listdir(db_dir):
            print("[*] Database kosong, melakukan instalasi awal sistem database...")
            init_cmd = [self.mysql_init, f"--datadir={db_dir}"]
            subprocess.run(init_cmd, creationflags=self.CREATE_NO_WINDOW)
            print("    -> Database berhasil diinisialisasi.")

    def start_services(self):
        """Menyalakan Nginx, PHP, dan MySQL"""
        # --- BLOK TAMBAHAN BARU: CEK PORT SEBELUM MULAI ---
        print("[*] Mengecek ketersediaan Port...")
        ports_to_check = {
            80: "Nginx/Web server lain",
            3306: "MYSQL / Mariadb Lain",
            9000: "PHP_CGI"
        }

        for port, app_name in ports_to_check.items():
            if self.is_port_in_use(port):
                raise Exception(f"PORT {port} BENTROK! Sedang dipakai oleh {app_name}.")

        self.generate_configs()
        # Generate virtual host dan update Windows
        active_domains = self.generate_vhosts()
        self.update_windows_hosts(active_domains)
        
        self.init_database()

        print("[*] Menjalankan Service...")

        # 1. Jalankan PHP-CGI di Port 9000
        # PHP butuh environment variable PHP_FCGI_MAX_REQUESTS
        env = os.environ.copy()
        env['PHP_FCGI_MAX_REQUESTS'] = '0'
        
        self.processes['php'] = subprocess.Popen(
            [self.php_cgi, '-b', '127.0.0.1:9000'],
            env=env,
            creationflags=self.CREATE_NO_WINDOW,
            cwd=os.path.join(self.base_dir, 'bin', 'php')
        )
        print("    -> PHP-CGI berjalan di port 9000.")

        # 2. Jalankan MySQL (MariaDB)
        mysql_conf = os.path.join(self.base_dir, 'config', 'my.ini')
        self.processes['mysql'] = subprocess.Popen(
            [self.mysql_exe, f'--defaults-file={mysql_conf}'],
            creationflags=self.CREATE_NO_WINDOW,
            cwd=os.path.join(self.base_dir, 'bin', 'mysql', 'bin')
        )
        print("    -> MySQL/MariaDB berjalan di port 3306.")

        # 3. Jalankan Nginx
        nginx_conf = os.path.join(self.base_dir, 'config', 'nginx.conf')
        self.processes['nginx'] = subprocess.Popen(
            [self.nginx_exe, '-c', nginx_conf],
            creationflags=self.CREATE_NO_WINDOW,
            cwd=os.path.join(self.base_dir, 'bin', 'nginx')
        )
        print("    -> Nginx berjalan di port 80.")

    def create_laravel_project(self, project_name):
        """Menjalankan Composer untuk menginstal Laravel dan menembakkan log ke GUI"""
        www_dir = os.path.join(self.base_dir, 'www')
        project_dir = os.path.join(www_dir, project_name)
        php_exe = os.path.join(self.base_dir, 'bin', 'php', 'php.exe')
        composer_phar = os.path.join(self.base_dir, 'bin', 'php', 'composer.phar')

        # 1. Validasi awal
        if not os.path.exists(composer_phar):
            print("[!] Error: composer.phar tidak ditemukan di folder bin/php/!")
            return False

        if os.path.exists(project_dir):
            print(f"[!] Error: Folder dengan nama '{project_name}' sudah ada di dalam www!")
            return False

        print(f"[*] Memulai instalasi Laravel untuk proyek: {project_name}")
        print(f"[*] Lokasi: {project_dir}")
        print("[*] Mengunduh file dari internet. Mohon tunggu, ini butuh waktu beberapa menit...\n")

        # 2. Siapkan perintah Composer
        cmd = [php_exe, composer_phar, "create-project", "laravel/laravel", project_dir]

        # 3. Eksekusi secara background dan tangkap log-nya secara real-time
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=self.CREATE_NO_WINDOW,
                cwd=self.base_dir # Jalankan dari root folder
            )
            
            # Membaca log baris per baris dan mengirimnya ke terminal GUI
            for line in process.stdout:
                print(line.strip())
            
            process.wait()

            # 4. Evaluasi Hasil
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
        """Otomatis membuat database kosong untuk project Laravel"""
        # Standar nama database tidak boleh pakai tanda strip (-), kita ubah jadi underscore (_)
        clean_db_name = db_name.replace('-', '_')
        print(f"[*] Membuat database MySQL otomatis: '{clean_db_name}'...")
        
        mysql_exe = os.path.join(self.base_dir, 'bin', 'mysql', 'bin', 'mysql.exe')
        cmd = [mysql_exe, "-u", "root", "-e", f"CREATE DATABASE IF NOT EXISTS `{clean_db_name}`;"]
        
        try:
            subprocess.run(cmd, creationflags=self.CREATE_NO_WINDOW)
            print(f"[+] Database '{clean_db_name}' berhasil disiapkan!")
            print(f"[!] Jangan lupa sesuaikan DB_DATABASE={clean_db_name} di file .env Laravel kamu nanti.")
        except Exception as e:
            print(f"[!] Gagal membuat database: {e}")
    
    def open_terminal(self):
        """Membuka CMD baru dengan path PHP dan MySQL yang sudah di-inject secara temporary"""
        www_dir = os.path.join(self.base_dir, 'www')
        php_dir = os.path.join(self.base_dir, 'bin', 'php')
        mysql_dir = os.path.join(self.base_dir, 'bin', 'mysql', 'bin')

        # 1. Salin environment/PATH Windows saat ini
        env = os.environ.copy()

        # 2. Injeksi path PHP dan MySQL ke urutan paling depan (dipisah dengan titik koma)
        env['PATH'] = f"{php_dir};{mysql_dir};" + env.get('PATH', '')

        print("> Membuka Quick Terminal...")

        try:
            # 3. Buka jendela CMD baru secara terpisah dari GUI
            # creationflags=subprocess.CREATE_NEW_CONSOLE (Nilai Hex: 0x00000010)
            subprocess.Popen(
                ['cmd.exe'],
                env=env,
                cwd=www_dir,
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        except Exception as e:
            print(f"[!] Gagal membuka terminal: {e}")
    
    def share_live(self, project_name=""):
        """Membuka eksekusi Ngrok dengan dukungan Virtual Host Header"""
        ngrok_exe = os.path.join(self.base_dir, 'bin', 'ngrok', 'ngrok.exe')

        if not os.path.exists(ngrok_exe):
            print("[!] Error: ngrok.exe tidak ditemukan di folder bin/ngrok/")
            return

        # Logika Penentuan Domain
        if project_name:
            domain = f"{project_name}.test"
            print(f"> Membuka jalur Ngrok untuk project Laravel: {domain} ...")
            # Tambahkan bendera --host-header agar Nginx mengenali domainnya
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
        """Menghentikan semua service dengan aman"""
        print("\n[*] Menghentikan Service...")

        # Matikan Nginx secara halus (graceful shutdown)
        subprocess.run([self.nginx_exe, '-s', 'quit'], creationflags=self.CREATE_NO_WINDOW, cwd=os.path.join(self.base_dir, 'bin', 'nginx'))
        print("    -> Nginx dihentikan.")

        # Matikan proses Python bawaan
        for name, proc in self.processes.items():
            try:
                proc.terminate()
                proc.wait(timeout=3)
                print(f"    -> {name.upper()} dihentikan.")
            except Exception as e:
                # Jika proses membandel, paksa mati pakai taskkill Windows
                os.system(f"taskkill /f /im {name}*.exe >nul 2>&1")
                print(f"    -> {name.upper()} dihentikan paksa.")

# Blok ini agar file bisa langsung dites jalankan lewat terminal
if __name__ == "__main__":
    server = ServerManager()
    try:
        server.start_services()
        print("\n[+] SEMUA SERVER MENYALA!")
        print("Tekan CTRL+C di terminal ini untuk mematikan server.")
        
        # Biarkan script berjalan terus
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        server.stop_services()
        print("[+] SERVER BERHASIL DIMATIKAN. Sampai jumpa!")