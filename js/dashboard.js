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
let deviceOnlineStatus = false;  // Renamed to avoid conflict with device.js isDeviceOnline function
let currentDirection = 'CW'; // CW or CCW
let targetRPM = 100;
let targetFlow = 0;  // Separate flow value
let inputMode = 'rpm';  // 'rpm' or 'flow' - which control is active
let dispenseMode = 'rpm'; // 'rpm' or 'volume'

// Real-time flow calculation
let pumpStartTime = null;  // When pump started running
let sessionFlowMl = 0;     // Accumulated flow in mL for current session
let flowUpdateInterval = null; // Interval for updating flow display

// Firebase listeners
let statusListener = null;
let settingsListener = null;
let infoListener = null;
let controlListener = null;  // For control node (mode, acknowledged)
let connectionListener = null;

// Control state from control node
let controlMode = 'LOCAL';

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
        console.log('Auth ready, initializing UI...');

        cacheElements();
        setupEventHandlers();
        setupNavigation();

        // Enable controls first (before Firebase data arrives)
        isPumpRunning = false;
        setControlsEnabled(true);
        updateDirectionDisplay();

        // Update sidebar device ID
        if (el.sidebarDeviceId) {
            el.sidebarDeviceId.textContent = currentDeviceId;
        }

        // Setup change device button
        Device.setupChangeDeviceButton();

        // Subscribe to Firebase after UI is ready
        subscribeToDevice();
        setupConnectionMonitoring();

        console.log('Dashboard initialized successfully');
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
    el.flowInput = document.getElementById('flowInput');
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

    // Volume-based dispense (no RPM control - auto calculated)
    el.volumeInput = document.getElementById('volumeInput');
    el.volumeOffTime = document.getElementById('volumeOffTime');
    el.volumeDirCW = document.getElementById('volumeDirCW');
    el.volumeDirCCW = document.getElementById('volumeDirCCW');
    el.estimatedTime = document.getElementById('estimatedTime');
    el.volumeDispenseBtn = document.getElementById('volumeDispenseBtn');

    // System Info - Tube Maintenance
    el.infoLastTubeChange = document.getElementById('infoLastTubeChange');
    el.infoRuntimeSinceChange = document.getElementById('infoRuntimeSinceChange');
    el.confirmTubeChangeBtn = document.getElementById('confirmTubeChangeBtn');
    el.preFlushBtn = document.getElementById('preFlushBtn');

    // System Info - Device
    el.infoDeviceName = document.getElementById('infoDeviceName');
    el.infoDeviceId = document.getElementById('infoDeviceId');
    el.infoFirmware = document.getElementById('infoFirmware');
    el.infoIP = document.getElementById('infoIP');
    el.infoMAC = document.getElementById('infoMAC');
    el.infoLastSeen = document.getElementById('infoLastSeen');
    el.infoRuntime = document.getElementById('infoRuntime');

    // System Info - Calibration
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
    // RPM Controls - switch to RPM mode when interacting
    if (el.rpmMinus) {
        el.rpmMinus.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchInputMode('rpm');
            adjustRPM(-10);
        });
    }
    if (el.rpmPlus) {
        el.rpmPlus.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchInputMode('rpm');
            adjustRPM(10);
        });
    }
    if (el.rpmInput) {
        el.rpmInput.addEventListener('focus', () => {
            switchInputMode('rpm');
        });
        el.rpmInput.addEventListener('change', (e) => {
            const val = Math.min(400, Math.max(0, parseInt(e.target.value) || 0));
            setRPM(val);
        });
    }
    if (el.rpmSlider) {
        el.rpmSlider.addEventListener('input', (e) => {
            switchInputMode('rpm');
            setRPM(parseInt(e.target.value));
        });
    }

    // Flow input - switch to Flow mode when interacting
    if (el.flowDisplayBox) {
        el.flowDisplayBox.addEventListener('click', () => {
            if (!isCalibrated) {
                Utils.showWarning('Please set tube size and calibrate from the device first.');
            } else {
                switchInputMode('flow');
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

    // Flow input handler - with validation based on calibration
    if (el.flowInput) {
        el.flowInput.addEventListener('focus', () => {
            switchInputMode('flow');
        });
        el.flowInput.addEventListener('input', (e) => {
            // Store raw value while typing
            targetFlow = parseFloat(e.target.value) || 0;
        });
        el.flowInput.addEventListener('change', (e) => {
            // Validate and clamp to achievable range on blur/enter
            const mlPerRev = deviceSettings?.mlPerRev || 0;
            const maxRPM = 400;
            const minRPM = 1;

            if (mlPerRev <= 0) {
                // Not calibrated - can't validate properly
                e.target.value = '';
                targetFlow = 0;
                return;
            }

            // Calculate flow limits
            const maxFlow = maxRPM * mlPerRev;
            const minFlow = minRPM * mlPerRev;

            let val = parseFloat(e.target.value) || 0;

            if (val <= 0) {
                e.target.value = '';
                targetFlow = 0;
                return;
            }

            // Clamp to valid range
            val = Math.min(maxFlow, Math.max(minFlow, val));

            // Calculate the actual RPM this would require
            const calculatedRPM = Math.round(val / mlPerRev);

            // Recalculate the actual achievable flow (nearest valid value)
            const actualFlow = calculatedRPM * mlPerRev;

            targetFlow = actualFlow;
            e.target.value = actualFlow.toFixed(2);

            // Also update the RPM display to show corresponding value
            if (el.rpmInput) {
                el.rpmInput.value = calculatedRPM;
            }
            if (el.rpmSlider) {
                el.rpmSlider.value = calculatedRPM;
            }
        });
    }

    // Volume-based dispense handlers (no RPM control - auto calculated)
    if (el.volumeInput) {
        el.volumeInput.addEventListener('input', () => {
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

    // Pre-Flush button
    if (el.preFlushBtn) {
        el.preFlushBtn.addEventListener('click', preFlush);
    }

    // Tube Change confirmation button
    if (el.confirmTubeChangeBtn) {
        el.confirmTubeChangeBtn.addEventListener('click', confirmTubeChange);
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
// INPUT MODE SWITCHING (RPM vs Flow)
// ========================================
function switchInputMode(mode) {
    if (!isCalibrated && mode === 'flow') {
        return; // Can't switch to flow mode if not calibrated
    }

    inputMode = mode;
    updateInputModeDisplay();
}

function updateInputModeDisplay() {
    const rpmSection = document.querySelector('.pump-section:has(#rpmInput)')?.parentElement?.querySelector('.pump-section:first-child');
    const flowSection = el.flowDisplayBox?.closest('.pump-section');

    if (inputMode === 'rpm') {
        // RPM mode - show RPM controls, show flow as display only
        if (el.rpmMinus) el.rpmMinus.style.opacity = '1';
        if (el.rpmPlus) el.rpmPlus.style.opacity = '1';
        if (el.rpmInput) el.rpmInput.style.opacity = '1';
        if (el.rpmSlider) el.rpmSlider.style.opacity = '1';

        // Flow shows calculated value (read-only display)
        if (el.flowDisplayBox) {
            el.flowDisplayBox.classList.remove('editable');
            if (el.flowInput) el.flowInput.classList.add('hidden');
            if (el.flowValue) el.flowValue.classList.remove('hidden');
        }

        // Update flow display from RPM
        const mlPerRev = deviceSettings?.mlPerRev || 0;
        const flow = (mlPerRev > 0 && targetRPM > 0) ? targetRPM * mlPerRev : 0;
        if (el.flowValue) {
            el.flowValue.textContent = flow > 0 ? flow.toFixed(2) : '--';
        }
    } else {
        // Flow mode - dim RPM controls, show flow as editable
        if (el.rpmMinus) el.rpmMinus.style.opacity = '0.4';
        if (el.rpmPlus) el.rpmPlus.style.opacity = '0.4';
        if (el.rpmInput) el.rpmInput.style.opacity = '0.4';
        if (el.rpmSlider) el.rpmSlider.style.opacity = '0.4';

        // Flow is editable
        if (el.flowDisplayBox && isCalibrated && !isPumpRunning) {
            el.flowDisplayBox.classList.add('editable');
            if (el.flowInput) {
                el.flowInput.classList.remove('hidden');
                el.flowInput.value = targetFlow > 0 ? targetFlow : '';
                // Auto-focus flow input so user can start typing
                setTimeout(() => el.flowInput.focus(), 50);
            }
            if (el.flowValue) el.flowValue.classList.add('hidden');
        }
    }
}

// ========================================
// FLOW CALCULATION
// ========================================
function updateFlowDisplay() {
    // Only auto-update flow from RPM when in RPM mode
    if (inputMode === 'rpm') {
        const mlPerRev = deviceSettings?.mlPerRev || 0;
        const flow = (mlPerRev > 0 && targetRPM > 0) ? targetRPM * mlPerRev : 0;

        if (el.flowValue) {
            el.flowValue.textContent = flow > 0 ? flow.toFixed(2) : '--';
        }
    }

    updateInputModeDisplay();
}

// ========================================
// REAL-TIME TOTAL FLOW CALCULATION
// ========================================
function startFlowTracking() {
    if (flowUpdateInterval) return; // Already tracking

    pumpStartTime = Date.now();
    sessionFlowMl = 0;

    // Update every 100ms for smooth display
    flowUpdateInterval = setInterval(() => {
        updateTotalFlowDisplay();
    }, 100);

    updateTotalFlowDisplay();
}

function stopFlowTracking() {
    if (flowUpdateInterval) {
        clearInterval(flowUpdateInterval);
        flowUpdateInterval = null;
    }

    // Reset to zero when pump stops
    sessionFlowMl = 0;
    pumpStartTime = null;

    if (el.totalFlowValue) {
        el.totalFlowValue.textContent = '0.000';
    }
}

function updateTotalFlowDisplay() {
    if (!isPumpRunning || !pumpStartTime || !isCalibrated) {
        if (el.totalFlowValue) {
            el.totalFlowValue.textContent = '0.000';
        }
        return;
    }

    const mlPerRev = deviceSettings?.mlPerRev || 0;
    const currentRPM = deviceStatus?.currentRPM || 0;

    if (mlPerRev <= 0 || currentRPM <= 0) {
        return;
    }

    // Calculate flow rate: mL/min = RPM * mlPerRev
    // Time elapsed in minutes
    const elapsedMs = Date.now() - pumpStartTime;
    const elapsedMin = elapsedMs / 60000;

    // Total mL = flow rate * time
    sessionFlowMl = currentRPM * mlPerRev * elapsedMin;

    // Convert to Liters and display with 3 decimals
    const sessionLiters = sessionFlowMl / 1000;

    if (el.totalFlowValue) {
        el.totalFlowValue.textContent = sessionLiters.toFixed(3);
    }
}

// ========================================
// TUBE CHANGE MANAGEMENT
// ========================================
async function confirmTubeChange() {
    if (!currentDeviceId) {
        Utils.showWarning('No device connected');
        return;
    }

    const confirmed = confirm('Are you sure you want to record a tube change? This will reset the runtime counter.');

    if (!confirmed) return;

    try {
        const now = Date.now();

        await FirebaseApp.getDeviceRef(currentDeviceId).child('maintenance').set({
            lastTubeChange: now,
            runtimeSinceChange: 0
        });

        Utils.showSuccess('Tube change recorded successfully');
        updateTubeMaintenanceUI();

    } catch (error) {
        console.error('Error recording tube change:', error);
        Utils.showError('Failed to record tube change');
    }
}

function updateTubeMaintenanceUI() {
    const maintenance = deviceSettings?.maintenance || {};
    const lastTubeChange = maintenance.lastTubeChange || deviceInfo?.lastTubeChange || 0;
    const runtimeSinceChange = maintenance.runtimeSinceChange || deviceInfo?.runtimeSinceChange || 0;

    if (el.infoLastTubeChange) {
        if (lastTubeChange > 0) {
            el.infoLastTubeChange.textContent = new Date(lastTubeChange).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            el.infoLastTubeChange.textContent = 'Not recorded';
        }
    }

    if (el.infoRuntimeSinceChange) {
        if (runtimeSinceChange > 0) {
            // Convert seconds to readable format
            const hours = Math.floor(runtimeSinceChange / 3600);
            const minutes = Math.floor((runtimeSinceChange % 3600) / 60);
            el.infoRuntimeSinceChange.textContent = `${hours}h ${minutes}m`;
        } else {
            el.infoRuntimeSinceChange.textContent = '0h 0m';
        }
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
    if (!currentDeviceId) {
        Utils.showWarning('No device connected');
        return;
    }

    // Calculate RPM based on input mode
    let rpmToUse = targetRPM;

    if (inputMode === 'flow') {
        // Convert flow to RPM
        const mlPerRev = deviceSettings?.mlPerRev || 0;
        if (mlPerRev > 0 && targetFlow > 0) {
            rpmToUse = Math.min(400, Math.max(1, Math.round(targetFlow / mlPerRev)));
        } else {
            Utils.showWarning('Please set Flow higher than 0');
            return;
        }
    } else {
        if (rpmToUse <= 0) {
            Utils.showWarning('Please set RPM higher than 0');
            return;
        }
    }

    // Optimistic UI update first for responsiveness
    setPumpRunning(true);

    try {
        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'START',
            rpm: rpmToUse,
            direction: currentDirection,
            onTime: 0,
            offTime: 0,
            targetVolume: 0,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        Utils.showSuccess('Pump started');
    } catch (error) {
        console.error('Error starting pump:', error);
        // Revert UI on error
        setPumpRunning(false);
        Utils.showError('Failed to start pump. Check connection.');
    }
}

async function stopPump() {
    if (!currentDeviceId) return;

    // Optimistic UI update first
    setPumpRunning(false);

    try {
        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').update({
            command: 'STOP',
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        Utils.showSuccess('Pump stopped');
    } catch (error) {
        console.error('Error stopping pump:', error);
        // Revert UI on error
        setPumpRunning(true);
        Utils.showError('Failed to stop pump. Check connection.');
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

    // Update Dispense buttons (RPM Mode)
    if (el.rpmDispenseBtn) {
        if (running) {
            el.rpmDispenseBtn.textContent = '⏹ Stop';
            el.rpmDispenseBtn.classList.add('running');
        } else {
            el.rpmDispenseBtn.textContent = '💧 Dispense';
            el.rpmDispenseBtn.classList.remove('running');
        }
    }

    // Update Dispense buttons (Volume Mode)
    if (el.volumeDispenseBtn) {
        if (running) {
            el.volumeDispenseBtn.textContent = '⏹ Stop';
            el.volumeDispenseBtn.classList.add('running');
        } else {
            el.volumeDispenseBtn.textContent = '💧 Dispense';
            el.volumeDispenseBtn.classList.remove('running');
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
    updateFlowDisplay();
    updateControlsState();

    // Start/stop real-time flow tracking
    if (running) {
        startFlowTracking();
    } else {
        stopFlowTracking();
    }
}

function setControlsEnabled(enabled) {
    const disabled = !enabled;

    // RPM Controls
    if (el.rpmMinus) el.rpmMinus.disabled = disabled;
    if (el.rpmPlus) el.rpmPlus.disabled = disabled;
    if (el.rpmInput) el.rpmInput.disabled = disabled;
    if (el.rpmSlider) el.rpmSlider.disabled = disabled;

    // Direction control
    if (el.directionBtn) el.directionBtn.disabled = disabled;

    // Flow Input
    if (el.flowInput) el.flowInput.disabled = disabled;

    // RPM Dispense Inputs
    if (el.dispenseRpmInput) el.dispenseRpmInput.disabled = disabled;
    if (el.dispenseRpmSlider) el.dispenseRpmSlider.disabled = disabled;
    if (el.dispenseOnTime) el.dispenseOnTime.disabled = disabled;
    if (el.dispenseOffTime) el.dispenseOffTime.disabled = disabled;

    // Volume Dispense Inputs
    if (el.volumeInput) el.volumeInput.disabled = disabled;
    if (el.volumeOffTime) el.volumeOffTime.disabled = disabled;

    // Dispense Direction Toggles (disable click events via class or pointer-events)
    const toggles = [
        el.dispenseRpmDirCW, el.dispenseRpmDirCCW,
        el.volumeDirCW, el.volumeDirCCW
    ];
    toggles.forEach(t => {
        if (t) {
            t.style.pointerEvents = disabled ? 'none' : 'auto';
            t.style.opacity = disabled ? '0.5' : '1';
        }
    });

    // Start/Stop button - ALWAYS enabled so user can STOP
    if (el.startStopBtn) {
        el.startStopBtn.disabled = false;
    }
}

/**
 * Update controls state based on device online status and calibration
 */
function updateControlsState() {
    // Pre-Flush button - always clickable to enable stop functionality
    if (el.preFlushBtn) {
        if (isPumpRunning) {
            el.preFlushBtn.textContent = '⏹ Stop';
            el.preFlushBtn.classList.add('running');
        } else {
            el.preFlushBtn.textContent = '🚿 Pre-Flush';
            el.preFlushBtn.classList.remove('running');
        }
        el.preFlushBtn.disabled = false;
    }

    // Dispense buttons
    // Allow clicking dispense buttons while running to enable "Stop" functionality
    if (el.rpmDispenseBtn) {
        el.rpmDispenseBtn.disabled = false;
    }
    if (el.volumeDispenseBtn) {
        // Volume dispense requires calibration, but we allow stop if running
        el.volumeDispenseBtn.disabled = (!isPumpRunning && !isCalibrated);
    }

    // Update calibration warning visibility
    if (el.calibWarning) {
        if (!isCalibrated) {
            el.calibWarning.classList.remove('hidden');
        } else {
            el.calibWarning.classList.add('hidden');
        }
    }
}

// ========================================
// RPM-BASED DISPENSE
// ========================================
async function dispenseRpmBased() {
    if (!currentDeviceId) return;

    // If pump is running, this button acts as Stop
    if (isPumpRunning) {
        await stopPump();
        return;
    }

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
        setPumpRunning(false);
        Utils.hideLoading();
        console.error('Error starting dispense:', error);
        Utils.showError('Failed to start dispense');
    }
}

// ========================================
// VOLUME-BASED DISPENSE
// ========================================
// Default RPM for volume-based dispense (auto-calculated from calibration)
const VOLUME_DISPENSE_RPM = 200;

function updateEstimatedTime() {
    if (!el.estimatedTime) return;

    const volume = parseFloat(el.volumeInput?.value) || 0;
    const mlPerRev = deviceSettings?.mlPerRev || 0;

    const valueEl = el.estimatedTime.querySelector('.estimation-value');
    const labelEl = el.estimatedTime.querySelector('.estimation-label');

    if (volume > 0 && mlPerRev > 0) {
        const seconds = Utils.calculateDispenseTime(volume, mlPerRev, VOLUME_DISPENSE_RPM);
        if (valueEl) valueEl.textContent = Utils.formatDuration(seconds);
        if (labelEl) labelEl.textContent = `${mlPerRev.toFixed(2)} mL/rev @ ${VOLUME_DISPENSE_RPM} RPM`;
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

async function dispenseVolume() {
    if (!currentDeviceId) {
        Utils.showWarning('No device connected');
        return;
    }

    if (!isCalibrated) {
        Utils.showWarning('Please calibrate the device first');
        return;
    }

    if (isPumpRunning) {
        await stopPump();
        return;
    }

    const volume = parseFloat(el.volumeInput?.value) || 0;
    const offTime = parseFloat(el.volumeOffTime?.value) || 0;
    const direction = el.volumeDirCCW?.classList.contains('active') ? 'CCW' : 'CW';

    if (volume <= 0) {
        Utils.showWarning('Please enter a valid volume');
        return;
    }

    if (offTime < 0 || offTime > 10) {
        Utils.showWarning('Off Time must be between 0 and 10 seconds');
        return;
    }

    // Optimistic UI update first
    setPumpRunning(true);

    try {
        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'DISPENSE_VOLUME',
            rpm: VOLUME_DISPENSE_RPM,
            direction: direction,
            onTime: 0,
            offTime: offTime * 1000, // Convert to ms
            targetVolume: volume,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        Utils.showSuccess(`Dispensing ${volume} mL`);
    } catch (error) {
        console.error('Error dispensing volume:', error);
        setPumpRunning(false);
        Utils.showError('Failed to start dispense. Check connection.');
    }
}

// ========================================
// PRE-FLUSH
// ========================================
async function preFlush() {
    if (!currentDeviceId) return;

    // If pump is running, this button acts as Stop
    if (isPumpRunning) {
        await stopPump();
        return;
    }

    // Check if device is online
    if (!deviceOnlineStatus) {
        Utils.showWarning('Device is offline');
        return;
    }

    try {
        Utils.showLoading('Starting pre-flush...');

        await FirebaseApp.getDeviceRef(currentDeviceId).child('control').set({
            command: 'PRE_FLUSH',
            rpm: 200,           // Default pre-flush speed
            direction: 'CW',    // Default direction
            onTime: 3000,       // 3 seconds
            offTime: 0,
            targetVolume: 0,
            issuedBy: Auth.getCurrentUserId(),
            issuedAt: Date.now(),
            acknowledged: false
        });

        // Optimistic UI update
        setPumpRunning(true);

        Utils.hideLoading();
        Utils.showSuccess('Pre-flush started');
    } catch (error) {
        setPumpRunning(false);
        Utils.hideLoading();
        console.error('Error starting pre-flush:', error);
        Utils.showError('Failed to start pre-flush');
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
        updateTubeMaintenanceUI();
    });

    // Control node updates (for mode and acknowledged)
    controlListener = deviceRef.child('control').on('value', (snapshot) => {
        const controlData = snapshot.val() || {};
        controlMode = controlData.mode || 'LOCAL';
        updateControlModeUI();

        // Check for acknowledged state to hide loading on buttons
        if (controlData.acknowledged === true) {
            hideButtonLoading();
        }
    });

    // Maintenance updates (for tube change tracking)
    deviceRef.child('maintenance').on('value', (snapshot) => {
        const maintenanceData = snapshot.val() || {};
        // Store in deviceSettings for easy access
        if (!deviceSettings) deviceSettings = {};
        deviceSettings.maintenance = maintenanceData;
        updateTubeMaintenanceUI();
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

    // Update device online state
    deviceOnlineStatus = deviceStatus.online === true;

    // Update pump running state from device - only trust if device is online
    // and data is fresh (within 60 seconds)
    const lastUpdated = deviceStatus.lastUpdated || 0;
    const isDataFresh = (Date.now() - lastUpdated) < 60000; // 60 seconds

    if (deviceOnlineStatus && isDataFresh) {
        const running = deviceStatus.pumpRunning === true;
        setPumpRunning(running);
    } else if (!deviceOnlineStatus) {
        // Device is offline - assume pump is stopped
        setPumpRunning(false);
    }
    // If data is stale but device claims online, keep current UI state

    // Current RPM display
    if (el.currentRPM) {
        el.currentRPM.textContent = deviceStatus.currentRPM || 0;
    }

    // Control mode - now from control node, not status
    // (updateControlModeUI handles this)

    // Session dispensed (for status page info display)
    const sessionMl = deviceStatus.sessionDispensed || 0;
    if (el.sessionDispensed) {
        el.sessionDispensed.textContent = `${sessionMl.toFixed(1)} mL`;
    }

    // Note: Total Flow is now calculated in real-time by updateTotalFlowDisplay()

    // Last updated
    if (el.lastUpdated) {
        el.lastUpdated.textContent = 'Last updated: ' + Utils.formatRelativeTime(deviceStatus.lastUpdated);
    }

    // Update connection status and controls
    updateConnectionStatus(FirebaseApp.isConnected());
    updateControlsState();
}

function updateSettingsUI() {
    if (!deviceSettings) return;

    // Tube Size - use tubeName only (board doesn't send tubeID)
    if (el.settingsTube) {
        const tubeName = deviceSettings.tubeName;
        if (tubeName && tubeName.trim() !== '') {
            el.settingsTube.textContent = tubeName;
            el.settingsTube.classList.remove('warning');
        } else {
            el.settingsTube.textContent = 'Not set';
            el.settingsTube.classList.add('warning');
        }
    }

    // Calibration Value - never show -1 or negative values
    if (el.settingsMlPerRev) {
        const mlPerRev = deviceSettings.mlPerRev;
        if (mlPerRev && mlPerRev > 0) {
            el.settingsMlPerRev.textContent = `${mlPerRev.toFixed(3)} mL/rev`;
            el.settingsMlPerRev.classList.remove('warning');
        } else {
            el.settingsMlPerRev.textContent = 'Not calibrated';
            el.settingsMlPerRev.classList.add('warning');
        }
    }

    // Calibration Type
    if (el.settingsCalibrationType) {
        const type = deviceSettings.calibrationType;
        if (type && type !== 'none') {
            el.settingsCalibrationType.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        } else {
            el.settingsCalibrationType.textContent = 'None';
        }
    }

    // Last Calibrated
    if (el.settingsLastCalibrated) {
        const lastCal = deviceSettings.lastCalibrated;
        if (lastCal && lastCal > 0) {
            el.settingsLastCalibrated.textContent = Utils.formatDateTime(lastCal);
        } else {
            el.settingsLastCalibrated.textContent = 'Never';
        }
    }

    // Anti-Drip
    if (el.settingsAntiDrip) {
        el.settingsAntiDrip.textContent = deviceSettings.antiDrip ? 'Enabled' : 'Disabled';
    }

    // Update flow display when settings change
    updateFlowDisplay();
    updateMaxVolume();
    updateControlsState();
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
    // Board doesn't send tubeID - use mlPerRev > 0 and tubeName not empty
    const mlPerRev = deviceSettings?.mlPerRev || 0;
    const tubeName = deviceSettings?.tubeName || '';

    isCalibrated = (mlPerRev > 0 && tubeName.trim() !== '');

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
    updateFlowDisplay();
}

/**
 * Update control mode display (from control node)
 */
function updateControlModeUI() {
    if (el.controlMode) {
        el.controlMode.textContent = controlMode;
    }
}

/**
 * Show loading state on a button
 */
function showButtonLoading(btn, originalText) {
    if (!btn) return;
    btn.disabled = true;
    btn.dataset.originalText = originalText || btn.textContent;
    btn.innerHTML = '<span class="btn-spinner">⏳</span> Waiting...';
}

/**
 * Hide loading state on buttons
 */
function hideButtonLoading() {
    // Restore all buttons that might be in loading state
    const buttons = [el.startStopBtn, el.rpmDispenseBtn, el.volumeDispenseBtn, el.preFlushBtn];
    buttons.forEach(btn => {
        if (btn && btn.dataset.originalText) {
            btn.disabled = false;
            // For start/stop button, use the current state
            if (btn === el.startStopBtn) {
                setPumpRunning(isPumpRunning);
            } else {
                btn.innerHTML = btn.dataset.originalText;
            }
            delete btn.dataset.originalText;
        }
    });
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
    if (controlListener) deviceRef.child('control').off('value', controlListener);
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
