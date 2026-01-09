/**
 * Frog Pump WebApp - Dashboard Module
 * Real-time monitoring and pump control logic
 */

// ========================================
// DASHBOARD STATE
// ========================================

let currentDeviceId = null;
let deviceStatus = null;
let deviceInfo = null;
let deviceSettings = null;
let isCalibrated = false;

// Firebase listeners
let statusListener = null;
let settingsListener = null;
let infoListener = null;
let controlListener = null;
let connectionListener = null;

// UI Elements cache
const elements = {};

// ========================================
// INITIALIZATION
// ========================================

/**
 * Initialize dashboard page
 */
function initDashboard() {
    console.log('Initializing dashboard...');

    // Check for device ID
    currentDeviceId = Utils.getSavedDeviceId();
    if (!currentDeviceId) {
        Utils.navigateTo('device.html');
        return;
    }

    // Initialize with auth
    Auth.initProtectedPage(async (user) => {
        // Cache DOM elements
        cacheElements();

        // Update header with device info
        updateDeviceHeader();

        // Setup UI event handlers
        setupEventHandlers();

        // Setup tabs
        setupTabs();

        // Subscribe to real-time updates
        subscribeToDevice();

        // Setup connection monitoring
        setupConnectionMonitoring();

        // Setup change device button
        Device.setupChangeDeviceButton();
    });
}

/**
 * Cache DOM elements for performance
 */
function cacheElements() {
    // Header
    elements.deviceName = document.getElementById('deviceName');
    elements.deviceIdDisplay = document.getElementById('deviceIdDisplay');
    elements.connectionBanner = document.getElementById('connectionBanner');

    // Status display
    elements.pumpStatus = document.getElementById('pumpStatus');
    elements.currentRPM = document.getElementById('currentRPM');
    elements.direction = document.getElementById('direction');
    elements.flowRate = document.getElementById('flowRate');
    elements.totalDispensed = document.getElementById('totalDispensed');
    elements.sessionDispensed = document.getElementById('sessionDispensed');
    elements.controlMode = document.getElementById('controlMode');
    elements.lastUpdated = document.getElementById('lastUpdated');

    // Calibration warning
    elements.calibrationWarning = document.getElementById('calibrationWarning');

    // Control tabs
    elements.rpmTab = document.getElementById('rpmTab');
    elements.volumeTab = document.getElementById('volumeTab');
    elements.rpmPanel = document.getElementById('rpmPanel');
    elements.volumePanel = document.getElementById('volumePanel');

    // RPM controls
    elements.rpmSlider = document.getElementById('rpmSlider');
    elements.rpmValue = document.getElementById('rpmValue');
    elements.rpmInput = document.getElementById('rpmInput');
    elements.durationInput = document.getElementById('durationInput');
    elements.directionCW = document.getElementById('directionCW');
    elements.directionCCW = document.getElementById('directionCCW');
    elements.startBtn = document.getElementById('startBtn');
    elements.stopBtn = document.getElementById('stopBtn');

    // Volume controls
    elements.volumeInput = document.getElementById('volumeInput');
    elements.volumeRpmSlider = document.getElementById('volumeRpmSlider');
    elements.volumeRpmValue = document.getElementById('volumeRpmValue');
    elements.volumeDirectionCW = document.getElementById('volumeDirectionCW');
    elements.volumeDirectionCCW = document.getElementById('volumeDirectionCCW');
    elements.dispenseBtn = document.getElementById('dispenseBtn');
    elements.estimatedTime = document.getElementById('estimatedTime');
    elements.volumeOverlay = document.getElementById('volumeOverlay');

    // Device info
    elements.infoDeviceName = document.getElementById('infoDeviceName');
    elements.infoDeviceId = document.getElementById('infoDeviceId');
    elements.infoFirmware = document.getElementById('infoFirmware');
    elements.infoIP = document.getElementById('infoIP');
    elements.infoMAC = document.getElementById('infoMAC');
    elements.infoLastSeen = document.getElementById('infoLastSeen');
    elements.infoRuntime = document.getElementById('infoRuntime');

    // Settings display
    elements.settingsTube = document.getElementById('settingsTube');
    elements.settingsMlPerRev = document.getElementById('settingsMlPerRev');
    elements.settingsCalibrationType = document.getElementById('settingsCalibrationType');
    elements.settingsLastCalibrated = document.getElementById('settingsLastCalibrated');
    elements.settingsAntiDrip = document.getElementById('settingsAntiDrip');
}

