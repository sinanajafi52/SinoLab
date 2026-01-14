/**
 * SinoLab WebApp - Dashboard Module
 * Real-time pump control and monitoring
 */

// ========================================
// STATE
// ========================================
let currentDeviceId = null;
let deviceStatus = null;
let deviceInfo = null;
let deviceSettings = null;
let isCalibrated = false;
let isPumpRunning = false;
let currentDirection = 'CW'; // CW or CCW
let targetRPM = 100;
let dispenseMode = 'rpm'; // 'rpm' or 'volume'

// Firebase listeners
let statusListener = null;
let settingsListener = null;
let infoListener = null;
let controlListener = null;
let connectionListener = null;

// UI Elements
const el = {};

// ========================================
// INITIALIZATION
// ========================================
function initDashboard() {
    console.log('Initializing dashboard...');

    currentDeviceId = Utils.getSavedDeviceId();
    if (!currentDeviceId) {
        Utils.navigateTo('device.html');
        return;
    }

    Auth.initProtectedPage(async (user) => {
        cacheElements();
        setupEventHandlers();
        setupNavigation();
        subscribeToDevice();
        setupConnectionMonitoring();
        Device.setupChangeDeviceButton();

        // Update sidebar device ID
        if (el.sidebarDeviceId) {
            el.sidebarDeviceId.textContent = currentDeviceId;
        }

        // Enable controls initially (pump is stopped)
        setControlsEnabled(true);

        // Initialize direction display
        updateDirectionDisplay();
    });
}

function cacheElements() {
    // Sidebar
    el.sidebarDeviceId = document.getElementById('sidebarDeviceId');
    el.sidebarConnectionStatus = document.getElementById('sidebarConnectionStatus');
    el.mobileConnectionStatus = document.getElementById('mobileConnectionStatus');
    el.lockOverlay = document.getElementById('lockOverlay');

    // Status page - Pump Control
    el.calibWarning = document.getElementById('calibWarning');
    el.rpmMinus = document.getElementById('rpmMinus');
    el.rpmPlus = document.getElementById('rpmPlus');
    el.rpmInput = document.getElementById('rpmInput');
    el.rpmSlider = document.getElementById('rpmSlider');
    el.flowDisplayBox = document.getElementById('flowDisplayBox');
    el.flowValue = document.getElementById('flowValue');
    el.directionBtn = document.getElementById('directionBtn');
    el.directionArrow = document.getElementById('directionArrow');
    el.directionLabel = document.getElementById('directionLabel');
    el.totalFlowValue = document.getElementById('totalFlowValue');
    el.startStopBtn = document.getElementById('startStopBtn');
    el.startStopIcon = document.getElementById('startStopIcon');
    el.startStopText = document.getElementById('startStopText');
    el.lastUpdated = document.getElementById('lastUpdated');

    // Status info panel
    el.pumpStatus = document.getElementById('pumpStatus');
    el.currentRPM = document.getElementById('currentRPM');
    el.controlMode = document.getElementById('controlMode');
    el.sessionDispensed = document.getElementById('sessionDispensed');

    // Dispense page - Mode tabs
    el.rpmModeTab = document.getElementById('rpmModeTab');
    el.volumeModeTab = document.getElementById('volumeModeTab');
    el.rpmDispensePanel = document.getElementById('rpmDispensePanel');
    el.volumeDispensePanel = document.getElementById('volumeDispensePanel');
    el.dispenseWarning = document.getElementById('dispenseWarning');

    // RPM-based dispense
    el.dispenseRpmInput = document.getElementById('dispenseRpmInput');
    el.dispenseRpmSlider = document.getElementById('dispenseRpmSlider');
    el.dispenseOnTime = document.getElementById('dispenseOnTime');
    el.dispenseOffTime = document.getElementById('dispenseOffTime');
    el.dispenseRpmDirCW = document.getElementById('dispenseRpmDirCW');
    el.dispenseRpmDirCCW = document.getElementById('dispenseRpmDirCCW');
    el.rpmDispenseBtn = document.getElementById('rpmDispenseBtn');

    // Volume-based dispense
    el.volumeInput = document.getElementById('volumeInput');
    el.volumeRpmInput = document.getElementById('volumeRpmInput');
    el.volumeRpmSlider = document.getElementById('volumeRpmSlider');
    el.volumeOffTime = document.getElementById('volumeOffTime');
    el.volumeDirCW = document.getElementById('volumeDirCW');
    el.volumeDirCCW = document.getElementById('volumeDirCCW');
    el.estimatedTime = document.getElementById('estimatedTime');
    el.volumeDispenseBtn = document.getElementById('volumeDispenseBtn');

    // System Info
    el.infoDeviceName = document.getElementById('infoDeviceName');
    el.infoDeviceId = document.getElementById('infoDeviceId');
    el.infoFirmware = document.getElementById('infoFirmware');
    el.infoIP = document.getElementById('infoIP');
    el.infoMAC = document.getElementById('infoMAC');
    el.infoLastSeen = document.getElementById('infoLastSeen');
    el.infoRuntime = document.getElementById('infoRuntime');
    el.settingsTube = document.getElementById('settingsTube');
    el.settingsMlPerRev = document.getElementById('settingsMlPerRev');
    el.settingsCalibrationType = document.getElementById('settingsCalibrationType');
    el.settingsLastCalibrated = document.getElementById('settingsLastCalibrated');
    el.settingsAntiDrip = document.getElementById('settingsAntiDrip');
}

