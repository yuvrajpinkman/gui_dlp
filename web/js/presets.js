// Returns the selected simple preset value (used by main.js)
function getSelectedPreset() {
    return document.querySelector('input[name="preset"]:checked')?.value || 'best';
}

// Kept for reference — mapping of preset value to label
const PRESET_LABELS = {
    best:   'Best Quality',
    '1080p':'1080p Video',
    mp3:    'Audio MP3',
    aac:    'Audio AAC',
    fast:   'Fast Download',
    mkv:    'MKV Remux',
    advanced: 'Custom',
};
