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
    });
}

function cacheElements() {
    // Sidebar
    el.sidebarDeviceId = document.getElementById('sidebarDeviceId');
    el.sidebarConnectionStatus = document.getElementById('sidebarConnectionStatus');
    el.mobileConnectionStatus = document.getElementById('mobileConnectionStatus');
    el.runningLockOverlay = document.getElementById('runningLockOverlay');

    // Status page - Pump Control
    el.calibrationWarning = document.getElementById('calibrationWarning');
    el.rpmMinus = document.getElementById('rpmMinus');
    el.rpmPlus = document.getElementById('rpmPlus');
    el.rpmInput = document.getElementById('rpmInput');
    el.rpmSlider = document.getElementById('rpmSlider');
    el.flowValue = document.getElementById('flowValue');
    el.directionBtn = document.getElementById('directionBtn');
    el.directionText = document.getElementById('directionText');
    el.totalFlowValue = document.getElementById('totalFlowValue');
    el.startStopBtn = document.getElementById('startStopBtn');
    el.lastUpdated = document.getElementById('lastUpdated');

    // Status info panel
    el.pumpStatus = document.getElementById('pumpStatus');
    el.currentRPM = document.getElementById('currentRPM');
    el.controlMode = document.getElementById('controlMode');
    el.sessionDispensed = document.getElementById('sessionDispensed');

    // Dispense page
    el.dispenseCalibrationWarning = document.getElementById('dispenseCalibrationWarning');
    el.volumeDispensePanel = document.getElementById('volumeDispensePanel');
    el.volumeInput = document.getElementById('volumeInput');
    el.volumeRpmInput = document.getElementById('volumeRpmInput');
    el.volumeRpmSlider = document.getElementById('volumeRpmSlider');
    el.volumeDirCW = document.getElementById('volumeDirCW');
    el.volumeDirCCW = document.getElementById('volumeDirCCW');
    el.estimatedTime = document.getElementById('estimatedTime');
    el.dispenseBtn = document.getElementById('dispenseBtn');

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
        el.rpmMinus.addEventListener('click', () => adjustRPM(-10));
    }
    if (el.rpmPlus) {
        el.rpmPlus.addEventListener('click', () => adjustRPM(10));
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

    // Direction button
    if (el.directionBtn) {
        el.directionBtn.addEventListener('click', toggleDirection);
    }

    // Start/Stop button
    if (el.startStopBtn) {
        el.startStopBtn.addEventListener('click', togglePump);
    }

    // Volume Dispense page handlers
    if (el.volumeRpmSlider) {
        el.volumeRpmSlider.addEventListener('input', (e) => {
            if (el.volumeRpmInput) el.volumeRpmInput.value = e.target.value;
            updateEstimatedTime();
        });
    }
    if (el.volumeRpmInput) {
        el.volumeRpmInput.addEventListener('change', (e) => {
            const val = Math.min(400, Math.max(10, parseInt(e.target.value) || 100));
            e.target.value = val;
            if (el.volumeRpmSlider) el.volumeRpmSlider.value = val;
            updateEstimatedTime();
        });
    }
    if (el.volumeInput) {
        el.volumeInput.addEventListener('input', updateEstimatedTime);
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
    if (el.dispenseBtn) {
        el.dispenseBtn.addEventListener('click', dispenseVolume);
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
    if (el.runningLockOverlay) {
        el.runningLockOverlay.classList.remove('hidden');
        setTimeout(() => {
            el.runningLockOverlay.classList.add('hidden');
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
    currentDirection = currentDirection === 'CW' ? 'CCW' : 'CW';
    updateDirectionDisplay();
}

function updateDirectionDisplay() {
    if (el.directionBtn) {
        const icon = el.directionBtn.querySelector('.direction-icon');
        if (icon) {
            icon.textContent = currentDirection === 'CW' ? '↻' : '↺';
        }
    }
    if (el.directionText) {
        el.directionText.textContent = currentDirection === 'CW' ? 'ساعتگرد' : 'پادساعتگرد';
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
    if (isPumpRunning) {
        await stopPump();
    } else {
        await startPump();
    }
}

async function startPump() {
    if (!currentDeviceId) return;

    if (targetRPM <= 0) {
        Utils.showWarning('لطفا RPM را بیشتر از صفر تنظیم کنید');
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
    isPumpRunning = running;

    // Update Start/Stop button
    if (el.startStopBtn) {
        const icon = el.startStopBtn.querySelector('.start-stop-icon');
        const text = el.startStopBtn.querySelector('.start-stop-text');

        if (running) {
            el.startStopBtn.classList.remove('start');
            el.startStopBtn.classList.add('stop');
            if (icon) icon.textContent = '⏹';
            if (text) text.textContent = 'Stop';
        } else {
            el.startStopBtn.classList.remove('stop');
            el.startStopBtn.classList.add('start');
            if (icon) icon.textContent = '▶';
            if (text) text.textContent = 'Start';
        }
    }

    // Update status display
    if (el.pumpStatus) {
        if (running) {
            el.pumpStatus.textContent = 'Running';
            el.pumpStatus.classList.remove('status-stopped');
            el.pumpStatus.classList.add('status-running');
        } else {
            el.pumpStatus.textContent = 'Stopped';
            el.pumpStatus.classList.remove('status-running');
            el.pumpStatus.classList.add('status-stopped');
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
// VOLUME DISPENSE
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

async function dispenseVolume() {
    if (!currentDeviceId || !isCalibrated || isPumpRunning) return;

    const volume = parseFloat(el.volumeInput?.value) || 0;
    const rpm = parseInt(el.volumeRpmInput?.value) || 100;
    const direction = el.volumeDirCCW?.classList.contains('active') ? 'CCW' : 'CW';

    if (volume <= 0 || volume > 9999) {
        Utils.showWarning('Volume must be between 0.1 and 9999 mL');
        return;
    }

    try {
        Utils.showLoading('Starting dispense...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'DISPENSE_VOLUME',
            rpm: rpm,
            direction: direction,
            duration: 0,
            targetVolume: volume,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

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

    // Update pump running state
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
    if (el.calibrationWarning) {
        if (isCalibrated) {
            el.calibrationWarning.classList.add('hidden');
        } else {
            el.calibrationWarning.classList.remove('hidden');
        }
    }

    // Dispense page
    if (el.dispenseCalibrationWarning) {
        if (isCalibrated) {
            el.dispenseCalibrationWarning.classList.add('hidden');
        } else {
            el.dispenseCalibrationWarning.classList.remove('hidden');
        }
    }
    if (el.volumeDispensePanel) {
        if (isCalibrated) {
            el.volumeDispensePanel.classList.remove('hidden');
        } else {
            el.volumeDispensePanel.classList.add('hidden');
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