// ========================================
// EVENT HANDLERS
// ========================================
function setupEventHandlers() {
    // RPM Controls
    if (el.rpmMinus) {
        el.rpmMinus.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            adjustRPM(-10);
        });
    }
    if (el.rpmPlus) {
        el.rpmPlus.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            adjustRPM(10);
        });
    }
    if (el.rpmInput) {
        el.rpmInput.addEventListener('change', (e) => {
            const val = Math.min(400, Math.max(0, parseInt(e.target.value) || 0));
            setRPM(val);
        });
    }
    if (el.rpmSlider) {
        el.rpmSlider.addEventListener('input', (e) => {
            setRPM(parseInt(e.target.value));
        });
    }

    // Flow display box click - show calibration message if not calibrated
    if (el.flowDisplayBox) {
        el.flowDisplayBox.addEventListener('click', () => {
            if (!isCalibrated) {
                Utils.showWarning('Please set tube size and calibrate from the device first.');
            }
        });
    }

    // Direction button
    if (el.directionBtn) {
        el.directionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Direction button clicked');
            toggleDirection();
        });
    }

    // Start/Stop button
    if (el.startStopBtn) {
        el.startStopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Start/Stop button clicked');
            togglePump();
        });
    }

    // Dispense mode tabs
    if (el.rpmModeTab) {
        el.rpmModeTab.addEventListener('click', () => switchDispenseMode('rpm'));
    }
    if (el.volumeModeTab) {
        el.volumeModeTab.addEventListener('click', () => switchDispenseMode('volume'));
    }

    // RPM-based dispense handlers
    if (el.dispenseRpmSlider) {
        el.dispenseRpmSlider.addEventListener('input', (e) => {
            if (el.dispenseRpmInput) el.dispenseRpmInput.value = e.target.value;
        });
    }
    if (el.dispenseRpmInput) {
        el.dispenseRpmInput.addEventListener('change', (e) => {
            const val = Math.min(400, Math.max(10, parseInt(e.target.value) || 100));
            e.target.value = val;
            if (el.dispenseRpmSlider) el.dispenseRpmSlider.value = val;
        });
    }
    if (el.dispenseOnTime) {
        el.dispenseOnTime.addEventListener('change', (e) => {
            const val = Math.min(10, Math.max(0.1, parseFloat(e.target.value) || 1));
            e.target.value = val;
        });
    }
    if (el.dispenseOffTime) {
        el.dispenseOffTime.addEventListener('change', (e) => {
            const val = Math.min(10, Math.max(0, parseFloat(e.target.value) || 0));
            e.target.value = val;
        });
    }
    if (el.dispenseRpmDirCW) {
        el.dispenseRpmDirCW.addEventListener('click', () => {
            el.dispenseRpmDirCW.classList.add('active');
            if (el.dispenseRpmDirCCW) el.dispenseRpmDirCCW.classList.remove('active');
        });
    }
    if (el.dispenseRpmDirCCW) {
        el.dispenseRpmDirCCW.addEventListener('click', () => {
            el.dispenseRpmDirCCW.classList.add('active');
            if (el.dispenseRpmDirCW) el.dispenseRpmDirCW.classList.remove('active');
        });
    }
    if (el.rpmDispenseBtn) {
        el.rpmDispenseBtn.addEventListener('click', dispenseRpmBased);
    }

    // Volume-based dispense handlers
    if (el.volumeRpmSlider) {
        el.volumeRpmSlider.addEventListener('input', (e) => {
            if (el.volumeRpmInput) el.volumeRpmInput.value = e.target.value;
            updateEstimatedTime();
            updateMaxVolume();
        });
    }
    if (el.volumeRpmInput) {
        el.volumeRpmInput.addEventListener('change', (e) => {
            const val = Math.min(400, Math.max(10, parseInt(e.target.value) || 100));
            e.target.value = val;
            if (el.volumeRpmSlider) el.volumeRpmSlider.value = val;
            updateEstimatedTime();
            updateMaxVolume();
        });
    }
    if (el.volumeInput) {
        el.volumeInput.addEventListener('input', () => {
            enforceVolumeLimit();
            updateEstimatedTime();
        });
    }
    if (el.volumeOffTime) {
        el.volumeOffTime.addEventListener('change', (e) => {
            const val = Math.min(10, Math.max(0, parseFloat(e.target.value) || 0));
            e.target.value = val;
        });
    }
    if (el.volumeDirCW) {
        el.volumeDirCW.addEventListener('click', () => {
            el.volumeDirCW.classList.add('active');
            if (el.volumeDirCCW) el.volumeDirCCW.classList.remove('active');
        });
    }
    if (el.volumeDirCCW) {
        el.volumeDirCCW.addEventListener('click', () => {
            el.volumeDirCCW.classList.add('active');
            if (el.volumeDirCW) el.volumeDirCW.classList.remove('active');
        });
    }
    if (el.volumeDispenseBtn) {
        el.volumeDispenseBtn.addEventListener('click', dispenseVolume);
    }
}

