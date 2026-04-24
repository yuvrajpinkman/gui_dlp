# GUI-DLP

A desktop GUI wrapper around `yt-dlp` built with Python + pywebview.

It provides:
- A simple one-click mode (quality/audio presets).
- An advanced mode that builds custom `yt-dlp` flags from UI selections.
- Per-download cards with progress, speed, ETA, pause/resume/cancel/remove/delete.
- Automatic dependency checks/install for `yt-dlp` and `ffmpeg` on Windows via `winget`.
- Optional Windows toast notifications when a download completes.

## 1) What this project is

GUI-DLP is a Windows desktop app that:
- launches a native window using `pywebview`,
- renders an HTML/CSS/JS frontend,
- calls Python methods through `window.pywebview.api`, and
- runs `yt-dlp` subprocesses to download media.

Core stack:
- Python 3.12 (project currently built from this environment)
- pywebview
- yt-dlp (installed/verified at runtime)
- ffmpeg (installed/verified at runtime)
- winotify (Windows notifications)
- tkinter (built-in, used for dependency splash/check UI)
- PyInstaller (for building `.exe`)

## 2) Features

### Simple mode presets
- `Best Quality`
- `1080p Video`
- `Audio MP3`
- `Audio AAC`
- `Fast Download` (worst quality stream)
- `MKV Remux`

### Advanced mode controls
- Video quality: auto, 4k, 1440p, 1080p, 720p, 480p, no-video
- Video codec filter: auto, h264, h265/hevc, av1, vp9
- Output container preference: auto, mp4, mkv, webm
- Audio options: auto, aac, mp3, opus, flac, no-audio
- Audio bitrate chips: auto/128/192/256 kbps (shown for lossy formats)
- Subtitles/chapters options:
	- download auto subtitles
	- embed subtitles
	- add chapters
	- SponsorBlock remove sponsor segments
	- no-playlist
- Extra options:
	- embed thumbnail
	- embed metadata
	- rate limit (`--limit-rate`)
	- raw extra `yt-dlp` flags input

### Download queue actions
- Start download
- Pause/resume per card
- Cancel per card
- Remove card from UI
- Delete downloaded file from disk
- Cancel all active/queued
- Clear completed/cancelled/failed cards

## 3) Windows-specific behavior

This project is currently Windows-focused because it uses:
- `winget` for dependency install,
- `winreg` to refresh PATH from Windows registry,
- `winotify` for native toast notifications,
- Win32 focus APIs (`ctypes.windll.user32`) to force the main window to foreground.

## 4) Requirements

Runtime:
- Windows 10/11
- Python 3.12+ recommended
- Internet connection

Python packages (source run/build):
- `pywebview`
- `winotify`
- `pyinstaller` (build only)

External tools (auto-checked/installed at startup):
- `yt-dlp`
- `ffmpeg`

Package manager:
- `winget` must be available on system PATH

## 5) Setup and run (source)

