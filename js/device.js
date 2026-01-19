/**
 * Frog Pump WebApp - Device Management Module
 * Handles device selection, linking, and validation
 */

// ========================================
// DEVICE STATE
// ========================================

let linkedDevices = {};
let deviceStatusListeners = [];

// ========================================
// DEVICE VALIDATION
// ========================================

/**
 * Check if device exists in database
 * @param {string} deviceId - Device ID to check
 * @returns {Promise<boolean>}
 */
async function deviceExists(deviceId) {
    if (!deviceId) return false;

    try {
        const snapshot = await FirebaseApp.getDeviceRef(deviceId).once('value');
        return snapshot.exists();
    } catch (error) {
        console.error('Error checking device existence:', error);
        return false;
    }
}

/**
 * Get device info (identity)
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>}
 */
async function getDeviceInfo(deviceId) {
    if (!deviceId) return null;

    try {
        const snapshot = await FirebaseApp.getDeviceRef(deviceId)
            .child('identity')
            .once('value');

        return snapshot.val();
    } catch (error) {
        console.error('Error getting device info:', error);
        return null;
    }
}

/**
 * Get device connection
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>}
 */
async function getDeviceConnection(deviceId) {
    if (!deviceId) return null;

    try {
        const snapshot = await FirebaseApp.getDeviceRef(deviceId)
            .child('connection')
            .once('value');

        return snapshot.val();
    } catch (error) {
        console.error('Error getting device connection:', error);
        return null;
    }
}

/**
 * Get device live status
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>}
 */
async function getDeviceLiveStatus(deviceId) {
    if (!deviceId) return null;

    try {
        const snapshot = await FirebaseApp.getDeviceRef(deviceId)
            .child('liveStatus')
            .once('value');

        return snapshot.val();
    } catch (error) {
        console.error('Error getting device live status:', error);
        return null;
    }
}

/**
 * Check if device is online
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>}
 */
async function isDeviceOnline(deviceId) {
    const conn = await getDeviceConnection(deviceId);
    return conn?.online === true;
}

// ========================================
// DEVICE LINKING
// ========================================

/**
 * Connect to a new device
 * @param {string} deviceId - Device ID
 * @param {string} nickname - Optional nickname
 * @returns {Promise<boolean>} Success status
 */
async function connectDevice(deviceId, nickname = '') {
    // Normalize device ID
    deviceId = Utils.normalizeDeviceId(deviceId);

    // Validate format
    if (!Utils.isValidDeviceId(deviceId)) {
        Utils.showError(Utils.ERRORS.INVALID_DEVICE_ID);
        return false;
    }

    try {
        Utils.showLoading('Connecting to device...');

        // Check if device exists
        const exists = await deviceExists(deviceId);
        if (!exists) {
            Utils.hideLoading();
            Utils.showError(Utils.ERRORS.DEVICE_NOT_FOUND);
            return false;
        }

        // Get current user
        const uid = Auth.getCurrentUserId();
        if (!uid) {
            Utils.hideLoading();
            Utils.showError(Utils.ERRORS.PERMISSION_DENIED);
            return false;
        }

        // Link device to user
        await Auth.linkDeviceToUser(uid, deviceId, nickname);

        // Save device ID to localStorage
        Utils.saveDeviceId(deviceId);

        Utils.hideLoading();
        Utils.showSuccess('Device connected successfully!');

        return true;
    } catch (error) {
        Utils.hideLoading();
        console.error('Error connecting device:', error);

        if (error.code === 'PERMISSION_DENIED') {
            Utils.showError(Utils.ERRORS.PERMISSION_DENIED);
        } else {
            Utils.showError(Utils.ERRORS.CONNECTION_FAILED);
        }

        return false;
    }
}

/**
 * Disconnect (unlink) a device
 * @param {string} deviceId - Device ID to disconnect
 */
async function disconnectDevice(deviceId) {
    try {
        const uid = Auth.getCurrentUserId();
        if (!uid || !deviceId) return;

        Utils.showLoading('Disconnecting device...');

        await Auth.unlinkDeviceFromUser(uid, deviceId);

        // Clear from localStorage if it was the selected device
        const savedDeviceId = Utils.getSavedDeviceId();
        if (savedDeviceId === deviceId) {
            Utils.clearSavedDeviceId();
        }

        Utils.hideLoading();
        Utils.showSuccess('Device disconnected');

        // Refresh device list
        await loadLinkedDevices();
    } catch (error) {
        Utils.hideLoading();
        Utils.showError('Error disconnecting device');
        console.error('Error disconnecting device:', error);
    }
}