// ========================================
// DISPENSE MODE SWITCHING
// ========================================
function switchDispenseMode(mode) {
    dispenseMode = mode;

    if (mode === 'rpm') {
        if (el.rpmModeTab) el.rpmModeTab.classList.add('active');
        if (el.volumeModeTab) el.volumeModeTab.classList.remove('active');
        if (el.rpmDispensePanel) el.rpmDispensePanel.classList.add('active');
        if (el.volumeDispensePanel) el.volumeDispensePanel.classList.remove('active');
    } else {
        if (el.rpmModeTab) el.rpmModeTab.classList.remove('active');
        if (el.volumeModeTab) el.volumeModeTab.classList.add('active');
        if (el.rpmDispensePanel) el.rpmDispensePanel.classList.remove('active');
        if (el.volumeDispensePanel) el.volumeDispensePanel.classList.add('active');
    }
}

// ========================================
// NAVIGATION
// ========================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const menuToggle = document.getElementById('menuToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.querySelector('.sidebar');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Check if pump is running - block navigation
            if (isPumpRunning) {
                showRunningLockMessage();
                return;
            }

            const page = item.dataset.page;

            // Update active nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show selected page
            document.querySelectorAll('.dashboard-page').forEach(p => p.classList.remove('active'));
            const targetPage = document.getElementById(page + 'Page');
            if (targetPage) targetPage.classList.add('active');

            // Close mobile sidebar
            if (sidebar) sidebar.classList.remove('open');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        });
    });

    // Mobile menu
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            if (sidebar) sidebar.classList.toggle('open');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });
    }
}

function showRunningLockMessage() {
    if (el.lockOverlay) {
        el.lockOverlay.classList.add('show');
        setTimeout(() => {
            el.lockOverlay.classList.remove('show');
        }, 2000);
    }
}