// ========================================
// REAL-TIME SUBSCRIPTIONS
// ========================================

/**
 * Subscribe to device data updates
 */
function subscribeToDevice() {
    if (!currentDeviceId) return;

    const deviceRef = FirebaseApp.getDeviceRef(currentDeviceId);

    // Subscribe to status
    statusListener = deviceRef.child('status').on('value', (snapshot) => {
        deviceStatus = snapshot.val() || {};
        updateStatusUI();
        saveStatusForOffline();
    });

    // Subscribe to settings
    settingsListener = deviceRef.child('settings').on('value', (snapshot) => {
        deviceSettings = snapshot.val() || {};
        updateSettingsUI();
        checkCalibration();
    });

    // Subscribe to info
    infoListener = deviceRef.child('info').on('value', (snapshot) => {
        deviceInfo = snapshot.val() || {};
        updateInfoUI();
    });

    // Subscribe to control acknowledgment
    controlListener = deviceRef.child('control').on('value', (snapshot) => {
        const control = snapshot.val() || {};
        updateControlAcknowledgment(control);
    });

    console.log('Subscribed to device:', currentDeviceId);
}

/**
 * Unsubscribe from all device updates
 */
function unsubscribeFromDevice() {
    if (!currentDeviceId) return;

    const deviceRef = FirebaseApp.getDeviceRef(currentDeviceId);

    if (statusListener) {
        deviceRef.child('status').off('value', statusListener);
        statusListener = null;
    }

    if (settingsListener) {
        deviceRef.child('settings').off('value', settingsListener);
        settingsListener = null;
    }

    if (infoListener) {
        deviceRef.child('info').off('value', infoListener);
        infoListener = null;
    }

    if (controlListener) {
        deviceRef.child('control').off('value', controlListener);
        controlListener = null;
    }

    console.log('Unsubscribed from device');
}

/**
 * Setup Firebase connection monitoring
 */
function setupConnectionMonitoring() {
    connectionListener = FirebaseApp.database.ref('.info/connected')
        .on('value', (snapshot) => {
            updateConnectionBanner(snapshot.val() === true);
        });

    // Also listen for custom event
    window.addEventListener('firebase-connection-change', (e) => {
        updateConnectionBanner(e.detail.connected);
    });
}

// ========================================
// UI UPDATE FUNCTIONS
// ========================================

/**
 * Update device header
 */
function updateDeviceHeader() {
    if (elements.deviceIdDisplay) {
        elements.deviceIdDisplay.textContent = currentDeviceId;
    }
}

/**
 * Update connection banner
 * @param {boolean} connected - Firebase connection status
 */
function updateConnectionBanner(connected) {
    if (!elements.connectionBanner) return;

    const isOnline = deviceStatus?.online === true;

    if (!connected) {
        elements.connectionBanner.className = 'connection-banner connecting';
        elements.connectionBanner.innerHTML = '🟡 Connecting...';
    } else if (isOnline) {
        elements.connectionBanner.className = 'connection-banner online';
        elements.connectionBanner.innerHTML = '🟢 Device Online';
    } else {
        elements.connectionBanner.className = 'connection-banner offline';
        elements.connectionBanner.innerHTML = '🔴 Device Offline';
    }
}

/**
 * Update status display
 */
