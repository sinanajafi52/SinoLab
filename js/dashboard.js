/**
 * SinoLab WebApp - Dashboard Module
 * Real-time pump control and monitoring
 */

// ========================================
// STATE
// ========================================
// State
let currentDeviceId = null;
let liveStatus = null;      // New: liveStatus node
let tubeConfig = null;      // New: tubeConfig node
let identity = null;        // New: identity node
let connection = null;      // New: connection node
let maintenance = null;     // New: maintenance node

let isCalibrated = false;
let isPumpRunning = false;
let deviceOnlineStatus = false;
let connectionChangedAt = 0;      // client time of the last connection/ update
let connectionWatchStart = 0;     // client time the connection listener started
let onlineRecheckTimer = null;    // re-evaluates liveness while the page is open
let currentDirection = 'CW';
let targetRPM = 100;
let targetFlow = 0;  // Separate flow value
let inputMode = 'rpm';  // 'rpm' or 'flow' - which control is active
let isFlowInputFocused = false;  // Track if user is typing in flow input
let dispenseMode = 'rpm'; // 'rpm' or 'volume'
let flowUpdateInterval = null; // Flow tracking interval
let pumpStartTime = null; // Timestamp when pump started
let sessionFlowMl = 0; // Total flow in current session (mL)
let currentFlowRate = 0; // Current flow rate (mL/min)

// Firebase listeners
let liveStatusListener = null;
let tubeConfigListener = null;
let identityListener = null;
let maintenanceListener = null;
let connectionListener = null;

// Lock System
let activeControllerListener = null;
let activeControllerInterval = null; // Heartbeat
let currentAuthUser = null;
let imActiveController = false;
let hasInitialNavigated = false; // Track if we've navigated based on activeMode on first load

// Control state (Removed controlMode as it's no longer used)

// UI Elements
const el = {};

// ========================================
// INITIALIZATION
// ========================================
async function initDashboard() {
    console.log('Initializing dashboard...');

    currentDeviceId = Utils.getSavedDeviceId()?.trim();
    console.log('📱 Device ID:', currentDeviceId);

    if (!currentDeviceId) {
        Utils.navigateTo('device.html');
        return;
    }

    console.log('🔐 Calling Auth.initProtectedPage...');
    Auth.initProtectedPage(async (user) => {
        console.log('Auth ready, checking session...');

        // Verify session is still valid (in case user refreshed page)
        const sessionResult = await Session.claimSession(currentDeviceId);
        if (!sessionResult.success) {
            Utils.showError(sessionResult.message);
            // Redirect back to device selection
            setTimeout(() => {
                Utils.navigateTo('device.html');
            }, 2000);
            return;
        }

        console.log('Session verified, initializing UI...');

        cacheElements();

        // Force hide legacy lock modal just in case
        if (el.userLockModal) {
            el.userLockModal.classList.remove('active');
            el.userLockModal.style.display = 'none';
        }

        // Show Leave Device button since we have the session
        if (el.leaveDeviceBtn) {
            el.leaveDeviceBtn.style.display = 'flex';
        }

        setupEventHandlers();
        setupNavigation();

        // Enable controls first (before Firebase data arrives)
        isPumpRunning = false;
        inputMode = 'rpm';  // Ensure we start in RPM mode
        setControlsEnabled(true);
        updateDirectionDisplay();
        setRPM(targetRPM);  // Initialize RPM display and controls

        // Update sidebar device ID
        if (el.sidebarDeviceId) {
            el.sidebarDeviceId.textContent = currentDeviceId;
        }

        // Setup change device button
        Device.setupChangeDeviceButton();

        // Check for database migration
        if (window.Migration && currentDeviceId) {
            await window.Migration.checkAndMigrate(currentDeviceId);
        }

        // Subscribe to Firebase after UI is ready
        subscribeToDevice();
        // setupConnectionMonitoring removed (integrated into subscribeToDevice)

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

    el.totalFlowValue = document.getElementById('totalFlowValue');
    el.startStopBtn = document.getElementById('startStopBtn');
    el.startStopIcon = document.getElementById('startStopIcon');
    el.startStopText = document.getElementById('startStopText');
    el.lastUpdated = document.getElementById('lastUpdated');

    // Status info panel

    el.controlMode = document.getElementById('controlMode');


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

    // System Info - Device
    el.infoDeviceName = document.getElementById('infoDeviceName');
    el.infoDeviceId = document.getElementById('infoDeviceId');
    el.infoFirmware = document.getElementById('infoFirmware');
    el.infoIP = document.getElementById('infoIP');
    el.infoMAC = document.getElementById('infoMAC');
    el.infoLastSeen = document.getElementById('infoLastSeen');
    el.infoRuntime = document.getElementById('infoRuntime');

    // System Info - Calibration
    el.settingsTubeName = document.getElementById('settingsTube');
    el.settingsMlPerRev = document.getElementById('settingsMlPerRev');
    el.settingsCalibrationType = document.getElementById('settingsCalibrationType');
    el.settingsLastCalibrated = document.getElementById('settingsLastCalibrated');
    el.settingsAntiDrip = document.getElementById('settingsAntiDrip');

    // Lock Modal
    el.userLockModal = document.getElementById('userLockModal');
    el.lockUserEmail = document.getElementById('lockUserEmail');
    el.exitDashboardBtn = document.getElementById('exitDashboardBtn');
    el.forceUnlockBtn = document.getElementById('forceUnlockBtn');
    el.leaveDeviceBtn = document.getElementById('leaveDeviceBtn');
    el.leaveDeviceBtn = document.getElementById('leaveDeviceBtn');
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
            const val = Math.min(300, Math.max(0, parseInt(e.target.value) || 0));
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
            const val = Math.min(300, Math.max(10, parseInt(e.target.value) || 100));
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
            isFlowInputFocused = true;
            switchInputMode('flow');
        });
        el.flowInput.addEventListener('blur', () => {
            isFlowInputFocused = false;
            // Validate and snap to nearest RPM
            let val = Math.max(0, parseFloat(el.flowInput.value) || 0);

            // If calibrated, snap to nearest RPM
            const mlPerRev = tubeConfig?.mlPerRev || 0;
            if (mlPerRev > 0 && val > 0) {
                // Calculate nearest RPM
                let calculatedRPM = Math.round(val / mlPerRev);
                // Clamp RPM
                calculatedRPM = Math.min(300, Math.max(0, calculatedRPM));

                // Update targetRPM
                setRPM(calculatedRPM);

                // Recalculate exact flow based on snapped RPM
                val = calculatedRPM * mlPerRev;
            }

            targetFlow = val;
            if (val > 0) {
                el.flowInput.value = val.toFixed(2);
            }
        });
        el.flowInput.addEventListener('input', (e) => {
            // Store raw value while typing
            targetFlow = parseFloat(e.target.value) || 0;
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



    // Tube Change confirmation button
    if (el.confirmTubeChangeBtn) {
        el.confirmTubeChangeBtn.addEventListener('click', confirmTubeChange);
    }

    // Exit on Lock
    if (el.exitDashboardBtn) {
        el.exitDashboardBtn.addEventListener('click', () => {
            Utils.navigateTo('device.html');
        });
    }

    // Leave Device (Active Release)
    // Leave Device (Active Release)
    if (el.leaveDeviceBtn) {
        el.leaveDeviceBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to leave this device?')) {
                Utils.showLoading('Leaving device...');
                await Session.releaseSession(currentDeviceId);
                Utils.navigateTo('device.html');
            }
        });
    }

    // Force Unlock (Manual Override)
    if (el.forceUnlockBtn) {
        el.forceUnlockBtn.addEventListener('click', async () => {
            if (!currentDeviceId || !currentAuthUser) return;

            if (confirm('Are you sure? This will kick out any other user controlling this device.')) {
                Utils.showLoading('Force unlocking...');
                try {
                    // Use Session module to force claim
                    await Session.claimSession(currentDeviceId);
                    window.location.reload(); // Refresh to init session properly
                } catch (e) {
                    console.error('Force unlock failed', e);
                    Utils.showError('Unlock failed: ' + e.message);
                    Utils.hideLoading();
                }
            }
        });
    }
}