// ========================================
// RPM CONTROL
// ========================================
function setRPM(value) {
    targetRPM = Math.min(400, Math.max(0, value));

    if (el.rpmInput) el.rpmInput.value = targetRPM;
    if (el.rpmSlider) {
        el.rpmSlider.value = targetRPM;
        // Update slider background
        const percent = (targetRPM / 400) * 100;
        el.rpmSlider.style.setProperty('--slider-percent', percent + '%');
    }

    updateFlowDisplay();
}

function adjustRPM(delta) {
    setRPM(targetRPM + delta);
}

// ========================================
// DIRECTION CONTROL
// ========================================
function toggleDirection() {
    if (isPumpRunning) return; // Don't allow direction change while running

    currentDirection = currentDirection === 'CW' ? 'CCW' : 'CW';
    console.log('Direction changed to:', currentDirection);
    updateDirectionDisplay();
}

function updateDirectionDisplay() {
    console.log('Updating direction display:', currentDirection);
    if (el.directionArrow) {
        el.directionArrow.textContent = currentDirection === 'CW' ? '↻' : '↺';
    }
    if (el.directionLabel) {
        el.directionLabel.textContent = currentDirection;
    }
}

// ========================================
// FLOW CALCULATION
// ========================================
function updateFlowDisplay() {
    if (!el.flowValue) return;

    const mlPerRev = deviceSettings?.mlPerRev || 0;

    if (mlPerRev > 0 && targetRPM > 0) {
        // Flow (ml/min) = RPM × mlPerRev
        const flow = targetRPM * mlPerRev;
        el.flowValue.textContent = flow.toFixed(2);
    } else {
        el.flowValue.textContent = '--';
    }
}

// ========================================
// START/STOP PUMP
// ========================================
async function togglePump() {
    console.log('togglePump called, isPumpRunning:', isPumpRunning);
    if (isPumpRunning) {
        await stopPump();
    } else {
        await startPump();
    }
}