function updateStatusUI() {
    if (!deviceStatus) return;

    // Pump running status
    if (elements.pumpStatus) {
        const isRunning = deviceStatus.pumpRunning === true;
        elements.pumpStatus.innerHTML = isRunning
            ? '<span class="pump-running">🔄 Running</span>'
            : '⏹️ Stopped';

        // Add animation class to parent
        const statusItem = elements.pumpStatus.closest('.status-item');
        if (statusItem) {
            statusItem.classList.toggle('pump-running', isRunning);
        }
    }

    // Current RPM
    if (elements.currentRPM) {
        elements.currentRPM.textContent = deviceStatus.currentRPM || 0;
    }

    // Direction
    if (elements.direction) {
        const dir = deviceStatus.direction || 'CW';
        elements.direction.textContent = dir === 'CW' ? '↻ CW' : '↺ CCW';
    }

    // Flow rate
    if (elements.flowRate) {
        elements.flowRate.textContent = Utils.formatFlowRate(deviceStatus.flowRate);
    }

    // Total dispensed
    if (elements.totalDispensed) {
        elements.totalDispensed.textContent = Utils.formatVolume(deviceStatus.totalDispensed);
    }

    // Session dispensed
    if (elements.sessionDispensed) {
        const sessionMl = deviceStatus.sessionDispensed || 0;
        elements.sessionDispensed.textContent = `${sessionMl.toFixed(1)} mL`;
    }

    // Control mode
    if (elements.controlMode) {
        const mode = deviceStatus.controlMode || 'LOCAL';
        elements.controlMode.innerHTML = mode === 'REMOTE'
            ? '<span class="badge badge-info">🌐 REMOTE</span>'
            : '<span class="badge badge-neutral">🏠 LOCAL</span>';
    }

    // Last updated
    if (elements.lastUpdated) {
        elements.lastUpdated.textContent = Utils.formatRelativeTime(deviceStatus.lastUpdated);
    }

    // Update connection banner with online status
    updateConnectionBanner(FirebaseApp.isConnected());
}

/**
 * Update settings display
 */
function updateSettingsUI() {
    if (!deviceSettings) return;

    // Tube size
    if (elements.settingsTube) {
        elements.settingsTube.textContent = deviceSettings.tubeName || 'Not set';
    }

    // ml per rev
    if (elements.settingsMlPerRev) {
        const mlPerRev = deviceSettings.mlPerRev;
        elements.settingsMlPerRev.textContent = mlPerRev
            ? `${mlPerRev.toFixed(3)} mL/rev`
            : 'Not calibrated';
    }

    // Calibration type
    if (elements.settingsCalibrationType) {
        const type = deviceSettings.calibrationType || 'None';
        elements.settingsCalibrationType.textContent =
            type.charAt(0).toUpperCase() + type.slice(1);
    }

    // Last calibrated
    if (elements.settingsLastCalibrated) {
        elements.settingsLastCalibrated.textContent =
            Utils.formatDateTime(deviceSettings.lastCalibrated);
    }

    // Anti-drip
    if (elements.settingsAntiDrip) {
        elements.settingsAntiDrip.innerHTML = deviceSettings.antiDrip
            ? '✅ Enabled'
            : '❌ Disabled';
    }
}

/**
 * Update device info display
 */
function updateInfoUI() {
    if (!deviceInfo) return;

    // Device name
    if (elements.infoDeviceName) {
        elements.infoDeviceName.textContent = deviceInfo.deviceName || 'Frog Pump';
    }

    // Update header device name
    if (elements.deviceName) {
        elements.deviceName.textContent = deviceInfo.deviceName || 'Frog Pump';
    }

    // Device ID
    if (elements.infoDeviceId) {
        elements.infoDeviceId.textContent = currentDeviceId;
    }

    // Firmware
    if (elements.infoFirmware) {
        elements.infoFirmware.textContent = deviceInfo.firmware || 'Unknown';
    }

    // IP Address
    if (elements.infoIP) {
        elements.infoIP.textContent = deviceInfo.ip || 'N/A';
    }

    // MAC Address
    if (elements.infoMAC) {
        elements.infoMAC.textContent = deviceInfo.mac || 'N/A';
    }

    // Last seen
    if (elements.infoLastSeen) {
        elements.infoLastSeen.textContent = Utils.formatRelativeTime(deviceInfo.lastSeen);
    }

    // Total runtime
    if (elements.infoRuntime) {
        const hours = deviceInfo.totalWorkingHours || 0;
        elements.infoRuntime.textContent = `${hours.toFixed(1)} hours`;
    }
}

/**
 * Check calibration status and update UI
 */
function checkCalibration() {
    const tubeID = deviceSettings?.tubeID || 0;
    const mlPerRev = deviceSettings?.mlPerRev || 0;

    isCalibrated = (tubeID > 0 && mlPerRev > 0);

    // Show/hide calibration warning
    if (elements.calibrationWarning) {
        Utils.toggleElement(elements.calibrationWarning, !isCalibrated);
    }

    // Enable/disable volume tab
    if (elements.volumeTab) {
        elements.volumeTab.disabled = !isCalibrated;
        elements.volumeTab.classList.toggle('disabled', !isCalibrated);
    }

    // Show/hide volume overlay
    if (elements.volumeOverlay) {
        Utils.toggleElement(elements.volumeOverlay, !isCalibrated);
    }

    // Disable volume panel inputs if not calibrated
    if (elements.volumePanel) {
        const inputs = elements.volumePanel.querySelectorAll('input, button');
        inputs.forEach(el => {
            el.disabled = !isCalibrated;
        });
    }

    // Update estimated time if calibrated
    if (isCalibrated) {
        updateEstimatedTime();
    }
}