// ========================================
// DISPENSE MODE SWITCHING
// ========================================
function switchDispenseMode(mode) {
    if (isPumpRunning) {
        showRunningLockMessage();
        return;
    }
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

/**
 * Navigate to the appropriate page based on activeMode
 * STATUS/NONE → Status page
 * RPM → Dispense page with RPM tab
 * VOLUME → Dispense page with Volume tab
 */
function navigateToActiveMode(activeMode) {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const pages = document.querySelectorAll('.dashboard-page');

    // Default to status page
    let targetPage = 'status';
    let dispenseTab = null;

    if (activeMode === 'RPM') {
        targetPage = 'dispense';
        dispenseTab = 'rpm';
    } else if (activeMode === 'VOLUME') {
        targetPage = 'dispense';
        dispenseTab = 'volume';
    }
    // STATUS and NONE stay on status page

    // Update nav active state
    navItems.forEach(nav => {
        nav.classList.remove('active');
        if (nav.dataset.page === targetPage) {
            nav.classList.add('active');
        }
    });

    // Show target page
    pages.forEach(p => p.classList.remove('active'));
    const targetPageEl = document.getElementById(targetPage + 'Page');
    if (targetPageEl) targetPageEl.classList.add('active');

    // If dispense page, also switch to correct tab
    if (dispenseTab) {
        // Use a slight delay to ensure elements are ready
        setTimeout(() => {
            if (dispenseTab === 'rpm') {
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
        }, 100);
    }

    console.log(`Navigated to ${targetPage} page${dispenseTab ? ` (${dispenseTab} tab)` : ''} based on activeMode: ${activeMode}`);
}

// ========================================
// RPM CONTROL
// ========================================
function setRPM(value) {
    targetRPM = Math.min(300, Math.max(0, value));

    if (el.rpmInput) el.rpmInput.value = targetRPM;
    if (el.rpmSlider) {
        el.rpmSlider.value = targetRPM;
        // Update slider background
        const percent = (targetRPM / 300) * 100;
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
        const mlPerRev = tubeConfig?.mlPerRev || 0;
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
                // Only set value if user is NOT currently typing
                if (!isFlowInputFocused) {
                    el.flowInput.value = targetFlow > 0 ? targetFlow : '';
                    // Note: Removed auto-focus to prevent scroll jumping on mobile
                }
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
        const mlPerRev = tubeConfig?.mlPerRev || 0;
        const flow = (mlPerRev > 0 && targetRPM > 0) ? targetRPM * mlPerRev : 0;

        currentFlowRate = flow; // Store for total calculation

        if (el.flowValue) {
            el.flowValue.textContent = flow > 0 ? flow.toFixed(2) : '--';
        }
    } else {
        // In flow mode, use targetFlow
        currentFlowRate = targetFlow;
    }

    updateInputModeDisplay();
}

// ========================================
// REAL-TIME TOTAL FLOW CALCULATION
// ========================================

function startFlowTracking(isResuming = false) {
    if (flowUpdateInterval) return; // Already tracking

    // Always reset session values
    sessionFlowMl = 0;

    console.log('📊 startFlowTracking called, isResuming:', isResuming, 'pumpStartedAt:', liveStatus?.pumpStartedAt);

    // ALWAYS check for pumpStartedAt when pump is running - this handles resume automatically
    if (isPumpRunning && liveStatus && liveStatus.pumpStartedAt) {
        const pumpStartedTime = typeof liveStatus.pumpStartedAt === 'number'
            ? liveStatus.pumpStartedAt
            : new Date(liveStatus.pumpStartedAt).getTime();
        const now = Date.now();
        const elapsed = now - pumpStartedTime;

        // Only use saved time if it's reasonable (within last 24 hours)
        if (elapsed > 0 && elapsed < 86400000) {
            pumpStartTime = pumpStartedTime;
            console.log('📊 ✅ Using pumpStartedAt, elapsed:', Math.round(elapsed / 1000), 's, currentFlowRate:', currentFlowRate);
        } else {
            pumpStartTime = now;
            console.log('📊 ⚠️ pumpStartedAt too old, elapsed:', elapsed, 'ms');
        }
    } else {
        // Fresh start - use current time
        pumpStartTime = Date.now();
        console.log('📊 Starting fresh - isPumpRunning:', isPumpRunning, ', pumpStartedAt:', liveStatus?.pumpStartedAt);
    }

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
        el.totalFlowValue.textContent = '0.00';
    }
}

function updateTotalFlowDisplay() {
    if (!isPumpRunning || !pumpStartTime) {
        if (el.totalFlowValue) {
            el.totalFlowValue.textContent = '0.00';
        }
        return;
    }

    if (currentFlowRate <= 0) {
        return;
    }

    // Time elapsed in minutes
    const elapsedMs = Date.now() - pumpStartTime;
    const elapsedMin = elapsedMs / 60000;

    // Total mL = flow rate (mL/min) * time (min)
    sessionFlowMl = currentFlowRate * elapsedMin;

    // Convert to Liters and display with 2 decimal places
    const sessionLiters = sessionFlowMl / 1000;
    if (el.totalFlowValue) {
        el.totalFlowValue.textContent = sessionLiters.toFixed(2);
    }
    // Note: updateTubeMaintenanceUI has its own interval, no need to call here
}

// ========================================
// TUBE CHANGE MANAGEMENT
// ========================================

// Runtime tracking variables
let pumpRuntimeStart = null;
let runtimeUpdateInterval = null;
let localUiInterval = null;

function confirmTubeChange() {
    if (!currentDeviceId) {
        Utils.showWarning('No device connected');
        return;
    }

    // Show custom confirmation modal
    showTubeChangeModal();
}

function showTubeChangeModal() {
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.id = 'tubeChangeModal';
    backdrop.innerHTML = `
        <div class="modal-content">
            <div class="modal-icon">🔧</div>
            <h3 class="modal-title">Confirm Tube Change</h3>
            <p class="modal-message">Are you sure you have changed the tube? This will reset the runtime counter.</p>
            <div class="modal-actions">
                <button class="btn btn-outline modal-btn-no" id="tubeChangeNo">No</button>
                <button class="btn btn-primary modal-btn-yes" id="tubeChangeYes">Yes</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);

    // Add event listeners
    document.getElementById('tubeChangeNo').addEventListener('click', () => {
        closeTubeChangeModal();
    });

    document.getElementById('tubeChangeYes').addEventListener('click', async () => {
        await saveTubeChange();
        closeTubeChangeModal();
    });

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeTubeChangeModal();
        }
    });
}

function closeTubeChangeModal() {
    const modal = document.getElementById('tubeChangeModal');
    if (modal) {
        modal.remove();
    }
}

async function saveTubeChange() {
    try {
        const now = Date.now();

        // Update maintenance node
        await FirebaseApp.getDeviceRef(currentDeviceId).child('maintenance').update({
            lastTubeChange: now,
            tubeRuntimeSeconds: 0
        });

        Utils.showSuccess('Tube change recorded successfully');
        // UI update is handled by listener
    } catch (error) {
        console.error('Error recording tube change:', error);
        Utils.showError('Failed to record tube change');
    }
}

// Start tracking runtime when pump starts
// Start tracking runtime when pump starts
function startRuntimeTracking() {
    pumpRuntimeStart = Date.now();

    // Runtime counters in maintenance/ are written by the device (every 60 s
    // while running). The web app only extrapolates them for display;
    // writing them here as well double-counted runtime.
    if (runtimeUpdateInterval) clearInterval(runtimeUpdateInterval);
    runtimeUpdateInterval = null;

    // Local UI update every 1 second
    if (localUiInterval) clearInterval(localUiInterval);
    localUiInterval = setInterval(() => {
        updateTubeMaintenanceUI();
        updateMaintenanceInfo();
    }, 1000);
}

// Stop tracking and save final runtime
function stopRuntimeTracking() {
    if (runtimeUpdateInterval) {
        clearInterval(runtimeUpdateInterval);
        runtimeUpdateInterval = null;
    }
    if (localUiInterval) {
        clearInterval(localUiInterval);
        localUiInterval = null;
    }

    pumpRuntimeStart = null;

    // Final UI update
    updateTubeMaintenanceUI();
    updateMaintenanceInfo();
}

function updateTubeMaintenanceUI() {
    // maintenance object is global state now
    if (!maintenance) return;

    const lastTubeChange = maintenance.lastTubeChange || 0;

    // Base runtime from DB
    let totalSeconds = maintenance.tubeRuntimeSeconds || 0;

    // Add volatile elapsed time if running
    if (isPumpRunning && pumpRuntimeStart) {
        const elapsed = Math.floor((Date.now() - pumpRuntimeStart) / 1000);
        totalSeconds += elapsed;
    }

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
        // Convert seconds to readable format
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        el.infoRuntimeSinceChange.textContent = `${hours}h ${minutes}m ${seconds}s`;
    }
}

// ========================================
// START/STOP PUMP
// ========================================
async function togglePump() {
    console.log('togglePump called, isPumpRunning:', isPumpRunning);

    // If pump is running, ALWAYS allow stop (even if offline)
    if (isPumpRunning) {
        await stopPump();
        return;
    }

    // For starting pump, check connection
    if (!deviceOnlineStatus) {
        Utils.showWarning('Device is offline');
        return;
    }

    await startPump();
}

async function startPump() {
    if (!currentDeviceId) {
        Utils.showWarning('No device connected');
        return;
    }

    // Calculate RPM based on input mode
    let rpmToUse = targetRPM;
    let flowRateVal = 0;

    const mlPerRev = tubeConfig?.mlPerRev || 0;

    if (inputMode === 'flow') {
        // Convert flow to RPM
        if (mlPerRev > 0 && targetFlow > 0) {
            rpmToUse = Math.min(300, Math.max(1, Math.round(targetFlow / mlPerRev)));
            flowRateVal = targetFlow;
        } else {
            Utils.showWarning('Please set Flow higher than 0 and ensure device is calibrated');
            return;
        }
    } else {
        if (rpmToUse <= 0) {
            Utils.showWarning('Please set RPM higher than 0');
            return;
        }
        // Calculate flow rate if calibrated
        if (mlPerRev > 0) {
            flowRateVal = rpmToUse * mlPerRev;
        }
    }

    // Optimistic UI update first for responsiveness
    setPumpRunning(true);

    // Start flow tracking from 0 (not resuming)
    stopFlowTracking(); // Clear any existing tracking first
    startFlowTracking(false);

    try {
        const payload = {
            activeMode: 'STATUS',
            inputMode: inputMode.toUpperCase(),
            currentRPM: rpmToUse,
            currentFlowRate: flowRateVal > 0 ? flowRateVal : null,
            direction: currentDirection,
            pumpStartedAt: Date.now(), // For Total Flow calculation
            acknowledged: false,
            lastIssuedBy: Auth.getCurrentUserId(),
            lastUpdated: Date.now()
        };

        await FirebaseApp.getDeviceRef(currentDeviceId).child('liveStatus').update(payload);

        Utils.showSuccess('Pump started');
    } catch (error) {
        console.error('Error starting pump:', error);
        // Revert UI on error
        setPumpRunning(false);
        // Stop tracking if start failed
        stopFlowTracking();
        stopRuntimeTracking();
        Utils.showError('Failed to start pump. Check connection.');
    }
}

async function stopPump() {
    if (!currentDeviceId) return;

    // Optimistic UI update first
    setPumpRunning(false);

    try {
        // Clear operational values for safety (Defense in Depth)
        // Direction is preserved as it's a user preference
        const payload = {
            activeMode: 'NONE',
            inputMode: null,
            currentRPM: 0,
            currentFlowRate: null,
            pumpStartedAt: null, // Clear pump start time
            acknowledged: false,
            lastIssuedBy: Auth.getCurrentUserId(),
            lastUpdated: Date.now()
        };

        await FirebaseApp.getDeviceRef(currentDeviceId).child('liveStatus').update(payload);

        Utils.showSuccess('Pump stopped');
    } catch (error) {
        console.error('Error stopping pump:', error);
        // Revert UI on error
        setPumpRunning(true);
        // Maybe don't show error for stop if it was just connection glitch, but good to know
        Utils.showError('Failed to stop pump (Connection error)');
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

    // Start/stop real-time flow tracking and runtime tracking
    if (running) {
        startFlowTracking();
        startRuntimeTracking();
    } else {
        stopFlowTracking();
        stopRuntimeTracking();
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
    const isOnline = deviceOnlineStatus;

    // Only lock ACTION buttons when offline, not input controls
    // Users should be able to adjust RPM/Flow even before connecting
    // NOTE: startStopBtn is NOT included - Stop must ALWAYS work (even offline)
    const actionButtons = [
        el.rpmDispenseBtn,
        el.volumeDispenseBtn
    ];

    // Disable/Enable action buttons based on connection.
    // While the pump runs these buttons act as Stop, which must always work.
    actionButtons.forEach(btn => {
        if (btn) btn.disabled = !isOnline && !isPumpRunning;
    });

    // Start/Stop button - only disable START when offline, STOP always works
    if (el.startStopBtn) {
        // If pump is running, button shows "Stop" - keep enabled
        // If pump is stopped, button shows "Start" - disable if offline
        el.startStopBtn.disabled = !isPumpRunning && !isOnline;
    }

    // Dispense tabs - always enabled, but volume tab depends on calibration
    if (el.rpmModeTab) {
        el.rpmModeTab.classList.remove('disabled');
    }
    // Volume tab is handled in checkCalibration

    // Volume dispense button
    if (el.volumeDispenseBtn) {
        // Volume dispense requires calibration AND connection (Stop always works)
        el.volumeDispenseBtn.disabled = !isPumpRunning && (!isOnline || !isCalibrated);
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

    if (rpm < 10 || rpm > 300) {
        Utils.showWarning('Speed must be between 10 and 300 RPM');
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

    // Optimistic UI update
    setPumpRunning(true);

    try {
        // Parameters and trigger in ONE atomic multi-path update, so the
        // device can never read the trigger together with stale parameters.
        await FirebaseApp.getDeviceRef(currentDeviceId).update({
            'rpmDispense': {
                rpm: rpm,
                onTime: Math.round(onTime * 1000),   // ms (integer: firmware reads it as int)
                offTime: Math.round(offTime * 1000), // ms
                direction: direction
            },
            'liveStatus/activeMode': 'RPM',
            'liveStatus/inputMode': null, // Clear inputMode to avoid conflict
            'liveStatus/acknowledged': false,
            'liveStatus/lastIssuedBy': Auth.getCurrentUserId(),
            'liveStatus/lastUpdated': Date.now()
        });

        Utils.showSuccess(`Running at ${rpm} RPM for ${onTime}s`);
    } catch (error) {
        setPumpRunning(false);
        console.error('Error starting dispense:', error);
        Utils.showError('Failed to start dispense');
    }
}

// ========================================
// VOLUME-BASED DISPENSE
// ========================================
// Default RPM for volume-based dispense (auto-calculated from calibration)
const VOLUME_DISPENSE_RPM = 120; // Fixed RPM for volume dispense

function updateEstimatedTime() {
    if (!el.estimatedTime) return;

    const volume = parseFloat(el.volumeInput?.value) || 0;
    const mlPerRev = tubeConfig?.mlPerRev || 0;

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
    // Calculate max volume based on 300 RPM limit
    const mlPerRev = tubeConfig?.mlPerRev || 0;
    if (mlPerRev > 0 && el.volumeInput) {
        // Max volume per minute at 300 RPM
        const maxFlowPerMin = 300 * mlPerRev;
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

    const requestedVolume = parseFloat(el.volumeInput?.value) || 0;
    const offTime = parseFloat(el.volumeOffTime?.value) || 0;
    const direction = el.volumeDirCCW?.classList.contains('active') ? 'CCW' : 'CW';

    if (requestedVolume <= 0) {
        Utils.showWarning('Please enter a valid volume');
        return;
    }

    if (offTime < 0 || offTime > 10) {
        Utils.showWarning('Off Time must be between 0 and 10 seconds');
        return;
    }

    // The device converts targetVolume into motor revolutions itself
    // (targetVolume / mlPerRev at VOLUME_DISPENSE_RPM), so no rounding of
    // the requested volume is needed here.
    const mlPerRev = tubeConfig?.mlPerRev || 0;
    const onTimeSec = Utils.calculateDispenseTime(requestedVolume, mlPerRev, VOLUME_DISPENSE_RPM);

    executeVolumeDispense(VOLUME_DISPENSE_RPM, onTimeSec, offTime, direction, requestedVolume);
}

async function executeVolumeDispense(rpm, onTimeSec, offTimeSec, direction, volume) {
    // Optimistic UI update first
    setPumpRunning(true);

    try {
        // targetVolume is what the firmware reads. rpm/onTime are kept for
        // display only (the firmware ignores them). Parameters and trigger
        // are written in ONE atomic multi-path update.
        await FirebaseApp.getDeviceRef(currentDeviceId).update({
            'volumeDispense': {
                targetVolume: Math.round(volume * 100) / 100, // mL
                offTime: Math.round(offTimeSec * 1000),       // ms
                direction: direction,
                rpm: rpm,
                onTime: Math.round(onTimeSec * 1000)          // ms, informational
            },
            'liveStatus/activeMode': 'VOLUME',
            'liveStatus/currentRPM': rpm,
            'liveStatus/inputMode': null,
            'liveStatus/acknowledged': false,
            'liveStatus/lastIssuedBy': Auth.getCurrentUserId(),
            'liveStatus/lastUpdated': Date.now()
        });

        Utils.showSuccess(`Dispensing ${volume.toFixed(2)} mL`);
    } catch (error) {
        console.error('Error dispensing volume:', error);
        setPumpRunning(false);
        Utils.showError('Failed to start dispense. Check connection.');
    }
}

// ========================================
// FIREBASE SUBSCRIPTIONS
// ========================================
function subscribeToDevice() {
    if (!currentDeviceId) return;

    const deviceRef = FirebaseApp.getDeviceRef(currentDeviceId);

    // Live Status updates
    liveStatusListener = deviceRef.child('liveStatus').on('value', (snapshot) => {
        liveStatus = snapshot.val() || {};
        updateLiveStatus();

        // On first load, navigate to correct page and populate Status form
        if (!hasInitialNavigated && liveStatus.activeMode) {
            hasInitialNavigated = true;
            navigateToActiveMode(liveStatus.activeMode);

            // Populate Status page form fields from liveStatus
            if (liveStatus.activeMode === 'STATUS' && liveStatus.currentRPM > 0) {
                console.log('📥 Loading Status page values from liveStatus:', liveStatus);

                // Set input mode first (RPM or FLOW)
                if (liveStatus.inputMode) {
                    inputMode = liveStatus.inputMode.toLowerCase();
                    updateInputModeDisplay();
                }

                // Set RPM (always, even if in flow mode - this is the calculated RPM)
                if (liveStatus.currentRPM) {
                    currentRPM = liveStatus.currentRPM;
                    targetRPM = liveStatus.currentRPM;

                    if (el.rpmInput) el.rpmInput.value = liveStatus.currentRPM;
                    if (el.rpmSlider) el.rpmSlider.value = liveStatus.currentRPM;
                }

                // Set Flow Rate
                if (liveStatus.currentFlowRate && liveStatus.currentFlowRate > 0) {
                    currentFlowRate = liveStatus.currentFlowRate;
                    targetFlow = liveStatus.currentFlowRate;

                    // Update flow display value (the large number)
                    if (el.flowValue) {
                        el.flowValue.textContent = liveStatus.currentFlowRate.toFixed(2);
                    }

                    // Update flow input field
                    if (el.flowInput) {
                        el.flowInput.value = liveStatus.currentFlowRate.toFixed(2);
                    }
                }

                // Set Direction
                if (liveStatus.direction) {
                    currentDirection = liveStatus.direction;
                    updateDirectionDisplay();
                }
            }
        }
    });

    // Tube Config updates (Settings)
    tubeConfigListener = deviceRef.child('tubeConfig').on('value', (snapshot) => {
        tubeConfig = snapshot.val() || {};
        updateTubeSettings();
        checkCalibration();
    });

    // Identity updates (Info)
    identityListener = deviceRef.child('identity').on('value', (snapshot) => {
        identity = snapshot.val() || {};
        updateIdentityInfo();
    });

    // Maintenance updates
    maintenanceListener = deviceRef.child('maintenance').on('value', (snapshot) => {
        maintenance = snapshot.val() || {};
        // New runtime values from the device already include the time run so
        // far: extrapolate from now on to avoid counting it twice.
        if (isPumpRunning && pumpRuntimeStart) {
            pumpRuntimeStart = Date.now();
        }
        updateMaintenanceInfo();
        updateTubeMaintenanceUI();
    });

    // RPM Dispense settings - load and populate form
    deviceRef.child('rpmDispense').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            console.log('📥 Loaded RPM Dispense settings:', data);
            if (el.dispenseRpmInput && data.rpm) el.dispenseRpmInput.value = data.rpm;
            if (el.dispenseRpmSlider && data.rpm) el.dispenseRpmSlider.value = data.rpm;
            if (el.dispenseOnTime && data.onTime !== undefined) el.dispenseOnTime.value = data.onTime / 1000; // Convert ms to seconds
            if (el.dispenseOffTime && data.offTime !== undefined) el.dispenseOffTime.value = data.offTime / 1000;

            // Set direction
            if (data.direction === 'CCW') {
                if (el.dispenseRpmDirCCW) el.dispenseRpmDirCCW.classList.add('active');
                if (el.dispenseRpmDirCW) el.dispenseRpmDirCW.classList.remove('active');
            } else {
                if (el.dispenseRpmDirCW) el.dispenseRpmDirCW.classList.add('active');
                if (el.dispenseRpmDirCCW) el.dispenseRpmDirCCW.classList.remove('active');
            }
        }
    });

    // Volume Dispense settings - load and populate form
    deviceRef.child('volumeDispense').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            console.log('📥 Loaded Volume Dispense settings:', data);

            // Volume: targetVolume (current format); older entries only had
            // onTime/rpm, so fall back to calculating it from those.
            if (data.targetVolume > 0) {
                if (el.volumeInput) el.volumeInput.value = Number(data.targetVolume).toFixed(2);
            } else if (data.onTime && data.rpm) {
                const mlPerRev = tubeConfig?.mlPerRev || 0;
                if (mlPerRev > 0) {
                    const onTimeSec = data.onTime / 1000;
                    const flowRatePerSec = (data.rpm * mlPerRev) / 60;
                    const calculatedVolume = onTimeSec * flowRatePerSec;
                    if (el.volumeInput) el.volumeInput.value = calculatedVolume.toFixed(2);
                }
            }

            // Load offTime
            if (el.volumeOffTime && data.offTime !== undefined) {
                el.volumeOffTime.value = data.offTime / 1000;
            }

            // Set direction
            if (data.direction === 'CCW') {
                if (el.volumeDirCCW) el.volumeDirCCW.classList.add('active');
                if (el.volumeDirCW) el.volumeDirCW.classList.remove('active');
            } else {
                if (el.volumeDirCW) el.volumeDirCW.classList.add('active');
                if (el.volumeDirCCW) el.volumeDirCCW.classList.remove('active');
            }

            // Recalculate estimated time with loaded values
            updateEstimatedTime();
        }
    });

    // Connection updates

    // 1. Monitor Active Controller (The Lock System)
    monitorActiveController(deviceRef);

    // Force initial state to offline to clear "Connecting..."
    updateConnectionStatus(false);

    connectionWatchStart = Date.now();
    connectionListener = deviceRef.child('connection').on('value', (snapshot) => {
        const val = snapshot.val();
        console.log('📡 RAW Firebase Connection:', val); // Debug Log
        connection = val || {};
        connectionChangedAt = Date.now();
        refreshOnlineState();
        updateConnectionInfo(); // Update IP/LastSeen in Info page
    }, (error) => {
        console.error('🔥 Firebase Error:', error);
        updateConnectionStatus(false);
    });

    // Liveness changes with time even when no data arrives (power cut),
    // so re-evaluate periodically.
    if (onlineRecheckTimer) clearInterval(onlineRecheckTimer);
    onlineRecheckTimer = setInterval(refreshOnlineState, 5000);

    console.log('Subscribed to device:', currentDeviceId);
}

// setupConnectionMonitoring removed - merged into subscribeToDevice connection listener

/**
 * Recompute whether the device is online and update the UI if it changed.
 * Uses the heartbeat timestamp; if the device has no wall-clock time yet
 * (lastSeen is its uptime counter), a heartbeat must still arrive within
 * DEVICE_OFFLINE_AFTER_MS while this page is watching.
 */
function refreshOnlineState() {
    let online = Utils.isDeviceOnline(connection);

    const lastSeen = Number(connection?.lastSeen);
    const hasEpochTime = lastSeen > 1e12;
    if (online && !hasEpochTime) {
        const watchedFor = Date.now() - connectionWatchStart;
        const sinceUpdate = Date.now() - connectionChangedAt;
        if (watchedFor > Utils.DEVICE_OFFLINE_AFTER_MS && sinceUpdate > Utils.DEVICE_OFFLINE_AFTER_MS) {
            online = false;
        }
    }

    updateConnectionStatus(online);
}

// ========================================
// UI UPDATES
// ========================================

/**
 * Update Sidebar Connection Status
 * @param {boolean} isOnline 
 */
function updateConnectionStatus(isOnline) {
    deviceOnlineStatus = isOnline;
    const statusText = document.getElementById('sidebarConnectionStatus');
    console.log('🔄 updateConnectionStatus:', isOnline, 'El:', statusText);

    if (statusText) {
        // Remove all status classes first
        statusText.classList.remove('connecting', 'connected', 'disconnected');

        if (isOnline) {
            statusText.textContent = 'Online';
            statusText.classList.add('connected');
            if (el.controlMode) el.controlMode.textContent = 'REMOTE'; // Fix for user request
        } else {
            statusText.textContent = 'Offline';
            statusText.classList.add('disconnected');
            if (el.controlMode) el.controlMode.textContent = 'LOCAL';
        }
    }
    updateControlsState();
}

function updateLiveStatus() {
    if (!liveStatus) return;

    // Check for acknowledged state to hide loading on buttons
    if (liveStatus.acknowledged === true) {
        hideButtonLoading();
    }

    const lastUpdatedTime = liveStatus.lastUpdated || liveStatus.updatedAt;

    // The pump state comes from activeMode only. The device resets it to
    // "NONE" itself (local stop, end of a volume dispense, fail-safe on lost
    // connection). It is not overridden by age or by the device being
    // offline: a run may legitimately last hours, and while offline the
    // Stop button must stay available so a stop command is queued for the
    // moment the device reconnects.
    const running = (liveStatus.activeMode && liveStatus.activeMode !== 'NONE');
    setPumpRunning(running);

    // If running, ensure flow tracking is active
    if (running && !flowUpdateInterval) {
        // This is a resume scenario (page load with pump already running)
        console.log('📊 Resume detected - liveStatus:', {
            pumpStartedAt: liveStatus.pumpStartedAt,
            currentRPM: liveStatus.currentRPM,
            currentFlowRate: liveStatus.currentFlowRate
        });

        // Calculate currentFlowRate from RPM if not directly available
        if (liveStatus.currentFlowRate && liveStatus.currentFlowRate > 0) {
            currentFlowRate = liveStatus.currentFlowRate;
        } else if (liveStatus.currentRPM && tubeConfig?.mlPerRev > 0) {
            // Calculate flow rate: RPM × mlPerRev = mL/min
            currentFlowRate = liveStatus.currentRPM * tubeConfig.mlPerRev;
            console.log('📊 Calculated currentFlowRate from RPM:', currentFlowRate);
        }

        startFlowTracking(true);
    }

    // Update direction
    if (liveStatus.direction && liveStatus.direction !== currentDirection) {
        currentDirection = liveStatus.direction;
        updateDirectionDisplay();
    }

    // Last updated display
    if (el.lastUpdated) {
        if (lastUpdatedTime && !isNaN(new Date(lastUpdatedTime).getTime())) {
            el.lastUpdated.textContent = 'Last updated: ' + Utils.formatRelativeTime(lastUpdatedTime);
        } else {
            el.lastUpdated.textContent = 'Last updated: Never';
            if (lastUpdatedTime) console.warn('Invalid lastUpdatedTime:', lastUpdatedTime);
        }
    }

    updateControlsState();
}

function updateTubeSettings() {
    if (!tubeConfig) return;

    // Tube Name
    if (el.settingsTubeName) {
        el.settingsTubeName.textContent = tubeConfig.tubeName || 'Not Selected';
    }

    // Ml Per Rev
    const mlPerRev = tubeConfig.mlPerRev;
    if (el.settingsMlPerRev) {
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
        const type = tubeConfig.calibrationType;
        if (type && type !== 'none') {
            el.settingsCalibrationType.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        } else {
            el.settingsCalibrationType.textContent = 'None';
        }
    }

    // Last Calibrated
    if (el.settingsLastCalibrated) {
        const lastCal = tubeConfig.lastCalibrated;
        if (lastCal) {
            const date = new Date(lastCal);
            el.settingsLastCalibrated.textContent = !isNaN(date) ? Utils.formatDateTime(date) : 'Never';
        } else {
            el.settingsLastCalibrated.textContent = 'Never';
        }
    }

    // Anti-Drip
    if (el.settingsAntiDrip) {
        el.settingsAntiDrip.textContent = tubeConfig.antiDrip ? 'Enabled' : 'Disabled';
    }

    // Crucial: Re-check calibration status whenever tube config changes
    checkCalibration();
}

function updateIdentityInfo() {
    if (!identity) return;

    if (el.infoMAC) el.infoMAC.textContent = identity.mac || 'N/A';
    if (el.infoFirmware) el.infoFirmware.textContent = identity.firmware || 'Unknown';
    if (el.infoDeviceName) el.infoDeviceName.textContent = 'Frog Pump';
    if (el.infoDeviceId) el.infoDeviceId.textContent = currentDeviceId;
}

function updateConnectionInfo() {
    if (!connection) return;

    if (el.infoIP) el.infoIP.textContent = connection.ip || 'N/A';
    if (el.infoLastSeen && connection.lastSeen) {
        const date = new Date(connection.lastSeen);
        el.infoLastSeen.textContent = !isNaN(date) ? Utils.formatRelativeTime(date) : connection.lastSeen;
    }
}

function updateMaintenanceInfo() {
    if (!maintenance) return;

    // Runtime from maintenance node (total)
    if (el.infoRuntime) {
        let totalSeconds = maintenance.totalRuntimeSeconds || 0;

        // Add volatile elapsed time if running
        if (isPumpRunning && pumpRuntimeStart) {
            const elapsed = Math.floor((Date.now() - pumpRuntimeStart) / 1000);
            totalSeconds += elapsed;
        }

        const hours = totalSeconds / 3600;
        el.infoRuntime.textContent = `${hours.toFixed(1)} hours`;
    }
}

function checkCalibration() {
    const mlPerRev = tubeConfig?.mlPerRev || 0;
    const tubeName = tubeConfig?.tubeName || '';

    isCalibrated = (mlPerRev > 0 && tubeName.trim() !== '');

    if (el.calibWarning) {
        el.calibWarning.classList.toggle('hidden', isCalibrated);
    }

    if (el.dispenseWarning) {
        el.dispenseWarning.classList.toggle('hidden', isCalibrated);
    }

    if (el.volumeModeTab) {
        el.volumeModeTab.classList.toggle('disabled', !isCalibrated);
        if (!isCalibrated && dispenseMode === 'volume') {
            switchDispenseMode('rpm');
        }
    }

    updateEstimatedTime();
    updateFlowDisplay();
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

// ========================================
// CONTROLLER LOCK SYSTEM
// ========================================

// ========================================
// CONTROLLER LOCK SYSTEM (DEPRECATED)
// ========================================
// NOTE: Lock system is now handled by Session module (js/session.js)
// Checking 'session' node instead of 'activeController'.

function monitorActiveController(deviceRef) {
    // Legacy function disabled. 
    console.log("Legacy monitorActiveController disabled. Using Session module.");
}

function handleControllerLock(isLocked, lockedByEmail = '', startTime = null) {
    // Legacy function disabled.
}

// ========================================
// CLEANUP
// ========================================
function cleanup() {
    if (onlineRecheckTimer) {
        clearInterval(onlineRecheckTimer);
        onlineRecheckTimer = null;
    }
    if (!currentDeviceId) return;

    // Stop heartbeat (session cleanup is handled in session.js)
    if (window.Session) {
        Session.stopHeartbeat();
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
    get status() { return liveStatus; }, // Updated mapping
    get isRunning() { return isPumpRunning; },
    get isCalibrated() { return isCalibrated; },
    cleanup
};

console.log('Dashboard module loaded - CLEANUP DONE');
