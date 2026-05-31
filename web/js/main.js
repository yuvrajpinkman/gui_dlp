let downloadId  = 0;
let currentMode = 'simple'; // set by switchMode() in tabs.js

// ── URL preview state ─────────────────────────────────────────────────────────
let _previewTimer   = null;
let _previewUrl     = '';
let _previewData    = null;   // {title, thumbnail, filesize} from last successful getInfo

function _isUrl(str) {
    try { return Boolean(new URL(str).hostname); } catch { return false; }
}

function _updatePreview(url) {
    const box = document.getElementById('url-preview');
    if (!box) return;

    if (!url) {
        box.style.display = 'none';
        _previewData = null;
        return;
    }

    // Show loading state
    box.style.display = 'flex';
    box.innerHTML = `<span class="preview-loading">Fetching info…</span>`;

    api.getInfo(url).then(info => {
        _previewData = info;
        const sizeStr = info.filesize ? `· ${formatBytes(info.filesize)}` : '';
        box.innerHTML = `
            ${info.thumbnail
                ? `<img class="preview-thumb" src="${info.thumbnail}" onerror="this.style.display='none'" />`
                : `<div class="preview-thumb-placeholder"></div>`}
            <div class="preview-meta">
                <div class="preview-title">${info.title}</div>
                <div class="preview-sub">${sizeStr}</div>
            </div>
        `;
    }).catch(() => {
        box.style.display = 'none';
        _previewData = null;
    });
}

function _clearPreview() {
    const box = document.getElementById('url-preview');
    if (box) box.style.display = 'none';
    _previewData = null;
    _previewUrl  = '';
}

// ── Start download ────────────────────────────────────────────────────────────

function startDownload() {
    const url = document.getElementById('url-input').value.trim();
    if (!url) return;

    const isPlaylist = document.getElementById('playlist-chk')?.checked;

    if (isPlaylist) {
        _startPlaylistDownload(url);
    } else {
        _startSingleDownload(url);
    }

    document.getElementById('url-input').value = '';
    _clearPreview();
}

function _startSingleDownload(url) {
    const id = ++downloadId;
    let preset     = 'best';
    let extraFlags = null;

    if (currentMode === 'simple') {
        preset = document.querySelector('input[name="preset"]:checked')?.value || 'best';
    } else {
        if (!validateAdvanced()) return;
        extraFlags = buildAdvancedFlags();
        preset     = 'advanced';
        collapseAdvancedPanel();
    }

    // Pass known title/thumb from preview so card shows them immediately
    const knownTitle = _previewData?.title   || null;
    const knownThumb = _previewData?.thumbnail || null;

    createCard(id, url, preset, knownTitle, knownThumb);
    api.startDownload(url, preset, id, extraFlags);
}

function _startPlaylistDownload(url) {
    const preset = currentMode === 'simple'
        ? (document.querySelector('input[name="preset"]:checked')?.value || 'best')
        : 'advanced';

    const extraFlags = currentMode === 'advanced'
        ? (validateAdvanced() ? buildAdvancedFlags() : null)
        : null;

    if (currentMode === 'advanced' && extraFlags === null) return;

    // Show a temporary "fetching playlist" card slot
    const placeholderId = ++downloadId;
    showToast('Fetching playlist info…', 'info');

    api.getPlaylistInfo(url).then(entries => {
        if (!entries || entries.length === 0) {
            showToast('No playlist entries found — trying as single video.', 'error');
            _startSingleDownload(url);
            return;
        }

        showToast(`Starting playlist — ${entries.length} video${entries.length > 1 ? 's' : ''}`, 'success');

        entries.forEach(entry => {
            if (!entry.url) return;
            const id = ++downloadId;
            createCard(id, entry.url, preset, entry.title, entry.thumbnail);
            api.startDownload(entry.url, preset, id, extraFlags);
        });
    }).catch(() => {
        showToast('Failed to fetch playlist — trying as single video.', 'error');
        _startSingleDownload(url);
    });
}

// ── DOM ready ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('url-input');

    // Enter key triggers download
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') startDownload();
    });

    // Debounced URL preview on input
    input.addEventListener('input', () => {
        clearTimeout(_previewTimer);
        const val = input.value.trim();
        if (!val || !_isUrl(val)) {
            _clearPreview();
            return;
        }
        if (val === _previewUrl) return; // same URL, skip
        _previewUrl  = val;
        _previewData = null;
        _previewTimer = setTimeout(() => _updatePreview(val), 600);
    });

    // Paste event — trigger preview immediately after paste settles
    input.addEventListener('paste', () => {
        clearTimeout(_previewTimer);
        _previewTimer = setTimeout(() => {
            const val = input.value.trim();
            if (val && _isUrl(val)) {
                _previewUrl = val;
                _updatePreview(val);
            }
        }, 100);
    });
});