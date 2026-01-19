/**
 * Frog Pump WebApp - Authentication Module
 * Handles Google Sign-In and user profile management
 */

// ========================================
// AUTH STATE
// ========================================

let currentUser = null;
let authStateUnsubscribe = null;

// ========================================
// USER PROFILE MANAGEMENT
// ========================================

/**
 * Create or update user profile in database
 * @param {firebase.User} user - Firebase user object
 */
async function saveUserProfile(user) {
    if (!user) return;

    const userRef = FirebaseApp.getUserRef(user.uid);

    try {
        // Check if user exists
        const snapshot = await userRef.once('value');
        const existingData = snapshot.val();

        const userData = {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: Date.now()
        };

        // If new user, add createdAt
        if (!existingData) {
            userData.createdAt = Date.now();
        }

        // Update user data
        await userRef.update(userData);

        console.log('User profile saved:', user.email);
    } catch (error) {
        console.error('Error saving user profile:', error);
    }
}

/**
 * Get user's linked devices
 * @param {string} uid - User ID
 * @returns {Promise<Object>} Linked devices object
 */
async function getUserLinkedDevices(uid) {
    if (!uid) return {};

    try {
        const snapshot = await FirebaseApp.getUserRef(uid)
            .child('linkedDevices')
            .once('value');

        return snapshot.val() || {};
    } catch (error) {
        console.error('Error getting linked devices:', error);
        return {};
    }
}

/**
 * Link a device to user
 * @param {string} uid - User ID
 * @param {string} deviceId - Device ID
 * @param {string} nickname - Optional nickname for device
 */
async function linkDeviceToUser(uid, deviceId, nickname = '') {
    if (!uid || !deviceId) return;

    try {
        await FirebaseApp.getUserRef(uid)
            .child('linkedDevices')
            .child(deviceId)
            .set({
                linkedAt: Date.now(),
                nickname: nickname
            });

        console.log('Device linked:', deviceId);
    } catch (error) {
        console.error('Error linking device:', error);
        throw error;
    }
}

/**
 * Unlink a device from user
 * @param {string} uid - User ID
 * @param {string} deviceId - Device ID
 */
async function unlinkDeviceFromUser(uid, deviceId) {
    if (!uid || !deviceId) return;

    try {
        await FirebaseApp.getUserRef(uid)
            .child('linkedDevices')
            .child(deviceId)
            .remove();

        console.log('Device unlinked:', deviceId);
    } catch (error) {
        console.error('Error unlinking device:', error);
        throw error;
    }
}

// ========================================
// SIGN IN / SIGN OUT
// ========================================

/**
 * Sign in with Google
 * @returns {Promise<firebase.User|null>}
 */
async function signIn() {
    try {
        Utils.showLoading('Signing in...');

        const result = await FirebaseApp.signInWithGoogle();
        const user = result.user;

        // Save user profile to database
        await saveUserProfile(user);

        // Save user info to localStorage for offline access
        Utils.saveToStorage(Utils.STORAGE_KEYS.USER, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL
        });

        Utils.hideLoading();
        Utils.showSuccess('Successfully signed in!');

        return user;
    } catch (error) {
        Utils.hideLoading();

        // Handle specific error codes
        let errorMessage = Utils.ERRORS.AUTH_FAILED;

        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage = 'Sign-in cancelled';
                break;
            case 'auth/network-request-failed':
                errorMessage = Utils.ERRORS.NETWORK_ERROR;
                break;
            case 'auth/popup-blocked':
                errorMessage = 'Popup blocked. Please allow popups for this site.';
                break;
            default:
                console.error('Sign-in error:', error);
        }

        Utils.showError(errorMessage);
        return null;
    }
}

/**
 * Sign out current user
 */
async function signOut() {
    try {
        Utils.showLoading('Signing out...');

        // Release all device sessions before signing out
        if (window.Session) {
            await Session.releaseAllSessions();
        }

        await FirebaseApp.signOut();

        // Clear stored data
        Utils.removeFromStorage(Utils.STORAGE_KEYS.USER);
        Utils.clearSavedDeviceId();
        Utils.removeFromStorage(Utils.STORAGE_KEYS.LAST_STATUS);

        Utils.hideLoading();
        Utils.showSuccess('Signed out successfully');

        // Redirect to login page
        Utils.navigateTo('index.html');
    } catch (error) {
        Utils.hideLoading();
        Utils.showError('Error signing out');
        console.error('Sign out error:', error);
    }
}

// ========================================
// AUTH STATE LISTENER
// ========================================

/**
 * Initialize auth state listener
 * @param {Function} onSignedIn - Callback when user signs in
 * @param {Function} onSignedOut - Callback when user signs out
 */