/**
 * Select a device (Check lock -> save -> navigate)
 * @param {string} deviceId - Device ID to select
 */
async function selectDevice(deviceId) {
    Utils.showLoading('Checking access...');

    // Check if locked
    const isAllowed = await checkDeviceLock(deviceId);

    Utils.hideLoading();

    if (isAllowed) {
        Utils.saveDeviceId(deviceId);
        Utils.navigateTo('dashboard.html');
    }
}

/**
 * Check if device is locked by another user
 */
async function checkDeviceLock(deviceId) {
    try {
        const snapshot = await FirebaseApp.getDeviceRef(deviceId).child('activeController').once('value');
        const controller = snapshot.val();
        const myUid = Auth.getCurrentUserId();

        if (controller && controller.uid !== myUid) {
            // Locked!
            const modal = document.getElementById('userLockModal');
            const emailEl = document.getElementById('lockUserEmail');
            if (modal && emailEl) {
                emailEl.textContent = controller.email || 'Unknown User';
                modal.classList.add('active');
            } else {
                Utils.showError(`Device is used by ${controller.email}`);
            }
            return false;
        }
        return true;
    } catch (e) {
        console.error('Lock check failed', e);
        return true; // Assume open if check fails (fallback)
    }
}

// ========================================
// DEVICE LIST MANAGEMENT
// ========================================

/**
 * Load user's linked devices
 * @returns {Promise<Object>}
 */
async function loadLinkedDevices() {
    const uid = Auth.getCurrentUserId();
    if (!uid) return {};

    try {
        linkedDevices = await Auth.getUserLinkedDevices(uid);
        return linkedDevices;
    } catch (error) {
        console.error('Error loading linked devices:', error);
        return {};
    }
}

/**
 * Get linked devices with their info
 * @returns {Promise<Array>} Array of device objects with info
 */
async function getLinkedDevicesWithInfo() {
    await loadLinkedDevices();

    const deviceIds = Object.keys(linkedDevices);
    const devicesWithInfo = [];

    for (const deviceId of deviceIds) {
        const info = await getDeviceInfo(deviceId);
        const conn = await getDeviceConnection(deviceId);
        const linkData = linkedDevices[deviceId];

        devicesWithInfo.push({
            deviceId,
            nickname: linkData?.nickname || '',
            linkedAt: linkData?.linkedAt,
            info: info || {}, // identity
            online: conn?.online === true
        });
    }

    return devicesWithInfo;
}

// ========================================
// UI RENDERING
// ========================================

/**
 * Render device list
 * @param {string} containerId - Container element ID
 */
