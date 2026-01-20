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
let currentDirection = 'CW';
let targetRPM = 100;
let targetFlow = 0;  // Separate flow value
let inputMode = 'rpm';  // 'rpm' or 'flow' - which control is active
let isFlowInputFocused = false;  // Track if user is typing in flow input
let dispenseMode = 'rpm'; // 'rpm' or 'volume'

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

// Control state (Removed controlMode as it's no longer used)

// UI Elements
const el = {};

// ========================================
// INITIALIZATION
// ========================================
async function initDashboard() {
    console.log('Initializing dashboard...');

    currentDeviceId = Utils.getSavedDeviceId();
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
                calculatedRPM = Math.min(400, Math.max(0, calculatedRPM));

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
                // Only set value and focus if user is NOT currently typing
                if (!isFlowInputFocused) {
                    el.flowInput.value = targetFlow > 0 ? targetFlow : '';
                    // Auto-focus only on first switch to flow mode
                    setTimeout(() => {
                        if (!isFlowInputFocused) {
                            el.flowInput.focus();
                            isFlowInputFocused = true;
                        }
                    }, 50);
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
function startFlowTracking() {
    if (flowUpdateInterval) return; // Already tracking

    pumpStartTime = Date.now();
    sessionFlowMl = 0;

    // Use server time if available to resume session
    if (liveStatus && (liveStatus.lastUpdated || liveStatus.updatedAt)) {
        const serverTime = new Date(liveStatus.lastUpdated || liveStatus.updatedAt).getTime();
        // Only use server time if it's recent (within 10 seconds of now OR cleaner logic)
        // If we are "resuming" a running pump, serverTime is the start time.
        // But liveStatus.lastUpdated updates on every change. 
        // Actually, if activeMode is running, lastUpdated IS (roughly) the start time of that mode
        // unless the board updates it periodically? The board updates it on command receipt.
        // So yes, it is the start time.
        pumpStartTime = serverTime;
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

    // Display in mL (no conversion to Liters needed)
    if (el.totalFlowValue) {
        el.totalFlowValue.textContent = sessionFlowMl.toFixed(2);
    }

    // Update runtime display as well
    updateTubeMaintenanceUI();
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
    backdrop.className = 'modal-backdrop';
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

    // DB Update every 10 seconds
    if (runtimeUpdateInterval) clearInterval(runtimeUpdateInterval);
    runtimeUpdateInterval = setInterval(() => {
        updateRuntimeInDB();
    }, 10000);

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

    // Save final runtime
    if (pumpRuntimeStart) {
        updateRuntimeInDB();
        pumpRuntimeStart = null;
    }

    // Final UI update
    updateTubeMaintenanceUI();
    updateMaintenanceInfo();
}

// Update runtime in database
async function updateRuntimeInDB() {
    if (!currentDeviceId || !pumpRuntimeStart) return;

    try {
        // Calculate elapsed seconds since pump started
        const elapsedSeconds = Math.floor((Date.now() - pumpRuntimeStart) / 1000);

        if (elapsedSeconds < 1) return;

        // Update tube runtime
        const refTube = FirebaseApp.getDeviceRef(currentDeviceId).child('maintenance/tubeRuntimeSeconds');
        await refTube.transaction((currentVal) => {
            return (currentVal || 0) + elapsedSeconds;
        });

        // Update total runtime
        const refTotal = FirebaseApp.getDeviceRef(currentDeviceId).child('maintenance/totalRuntimeSeconds');
        await refTotal.transaction((currentVal) => {
            return (currentVal || 0) + elapsedSeconds;
        });

        // Reset start time for next interval
        pumpRuntimeStart = Date.now();

    } catch (error) {
        console.error('Error updating runtime:', error);
    }
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

    // Safety check for connection
    if (!connection || !connection.online) {
        Utils.showWarning('Device is offline');
        return;
    }

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
    let flowRateVal = 0;

    const mlPerRev = tubeConfig?.mlPerRev || 0;

    if (inputMode === 'flow') {
        // Convert flow to RPM
        if (mlPerRev > 0 && targetFlow > 0) {
            rpmToUse = Math.min(400, Math.max(1, Math.round(targetFlow / mlPerRev)));
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

    try {
        await FirebaseApp.getDeviceRef(currentDeviceId).child('liveStatus').update({
            activeMode: 'STATUS',
            inputMode: inputMode.toUpperCase(),
            currentRPM: rpmToUse,
            currentFlowRate: flowRateVal > 0 ? flowRateVal : null,
            direction: currentDirection,
            acknowledged: false,
            lastIssuedBy: Auth.getCurrentUserId(),
            lastUpdated: new Date().toISOString()
        });

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
        await FirebaseApp.getDeviceRef(currentDeviceId).child('liveStatus').update({
            activeMode: 'NONE',
            acknowledged: false,
            lastIssuedBy: Auth.getCurrentUserId(),
            lastUpdated: new Date().toISOString()
        });

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
    const isOnline = connection && connection.online;

    // Only lock ACTION buttons when offline, not input controls
    // Users should be able to adjust RPM/Flow even before connecting
    const actionButtons = [
        el.startStopBtn,
        el.rpmDispenseBtn,
        el.volumeDispenseBtn
    ];

    // Disable/Enable action buttons based on connection
    actionButtons.forEach(btn => {
        if (btn) btn.disabled = !isOnline;
    });

    // Dispense tabs - always enabled, but volume tab depends on calibration
    if (el.rpmModeTab) {
        el.rpmModeTab.classList.remove('disabled');
    }
    // Volume tab is handled in checkCalibration

    // Volume dispense button
    if (el.volumeDispenseBtn) {
        // Volume dispense requires calibration AND connection
        el.volumeDispenseBtn.disabled = !isOnline || !isCalibrated;
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

    // Optimistic UI update
    setPumpRunning(true);

    try {
        // 1. Set parameters
        await FirebaseApp.getDeviceRef(currentDeviceId).child('rpmDispense').set({
            rpm: rpm,
            onTime: onTime * 1000, // Convert to ms
            offTime: offTime * 1000, // Convert to ms
            direction: direction
        });

        // 2. Trigger action
        await FirebaseApp.getDeviceRef(currentDeviceId).child('liveStatus').update({
            activeMode: 'RPM',
            inputMode: null, // Clear inputMode to avoid conflict
            acknowledged: false,
            lastIssuedBy: Auth.getCurrentUserId(),
            lastUpdated: new Date().toISOString()
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
const VOLUME_DISPENSE_RPM = 200;

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
    // Calculate max volume based on 400 RPM limit
    const mlPerRev = tubeConfig?.mlPerRev || 0;
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
        // 1. Set parameters
        await FirebaseApp.getDeviceRef(currentDeviceId).child('volumeDispense').set({
            targetVolume: volume,
            offTime: offTime * 1000, // Convert to ms
            direction: direction
        });

        // 2. Trigger action
        await FirebaseApp.getDeviceRef(currentDeviceId).child('liveStatus').update({
            activeMode: 'VOLUME',
            inputMode: null, // Clear inputMode to avoid conflict
            acknowledged: false,
            lastIssuedBy: Auth.getCurrentUserId(),
            lastUpdated: new Date().toISOString()
        });

        Utils.showSuccess(`Dispensing ${volume} mL`);
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
        updateMaintenanceInfo();
        updateTubeMaintenanceUI();
    });

    // Connection updates

    // 1. Monitor Active Controller (The Lock System)
    monitorActiveController(deviceRef);

    // Force initial state to offline to clear "Connecting..."
    updateConnectionStatus(false);

    connectionListener = deviceRef.child('connection').on('value', (snapshot) => {
        const val = snapshot.val();
        console.log('📡 RAW Firebase Connection:', val); // Debug Log
        connection = val || {};
        updateConnectionStatus(connection.online === true);
        updateConnectionInfo(); // Update IP/LastSeen in Info page
    }, (error) => {
        console.error('🔥 Firebase Error:', error);
        updateConnectionStatus(false);
    });

    console.log('Subscribed to device:', currentDeviceId);
}

// setupConnectionMonitoring removed - merged into subscribeToDevice connection listener

// ========================================
// UI UPDATES
// ========================================

/**
 * Update Sidebar Connection Status
 * @param {boolean} isOnline 
 */
function updateConnectionStatus(isOnline) {
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

    // STALE STATE CHECK
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    const lastUpdatedTime = liveStatus.lastUpdated || liveStatus.updatedAt;
    let isStale = false;

    if (lastUpdatedTime) {
        const diff = Date.now() - new Date(lastUpdatedTime).getTime();
        if (diff > STALE_THRESHOLD) {
            isStale = true;
            console.warn('⚠️ Stale liveStatus detected. Treating as STOPPED.');
        }
    }

    // Determine pump running state from activeMode
    // If stale, assume pump is NOT running regardless of activeMode
    let running = (liveStatus.activeMode && liveStatus.activeMode !== 'NONE');
    if (isStale) {
        running = false;
    }

    // Check connection validity (using separate connection state)
    if (connection && !connection.online) {
        setPumpRunning(false);
    } else {
        setPumpRunning(running);
    }

    // If running, ensure start time is synced for flow calculation
    if (running && lastUpdatedTime && (!pumpStartTime || pumpStartTime === 0)) {
        pumpStartTime = new Date(lastUpdatedTime).getTime();
        // Trigger immediate update
        updateTotalFlowDisplay();
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

function checkCalibration() {
    console.log('Checking Calibration. TubeConfig:', tubeConfig);
    const mlPerRev = tubeConfig?.mlPerRev || 0;
    const tubeName = tubeConfig?.tubeName || '';

    // Consider calibrated if mlPerRev > 0. tubeName is less critical but good practice.
    isCalibrated = (mlPerRev > 0);

    if (el.calibWarning) {
        el.calibWarning.classList.toggle('hidden', isCalibrated);
    }

    if (el.dispenseWarning) {
        el.dispenseWarning.classList.toggle('hidden', isCalibrated);
    }

    if (el.volumeModeTab) {
        el.volumeModeTab.classList.toggle('disabled', !isCalibrated);
        // If we lost calibration while in volume mode, switch back
        if (!isCalibrated && dispenseMode === 'volume') {
            switchDispenseMode('rpm');
        }
    }

    updateEstimatedTime();
    updateFlowDisplay();
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
