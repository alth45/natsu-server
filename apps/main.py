import customtkinter as ctk
import webbrowser
import subprocess
import os
import sys
import threading
import tkinter as tk
from tkinter import messagebox

import pystray
from PIL import Image, ImageDraw
from process_manager import ServerManager

# --- Konfigurasi Tema GUI (Modern Dark) ---
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("dark-blue")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        # --- Seting Jendela Utama ---
        self.title("なつServer - Unix Edition")
        self.geometry("780x620")
        self.resizable(False, False)
        self.configure(fg_color="#0d1117")

        # Inisialisasi Backend Manager (TIDAK DIUBAH)
        self.server = ServerManager()
        self.is_running = False

        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # --- PENGATURAN GRID UTAMA (2 Kolom) ---
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ==========================================
        # BAGIAN KIRI: SIDEBAR MODERN
        # ==========================================
        self.sidebar_frame = ctk.CTkFrame(
            self, width=230, corner_radius=0,
            fg_color="#161b22", border_width=0
        )
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(10, weight=1)

        # Logo
        self.logo_label = ctk.CTkLabel(
            self.sidebar_frame,
            text="⚡ なつServer",
            font=ctk.CTkFont(family="Segoe UI", size=26, weight="bold"),
            text_color="#58a6ff"
        )
        self.logo_label.grid(row=0, column=0, padx=24, pady=(25, 30))

        # Style dasar tombol sidebar
        btn_style = {
            "corner_radius": 12,
            "height": 38,
            "font": ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            "border_width": 1,
            "border_color": "#30363d",
            "text_color": "#e6edf3",
            "anchor": "w"
        }

        self.btn_web = ctk.CTkButton(
            self.sidebar_frame, text="  🌐 Buka Browser",
            fg_color="#1f6feb", hover_color="#388bfd",
            state="disabled", **btn_style, command=self.open_web
        )
        self.btn_web.grid(row=1, column=0, padx=20, pady=7)

        self.btn_db = ctk.CTkButton(
            self.sidebar_frame, text="  🗄️ Database",
            fg_color="#2ea043", hover_color="#3fb950",
            **btn_style, command=self.open_db
        )
        self.btn_db.grid(row=2, column=0, padx=20, pady=7)

        self.btn_folder = ctk.CTkButton(
            self.sidebar_frame, text="  📁 Folder (www)",
            fg_color="#d29922", hover_color="#e3b341",
            corner_radius=12, height=38,
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            border_width=1, border_color="#30363d",
            text_color="#0d1117",
            anchor="w",
            command=self.open_root_folder
        )
        self.btn_folder.grid(row=3, column=0, padx=20, pady=7)

        self.btn_terminal = ctk.CTkButton(
            self.sidebar_frame, text="  💻 Terminal",
            fg_color="#1b9e9e", hover_color="#26c6c6",
            **btn_style, command=self.open_terminal
        )
        self.btn_terminal.grid(row=4, column=0, padx=20, pady=7)

        self.btn_ngrok = ctk.CTkButton(
            self.sidebar_frame, text="  🌍 Share Live",
            fg_color="#bf5b16", hover_color="#d97706",
            **btn_style, command=self.share_live
        )
        self.btn_ngrok.grid(row=5, column=0, padx=20, pady=7)

        self.btn_laravel = ctk.CTkButton(
            self.sidebar_frame, text="  🚀 New Laravel",
            fg_color="#c62828", hover_color="#e53935",
            **btn_style, command=self.prompt_laravel
        )
        self.btn_laravel.grid(row=6, column=0, padx=20, pady=7)

        self.mail_switch_var = ctk.StringVar(value="off")
        self.mail_switch = ctk.CTkSwitch(
            self.sidebar_frame,
            text="📬 Mail Catcher",
            command=self.on_mail_toggle,
            variable=self.mail_switch_var,
            onvalue="on", offvalue="off",
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            progress_color="#a371f7"
        )
        self.mail_switch.grid(row=7, column=0, padx=24, pady=(15, 5), sticky="w")

        self.btn_mail_ui = ctk.CTkButton(
            self.sidebar_frame, text="  📧 Buka Web Mail",
            state="disabled", fg_color="#3a3f47", hover_color="#4c5159",
            **btn_style, command=self.open_mail_ui
        )
        self.btn_mail_ui.grid(row=8, column=0, padx=20, pady=7)

        self.btn_quit = ctk.CTkButton(
            self.sidebar_frame, text="  🚪 Keluar Aplikasi",
            fg_color="#b71c1c", hover_color="#d32f2f",
            corner_radius=12, height=38,
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            border_width=1, border_color="#ef5350",
            text_color="#ffffff",
            command=self.quit_app
        )
        self.btn_quit.grid(row=9, column=0, padx=20, pady=(30, 20))

        # ==========================================
        # BAGIAN KANAN: MAIN PANEL DENGAN CARDS MODERN
        # ==========================================
        self.main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.main_frame.grid(row=0, column=1, padx=30, pady=25, sticky="nsew")
        self.main_frame.grid_columnconfigure(0, weight=1)

        # --- Status Card ---
        self.status_card = ctk.CTkFrame(
            self.main_frame, fg_color="#161b22", corner_radius=16,
            border_width=1, border_color="#30363d"
        )
        self.status_card.grid(row=0, column=0, sticky="ew", pady=(0, 15))

        self.status_label = ctk.CTkLabel(
            self.status_card,
            text="●  OFFLINE",
            text_color="#ff4c4c",
            font=ctk.CTkFont(family="Segoe UI", size=20, weight="bold"),
            padx=20, pady=12
        )
        self.status_label.pack(anchor="w")

        # --- Control Card ---
        self.control_card = ctk.CTkFrame(
            self.main_frame, fg_color="#161b22", corner_radius=16,
            border_width=1, border_color="#30363d"
        )
        self.control_card.grid(row=1, column=0, sticky="ew", pady=(0, 15))
        self.control_card.grid_columnconfigure((0, 1), weight=1)

        btn_big_style = {
            "height": 50,
            "corner_radius": 16,
            "font": ctk.CTkFont(family="Segoe UI", size=15, weight="bold"),
            "border_width": 2
        }

        self.btn_start = ctk.CTkButton(
            self.control_card, text="▶  START",
            fg_color="#1e7e34", hover_color="#2e9a4a",
            border_color="#28a745", text_color="#ffffff",
            **btn_big_style, command=self.start_all
        )
        self.btn_start.grid(row=0, column=0, padx=12, pady=12, sticky="ew")

        self.btn_stop = ctk.CTkButton(
            self.control_card, text="⏹  STOP",
            fg_color="#941c2e", hover_color="#b02a3a",
            border_color="#dc3545", text_color="#ffffff",
            state="disabled", **btn_big_style, command=self.stop_all
        )
        self.btn_stop.grid(row=0, column=1, padx=12, pady=12, sticky="ew")

        # --- Log Card (dengan toggle show/hide) ---
        self.log_card = ctk.CTkFrame(
            self.main_frame, fg_color="#161b22", corner_radius=16,
            border_width=1, border_color="#30363d"
        )
        self.log_card.grid(row=2, column=0, sticky="nsew")
        self.log_card.grid_columnconfigure(0, weight=1)
        self.log_card.grid_rowconfigure(1, weight=1)  # baris terminal

        # Header log
        log_header = ctk.CTkFrame(self.log_card, fg_color="transparent")
        log_header.grid(row=0, column=0, sticky="ew", padx=15, pady=(10, 5))

        self.console_label = ctk.CTkLabel(
            log_header,
            text="▸ Terminal Log",
            font=ctk.CTkFont(family="Segoe UI", size=13, weight="bold"),
            text_color="#8b949e"
        )
        self.console_label.pack(side="left")

        self.toggle_log_btn = ctk.CTkButton(
            log_header, text="▼", width=30, height=30,
            fg_color="#30363d", hover_color="#444c56",
            corner_radius=8, font=("Segoe UI", 14),
            command=self.toggle_log_visibility
        )
        self.toggle_log_btn.pack(side="right")

        # Terminal box
        self.console_box = ctk.CTkTextbox(
            self.log_card,
            font=ctk.CTkFont(family="Cascadia Code", size=11),
            fg_color="#0d1117",
            text_color="#00ff41",
            border_width=2,
            border_color="#30363d",
            corner_radius=10
        )
        self.console_box.grid(row=1, column=0, padx=15, pady=(0, 10), sticky="nsew")
        self.console_box.insert("0.0", "なつServer v1.0\nReady...\n")
        self.console_box.configure(state="disabled")

        self.log_visible = True

        # --- Footer info ---
        self.footer_label = ctk.CTkLabel(
            self.main_frame,
            text="なつServer v1.0 • Modern Dashboard",
            font=ctk.CTkFont(family="Segoe UI", size=10),
            text_color="#8b949e"
        )
        self.footer_label.grid(row=3, column=0, pady=(10, 0), sticky="e")

        # Pastikan log_card mengisi sisa tinggi
        self.main_frame.grid_rowconfigure(2, weight=1)

        # Redirect stdout (TIDAK DIUBAH)
        self.redirect_stdout()

        # --------------- BIND CONTEXT MENU (KLIK KANAN) ---------------
        self.bind_context_menu()

    def bind_context_menu(self):
        """Aktifkan menu klik kanan di seluruh area aplikasi."""
        widgets = [self, self.sidebar_frame, self.main_frame,
                   self.status_card, self.control_card, self.log_card]
        for w in widgets:
            w.bind("<Button-3>", self.show_context_menu)

    def show_context_menu(self, event):
        """Tampilkan popup menu saat klik kanan."""
        menu = tk.Menu(self, tearoff=0,
                       bg='#161b22', fg='#e6edf3',
                       activebackground='#1f6feb', activeforeground='#ffffff',
                       font=('Segoe UI', 11))
        menu.add_command(label="📊 Dashboard", command=lambda: print("Dashboard clicked"))
        menu.add_command(label="⚙️ Settings", command=lambda: print("Settings clicked"))
        menu.add_separator()
        menu.add_command(label="🪟 Toggle Log", command=self.toggle_log_visibility)
        menu.add_separator()
        menu.add_command(label="🔗 About", command=self.show_about)
        menu.add_command(label="🚪 Exit", command=self.quit_app)

        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def show_about(self):
        """Menampilkan dialog tentang aplikasi."""
        messagebox.showinfo("About", "なつServer v1.0\nModern Development Server\nBuilt with CustomTkinter")

    # --------------- FITUR TOGGLE LOG ---------------
    def toggle_log_visibility(self):
        if self.log_visible:
            self.console_box.grid_remove()
            self.toggle_log_btn.configure(text="▲")
            self.log_visible = False
        else:
            self.console_box.grid()
            self.toggle_log_btn.configure(text="▼")
            self.log_visible = True

    # --------------- FUNGSI BACKEND (TIDAK DIUBAH SAMA SEKALI) ---------------
    def redirect_stdout(self):
        class OutputRedirector:
            def __init__(self, textbox):
                self.textbox = textbox
            def write(self, text):
                self.textbox.configure(state="normal")
                self.textbox.insert("end", text)
                self.textbox.see("end")
                self.textbox.configure(state="disabled")
                self.textbox.update()
            def flush(self):
                pass
        sys.stdout = OutputRedirector(self.console_box)
        sys.stderr = sys.stdout

    def start_all(self):
        self.status_label.configure(text="●  MENYALAKAN...", text_color="#f39c12")
        self.console_box.configure(state="normal")
        self.console_box.insert("end", "\n--- Inisiasi Proses ---\n")
        self.console_box.configure(state="disabled")
        self.update()
        try:
            self.server.start_services()
            self.is_running = True
            self.status_label.configure(text="●  ONLINE (80, 3306)", text_color="#28a745")
            self.btn_start.configure(state="disabled")
            self.btn_stop.configure(state="normal")
            self.btn_web.configure(state="normal")
            print("\n[+] Sistem Siap Digunakan!")
        except Exception as e:
            self.status_label.configure(text="●  ERROR!", text_color="#ff4c4c")
            print(f"\n[!] GAGAL START: {e}")

    def stop_all(self):
        self.status_label.configure(text="●  MEMATIKAN...", text_color="#f39c12")
        self.update()
        self.server.stop_services()
        self.is_running = False
        self.status_label.configure(text="●  OFFLINE", text_color="#ff4c4c")
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
        www_path = os.path.join(self.server.base_dir, 'www')
        os.startfile(www_path)
        print("> Folder 'www' dibuka.")

    def create_tray_icon(self):
        image = Image.new('RGB', (64, 64), color=(24, 24, 24))
        dc = ImageDraw.Draw(image)
        dc.rectangle([(16, 16), (48, 48)], fill=(255, 45, 32))
        return image

    def share_live(self):
        if not self.is_running:
            print("\n[!] Peringatan: Mohon jalankan server (START) terlebih dahulu sebelum membuka jalur ke internet!")
            return
        dialog = ctk.CTkInputDialog(
            text="Masukkan nama folder project yang ingin di-share\n(Contoh: library). Kosongkan jika ingin share default localhost:",
            title="🌍 Share Live via Ngrok"
        )
        project_name = dialog.get_input()
        if project_name is not None:
            clean_name = project_name.strip().lower()
            self.server.share_live(clean_name)

    def on_mail_toggle(self):
        is_on = self.mail_switch_var.get() == "on"
        if is_on:
            self.btn_mail_ui.configure(state="normal", fg_color="#7c4dff", hover_color="#9670ff")
        else:
            self.btn_mail_ui.configure(state="disabled", fg_color="#3a3f47", hover_color="#4c5159")
        self.server.toggle_mail_catcher(is_on)

    def open_mail_ui(self):
        webbrowser.open('http://127.0.0.1:8025')

    def quit_app(self):
        print("\n> Menutup aplikasi secara permanen...")
        if self.is_running:
            self.server.stop_services()
        self.destroy()
        os._exit(0)

    def on_closing(self):
        print("\n> Aplikasi disembunyikan ke System Tray (Pojok kanan bawah).")
        self.withdraw()
        menu = pystray.Menu(
            pystray.MenuItem('Tampilkan Dashboard', self.show_window),
            pystray.MenuItem('Matikan Server & Keluar', self.quit_window)
        )
        self.tray_icon = pystray.Icon("NatsuServer", self.create_tray_icon(), "なつServer is Running", menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def show_window(self, icon, item):
        self.tray_icon.stop()
        self.after(0, self.deiconify)
        print("> Dashboard dibuka kembali.")

    def quit_window(self, icon, item):
        self.tray_icon.stop()
        if self.is_running:
            print("\n> Menjalankan prosedur penutupan otomatis...")
            self.server.stop_services()
        self.after(0, self.destroy)

    def open_terminal(self):
        self.server.open_terminal()

    def prompt_laravel(self):
        if not self.is_running:
            print("\n[!] Peringatan: Mohon jalankan (START) server terlebih dahulu agar sistem bisa otomatis membuat database!")
            return
        dialog = ctk.CTkInputDialog(text="Masukkan nama project Laravel (Gunakan huruf kecil & tanpa spasi):", title="🚀 Auto-Install Laravel")
        project_name = dialog.get_input()
        if project_name:
            project_name = project_name.replace(" ", "_").lower()
            print(f"\n> Menyiapkan instalasi Laravel: {project_name}...")
            self.btn_laravel.configure(state="disabled")
            threading.Thread(target=self.run_laravel_installer, args=(project_name,), daemon=True).start()

    def run_laravel_installer(self, project_name):
        is_success = self.server.create_laravel_project(project_name)
        if is_success:
            print("\n[*] Mendaftarkan domain lokal ke sistem Windows...")
            active_domains = self.server.generate_vhosts()
            try:
                self.server.update_windows_hosts(active_domains)
                print(f"\n[+] SELESAI! Silakan akses: http://{project_name}.test di browser.")
            except Exception as e:
                print(f"[!] Info: Gagal mendaftarkan domain otomatis. {e}")
        self.btn_laravel.configure(state="normal")

if __name__ == "__main__":
    app = App()
    app.mainloop()