async function renderDeviceList(containerId = 'deviceList') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const devices = await getLinkedDevicesWithInfo();

        if (devices.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted" style="padding: 2rem;">
                    <p>No devices linked yet.</p>
                    <p>Add a device using the form below.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = devices.map(device => `
            <div class="device-card" data-device-id="${device.deviceId}">
                <div class="device-card-icon">🐸</div>
                <div class="device-card-info">
                    <div class="device-card-name">
                        ${device.nickname || device.info?.deviceName || 'Frog Pump'}
                    </div>
                    <div class="device-card-id">${device.deviceId}</div>
                </div>
                <div class="device-card-status ${device.online ? 'online' : 'offline'}">
                    <span>${device.online ? '🟢 Online' : '🔴 Offline'}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.device-card').forEach(card => {
            card.addEventListener('click', () => {
                const deviceId = card.dataset.deviceId;
                selectDevice(deviceId);
            });
        });
    } catch (error) {
        console.error('Error rendering device list:', error);
        container.innerHTML = `
            <div class="text-center text-error" style="padding: 2rem;">
                <p>Error loading devices</p>
                <button class="btn btn-secondary btn-sm" onclick="Device.renderDeviceList()">
                    Retry
                </button>
            </div>
        `;
    }
}

/**
 * Setup device input form
 * @param {string} formId - Form element ID
 * @param {string} inputId - Input element ID
 */
function setupDeviceForm(formId = 'deviceForm', inputId = 'deviceInput') {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);

    if (!form || !input) return;

    // Format input as user types
    input.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

        // Auto-add FROG- prefix if needed
        if (value.length > 0 && !value.startsWith('FROG-')) {
            if (value.startsWith('FROG')) {
                value = 'FROG-' + value.substring(4);
            } else if (!value.startsWith('F')) {
                // If user starts typing hex chars, assume they're entering the ID part
                value = 'FROG-' + value;
            }
        }

        // Limit length (FROG-XXXXXX = 11 chars)
        if (value.length > 11) {
            value = value.substring(0, 11);
        }

        e.target.value = value;

        // Update validation UI
        const isValid = Utils.isValidDeviceId(value);
        e.target.classList.toggle('error', value.length > 5 && !isValid);
    });

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const deviceId = input.value.trim();

        if (!deviceId) {
            Utils.showError('Please enter a Device ID');
            return;
        }

        const success = await connectDevice(deviceId);

        if (success) {
            // Check lock before navigating
            await selectDevice(deviceId);
        }
    });
}

// ========================================
// DEVICE PAGE INITIALIZATION
// ========================================

/**
 * Initialize device page
 */
function initDevicePage() {
    console.log('Initializing device page...');

    Auth.initProtectedPage(async (user) => {
        // Render device list
        await renderDeviceList();

        // Setup device form
        setupDeviceForm();

        // Setup change device button if on other pages
        // Setup change device button
        setupChangeDeviceButton();

        // Lock Modal Close Button
        const closeLockBtn = document.getElementById('closeLockModalBtn');
        if (closeLockBtn) {
            closeLockBtn.addEventListener('click', () => {
                document.getElementById('userLockModal').classList.remove('active');
            });
        }
    });
}

/**
 * Setup change device button
 * @param {string} selector - Button selector
 */
function setupChangeDeviceButton(selector = '#changeDeviceBtn') {
    const btn = document.querySelector(selector);
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            Utils.navigateTo('device.html');
        });
    }
}

// ========================================
// REAL-TIME STATUS UPDATES
// ========================================

/**
 * Subscribe to device status updates (LiveStatus)
 * @param {string} deviceId - Device ID
 * @param {Function} callback - Callback function(status)
 * @returns {Function} Unsubscribe function
 */
function subscribeToDeviceStatus(deviceId, callback) {
    const statusRef = FirebaseApp.getDeviceRef(deviceId).child('liveStatus');

    const listener = statusRef.on('value', (snapshot) => {
        const status = snapshot.val();
        if (callback) {
            callback(status);
        }
    });

    // Store listener reference for cleanup
    deviceStatusListeners.push({ ref: statusRef, event: 'value', listener });

    // Return unsubscribe function
    return () => {
        statusRef.off('value', listener);
    };
}

/**
 * Subscribe to device online status only
 * @param {string} deviceId - Device ID
 * @param {Function} callback - Callback function(isOnline)
 * @returns {Function} Unsubscribe function
 */
function subscribeToOnlineStatus(deviceId, callback) {
    const connRef = FirebaseApp.getDeviceRef(deviceId).child('connection');

    const listener = connRef.on('value', (snapshot) => {
        const conn = snapshot.val();
        if (callback) {
            callback(conn?.online === true);
        }
    });

    deviceStatusListeners.push({ ref: connRef, event: 'value', listener });

    return () => {
        connRef.off('value', listener);
    };
}

/**
 * Clean up all device status listeners
 */
function cleanupStatusListeners() {
    deviceStatusListeners.forEach(({ ref, event, listener }) => {
        ref.off(event, listener);
    });
    deviceStatusListeners = [];
}

// ========================================
// CLEANUP
// ========================================

window.addEventListener('beforeunload', () => {
    cleanupStatusListeners();
});

// ========================================
// EXPORT
// ========================================

window.Device = {
    // Validation
    deviceExists,
    getDeviceInfo,
    getDeviceLiveStatus,
    getDeviceConnection,
    isDeviceOnline,

    // Linking
    connectDevice,
    disconnectDevice,
    selectDevice,

    // List management
    loadLinkedDevices,
    getLinkedDevicesWithInfo,

    // UI
    renderDeviceList,
    setupDeviceForm,
    setupChangeDeviceButton,

    // Page init
    initDevicePage,

    // Real-time
    subscribeToDeviceStatus,
    subscribeToOnlineStatus,
    cleanupStatusListeners
};

console.log('Device module loaded');