From project root:

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
pip install pywebview winotify pyinstaller
python main.py
```

On first run, dependency checker will:
1. check `winget`
2. check/install `yt-dlp`
3. check/install `ffmpeg`
4. refresh PATH and re-check

If install succeeds but PATH is not yet visible in current session, app asks you to restart.

## 6) Run packaged executable

If you already built it, use:
- `dist/GUI-DLP.exe` (one-file output)

## 7) Build executable (PyInstaller)

Spec file already exists:
- `GUI-DLP.spec`

Build command:

```powershell
pyinstaller GUI-DLP.spec
```

Output:
- `dist/GUI-DLP.exe`

Important spec notes:
- Bundles `web/` as app data.
- Uses hidden import `webview.platforms.winforms`.
- Configured as `onefile=True` and `console=False`.

## 8) How startup works

1. `main.py` calls `ensure_dependencies()` from `checker.py`.
2. `checker.py` shows a tkinter splash and verifies/installs dependencies.
3. If ready, `pywebview.create_window(...)` opens `web/index.html`.
4. JS calls Python through `window.pywebview.api.*`.
5. Python starts download thread(s) and runs `yt-dlp` subprocesses.
6. Python pushes updates back to JS via `window.evaluate_js(...)`.

## 9) API bridge contract (JS <-> Python)

JS -> Python methods:
- `start_download(url, preset, dl_id, extra_flags=None)`
- `cancel_download(dl_id)`
- `pause_download(dl_id)`
- `resume_download(dl_id)`
- `delete_file(dl_id)`

Python -> JS callbacks (by `evaluate_js`):
- `setInfo(id, title, thumbnailUrl, filesize)`
- `updateProgress(id, percent, speed, eta)`
- `downloadFinished(id)`
- `downloadFailed(id, error)`

## 10) Preset/flag behavior

Simple mode preset map in Python:
- `best` -> no extra flags (yt-dlp default best)
- `mp3` -> `-x --audio-format mp3`
- `aac` -> `-x --audio-format aac`
- `1080p` -> `-f bestvideo[height<=1080]+bestaudio/best[height<=1080]`
- `fast` -> `-f worst`
- `mkv` -> `--remux-video mkv`

Advanced mode:
- Frontend composes a full flag list in `buildAdvancedFlags()`.
- If advanced flags exist, backend uses them directly and ignores simple preset flags.

## 11) Download storage and file deletion

Default save directory:
- `%USERPROFILE%\Videos\yt_dlp`

Filename template:
- `%(title)s.%(ext)s`

Delete-file action:
- Attempts exact stem match against stored title.
- Falls back to glob match for sanitized title variants.

## 12) Project structure

```text
gui_dlp/
	main.py                    # App entry, webview window, JS API bridge
	checker.py                 # Dependency checker + optional auto-install flow
	download_manager.py        # yt-dlp subprocess control and progress parsing
	GUI-DLP.spec               # PyInstaller build spec
	README.md                  # Project documentation

	web/
		index.html               # Main UI layout
		css/
			main.css               # Base layout/top bar/url row/tabs/queue shell
			presets.css            # Simple preset cards styling
			advanced.css           # Advanced panel/accordion/chips/forms styling
			components.css         # Download cards/buttons/toasts styling
		js/
			api.js                 # pywebview-ready queue + backend API wrapper
			main.js                # Start-download flow + enter-key handling
			downloads.js           # Card creation/update/actions/status rendering
			presets.js             # Preset labels and preset helper
			advanced.js            # Advanced UI logic + yt-dlp flag generation
			components/
				tabs.js              # Simple/advanced mode switch logic
				toast.js             # Toast helper
				modal.js             # Placeholder for modal logic

	build/                     # PyInstaller intermediate artifacts
	dist/                      # Built executable outputs
	venv/                      # Local virtual environment (dev)
```

## 13) Notes and caveats

- Progress is parsed from `--progress-template %(progress)j` JSON output.
- Pause in current implementation pauses processing loop updates in Python; it is not an OS-level process suspension.
- `flac` option in advanced mode re-encodes available audio; source from platforms like YouTube is usually lossy.
- Some legacy/unused CSS blocks are present in style files; active UI still uses the main dark theme classes.

## 14) Troubleshooting

### `winget` not found
- Install App Installer / Windows Package Manager from Microsoft:
	- https://aka.ms/getwinget

### Dependencies installed but still not detected
- Close and reopen GUI-DLP (PATH refresh may require restart).

### Download fails
- Verify URL works in plain `yt-dlp` from terminal.
- Test network/proxy/firewall restrictions.
- For site-specific auth/age restrictions, pass raw flags in advanced mode (for example cookies flags).

### No thumbnail or unknown filesize
- Metadata endpoint may not expose thumbnail/filesize for that source; download may still complete normally.

## 15) Dev improvement ideas

- Add `requirements.txt` for reproducible installs.
- Add structured logging and optional download error details in UI.
- Add tests for advanced flag builder and deletion matching logic.
- Add platform abstraction if Linux/macOS support is desired.

