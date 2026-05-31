import re
import time
import subprocess
import json
import glob as glob_module
from pathlib import Path
from winotify import Notification

processes   = {}   # dl_id -> Popen
saved_files = {}   # dl_id -> {"title": str, "dir": str, "paths": set}
paused      = {}   # dl_id -> bool

# Patterns to capture the actual file yt-dlp writes to disk
_DEST_RE  = re.compile(r'^\[download\] Destination: (.+)$')
_MERGE_RE = re.compile(r'^\[Merger\] Merging formats into "(.+)"$')
_MOVE_RE  = re.compile(r'^\[MoveFiles\] Moving file (.+) to (.+)$')
_ALREADY_RE = re.compile(r'^\[download\] (.+) has already been downloaded$')

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
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        # yt-dlp may emit warning lines before the JSON — scan for first valid JSON object
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line or not line.startswith('{'):
                continue
            try:
                data      = json.loads(line)
                title     = data.get("title") or "Unknown Title"
                thumbnail = data.get("thumbnail", "")
                filesize  = data.get("filesize") or data.get("filesize_approx") or 0
                return title, thumbnail, filesize
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return "Unknown Title", "", 0


def get_playlist_info(url):
    """Return a list of {title, url, thumbnail, duration} for every entry in a playlist.
    Falls back to a single-item list for plain video URLs."""
    cmd = ["yt-dlp", "--flat-playlist", "--dump-json", url]
    try:
        result  = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        entries = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                entry_url = (
                    data.get("url") or
                    data.get("webpage_url") or
                    data.get("original_url") or ""
                )
                # yt-dlp flat-playlist gives short IDs — build full URL when needed
                if entry_url and not entry_url.startswith("http"):
                    vid_id = data.get("id", "")
                    entry_url = f"https://www.youtube.com/watch?v={vid_id}" if vid_id else ""
                entries.append({
                    "title":     data.get("title", "Unknown"),
                    "url":       entry_url,
                    "thumbnail": data.get("thumbnail") or data.get("thumbnails", [{}])[-1].get("url", ""),
                    "duration":  data.get("duration", 0),
                })
            except Exception:
                pass
        return entries if entries else []
    except Exception:
        return []


def download(url, preset, dl_id, window, extra_flags=None):
    save_path = Path.home() / "Videos" / "yt_dlp"
    save_path.mkdir(parents=True, exist_ok=True)

    # Fetch metadata and push to UI immediately
    title, thumbnail, filesize = get_info(url)
    window.evaluate_js(
        f"setInfo({dl_id}, {json.dumps(title)}, {json.dumps(thumbnail)}, {filesize})"
    )

    # Build flags: advanced overrides preset entirely
    flags = extra_flags if extra_flags else PRESETS.get(preset, [])

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
    saved_files[dl_id] = {"title": title, "dir": str(save_path), "paths": set()}

    for line in process.stdout:
        # Pause: block reading until resumed
        while paused.get(dl_id, False):
            time.sleep(0.3)

        stripped = line.strip()

        # ── Track actual file paths written by yt-dlp ──────────────────────
        m = _DEST_RE.match(stripped)
        if m:
            saved_files[dl_id]["paths"].add(m.group(1).strip())

        m = _MERGE_RE.match(stripped)
        if m:
            saved_files[dl_id]["paths"].add(m.group(1).strip())

        m = _MOVE_RE.match(stripped)
        if m:
            # source is being replaced by destination — track destination
            saved_files[dl_id]["paths"].discard(m.group(1).strip())
            saved_files[dl_id]["paths"].add(m.group(2).strip())

        m = _ALREADY_RE.match(stripped)
        if m:
            saved_files[dl_id]["paths"].add(m.group(1).strip())

        # ── Progress JSON ───────────────────────────────────────────────────
        try:
            progress  = json.loads(stripped)
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
    """Delete the file(s) yt-dlp actually wrote to disk for this download."""
    info = saved_files.get(dl_id)
    if not info:
        return False

    deleted = False

    # Primary: delete every path we captured from yt-dlp output
    for path_str in list(info.get("paths", [])):
        p = Path(path_str)
        if p.exists() and p.is_file():
            try:
                p.unlink()
                deleted = True
            except Exception:
                pass

    # Fallback: if we didn't capture a path (e.g. very old yt-dlp),
    # scan the save dir for files whose stem starts with the title (fuzzy)
    if not deleted:
        save_dir = Path(info["dir"])
        title    = info["title"]
        if save_dir.exists():
            # yt-dlp replaces : / \ | ? * < > " with _ or - 
            # so compare lowercased first 40 chars of stem vs title
            prefix = re.sub(r'[^\w\s]', '', title[:40]).lower().strip()
            for f in save_dir.iterdir():
                if not f.is_file():
                    continue
                stem_clean = re.sub(r'[^\w\s]', '', f.stem[:40]).lower().strip()
                if stem_clean == prefix:
                    try:
                        f.unlink()
                        deleted = True
                    except Exception:
                        pass

    saved_files.pop(dl_id, None)
    return deleted