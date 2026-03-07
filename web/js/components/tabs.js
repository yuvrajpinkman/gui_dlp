/* Switch between Simple and Advanced mode panels */
function switchMode(mode) {
    currentMode = mode;
    document.getElementById('panel-simple').classList.toggle('hidden',   mode !== 'simple');
    document.getElementById('panel-advanced').classList.toggle('hidden', mode !== 'advanced');
    document.getElementById('tab-simple').classList.toggle('active',     mode === 'simple');
    document.getElementById('tab-advanced').classList.toggle('active',   mode === 'advanced');
}