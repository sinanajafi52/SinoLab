/**
 * SinoLab WebApp - Session Management Module
 * Handles device session locking, heartbeat, and multi-user access control
 */

// ========================================
// CONSTANTS
// ========================================
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes - session considered stale after this
const HEARTBEAT_INTERVAL = 60 * 1000;   // 1 minute - update lastActive every minute

// ========================================
// STATE
// ========================================
let heartbeatTimer = null;
let currentSessionDeviceId = null;

// ========================================
// SESSION MANAGEMENT
// ========================================

/**
 * Get the current session for a device
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>} Session object or null
 */
async function getDeviceSession(deviceId) {
    if (!deviceId) return null;

    try {
        const snapshot = await FirebaseApp.getDeviceRef(deviceId)
            .child('session')
            .once('value');

        return snapshot.val();
    } catch (error) {
        console.error('Error getting device session:', error);
        return null;
    }
}

/**
 * Check if a session is stale (expired)
 * @param {Object} session - Session object
 * @returns {boolean} True if session is stale or doesn't exist
 */
function isSessionStale(session) {
    if (!session || !session.lastActive) return true;

    const now = Date.now();
    const elapsed = now - session.lastActive;

    // Session is stale if:
    // 1. Inactive for longer than timeout
    // 2. Timestamp is in the future (clock skew > 1 minute)
    return elapsed > SESSION_TIMEOUT || elapsed < -60000;
}

/**
 * Check if current user owns the session
 * @param {Object} session - Session object
 * @returns {boolean} True if current user owns the session
 */
function isMySession(session) {
    if (!session) return false;

    const currentUser = Auth.getCurrentUser();
    if (!currentUser) return false;

    // Check UID match
    if (session.activeUser === currentUser.uid) return true;

    // Check Email match (Fallback for re-logins with different UIDs)
    if (session.userEmail && currentUser.email &&
        session.userEmail.toLowerCase() === currentUser.email.toLowerCase()) {
        return true;
    }

    return false;
}

/**
 * Attempt to claim a session for a device
 * @param {string} deviceId - Device ID
 * @returns {Promise<{success: boolean, message: string, blockedBy?: string}>}
 */
async function claimSession(deviceId) {
    if (!deviceId) {
        return { success: false, message: 'Invalid device ID' };
    }

    const currentUser = Auth.getCurrentUser();
    if (!currentUser) {
        return { success: false, message: 'Not authenticated' };
    }

    try {
        // Get current session
        const existingSession = await getDeviceSession(deviceId);

        // DEBUG: Log session state
        console.log('🔍 Session Debug:', {
            deviceId,
            existingSession,
            currentUserUid: currentUser.uid,
            currentUserEmail: currentUser.email,
            isStale: existingSession ? isSessionStale(existingSession) : 'no session',
            isMySession: existingSession ? isMySession(existingSession) : 'no session',
            sessionAge: existingSession?.lastActive ? Math.round((Date.now() - existingSession.lastActive) / 1000) + 's' : 'N/A'
        });

        // Check if there's an active session by another user
        if (existingSession && !isSessionStale(existingSession) && !isMySession(existingSession)) {
            // Another user has an active session
            const blockedByEmail = existingSession.userEmail || 'another user';
            console.log(`Session blocked: Device ${deviceId} is in use by ${blockedByEmail}`);
            return {
                success: false,
                message: `Device is currently in use by:\n${blockedByEmail}`,
                blockedBy: blockedByEmail
            };
        }

        // Session is available - claim it
        const sessionData = {
            activeUser: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.displayName || currentUser.email,
            lastActive: Date.now(),
            claimedAt: Date.now()
        };

        await FirebaseApp.getDeviceRef(deviceId)
            .child('session')
            .set(sessionData);

        console.log(`Session claimed: Device ${deviceId} by ${currentUser.email}`);

        // Start heartbeat
        startHeartbeat(deviceId);

        return { success: true, message: 'Session claimed successfully' };
    } catch (error) {
        console.error('Error claiming session:', error);

        // Check for permission denied (Firebase Rules blocking)
        if (error.code === 'PERMISSION_DENIED') {
            return {
                success: false,
                message: 'Permission denied - device may be in use by another user'
            };
        }

        return { success: false, message: 'Failed to claim session' };
    }
}

/**
 * Release a session for a device
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} Success status
 */
async function releaseSession(deviceId) {
    if (!deviceId) return false;

    try {
        // Only release if we own the session
        const session = await getDeviceSession(deviceId);
        if (session && isMySession(session)) {
            await FirebaseApp.getDeviceRef(deviceId)
                .child('session')
                .remove();

            console.log(`Session released: Device ${deviceId}`);
        }

        // Stop heartbeat if this was our active device
        if (currentSessionDeviceId === deviceId) {
            stopHeartbeat();
        }

        return true;
    } catch (error) {
        console.error('Error releasing session:', error);
        return false;
    }
}

/**
 * Release all sessions owned by current user
 * Called on logout
 * @returns {Promise<void>}
 */