function initAuthListener(onSignedIn, onSignedOut) {
    // Clean up existing listener
    if (authStateUnsubscribe) {
        authStateUnsubscribe();
    }

    authStateUnsubscribe = FirebaseApp.onAuthStateChange((user) => {
        currentUser = user;

        if (user) {
            console.log('User signed in:', user.email);

            // Save user info to localStorage
            Utils.saveToStorage(Utils.STORAGE_KEYS.USER, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            });

            if (onSignedIn) {
                onSignedIn(user);
            }
        } else {
            console.log('User signed out');

            if (onSignedOut) {
                onSignedOut();
            }
        }
    });
}

/**
 * Clean up auth listener
 */
function cleanupAuthListener() {
    if (authStateUnsubscribe) {
        authStateUnsubscribe();
        authStateUnsubscribe = null;
    }
}

// ========================================
// AUTH CHECKS
// ========================================

/**
 * Check if user is currently signed in
 * @returns {boolean}
 */
function isSignedIn() {
    return currentUser !== null || FirebaseApp.isAuthenticated();
}

/**
 * Get current user
 * @returns {firebase.User|null}
 */
function getCurrentUser() {
    return currentUser || FirebaseApp.getCurrentUser();
}

/**
 * Get current user's UID
 * @returns {string|null}
 */
function getCurrentUserId() {
    const user = getCurrentUser();
    return user ? user.uid : null;
}

/**
 * Get saved user info from localStorage (for offline access)
 * @returns {Object|null}
 */
function getSavedUserInfo() {
    return Utils.loadFromStorage(Utils.STORAGE_KEYS.USER);
}

// ========================================
// UI HELPERS
// ========================================

/**
 * Update UI with user info
 * @param {firebase.User|Object} user - User object
 */
function updateUserUI(user) {
    if (!user) return;

    // Update user name displays
    const nameElements = document.querySelectorAll('.user-name, #userName');
    nameElements.forEach(el => {
        el.textContent = user.displayName || user.email || 'User';
    });

    // Update user avatar
    const avatarElements = document.querySelectorAll('.user-avatar, #userAvatar');
    avatarElements.forEach(el => {
        if (user.photoURL) {
            el.src = user.photoURL;
            el.alt = user.displayName || 'User';
        }
    });

    // Update user email displays
    const emailElements = document.querySelectorAll('.user-email, #userEmail');
    emailElements.forEach(el => {
        el.textContent = user.email || '';
    });
}

/**
 * Setup logout button handler
 * @param {string} selector - Button selector (default: #logoutBtn)
 */
function setupLogoutButton(selector = '#logoutBtn') {
    const btn = document.querySelector(selector);
    if (btn) {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut();
        });
    }
}

// ========================================
// LOGIN PAGE SPECIFIC
// ========================================

/**
 * Initialize login page
 * Called from index.html
 */
function initLoginPage() {
    console.log('Initializing login page...');

    // Setup Google sign-in button
    const googleBtn = document.querySelector('#googleSignInBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const user = await signIn();
            if (user) {
                // Redirect to device page
                Utils.navigateTo('device.html');
            }
        });
    }

    // Check if already signed in
    initAuthListener(
        // On signed in - redirect to device page
        (user) => {
            Utils.navigateTo('device.html');
        },
        // On signed out - stay on login page
        () => {
            Utils.hideLoading();
        }
    );
}

// ========================================
// PROTECTED PAGE INITIALIZATION
// ========================================

/**
 * Initialize auth for protected pages
 * Redirects to login if not authenticated
 * @param {Function} onReady - Called when auth is ready and user is signed in
 */
function initProtectedPage(onReady) {
    initAuthListener(
        // On signed in
        (user) => {
            updateUserUI(user);
            setupLogoutButton();

            if (onReady) {
                onReady(user);
            }
        },
        // On signed out - redirect to login
        () => {
            Utils.navigateTo('index.html');
        }
    );
}

// ========================================
// CLEANUP
// ========================================

/**
 * Clean up on page unload
 */
window.addEventListener('beforeunload', () => {
    cleanupAuthListener();
});

// ========================================
// EXPORT
// ========================================

window.Auth = {
    // User management
    saveUserProfile,
    getUserLinkedDevices,
    linkDeviceToUser,
    unlinkDeviceFromUser,

    // Sign in/out
    signIn,
    signOut,

    // State
    initAuthListener,
    cleanupAuthListener,
    isSignedIn,
    getCurrentUser,
    getCurrentUserId,
    getSavedUserInfo,

    // UI
    updateUserUI,
    setupLogoutButton,

    // Page initialization
    initLoginPage,
    initProtectedPage
};

console.log('Auth module loaded');
