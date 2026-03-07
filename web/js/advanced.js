/* Toggle accordion section open/closed */
function toggleSection(id) {
    const body = document.getElementById(id);
    const chev = document.getElementById('chev-' + id);
    if (!body) return;
    const collapsed = body.classList.toggle('collapsed');
    if (chev) chev.textContent = collapsed ? '\u25B6' : '\u25BC';
}

/* Toggle the entire advanced options body */
function toggleAdvancedPanel() {
    const body = document.getElementById('adv-panel-body');
    const chev = document.getElementById('adv-panel-chevron');
    if (!body) return;
    const isCollapsed = body.classList.toggle('collapsed');
    if (chev) chev.textContent = isCollapsed ? '▶ Show' : '▼ Hide';
}

/* Collapse the advanced panel (called automatically when download starts) */
function collapseAdvancedPanel() {
    const body = document.getElementById('adv-panel-body');
    const chev = document.getElementById('adv-panel-chevron');
    if (body && !body.classList.contains('collapsed')) {
        body.classList.add('collapsed');
        if (chev) chev.textContent = '▶ Show';
    }
}

/* Show/hide bitrate row based on selected audio codec */
function onAudioChange() {
    const audio = document.querySelector('input[name="adv-audio"]:checked')?.value || '';
    const bitrateRow = document.getElementById('audio-bitrate-row');
    // Show bitrate only for lossy formats that support it
    if (bitrateRow) bitrateRow.style.display = ['mp3','aac','opus'].includes(audio) ? '' : 'none';
    // Clear section-required if a valid codec is now picked
    const audioSection = document.getElementById('sec-audio');
    if (audioSection && audio && audio !== 'none') {
        audioSection.closest('.adv-section').classList.remove('section-required');
    }
}

/* Show/hide sections and enforce audio selection rules */
function onQualityChange() {
    const quality = document.querySelector('input[name="adv-quality"]:checked')?.value || '';
    const isNoVideo = quality === 'no-video';

    // Hide video-only sections when no-video is selected
    ['section-vcodec', 'section-vformat'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isNoVideo ? 'none' : '';
    });

    // When no-video: hide Auto and No-audio chips (both are invalid — user must pick a format)
    const autoChip = document.getElementById('chip-audio-auto');
    const noneChip = document.getElementById('chip-audio-none');
    if (autoChip) autoChip.style.display = isNoVideo ? 'none' : '';
    if (noneChip) noneChip.style.display = isNoVideo ? 'none' : '';

    // When switching to no-video, default to AAC if current selection is Auto or None
    const selectedAudio = document.querySelector('input[name="adv-audio"]:checked')?.value ?? '';
    if (isNoVideo && (selectedAudio === '' || selectedAudio === 'none')) {
        const aacRadio = document.querySelector('input[name="adv-audio"][value="aac"]');
        if (aacRadio) aacRadio.checked = true;
    }

    const audioSection = document.getElementById('sec-audio');
    if (audioSection) audioSection.closest('.adv-section').classList.remove('section-required');
}

/* Validate advanced options before starting — returns true if OK */
function validateAdvanced() {
    const quality = document.querySelector('input[name="adv-quality"]:checked')?.value || '';
    const audio   = document.querySelector('input[name="adv-audio"]:checked')?.value   ?? null;
    if (quality === 'no-video' && (audio === null || audio === '' || audio === 'none')) {
        showToast('Select an audio format before downloading.', 'error');
        // Keep the section highlighted
        const audioSection = document.getElementById('sec-audio');
        if (audioSection) audioSection.closest('.adv-section').classList.add('section-required');
        return false;
    }
    return true;
}

/* Build yt-dlp flags from the advanced panel selections */
function buildAdvancedFlags() {
    const flags = [];

    const quality  = document.querySelector('input[name="adv-quality"]:checked')?.value  || '';
    const vcodec   = document.querySelector('input[name="adv-vcodec"]:checked')?.value   || '';
    const vformat  = document.querySelector('input[name="adv-vformat"]:checked')?.value  || '';
    const audio    = document.querySelector('input[name="adv-audio"]:checked')?.value    || '';

    const isNoVideo = quality === 'no-video';
    const isNoAudio = audio   === 'none';

    const heightMap = { '4k': 2160, '1440p': 1440, '1080p': 1080, '720p': 720, '480p': 480 };
    const vcodecMap = { 'h264': 'avc1', 'h265': 'hvc1', 'av1': 'av01', 'vp9': 'vp09' };
    const audioFmts = ['aac', 'mp3', 'opus', 'flac'];

    const abitrate = document.querySelector('input[name="adv-abitrate"]:checked')?.value || '';

    if (isNoVideo) {
        // Audio-only extraction
        flags.push('-f', 'bestaudio/best', '-x');
        if (audioFmts.includes(audio)) flags.push('--audio-format', audio);
        if (abitrate) flags.push('--audio-quality', abitrate + 'K');
    } else {
        const height = heightMap[quality] || null;
        const vc     = vcodecMap[vcodec]  || null;

        if (height || vc) {
            let videoFmt = 'bestvideo';
            if (height) videoFmt += `[height<=${height}]`;
            if (vc)     videoFmt += `[vcodec^=${vc}]`;

            if (isNoAudio) {
                flags.push('-f', videoFmt);
            } else {
                const fallback = height ? `best[height<=${height}]` : 'best';
                flags.push('-f', `${videoFmt}+bestaudio/${fallback}`);
            }
        }
        // else: fully yt-dlp default — no -f needed

        // Container format (only meaningful for video)
        if (vformat) flags.push('--merge-output-format', vformat);

        // Re-encode audio track when a specific format is requested
        const ppCodecMap = { 'mp3': 'libmp3lame', 'aac': 'aac', 'opus': 'libopus', 'flac': 'flac' };
        if (!isNoAudio && ppCodecMap[audio]) {
            let aargs = `-c:v copy -c:a ${ppCodecMap[audio]}`;
            if (abitrate && ['mp3', 'aac', 'opus'].includes(audio)) {
                aargs += ` -b:a ${abitrate}k`;
            } else if (audio === 'mp3') {
                aargs += ' -q:a 4'; // VBR ~175 kbps default
            }
            flags.push('--postprocessor-args', `ffmpeg:${aargs}`);
        }
    }

    // Subtitles & chapters
    if (document.getElementById('adv-write-subs')?.checked)   flags.push('--write-auto-sub');
    if (document.getElementById('adv-embed-subs')?.checked)   flags.push('--embed-subs');
    if (document.getElementById('adv-chapters')?.checked)     flags.push('--add-chapters');
    if (document.getElementById('adv-sponsorblock')?.checked) flags.push('--sponsorblock-remove', 'sponsor');
    if (document.getElementById('adv-no-playlist')?.checked)  flags.push('--no-playlist');

    // Extra settings
    if (document.getElementById('adv-thumb')?.checked)    flags.push('--embed-thumbnail');
    if (document.getElementById('adv-metadata')?.checked) flags.push('--embed-metadata');

    const ratelimit = document.getElementById('adv-ratelimit')?.value.trim();
    if (ratelimit) flags.push('--limit-rate', ratelimit);

    const raw = document.getElementById('adv-raw')?.value.trim();
    if (raw) flags.push(...raw.split(/\s+/).filter(Boolean));

    return flags.length ? flags : null;
}


