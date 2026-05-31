import sys
import os
import time
import ctypes
import webview
import threading
import download_manager as dm
from checker import ensure_dependencies

# When packaged as a single exe, files are extracted to sys._MEIPASS at runtime
_BASE = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
_WEB  = os.path.join(_BASE, 'web', 'index.html')


class API:
    def start_download(self, url, preset, dl_id, extra_flags=None):
        thread = threading.Thread(
            target=dm.download,
            args=(url, preset, dl_id, window, extra_flags)
        )
        thread.daemon = True
        thread.start()

    def cancel_download(self, dl_id):
        dm.cancel(dl_id)

    def pause_download(self, dl_id):
        dm.pause(dl_id)

    def resume_download(self, dl_id):
        dm.resume(dl_id)

    def delete_file(self, dl_id):
        return dm.delete_file(dl_id)

    def get_info(self, url):
        """Return title, thumbnail, filesize for a single URL (used for preview)."""
        title, thumbnail, filesize = dm.get_info(url)
        return {"title": title, "thumbnail": thumbnail, "filesize": filesize}

    def get_playlist_info(self, url):
        """Return list of playlist entries for a given URL."""
        return dm.get_playlist_info(url)


api = API()

if not ensure_dependencies():
    sys.exit(0)


def _focus_main_window():
    """Called by webview in a background thread once the GUI loop starts.
    Waits briefly for the native window to appear, then forces it to the
    foreground — counteracting Windows returning focus to the previous app
    after the tkinter checker window closes."""
    time.sleep(0.6)
    hwnd = ctypes.windll.user32.FindWindowW(None, "GUI-DLP")
    if hwnd:
        ctypes.windll.user32.ShowWindow(hwnd, 9)     # SW_RESTORE
        ctypes.windll.user32.SetForegroundWindow(hwnd)


window = webview.create_window(
    "GUI-DLP",
    _WEB,
    js_api=api,
    width=960,
    height=650,
    min_size=(700, 480)
)

webview.start(func=_focus_main_window)