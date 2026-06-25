/**
 * SinoLab WebApp - Device Watchdog Module
 * Monitors all devices and marks stale ones as offline
 */

// ========================================
// CONSTANTS
// ========================================
const WATCHDOG_INTERVAL = 30 * 1000;  // Check every 30 seconds
const STALE_THRESHOLD = 180 * 1000;   // Device is stale if lastSeen > 3 minutes ago

// ========================================
// STATE
// ========================================
let watchdogTimer = null;

// ========================================
// WATCHDOG LOGIC
// ========================================

/**
 * Start the device watchdog
 * Should be called when user logs in
 */
function startWatchdog() {
    if (watchdogTimer) {
        console.log('Watchdog already running');
        return;
    }

    console.log('🐕 Watchdog started - checking devices every 30s');

    // Run immediately on start
    checkAllDevices();

    // Then run every 30 seconds
    watchdogTimer = setInterval(checkAllDevices, WATCHDOG_INTERVAL);
}

/**
 * Stop the device watchdog
 * Should be called when user logs out
 */
function stopWatchdog() {
    if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
        console.log('🐕 Watchdog stopped');
    }
}

/**
 * Check all devices and mark stale ones as offline
 */
async function checkAllDevices() {
    const uid = Auth.getCurrentUserId();
    if (!uid) {
        console.log('🐕 Watchdog: No user logged in, skipping check');
        return;
    }

    try {
        // Get all devices
        const snapshot = await FirebaseApp.database.ref('devices').once('value');
        const devices = snapshot.val();

        if (!devices) {
            return;
        }

        const now = Date.now();
        const updatePromises = [];

        for (const deviceId of Object.keys(devices)) {
            const device = devices[deviceId];
            const connection = device.connection;

            // Skip if no connection data
            if (!connection) continue;

            // Check if device is marked online but lastSeen is stale
            if (connection.online === true && connection.lastSeen) {
                const timeSinceLastSeen = now - connection.lastSeen;

                if (timeSinceLastSeen > STALE_THRESHOLD) {
                    console.log(`🐕 Watchdog: Device ${deviceId} is stale (${Math.round(timeSinceLastSeen / 1000)}s), marking offline`);

                    updatePromises.push(
                        FirebaseApp.getDeviceRef(deviceId)
                            .child('connection/online')
                            .set(false)
                    );
                }
            }
        }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`🐕 Watchdog: Marked ${updatePromises.length} device(s) as offline`);
        }

    } catch (error) {
        console.error('🐕 Watchdog error:', error);
    }
}

// ========================================
// EXPORT
// ========================================
window.Watchdog = {
    start: startWatchdog,
    stop: stopWatchdog,
    checkNow: checkAllDevices,
    WATCHDOG_INTERVAL,
    STALE_THRESHOLD
};

console.log('Watchdog module loaded');