/**
 * Update control acknowledgment status
 * @param {Object} control - Control data
 */
function updateControlAcknowledgment(control) {
    if (!control) return;

    // Could show acknowledgment status or handle command feedback
    if (control.acknowledged) {
        console.log('Command acknowledged by device');
    }
}

/**
 * Update estimated time for volume dispense
 */
function updateEstimatedTime() {
    if (!elements.estimatedTime || !elements.volumeInput || !elements.volumeRpmSlider) return;

    const volume = parseFloat(elements.volumeInput.value) || 0;
    const rpm = parseInt(elements.volumeRpmSlider.value) || 100;
    const mlPerRev = deviceSettings?.mlPerRev || 0;

    if (volume > 0 && mlPerRev > 0 && rpm > 0) {
        const seconds = Utils.calculateDispenseTime(volume, mlPerRev, rpm);
        elements.estimatedTime.innerHTML = `
            <div class="estimation-value">${Utils.formatDuration(seconds)}</div>
            <div class="estimation-label">Estimated time (${mlPerRev.toFixed(2)} mL/rev @ ${rpm} RPM)</div>
        `;
    } else {
        elements.estimatedTime.innerHTML = `
            <div class="estimation-value">--</div>
            <div class="estimation-label">Enter volume to calculate</div>
        `;
    }
}

// ========================================
// EVENT HANDLERS
// ========================================

/**
 * Setup all event handlers
 */
function setupEventHandlers() {
    // RPM Slider
    if (elements.rpmSlider) {
        elements.rpmSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            if (elements.rpmValue) elements.rpmValue.textContent = value;
            if (elements.rpmInput) elements.rpmInput.value = value;
        });
    }

    // RPM Input
    if (elements.rpmInput) {
        elements.rpmInput.addEventListener('input', (e) => {
            let value = parseInt(e.target.value) || 0;
            value = Math.max(0, Math.min(300, value));
            if (elements.rpmSlider) elements.rpmSlider.value = value;
            if (elements.rpmValue) elements.rpmValue.textContent = value;
        });
    }

    // Direction buttons (RPM mode)
    if (elements.directionCW) {
        elements.directionCW.addEventListener('click', () => {
            elements.directionCW.classList.add('active');
            if (elements.directionCCW) elements.directionCCW.classList.remove('active');
        });
    }

    if (elements.directionCCW) {
        elements.directionCCW.addEventListener('click', () => {
            elements.directionCCW.classList.add('active');
            if (elements.directionCW) elements.directionCW.classList.remove('active');
        });
    }

    // Start button
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', () => startPump());
    }

    // Stop button
    if (elements.stopBtn) {
        elements.stopBtn.addEventListener('click', () => stopPump());
    }

    // Volume controls
    if (elements.volumeRpmSlider) {
        elements.volumeRpmSlider.addEventListener('input', (e) => {
            if (elements.volumeRpmValue) {
                elements.volumeRpmValue.textContent = e.target.value;
            }
            updateEstimatedTime();
        });
    }

    if (elements.volumeInput) {
        elements.volumeInput.addEventListener('input', () => {
            updateEstimatedTime();
        });
    }

    // Direction buttons (Volume mode)
    if (elements.volumeDirectionCW) {
        elements.volumeDirectionCW.addEventListener('click', () => {
            elements.volumeDirectionCW.classList.add('active');
            if (elements.volumeDirectionCCW) elements.volumeDirectionCCW.classList.remove('active');
        });
    }

    if (elements.volumeDirectionCCW) {
        elements.volumeDirectionCCW.addEventListener('click', () => {
            elements.volumeDirectionCCW.classList.add('active');
            if (elements.volumeDirectionCW) elements.volumeDirectionCW.classList.remove('active');
        });
    }

    // Dispense button
    if (elements.dispenseBtn) {
        elements.dispenseBtn.addEventListener('click', () => dispenseVolume());
    }
}

