"""
Startup dependency checker for GUI-DLP.

Sequence:
  1. Verify winget is present.
  2. Verify yt-dlp is present; install via winget if missing.
  3. Verify ffmpeg  is present; install via winget if missing.
  4. After any installation, refresh PATH from the Windows registry and
     re-probe – if still missing, ask the user to restart.

Call ensure_dependencies() before opening the pywebview window.
Returns True when all dependencies are ready, False when the app should exit.
"""

import os
import subprocess
import sys
import winreg
import tkinter as tk
from tkinter import messagebox

_WINGET_URL = "https://aka.ms/getwinget"

_DEPS = [
    ("yt-dlp", "yt-dlp.yt-dlp", ["yt-dlp", "--version"]),
    ("ffmpeg",  "Gyan.FFmpeg",   ["ffmpeg", "-version"]),
]


# ── helpers ──────────────────────────────────────────────────────────────────

def _probe(cmd):
    """Return True if *cmd* can be executed (i.e. the binary exists on PATH)."""
    try:
        subprocess.run(cmd, capture_output=True, timeout=10)
        return True
    except Exception:
        return False


def _refresh_path():
    """Read the current user + system PATH from the Windows registry
    and apply it to this process so newly-installed tools are discoverable."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            user_path, _ = winreg.QueryValueEx(k, "Path")
    except FileNotFoundError:
        user_path = ""

    try:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ) as k:
            sys_path, _ = winreg.QueryValueEx(k, "Path")
    except FileNotFoundError:
        sys_path = ""

    os.environ["PATH"] = sys_path + ";" + user_path


def _winget_install(package_id):
    """Run a silent winget install and return True on success."""
    try:
        result = subprocess.run(
            [
                "winget", "install",
                "--id", package_id,
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        return result.returncode == 0
    except Exception:
        return False


# ── splash window ─────────────────────────────────────────────────────────────

class _Splash:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("GUI-DLP")
        self.root.geometry("440x220")
        self.root.resizable(False, False)
        self.root.eval("tk::PlaceWindow . center")
        self.root.protocol("WM_DELETE_WINDOW", sys.exit)

        tk.Label(
            self.root,
            text="Checking dependencies…",
            font=("Segoe UI", 12, "bold"),
        ).pack(pady=(20, 6))

        self._status_var = tk.StringVar(value="")
        tk.Label(
            self.root,
            textvariable=self._status_var,
            font=("Segoe UI", 10),
            fg="#555555",
        ).pack()

        frame = tk.Frame(self.root, bg="#f0f0f0", relief="sunken", bd=1)
        frame.pack(fill="x", padx=20, pady=12)

        self._log_widget = tk.Text(
            frame,
            height=4,
            state="disabled",
            font=("Consolas", 9),
            bg="#f0f0f0",
            fg="#222222",
            relief="flat",
            padx=6,
            pady=4,
        )
        self._log_widget.pack(fill="x")

    def status(self, text):
        self._status_var.set(text)
        self.root.update()

    def log(self, text):
        self._log_widget.config(state="normal")
        self._log_widget.insert("end", text + "\n")
        self._log_widget.see("end")
        self._log_widget.config(state="disabled")
        self.root.update()

    def close(self):
        self.root.destroy()


# ── public API ────────────────────────────────────────────────────────────────

def ensure_dependencies():
    """
    Verify winget / yt-dlp / ffmpeg are present and install any that are
    missing.  Returns True when the app is ready to launch, False when the
    caller should exit.
    """
    splash = _Splash()

    # ── 1. winget ──────────────────────────────────────────────────────────
    splash.status("Checking winget…")
    if not _probe(["winget", "--version"]):
        splash.close()
        messagebox.showerror(
            "winget not found",
            "Windows Package Manager (winget) is required to install\n"
            "yt-dlp and ffmpeg automatically.\n\n"
            "Install it from Microsoft's official page:\n"
            f"    {_WINGET_URL}\n\n"
            "Then restart GUI-DLP.",
        )
        return False
    splash.log("✓  winget")

    # ── 2–3. yt-dlp / ffmpeg ───────────────────────────────────────────────
    installed_any = False

    for name, pkg_id, probe_cmd in _DEPS:
        splash.status(f"Checking {name}…")

        if _probe(probe_cmd):
            splash.log(f"✓  {name}")
            continue

        splash.log(f"   {name} not found — installing via winget…")
        splash.status(f"Installing {name}  (this may take a moment)…")

        ok = _winget_install(pkg_id)
        if not ok:
            splash.close()
            messagebox.showerror(
                f"Failed to install {name}",
                f"winget could not install {name} automatically.\n\n"
                f"Run the following command in a terminal, then restart:\n"
                f"    winget install {pkg_id}",
            )
            return False

        splash.log(f"✓  {name} installed")
        installed_any = True

    splash.close()

    # ── 4. If anything was installed, refresh PATH and re-verify ───────────
    if installed_any:
        _refresh_path()

        still_missing = [
            name for name, _, probe_cmd in _DEPS if not _probe(probe_cmd)
        ]
        if still_missing:
            messagebox.showinfo(
                "Restart required",
                "Dependencies were installed successfully, but a restart is\n"
                "needed before the system PATH updates.\n\n"
                "Please close and reopen GUI-DLP.",
            )
            return False

    return True
