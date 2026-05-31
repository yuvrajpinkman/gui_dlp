// Handles all communication with the Python backend via pywebview bridge.

// Queue calls until pywebview signals it is ready
let _pvReady = false;
const _pvQueue = [];
window.addEventListener('pywebviewready', () => {
    _pvReady = true;
    _pvQueue.splice(0).forEach(fn => fn());
});

function _call(fn) {
    return new Promise((resolve, reject) => {
        const exec = () => {
            try { fn().then(resolve).catch(reject); }
            catch(e) { reject(e); }
        };
        _pvReady ? exec() : _pvQueue.push(exec);
    });
}

const api = {
    startDownload: function(url, preset, dl_id, extra_flags) {
        return _call(() => window.pywebview.api.start_download(url, preset, dl_id, extra_flags));
    },

    cancelDownload: function(dl_id) {
        return _call(() => window.pywebview.api.cancel_download(dl_id));
    },

    pauseDownload: function(dl_id) {
        return _call(() => window.pywebview.api.pause_download(dl_id));
    },

    resumeDownload: function(dl_id) {
        return _call(() => window.pywebview.api.resume_download(dl_id));
    },

    deleteFile: function(dl_id) {
        return _call(() => window.pywebview.api.delete_file(dl_id));
    },

    // Returns {title, thumbnail, filesize} for a single URL
    getInfo: function(url) {
        return _call(() => window.pywebview.api.get_info(url));
    },

    // Returns [{title, url, thumbnail, duration}, ...] for a playlist URL
    getPlaylistInfo: function(url) {
        return _call(() => window.pywebview.api.get_playlist_info(url));
    },
};