import subprocess
import json
import glob as glob_module
from pathlib import Path
from winotify import Notification

processes   = {}   # dl_id -> Popen
saved_files = {}   # dl_id -> {"title": str, "dir": str}
paused      = {}   # dl_id -> bool

PRESETS = {
    "best":     [],
    "mp3":      ["-x", "--audio-format", "mp3"],
    "aac":      ["-x", "--audio-format", "aac"],
    "1080p":    ["-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]"],
    "fast":     ["-f", "worst"],
    "mkv":      ["--remux-video", "mkv"],
    "advanced": [],   # flags come entirely from extra_flags
}


def get_info(url):
    """Fetch title, thumbnail URL and approximate filesize via yt-dlp --dump-json."""
    cmd = ["yt-dlp", "--dump-json", "--no-playlist", url]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        data      = json.loads(result.stdout)
        title     = data.get("title", "Unknown Title")
        thumbnail = data.get("thumbnail", "")
        filesize  = data.get("filesize") or data.get("filesize_approx") or 0
        return title, thumbnail, filesize
    except Exception:
        return "Unknown Title", "", 0


def download(url, preset, dl_id, window, extra_flags=None):
    save_path = Path.home() / "Videos" / "yt_dlp"
    save_path.mkdir(parents=True, exist_ok=True)

    # Fetch metadata and push to UI immediately
    title, thumbnail, filesize = get_info(url)
    window.evaluate_js(
        f"setInfo({dl_id}, {json.dumps(title)}, {json.dumps(thumbnail)}, {filesize})"
    )

    # Build flags: advanced overrides preset entirely
    if extra_flags:
        flags = extra_flags
    else:
        flags = PRESETS.get(preset, [])

    output_template = str(save_path / "%(title)s.%(ext)s")

    cmd = [
        "yt-dlp",
        *flags,
        "--progress-template", "%(progress)j",
        "-o", output_template,
        url,
    ]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    processes[dl_id]   = process
    paused[dl_id]      = False
    saved_files[dl_id] = {"title": title, "dir": str(save_path)}

    for line in process.stdout:
        # Pause: block reading until resumed
        while paused.get(dl_id, False):
            import time
            time.sleep(0.3)

        try:
            progress  = json.loads(line)
            total     = progress.get("total_bytes") or progress.get("total_bytes_estimate", 0)
            if total:
                downloaded = progress.get("downloaded_bytes", 0)
                percent    = (downloaded / total) * 100
                speed      = progress.get("speed") or 0
                eta        = progress.get("eta") or 0
                window.evaluate_js(
                    f"updateProgress({dl_id},{percent},{speed},{eta})"
                )
        except Exception:
            pass

    process.wait()
    processes.pop(dl_id, None)
    paused.pop(dl_id, None)

    if process.returncode == 0:
        window.evaluate_js(f"downloadFinished({dl_id})")
        try:
            Notification(
                app_id="GUI-DLP",
                title="Download Complete",
                msg=f"{title} saved to {save_path}",
            ).show()
        except Exception:
            pass
    else:
        window.evaluate_js(f"downloadFailed({dl_id}, 'yt-dlp exited with an error')")


def pause(dl_id):
    if dl_id in paused:
        paused[dl_id] = True


def resume(dl_id):
    if dl_id in paused:
        paused[dl_id] = False


def cancel(dl_id):
    paused.pop(dl_id, None)
    proc = processes.get(dl_id)
    if proc:
        proc.terminate()
        processes.pop(dl_id, None)


def delete_file(dl_id):
    """Delete every file on disk whose stem matches the downloaded video title."""
    info = saved_files.get(dl_id)
    if not info:
        return False

    save_dir = Path(info["dir"])
    title    = info["title"]
    deleted  = False

    if save_dir.exists():
        # Exact stem match (yt-dlp uses the title as the stem)
        for f in save_dir.iterdir():
            if f.is_file() and f.stem == title:
                try:
                    f.unlink()
                    deleted = True
                except Exception:
                    pass

        # Fallback: glob-based match (handles any sanitisation yt-dlp applied)
        if not deleted:
            pattern = str(save_dir / (glob_module.escape(title) + ".*"))
            for path in glob_module.glob(pattern):
                try:
                    Path(path).unlink()
                    deleted = True
                except Exception:
                    pass

    saved_files.pop(dl_id, None)
    return deleted