/**
 * Setup tab switching
 */
function setupTabs() {
    if (elements.rpmTab) {
        elements.rpmTab.addEventListener('click', () => {
            switchTab('rpm');
        });
    }

    if (elements.volumeTab) {
        elements.volumeTab.addEventListener('click', () => {
            if (!elements.volumeTab.disabled) {
                switchTab('volume');
            }
        });
    }
}

/**
 * Switch between control tabs
 * @param {string} tab - 'rpm' or 'volume'
 */
function switchTab(tab) {
    if (tab === 'rpm') {
        elements.rpmTab?.classList.add('active');
        elements.volumeTab?.classList.remove('active');
        elements.rpmPanel?.classList.add('active');
        elements.volumePanel?.classList.remove('active');
    } else if (tab === 'volume') {
        elements.volumeTab?.classList.add('active');
        elements.rpmTab?.classList.remove('active');
        elements.volumePanel?.classList.add('active');
        elements.rpmPanel?.classList.remove('active');
    }
}

// ========================================
// PUMP CONTROL FUNCTIONS
// ========================================

/**
 * Start pump (RPM mode)
 */
async function startPump() {
    if (!currentDeviceId) return;

    const rpm = parseInt(elements.rpmInput?.value || elements.rpmSlider?.value) || 100;
    const duration = parseInt(elements.durationInput?.value) || 0;
    const direction = elements.directionCCW?.classList.contains('active') ? 'CCW' : 'CW';

    if (rpm <= 0) {
        Utils.showWarning('Please set RPM greater than 0');
        return;
    }

    try {
        Utils.showLoading('Starting pump...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'START',
            rpm: rpm,
            direction: direction,
            duration: duration,
            targetVolume: 0,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        Utils.hideLoading();
        Utils.showSuccess('Start command sent');
    } catch (error) {
        Utils.hideLoading();
        console.error('Error starting pump:', error);
        Utils.showError('Failed to start pump');
    }
}

/**
 * Stop pump
 */
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
        Utils.showSuccess('Stop command sent');
    } catch (error) {
        Utils.hideLoading();
        console.error('Error stopping pump:', error);
        Utils.showError('Failed to stop pump');
    }
}

/**
 * Dispense specific volume
 */
async function dispenseVolume() {
    if (!currentDeviceId || !isCalibrated) return;

    const volume = parseFloat(elements.volumeInput?.value) || 0;
    const rpm = parseInt(elements.volumeRpmSlider?.value) || 100;
    const direction = elements.volumeDirectionCCW?.classList.contains('active') ? 'CCW' : 'CW';

    // Validation
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
// OFFLINE SUPPORT
// ========================================

/**
 * Save current status for offline viewing
 */
function saveStatusForOffline() {
    if (deviceStatus) {
        Utils.saveLastStatus({
            deviceId: currentDeviceId,
            status: deviceStatus,
            info: deviceInfo,
            settings: deviceSettings
        });
    }
}

/**
 * Load saved status for offline display
 */
function loadOfflineStatus() {
    const saved = Utils.getLastStatus();
    if (saved && saved.deviceId === currentDeviceId) {
        deviceStatus = saved.status;
        deviceInfo = saved.info;
        deviceSettings = saved.settings;

        updateStatusUI();
        updateInfoUI();
        updateSettingsUI();
        checkCalibration();

        Utils.showWarning('Showing last saved data (offline)');
    }
}

// ========================================
// CLEANUP
// ========================================

/**
 * Cleanup on page unload
 */
function cleanup() {
    unsubscribeFromDevice();

    if (connectionListener) {
        FirebaseApp.database.ref('.info/connected').off('value', connectionListener);
        connectionListener = null;
    }
}

window.addEventListener('beforeunload', cleanup);

// ========================================
// EXPORT
// ========================================

window.Dashboard = {
    // Initialization
    initDashboard,

    // Control functions
    startPump,
    stopPump,
    dispenseVolume,

    // Tab switching
    switchTab,

    // State
    get deviceId() { return currentDeviceId; },
    get status() { return deviceStatus; },
    get info() { return deviceInfo; },
    get settings() { return deviceSettings; },
    get isCalibrated() { return isCalibrated; },

    // Cleanup
    cleanup
};

console.log('Dashboard module loaded');
