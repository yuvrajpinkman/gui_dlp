const downloads = {};

function createCard(id, url, preset, knownTitle, knownThumb) {
    const card        = document.createElement('div');
    card.className    = 'card active';
    card.id           = 'card-' + id;
    card.innerHTML    = `
        <div class="card-thumb-placeholder" id="thumb-${id}">No Thumbnail</div>
        <div class="card-body">
            <div class="card-title"   id="title-${id}">${knownTitle || 'Fetching info…'}</div>
            <div class="card-meta">
                <span id="size-${id}">--</span>
                <span id="preset-label-${id}">${PRESET_LABELS[preset] || preset}</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" id="bar-${id}"></div>
            </div>
            <div class="card-stats">
                <span id="speed-${id}">Speed: --</span>
                <span id="eta-${id}">ETA: --</span>
                <span id="percent-${id}">0%</span>
            </div>
            <span class="card-status-badge badge-queued" id="badge-${id}">Queued</span>
        </div>
        <div class="card-actions" id="actions-${id}">
            <button class="btn-cancel" onclick="cancelDownload(${id})">Cancel</button>
            <button class="btn-pause"  onclick="togglePause(${id})" id="pause-btn-${id}">Pause</button>
            <button class="btn-remove" onclick="removeCard(${id})">Remove</button>
            <button class="btn-delete" onclick="deleteFile(${id})">Delete File</button>
        </div>
    `;
    document.getElementById('cards').prepend(card);
    downloads[id] = { status: 'queued', paused: false };

    // If we already know the thumbnail (e.g. from playlist preview), set it now
    if (knownThumb) {
        _setThumb(id, knownThumb);
    }
}

function _setThumb(id, url) {
    const thumbEl = document.getElementById('thumb-' + id);
    if (!thumbEl || !url) return;
    const img     = document.createElement('img');
    img.src       = url;
    img.className = 'card-thumb';
    img.id        = 'thumb-' + id;
    img.onerror   = () => { img.style.display = 'none'; };
    thumbEl.replaceWith(img);
}

/* Called from Python via evaluate_js */
function setInfo(id, title, thumbnailUrl, filesize) {
    const titleEl = document.getElementById('title-'  + id);
    const sizeEl  = document.getElementById('size-'   + id);
    if (titleEl) titleEl.textContent = title;
    if (sizeEl)  sizeEl.textContent  = filesize ? formatBytes(filesize) : 'Unknown size';
    _setThumb(id, thumbnailUrl);
    setBadge(id, 'downloading');
    if (downloads[id]) downloads[id].status = 'downloading';
}

function updateProgress(id, percent, speed, eta) {
    const bar = document.getElementById('bar-'     + id);
    const s   = document.getElementById('speed-'   + id);
    const e   = document.getElementById('eta-'     + id);
    const p   = document.getElementById('percent-' + id);
    if (bar) bar.style.width  = percent.toFixed(1) + '%';
    if (s)   s.textContent    = 'Speed: ' + formatSpeed(speed);
    if (e)   e.textContent    = 'ETA: '   + formatETA(eta);
    if (p)   p.textContent    = percent.toFixed(1) + '%';
}

function downloadFinished(id) {
    const bar = document.getElementById('bar-' + id);
    if (bar) bar.style.width = '100%';
    const pct = document.getElementById('percent-' + id);
    if (pct) pct.textContent = '100%';
    const s = document.getElementById('speed-' + id);
    const e = document.getElementById('eta-'   + id);
    if (s) s.textContent = 'Speed: --';
    if (e) e.textContent = 'ETA: Done';
    setBadge(id, 'completed');
    setCardState(id, 'completed');
    if (downloads[id]) downloads[id].status = 'completed';
    document.querySelector('#actions-' + id + ' .btn-cancel')?.remove();
    document.getElementById('pause-btn-' + id)?.remove();
}

function downloadFailed(id, error) {
    setBadge(id, 'failed');
    setCardState(id, 'failed');
    if (downloads[id]) downloads[id].status = 'failed';
    const t = document.getElementById('title-' + id);
    if (t && error) t.textContent += ' — ' + error;
    document.querySelector('#actions-' + id + ' .btn-cancel')?.remove();
    document.getElementById('pause-btn-' + id)?.remove();
}

function cancelDownload(id) {
    api.cancelDownload(id);
    setBadge(id, 'cancelled');
    setCardState(id, 'cancelled');
    if (downloads[id]) downloads[id].status = 'cancelled';
    document.querySelector('#actions-' + id + ' .btn-cancel')?.remove();
    document.getElementById('pause-btn-' + id)?.remove();
}

function togglePause(id) {
    const btn = document.getElementById('pause-btn-' + id);
    const dl  = downloads[id];
    if (!dl || !btn) return;
    if (dl.paused) {
        api.resumeDownload(id);
        dl.paused       = false;
        btn.textContent = 'Pause';
        setCardState(id, 'active');
        setBadge(id, 'downloading');
    } else {
        api.pauseDownload(id);
        dl.paused       = true;
        btn.textContent = 'Resume';
        setCardState(id, 'paused');
        setBadge(id, 'paused');
    }
}

function removeCard(id) {
    const card = document.getElementById('card-' + id);
    if (card) {
        card.style.transition = 'opacity 0.2s';
        card.style.opacity    = '0';
        setTimeout(() => card.remove(), 200);
    }
    delete downloads[id];
}

function deleteFile(id) {
    api.deleteFile(id).then(ok => {
        if (!ok) showToast('Could not find file on disk — card removed.', 'error');
        removeCard(id);
    });
}

function cancelAll() {
    Object.keys(downloads).forEach(id => {
        if (['downloading','queued','paused'].includes(downloads[id].status))
            cancelDownload(parseInt(id));
    });
}

function clearCompleted() {
    Object.keys(downloads).forEach(id => {
        if (['completed','cancelled','failed'].includes(downloads[id].status))
            removeCard(parseInt(id));
    });
}

function setBadge(id, state) {
    const badge = document.getElementById('badge-' + id);
    if (!badge) return;
    const map = {
        queued:      ['badge-queued',      'Queued'],
        downloading: ['badge-downloading', 'Downloading'],
        completed:   ['badge-completed',   'Completed'],
        failed:      ['badge-failed',      'Failed'],
        cancelled:   ['badge-cancelled',   'Cancelled'],
        paused:      ['badge-paused',      'Paused'],
    };
    const [cls, label] = map[state] || ['badge-queued', state];
    badge.className   = 'card-status-badge ' + cls;
    badge.textContent = label;
}

function setCardState(id, state) {
    const card = document.getElementById('card-' + id);
    if (card) card.className = 'card ' + state;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    if (m > 0) {
        return `${m}:${String(s).padStart(2,'0')}`;
    }
    // Under a minute — show 1 decimal
    return `${s.toFixed(1)}s`;
}

function formatBytes(b) {
    if (!b)      return 'Unknown';
    if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
    if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
    return (b / 1e3).toFixed(0) + ' KB';
}

function formatSpeed(bps) {
    if (!bps)      return '--';
    if (bps > 1e6) return (bps / 1e6).toFixed(2) + ' MB/s';
    return (bps / 1e3).toFixed(1) + ' KB/s';
}