async function startPump() {
    if (!currentDeviceId) return;

    if (targetRPM <= 0) {
        Utils.showWarning('Please set RPM higher than 0');
        return;
    }

    try {
        Utils.showLoading('Starting pump...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'START',
            rpm: targetRPM,
            direction: currentDirection,
            onTime: 0,
            offTime: 0,
            targetVolume: 0,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        // Optimistic UI update
        setPumpRunning(true);

        Utils.hideLoading();
        Utils.showSuccess('Pump started');
    } catch (error) {
        Utils.hideLoading();
        console.error('Error starting pump:', error);
        Utils.showError('Failed to start pump');
    }
}

async function stopPump() {
    if (!currentDeviceId) return;

    try {
        Utils.showLoading('Stopping pump...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').update({
            command: 'STOP',
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        // Optimistic UI update
        setPumpRunning(false);

        Utils.hideLoading();
        Utils.showSuccess('Pump stopped');
    } catch (error) {
        Utils.hideLoading();
        console.error('Error stopping pump:', error);
        Utils.showError('Failed to stop pump');
    }
}

// ========================================
// PUMP STATE MANAGEMENT
// ========================================
function setPumpRunning(running) {
    console.log('setPumpRunning:', running);
    isPumpRunning = running;

    // Update Start/Stop button
    if (el.startStopBtn) {
        if (running) {
            el.startStopBtn.classList.add('running');
            if (el.startStopIcon) el.startStopIcon.textContent = '⏹';
            if (el.startStopText) el.startStopText.textContent = 'Stop';
        } else {
            el.startStopBtn.classList.remove('running');
            if (el.startStopIcon) el.startStopIcon.textContent = '▷';
            if (el.startStopText) el.startStopText.textContent = 'Start';
        }
    }

    // Update status display
    if (el.pumpStatus) {
        if (running) {
            el.pumpStatus.textContent = 'Running';
            el.pumpStatus.classList.remove('stopped');
            el.pumpStatus.classList.add('running');
        } else {
            el.pumpStatus.textContent = 'Stopped';
            el.pumpStatus.classList.remove('running');
            el.pumpStatus.classList.add('stopped');
        }
    }

    // Enable/disable controls based on running state
    setControlsEnabled(!running);
}

function setControlsEnabled(enabled) {
    // RPM controls
    if (el.rpmMinus) el.rpmMinus.disabled = !enabled;
    if (el.rpmPlus) el.rpmPlus.disabled = !enabled;
    if (el.rpmInput) el.rpmInput.disabled = !enabled;
    if (el.rpmSlider) el.rpmSlider.disabled = !enabled;

    // Direction control
    if (el.directionBtn) el.directionBtn.disabled = !enabled;
}

// ========================================
// RPM-BASED DISPENSE
// ========================================
async function dispenseRpmBased() {
    if (!currentDeviceId || isPumpRunning) return;

    const rpm = parseInt(el.dispenseRpmInput?.value) || 100;
    const onTime = parseFloat(el.dispenseOnTime?.value) || 1;
    const offTime = parseFloat(el.dispenseOffTime?.value) || 0;
    const direction = el.dispenseRpmDirCCW?.classList.contains('active') ? 'CCW' : 'CW';

    if (rpm < 10 || rpm > 400) {
        Utils.showWarning('Speed must be between 10 and 400 RPM');
        return;
    }

    if (onTime <= 0 || onTime > 10) {
        Utils.showWarning('On Time must be between 0.1 and 10 seconds');
        return;
    }

    if (offTime < 0 || offTime > 10) {
        Utils.showWarning('Off Time must be between 0 and 10 seconds');
        return;
    }

    try {
        Utils.showLoading('Starting dispense...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'DISPENSE_TIMED',
            rpm: rpm,
            direction: direction,
            onTime: onTime * 1000, // Convert to ms
            offTime: offTime * 1000, // Convert to ms
            targetVolume: 0,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        // Optimistic UI update
        setPumpRunning(true);

        Utils.hideLoading();
        Utils.showSuccess(`Running at ${rpm} RPM for ${onTime}s`);
    } catch (error) {
        Utils.hideLoading();
        console.error('Error starting dispense:', error);
        Utils.showError('Failed to start dispense');
    }
}

// ========================================
// VOLUME-BASED DISPENSE
// ========================================
function updateEstimatedTime() {
    if (!el.estimatedTime) return;

    const volume = parseFloat(el.volumeInput?.value) || 0;
    const rpm = parseInt(el.volumeRpmInput?.value) || 100;
    const mlPerRev = deviceSettings?.mlPerRev || 0;

    const valueEl = el.estimatedTime.querySelector('.estimation-value');
    const labelEl = el.estimatedTime.querySelector('.estimation-label');

    if (volume > 0 && mlPerRev > 0 && rpm > 0) {
        const seconds = Utils.calculateDispenseTime(volume, mlPerRev, rpm);
        if (valueEl) valueEl.textContent = Utils.formatDuration(seconds);
        if (labelEl) labelEl.textContent = `${mlPerRev.toFixed(2)} mL/rev @ ${rpm} RPM`;
    } else {
        if (valueEl) valueEl.textContent = '--';
        if (labelEl) labelEl.textContent = 'Estimated Time';
    }
}

function updateMaxVolume() {
    // Calculate max volume based on 400 RPM limit
    const mlPerRev = deviceSettings?.mlPerRev || 0;
    if (mlPerRev > 0 && el.volumeInput) {
        // Max volume per minute at 400 RPM
        const maxFlowPerMin = 400 * mlPerRev;
        // Allow up to 60 minutes of dispensing at max speed
        const maxVolume = maxFlowPerMin * 60;
        el.volumeInput.max = maxVolume.toFixed(1);
    }
}

function enforceVolumeLimit() {
    if (!el.volumeInput || !el.volumeRpmInput) return;

    const volume = parseFloat(el.volumeInput.value) || 0;
    const rpm = parseInt(el.volumeRpmInput.value) || 100;
    const mlPerRev = deviceSettings?.mlPerRev || 0;

    if (volume > 0 && mlPerRev > 0) {
        // Calculate required RPM for this volume
        // volume = rpm * mlPerRev * time(min)
        // We want to ensure rpm doesn't exceed 400
        // Max volume that can be dispensed at current RPM in reasonable time
        const flowPerMin = rpm * mlPerRev;
        // If volume would require more than 400 RPM for 1 minute dispense, limit it
        const maxVolumeAt400 = 400 * mlPerRev * 60; // 60 minutes at max speed

        if (volume > maxVolumeAt400) {
            el.volumeInput.value = maxVolumeAt400.toFixed(1);
        }
    }
}

async function dispenseVolume() {
    if (!currentDeviceId || !isCalibrated || isPumpRunning) return;

    const volume = parseFloat(el.volumeInput?.value) || 0;
    const rpm = parseInt(el.volumeRpmInput?.value) || 100;
    const offTime = parseFloat(el.volumeOffTime?.value) || 0;
    const direction = el.volumeDirCCW?.classList.contains('active') ? 'CCW' : 'CW';

    if (volume <= 0) {
        Utils.showWarning('Please enter a valid volume');
        return;
    }

    if (rpm < 10 || rpm > 400) {
        Utils.showWarning('Speed must be between 10 and 400 RPM');
        return;
    }

    if (offTime < 0 || offTime > 10) {
        Utils.showWarning('Off Time must be between 0 and 10 seconds');
        return;
    }

    try {
        Utils.showLoading('Starting dispense...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'DISPENSE_VOLUME',
            rpm: rpm,
            direction: direction,
            onTime: 0,
            offTime: offTime * 1000, // Convert to ms
            targetVolume: volume,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        // Optimistic UI update
        setPumpRunning(true);

        Utils.hideLoading();
        Utils.showSuccess(`Dispensing ${volume} mL`);
    } catch (error) {
        Utils.hideLoading();
        console.error('Error dispensing volume:', error);
        Utils.showError('Failed to start dispense');
    }
}

// ========================================
// FIREBASE SUBSCRIPTIONS
// ========================================
function subscribeToDevice() {
    if (!currentDeviceId) return;

    const deviceRef = FirebaseApp.getDeviceRef(currentDeviceId);

    // Status updates
    statusListener = deviceRef.child('status').on('value', (snapshot) => {
        deviceStatus = snapshot.val() || {};
        updateStatusUI();
    });

    // Settings updates
    settingsListener = deviceRef.child('settings').on('value', (snapshot) => {
        deviceSettings = snapshot.val() || {};
        updateSettingsUI();
        checkCalibration();
    });

    // Info updates
    infoListener = deviceRef.child('info').on('value', (snapshot) => {
        deviceInfo = snapshot.val() || {};
        updateInfoUI();
    });

    console.log('Subscribed to device:', currentDeviceId);
}

function setupConnectionMonitoring() {
    connectionListener = FirebaseApp.database.ref('.info/connected')
        .on('value', (snapshot) => {
            updateConnectionStatus(snapshot.val() === true);
        });
}

// ========================================
// UI UPDATES
// ========================================
function updateStatusUI() {
    if (!deviceStatus) return;

    // Update pump running state from device
    const running = deviceStatus.pumpRunning === true;
    setPumpRunning(running);

    // Current RPM display
    if (el.currentRPM) {
        el.currentRPM.textContent = deviceStatus.currentRPM || 0;
    }

    // Control mode
    if (el.controlMode) {
        el.controlMode.textContent = deviceStatus.controlMode || 'LOCAL';
    }

    // Session dispensed
    if (el.sessionDispensed) {
        const sessionMl = deviceStatus.sessionDispensed || 0;
        el.sessionDispensed.textContent = `${sessionMl.toFixed(1)} mL`;
    }

    // Total flow
    if (el.totalFlowValue) {
        const total = deviceStatus.totalDispensed || 0;
        el.totalFlowValue.textContent = total.toFixed(2);
    }

    // Last updated
    if (el.lastUpdated) {
        el.lastUpdated.textContent = 'Last updated: ' + Utils.formatRelativeTime(deviceStatus.lastUpdated);
    }

    // Update connection status
    updateConnectionStatus(FirebaseApp.isConnected());
}

function updateSettingsUI() {
    if (!deviceSettings) return;

    if (el.settingsTube) {
        el.settingsTube.textContent = deviceSettings.tubeName || 'Not set';
    }
    if (el.settingsMlPerRev) {
        const mlPerRev = deviceSettings.mlPerRev;
        el.settingsMlPerRev.textContent = mlPerRev ? `${mlPerRev.toFixed(3)} mL/rev` : 'Not calibrated';
    }
    if (el.settingsCalibrationType) {
        const type = deviceSettings.calibrationType || 'None';
        el.settingsCalibrationType.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    }
    if (el.settingsLastCalibrated) {
        el.settingsLastCalibrated.textContent = Utils.formatDateTime(deviceSettings.lastCalibrated);
    }
    if (el.settingsAntiDrip) {
        el.settingsAntiDrip.textContent = deviceSettings.antiDrip ? 'Enabled' : 'Disabled';
    }

    // Update flow display when settings change
    updateFlowDisplay();
    updateMaxVolume();
}

function updateInfoUI() {
    if (!deviceInfo) return;

    if (el.infoDeviceName) el.infoDeviceName.textContent = deviceInfo.deviceName || 'Frog Pump';
    if (el.infoDeviceId) el.infoDeviceId.textContent = currentDeviceId;
    if (el.infoFirmware) el.infoFirmware.textContent = deviceInfo.firmware || 'Unknown';
    if (el.infoIP) el.infoIP.textContent = deviceInfo.ip || 'N/A';
    if (el.infoMAC) el.infoMAC.textContent = deviceInfo.mac || 'N/A';
    if (el.infoLastSeen) el.infoLastSeen.textContent = Utils.formatRelativeTime(deviceInfo.lastSeen);
    if (el.infoRuntime) {
        const hours = deviceInfo.totalWorkingHours || 0;
        el.infoRuntime.textContent = `${hours.toFixed(1)} hours`;
    }
}

function checkCalibration() {
    const tubeID = deviceSettings?.tubeID || 0;
    const mlPerRev = deviceSettings?.mlPerRev || 0;

    isCalibrated = (tubeID > 0 && mlPerRev > 0);

    // Status page warning
    if (el.calibWarning) {
        if (isCalibrated) {
            el.calibWarning.classList.add('hidden');
        } else {
            el.calibWarning.classList.remove('hidden');
        }
    }

    // Dispense page - only show volume mode warning, RPM mode always works
    if (el.dispenseWarning) {
        if (isCalibrated) {
            el.dispenseWarning.classList.add('hidden');
        } else {
            el.dispenseWarning.classList.remove('hidden');
        }
    }

    // Volume mode tab - disable if not calibrated
    if (el.volumeModeTab) {
        if (isCalibrated) {
            el.volumeModeTab.classList.remove('disabled');
        } else {
            el.volumeModeTab.classList.add('disabled');
            // Switch to RPM mode if volume mode is selected
            if (dispenseMode === 'volume') {
                switchDispenseMode('rpm');
            }
        }
    }

    updateEstimatedTime();
}

function updateConnectionStatus(connected) {
    const isOnline = deviceStatus?.online === true;

    let statusClass = 'connecting';
    let statusText = 'Connecting...';

    if (connected) {
        if (isOnline) {
            statusClass = 'connected';
            statusText = 'Device Online';
        } else {
            statusClass = 'disconnected';
            statusText = 'Device Offline';
        }
    }

    if (el.sidebarConnectionStatus) {
        el.sidebarConnectionStatus.className = 'sidebar-connection ' + statusClass;
        el.sidebarConnectionStatus.textContent = statusText;
    }

    if (el.mobileConnectionStatus) {
        el.mobileConnectionStatus.className = 'mobile-connection ' + statusClass;
    }
}

// ========================================
// CLEANUP
// ========================================
function cleanup() {
    if (!currentDeviceId) return;
    const deviceRef = FirebaseApp.getDeviceRef(currentDeviceId);

    if (statusListener) deviceRef.child('status').off('value', statusListener);
    if (settingsListener) deviceRef.child('settings').off('value', settingsListener);
    if (infoListener) deviceRef.child('info').off('value', infoListener);
    if (connectionListener) {
        FirebaseApp.database.ref('.info/connected').off('value', connectionListener);
    }
}

window.addEventListener('beforeunload', cleanup);

// ========================================
// EXPORT
// ========================================
window.Dashboard = {
    initDashboard,
    startPump,
    stopPump,
    togglePump,
    get deviceId() { return currentDeviceId; },
    get status() { return deviceStatus; },
    get isRunning() { return isPumpRunning; },
    get isCalibrated() { return isCalibrated; },
    cleanup
};

console.log('Dashboard module loaded');
