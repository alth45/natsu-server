import customtkinter as ctk
import webbrowser
import subprocess
import os
import sys
import threading

import pystray
from PIL import Image, ImageDraw
from process_manager import ServerManager

# --- Konfigurasi Tema GUI ---
ctk.set_appearance_mode("Dark")  # Wajib dark mode agar terasa 'Unix'
ctk.set_default_color_theme("blue")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        # --- Seting Jendela Utama ---
        self.title("なつServer - Unix Edition")
        self.geometry("700x450")
        self.resizable(False, False)

        # Inisialisasi Backend Manager
        self.server = ServerManager()
        self.is_running = False

        # Tangkap event close (Pembunuh Zombie)
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # --- PENGATURAN GRID UTAMA (2 Kolom) ---
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ==========================================
        # BAGIAN KIRI: SIDEBAR (TOOLS)
        # ==========================================
        self.sidebar_frame = ctk.CTkFrame(self, width=200, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(7, weight=1) # Dorong elemen ke atas

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="⚡ なつServer", font=ctk.CTkFont(size=24, weight="bold"))
        self.logo_label.grid(row=0, column=0, padx=20, pady=(20, 30))

        # Tombol Tools
        self.btn_web = ctk.CTkButton(self.sidebar_frame, text="🌐 Buka Browser", command=self.open_web, state="disabled")
        self.btn_web.grid(row=1, column=0, padx=20, pady=10)

        self.btn_db = ctk.CTkButton(self.sidebar_frame, text="🗄️ Database", command=self.open_db)
        self.btn_db.grid(row=2, column=0, padx=20, pady=10)

        self.btn_folder = ctk.CTkButton(self.sidebar_frame, text="📁 Folder (www)", command=self.open_root_folder)
        self.btn_folder.grid(row=3, column=0, padx=20, pady=10)

        self.btn_terminal = ctk.CTkButton(self.sidebar_frame, text="💻 Terminal", fg_color="#17a2b8", hover_color="#138496", command=self.open_terminal)
        self.btn_terminal.grid(row=4, column=0, padx=20, pady=10)

        self.btn_ngrok = ctk.CTkButton(self.sidebar_frame, text="🌍 Share Live", fg_color="#f39c12", hover_color="#d68910", command=self.share_live)
        self.btn_ngrok.grid(row=5, column=0, padx=20, pady=10)

        self.btn_laravel = ctk.CTkButton(self.sidebar_frame, text="🚀 New Laravel", fg_color="#ff2d20", hover_color="#cc2419", command=self.prompt_laravel)
        self.btn_laravel.grid(row=6, column=0, padx=20, pady=10)

        # ==========================================
        # BAGIAN KANAN: MAIN PANEL (KONTROL & TERMINAL)
        # ==========================================
        self.main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.main_frame.grid(row=0, column=1, padx=20, pady=20, sticky="nsew")
        self.main_frame.grid_columnconfigure(0, weight=1)

        # Indikator Status
        self.status_label = ctk.CTkLabel(self.main_frame, text="[ STATUS: OFFLINE ]", text_color="#ff4c4c", font=ctk.CTkFont(size=18, weight="bold"))
        self.status_label.grid(row=0, column=0, pady=(10, 20), sticky="w")

        # Tombol Start/Stop (Bersebelahan)
        self.control_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        self.control_frame.grid(row=1, column=0, sticky="ew")
        self.control_frame.grid_columnconfigure((0, 1), weight=1)

        self.btn_start = ctk.CTkButton(self.control_frame, text="▶ START", height=40, fg_color="#28a745", hover_color="#218838", font=ctk.CTkFont(weight="bold"), command=self.start_all)
        self.btn_start.grid(row=0, column=0, padx=(0, 10), sticky="ew")

        self.btn_stop = ctk.CTkButton(self.control_frame, text="⏹ STOP", height=40, fg_color="#dc3545", hover_color="#c82333", font=ctk.CTkFont(weight="bold"), state="disabled", command=self.stop_all)
        self.btn_stop.grid(row=0, column=1, padx=(10, 0), sticky="ew")

        # Terminal Box / Console Output
        self.console_label = ctk.CTkLabel(self.main_frame, text="Terminal Log:", font=ctk.CTkFont(size=12, weight="bold"))
        self.console_label.grid(row=2, column=0, pady=(20, 5), sticky="w")

        self.console_box = ctk.CTkTextbox(self.main_frame, height=180, font=ctk.CTkFont(family="Consolas", size=12), fg_color="#1e1e1e", text_color="#00ff00")
        self.console_box.grid(row=3, column=0, sticky="nsew")
        self.console_box.insert("0.0", "なつServer v1.0\nReady...\n")
        self.console_box.configure(state="disabled") # Disable agar user tidak bisa mengetik

        # --- Mengalihkan output 'print' Python ke Console GUI ---
        self.redirect_stdout()

    # --- FUNGSI REDIRECT LOG KE TERMINAL GUI ---
    def redirect_stdout(self):
        class OutputRedirector:
            def __init__(self, textbox):
                self.textbox = textbox
            def write(self, text):
                self.textbox.configure(state="normal")
                self.textbox.insert("end", text)
                self.textbox.see("end") # Auto scroll ke bawah
                self.textbox.configure(state="disabled")
                self.textbox.update()
            def flush(self):
                pass
        
        sys.stdout = OutputRedirector(self.console_box)
        sys.stderr = sys.stdout # Tangkap error (warna merahnya nanti)

    # --- FUNGSI-FUNGSI LOGIKA TOMBOL ---
    def start_all(self):
        self.status_label.configure(text="[ STATUS: MENYALAKAN... ]", text_color="#f39c12")
        self.console_box.configure(state="normal")
        self.console_box.insert("end", "\n--- Inisiasi Proses ---\n")
        self.console_box.configure(state="disabled")
        self.update()

        try:
            self.server.start_services()
            self.is_running = True
            
            self.status_label.configure(text="[ STATUS: ONLINE (80, 3306) ]", text_color="#28a745")
            self.btn_start.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_web.configure(state="normal")
            print("\n[+] Sistem Siap Digunakan!")
        except Exception as e:
            self.status_label.configure(text="[ STATUS: ERROR! ]", text_color="#ff4c4c")
            print(f"\n[!] GAGAL START: {e}")

    def stop_all(self):
        self.status_label.configure(text="[ STATUS: MEMATIKAN... ]", text_color="#f39c12")
        self.update()

        self.server.stop_services()
        self.is_running = False
        
        self.status_label.configure(text="[ STATUS: OFFLINE ]", text_color="#ff4c4c")
        self.btn_start.configure(state="normal")
        self.btn_stop.configure(state="disabled")
        self.btn_web.configure(state="disabled")
        print("\n[-] Semua Service Telah Dihentikan.")

    def open_web(self):
        webbrowser.open("http://localhost")
        print("> Browser dibuka.")

    def open_db(self):
        heidi_path = os.path.join(self.server.base_dir, 'bin', 'heidisql', 'heidisql.exe')
        if os.path.exists(heidi_path):
            subprocess.Popen([heidi_path])
            print("> HeidiSQL dibuka.")
        else:
            print(f"[!] HeidiSQL tidak ditemukan.")

    def open_root_folder(self):
        """Fitur baru: Buka folder www di Windows Explorer"""
        www_path = os.path.join(self.server.base_dir, 'www')
        # Buka explorer menggunakan modul os bawaan Windows
        os.startfile(www_path)
        print("> Folder 'www' dibuka.")

    def create_tray_icon(self):
        """Membuat gambar ikon secara dinamis (tanpa butuh file .ico eksternal)"""
        # Membuat kanvas hitam ukuran 64x64
        image = Image.new('RGB', (64, 64), color=(24, 24, 24))
        dc = ImageDraw.Draw(image)
        # Menggambar kotak merah khas 'Natsu/Laravel' di tengahnya
        dc.rectangle([(16, 16), (48, 48)], fill=(255, 45, 32))
        return image
    
    def share_live(self):
        """Memvalidasi dan memunculkan pop-up pilihan project sebelum memanggil Ngrok"""
        if not self.is_running:
            print("\n[!] Peringatan: Mohon jalankan server (START) terlebih dahulu sebelum membuka jalur ke internet!")
            return
            
        # Munculkan jendela dialog input
        dialog = ctk.CTkInputDialog(
            text="Masukkan nama folder project yang ingin di-share\n(Contoh: library). Kosongkan jika ingin share default localhost:", 
            title="🌍 Share Live via Ngrok"
        )
        project_name = dialog.get_input()

        # Deteksi jika user menekan tombol OK
        if project_name is not None:
            # Bersihkan dari spasi berlebih
            clean_name = project_name.strip().lower()
            self.server.share_live(clean_name)

    def on_closing(self):
        """Dijalankan saat tombol X ditekan. Alih-alih keluar, kita sembunyikan (minimize to tray)"""
        print("\n> Aplikasi disembunyikan ke System Tray (Pojok kanan bawah).")
        
        # Sembunyikan jendela GUI utama
        self.withdraw() 
        
        # Buat menu klik kanan di ikon System Tray
        menu = pystray.Menu(
            pystray.MenuItem('Tampilkan Dashboard', self.show_window),
            pystray.MenuItem('Matikan Server & Keluar', self.quit_window)
        )
        
        # Inisialisasi ikon System Tray
        self.tray_icon = pystray.Icon("NatsuServer", self.create_tray_icon(), "なつServer is Running", menu)
        
        # Jalankan ikon di background thread agar tidak membekukan sistem GUI
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def show_window(self, icon, item):
        """Fungsi untuk mengembalikan jendela GUI dari System Tray"""
        # Matikan ikon tray
        self.tray_icon.stop() 
        
        # Tkinter butuh di-refresh dari jalur utama (Main Thread), kita pakai .after
        self.after(0, self.deiconify) 
        print("> Dashboard dibuka kembali.")

    def quit_window(self, icon, item):
        """Fungsi untuk menutup aplikasi sepenuhnya dari System Tray"""
        # Matikan ikon tray
        self.tray_icon.stop()
        
        if self.is_running:
            print("\n> Menjalankan prosedur penutupan otomatis...")
            self.server.stop_services()
            
        # Hancurkan jendela GUI sepenuhnya
        self.after(0, self.destroy)
    
    def open_terminal(self):
        """Memanggil fungsi terminal dari mesin backend"""
        self.server.open_terminal()
    
    def prompt_laravel(self):
        """Memunculkan pop-up untuk meminta nama project"""
        # Cek apakah server menyala (wajib nyala untuk buat database)
        if not self.is_running:
            print("\n[!] Peringatan: Mohon jalankan (START) server terlebih dahulu agar sistem bisa otomatis membuat database!")
            return

        # Munculkan jendela dialog input
        dialog = ctk.CTkInputDialog(text="Masukkan nama project Laravel (Gunakan huruf kecil & tanpa spasi):", title="🚀 Auto-Install Laravel")
        project_name = dialog.get_input()
        
        if project_name:
            # Cegah nama project pakai spasi
            project_name = project_name.replace(" ", "_").lower()
            print(f"\n> Menyiapkan instalasi Laravel: {project_name}...")
            
            # Matikan tombol sementara agar user tidak spam klik ganda
            self.btn_laravel.configure(state="disabled")
            
            # --- ILMU THREADING: Jalankan fungsi eksekusi di jalur background ---
            threading.Thread(target=self.run_laravel_installer, args=(project_name,), daemon=True).start()

    def run_laravel_installer(self, project_name):
        """Fungsi yang berjalan secara diam-diam di thread terpisah"""
        # Memanggil mesin dari process_manager.py
        is_success = self.server.create_laravel_project(project_name)
        
        if is_success:
            # Reset dan update ulang Virtual Host Windows
            print("\n[*] Mendaftarkan domain lokal ke sistem Windows...")
            active_domains = self.server.generate_vhosts()
            try:
                self.server.update_windows_hosts(active_domains)
                print(f"\n[+] SELESAI! Silakan akses: http://{project_name}.test di browser.")
            except Exception as e:
                print(f"[!] Info: Gagal mendaftarkan domain otomatis. {e}")

        # Nyalakan kembali tombol Laravel-nya
        self.btn_laravel.configure(state="normal")

if __name__ == "__main__":
    app = App()
    app.mainloop()