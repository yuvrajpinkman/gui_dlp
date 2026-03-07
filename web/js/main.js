let downloadId = 0;
let currentMode = 'simple'; // set by switchMode() in tabs.js

function startDownload() {
    const url = document.getElementById('url-input').value.trim();
    if (!url) return;

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

    createCard(id, url, preset);
    document.getElementById('url-input').value = '';
    api.startDownload(url, preset, id, extraFlags);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('url-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') startDownload();
    });
});