async function releaseAllSessions() {
    const uid = Auth.getCurrentUserId();
    if (!uid) return;

    try {
        // Get all devices
        const devicesSnapshot = await FirebaseApp.database.ref('devices').once('value');
        const devices = devicesSnapshot.val() || {};

        // Check each device's session
        const releasePromises = [];
        for (const deviceId of Object.keys(devices)) {
            const session = devices[deviceId]?.session;
            if (session && session.activeUser === uid) {
                console.log(`Releasing session for device: ${deviceId}`);
                releasePromises.push(
                    FirebaseApp.getDeviceRef(deviceId)
                        .child('session')
                        .remove()
                );
            }
        }

        await Promise.all(releasePromises);
        console.log(`Released ${releasePromises.length} session(s) on logout`);

        stopHeartbeat();
    } catch (error) {
        console.error('Error releasing all sessions:', error);
    }
}

// ========================================
// HEARTBEAT
// ========================================

/**
 * Start heartbeat to keep session alive
 * @param {string} deviceId - Device ID
 */
function startHeartbeat(deviceId) {
    // Stop any existing heartbeat
    stopHeartbeat();

    currentSessionDeviceId = deviceId;

    // Send immediate heartbeat
    sendHeartbeat(deviceId);

    // Start interval
    heartbeatTimer = setInterval(() => {
        sendHeartbeat(deviceId);
    }, HEARTBEAT_INTERVAL);

    console.log(`Heartbeat started for device: ${deviceId}`);
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    currentSessionDeviceId = null;
    console.log('Heartbeat stopped');
}

/**
 * Send a heartbeat update
 * @param {string} deviceId - Device ID
 */
async function sendHeartbeat(deviceId) {
    if (!deviceId) return;

    const uid = Auth.getCurrentUserId();
    if (!uid) {
        stopHeartbeat();
        return;
    }

    try {
        await FirebaseApp.getDeviceRef(deviceId)
            .child('session/lastActive')
            .set(Date.now());

        console.log(`Heartbeat sent for device: ${deviceId}`);
    } catch (error) {
        console.error('Error sending heartbeat:', error);
        // If permission denied, session was likely taken over
        if (error.code === 'PERMISSION_DENIED') {
            stopHeartbeat();
            Utils.showError('Session expired. Another user may have connected.');
        }
    }
}

// ========================================
// SESSION STATUS CHECK
// ========================================

/**
 * Check if we can access a device (have active session)
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>}
 */
async function canAccessDevice(deviceId) {
    if (!deviceId) return false;

    const session = await getDeviceSession(deviceId);

    // No session exists - can access
    if (!session) return true;

    // Session is stale - can access
    if (isSessionStale(session)) return true;

    // We own the session - can access
    if (isMySession(session)) return true;

    // Another user has active session - cannot access
    return false;
}

/**
 * Get session status for display
 * @param {string} deviceId - Device ID
 * @returns {Promise<{available: boolean, message: string, userEmail?: string}>}
 */
async function getSessionStatus(deviceId) {
    const session = await getDeviceSession(deviceId);

    if (!session) {
        return { available: true, message: 'Available' };
    }

    if (isSessionStale(session)) {
        return { available: true, message: 'Available (session expired)' };
    }

    if (isMySession(session)) {
        return { available: true, message: 'Your session', userEmail: session.userEmail };
    }

    return {
        available: false,
        message: `In use by ${session.userName || session.userEmail || 'another user'}`,
        userEmail: session.userEmail
    };
}

// ========================================
// CLEANUP
// ========================================

/**
 * Cleanup on page unload
 */
function cleanup() {
    stopHeartbeat();
    // Note: We don't release session on page close because the user might refresh
    // Session will expire naturally if they don't return
}

window.addEventListener('beforeunload', cleanup);

// ========================================
// EXPORT
// ========================================

window.Session = {
    // Session management
    getDeviceSession,
    isSessionStale,
    isMySession,
    claimSession,
    releaseSession,
    releaseAllSessions,

    // Heartbeat
    startHeartbeat,
    stopHeartbeat,

    // Status
    canAccessDevice,
    getSessionStatus,

    // Constants (for reference)
    SESSION_TIMEOUT,
    HEARTBEAT_INTERVAL,

    // Cleanup
    cleanup
};

// Debug function - clear stuck session (call from console)
window.forceReleaseSession = async function (deviceId) {
    if (!deviceId) {
        deviceId = Utils.getSavedDeviceId();
    }
    if (!deviceId) {
        console.error('❌ No device ID provided or saved');
        return;
    }

    console.log('🔧 Force releasing session for:', deviceId);
    try {
        await FirebaseApp.getDeviceRef(deviceId).child('session').remove();
        console.log('✅ Session cleared! You can now access the device.');
        Utils.showSuccess('Session cleared');
    } catch (error) {
        console.error('❌ Failed to clear session:', error);
    }
};

console.log('Session module loaded');
