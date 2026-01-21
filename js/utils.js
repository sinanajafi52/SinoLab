/**
 * Frog Pump WebApp - Utility Functions
 * Helper functions for common operations
 */

// ========================================
// CONSTANTS
// ========================================

// Device ID validation regex
const DEVICE_ID_REGEX = /^FROG-[A-F0-9]{6}$/;

// LocalStorage keys
const STORAGE_KEYS = {
    DEVICE_ID: 'frogpump_deviceId',
    LAST_STATUS: 'frogpump_lastStatus',
    USER: 'frogpump_user'
};

// Error messages
const ERRORS = {
    INVALID_DEVICE_ID: 'Invalid Device ID format. Example: FROG-A1B2C3',
    DEVICE_NOT_FOUND: 'Device not found. Please check the ID.',
    CALIBRATION_REQUIRED: 'Calibration required for volume-based dispense.',
    CONNECTION_FAILED: 'Connection failed. Check your internet.',
    PERMISSION_DENIED: 'Permission denied. Please login again.',
    AUTH_FAILED: 'Authentication failed. Please try again.',
    NETWORK_ERROR: 'Network error. Please check your connection.'
};

// ========================================
// VALIDATION
// ========================================

/**
 * Validate device ID format
 * @param {string} deviceId - Device ID to validate
 * @returns {boolean}
 */
function isValidDeviceId(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') {
        return false;
    }
    return DEVICE_ID_REGEX.test(deviceId.toUpperCase());
}

/**
 * Normalize device ID (uppercase)
 * @param {string} deviceId - Device ID to normalize
 * @returns {string}
 */
function normalizeDeviceId(deviceId) {
    return deviceId ? deviceId.toUpperCase().trim() : '';
}

// ========================================
// LOCAL STORAGE
// ========================================

/**
 * Save to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified)
 */
function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

/**
 * Load from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*}
 */
function loadFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return defaultValue;
    }
}

/**
 * Remove from localStorage
 * @param {string} key - Storage key
 */
function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error removing from localStorage:', error);
    }
}

/**
 * Get saved device ID
 * @returns {string|null}
 */
function getSavedDeviceId() {
    return loadFromStorage(STORAGE_KEYS.DEVICE_ID);
}

/**
 * Save device ID
 * @param {string} deviceId
 */
function saveDeviceId(deviceId) {
    saveToStorage(STORAGE_KEYS.DEVICE_ID, deviceId);
}

/**
 * Clear saved device ID
 */
function clearSavedDeviceId() {
    removeFromStorage(STORAGE_KEYS.DEVICE_ID);
}

/**
 * Save last status for offline viewing
 * @param {Object} status
 */
function saveLastStatus(status) {
    saveToStorage(STORAGE_KEYS.LAST_STATUS, {
        ...status,
        savedAt: Date.now()
    });
}

/**
 * Get last saved status
 * @returns {Object|null}
 */
function getLastStatus() {
    return loadFromStorage(STORAGE_KEYS.LAST_STATUS);
}

// ========================================
// DATE/TIME FORMATTING
// ========================================

/**
 * Format timestamp to relative time (e.g., "2 minutes ago")
 * @param {number|string} timestamp - Unix timestamp (ms) or date string
 * @returns {string}
 */
function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Never';

    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Format timestamp to full date time
 * @param {number|string} timestamp
 * @returns {string}
 */
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';

    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);

    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format duration in seconds to human readable
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ========================================
// NUMBER FORMATTING
// ========================================

/**
 * Format volume (mL to L if needed)
 * @param {number} ml - Volume in milliliters
 * @param {number} decimals - Decimal places
 * @returns {string}
 */
function formatVolume(ml, decimals = 3) {
    if (ml === undefined || ml === null) return 'N/A';

    if (ml >= 1000) {
        return `${(ml / 1000).toFixed(decimals)} L`;
    }
    return `${ml.toFixed(decimals > 1 ? 1 : decimals)} mL`;
}

/**
 * Format flow rate
 * @param {number} mlPerMin - Flow rate in mL/min
 * @returns {string}
 */
function formatFlowRate(mlPerMin) {
    if (mlPerMin === undefined || mlPerMin === null) return 'N/A';
    return `${mlPerMin.toFixed(1)} mL/min`;
}

/**
 * Calculate estimated time for volume dispense
 * @param {number} volumeMl - Target volume in mL
 * @param {number} mlPerRev - mL per revolution
 * @param {number} rpm - Rotations per minute
 * @returns {number} Time in seconds
 */
function calculateDispenseTime(volumeMl, mlPerRev, rpm) {
    if (!mlPerRev || !rpm || mlPerRev <= 0 || rpm <= 0) {
        return 0;
    }
    const revolutions = volumeMl / mlPerRev;
    const minutes = revolutions / rpm;
    return minutes * 60;
}

// ========================================
// UI HELPERS
// ========================================

/**
 * Show element
 * @param {HTMLElement|string} element - Element or selector
 */
function showElement(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) el.classList.remove('hidden');
}

/**
 * Hide element
 * @param {HTMLElement|string} element - Element or selector
 */
function hideElement(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) el.classList.add('hidden');
}

/**
 * Toggle element visibility
 * @param {HTMLElement|string} element - Element or selector
 * @param {boolean} show - Whether to show or hide
 */
function toggleElement(element, show) {
    if (show) {
        showElement(element);
    } else {
        hideElement(element);
    }
}

/**
 * Set element text content safely
 * @param {string} selector - CSS selector
 * @param {string} text - Text content
 */
function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
}

/**
 * Set element HTML content safely
 * @param {string} selector - CSS selector
 * @param {string} html - HTML content
 */
function setHtml(selector, html) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
}

/**
 * Add class to element
 * @param {string} selector - CSS selector
 * @param {string} className - Class name to add
 */
function addClass(selector, className) {
    const el = document.querySelector(selector);
    if (el) el.classList.add(className);
}

/**
 * Remove class from element
 * @param {string} selector - CSS selector
 * @param {string} className - Class name to remove
 */
function removeClass(selector, className) {
    const el = document.querySelector(selector);
    if (el) el.classList.remove(className);
}

/**
 * Toggle class on element
 * @param {string} selector - CSS selector
 * @param {string} className - Class name to toggle
 * @param {boolean} force - Force add or remove
 */
function toggleClass(selector, className, force) {
    const el = document.querySelector(selector);
    if (el) el.classList.toggle(className, force);
}

// ========================================
// TOAST NOTIFICATIONS
// ========================================

let toastContainer = null;

/**
 * Initialize toast container
 */
function initToasts() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (success, error, warning, info)
 * @param {number} duration - Duration in ms (default 4000)
 */
function showToast(message, type = 'info', duration = 4000) {
    initToasts();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close">×</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });

    toastContainer.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
        toast.style.animation = 'slide-in 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show success toast
 * @param {string} message
 */
function showSuccess(message) {
    showToast(message, 'success');
}

/**
 * Show error toast
 * @param {string} message
 */
function showError(message) {
    showToast(message, 'error', 5000);
}

/**
 * Show warning toast
 * @param {string} message
 */
function showWarning(message) {
    showToast(message, 'warning');
}

/**
 * Show a blocking error popup (centered modal)
 * Use for important errors that need user attention (e.g., access denied)
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @param {Function} onClose - Callback when closed
 */
function showBlockingError(title, message, onClose = null) {
    // Remove existing if any
    const existing = document.querySelector('.blocking-error-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'blocking-error-overlay';
    overlay.innerHTML = `
        <div class="blocking-error-content">
            <div class="blocking-error-icon">⛔</div>
            <h3 class="blocking-error-title">${title}</h3>
            <p class="blocking-error-message">${message}</p>
            <button class="blocking-error-btn">OK</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.blocking-error-btn');
    closeBtn.addEventListener('click', () => {
        overlay.remove();
        if (onClose) onClose();
    });

    // Also close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            if (onClose) onClose();
        }
    });
}

/**
 * Show volume adjustment popup for Volume Dispense
 * @param {number} requestedVolume - Volume user requested
 * @param {number} actualVolume - Volume that will actually be dispensed
 * @param {number} runTime - Time in seconds
 * @param {Function} onConfirm - Callback when user confirms
 * @param {Function} onCancel - Callback when user cancels
 */
function showVolumeAdjustment(requestedVolume, actualVolume, runTime, onConfirm, onCancel = null) {
    // Remove existing if any
    const existing = document.querySelector('.volume-adjust-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'volume-adjust-overlay';
    overlay.innerHTML = `
        <div class="volume-adjust-content">
            <div class="volume-adjust-icon">⚠️</div>
            <h3 class="volume-adjust-title">Volume Adjustment</h3>
            <div class="volume-adjust-details">
                <p>Your requested: <strong>${requestedVolume.toFixed(1)} mL</strong></p>
                <p>Device will dispense: <strong>${actualVolume.toFixed(2)} mL</strong></p>
                <p class="volume-adjust-time">Run time: ${runTime.toFixed(1)} sec</p>
            </div>
            <div class="volume-adjust-buttons">
                <button class="volume-adjust-cancel">Cancel</button>
                <button class="volume-adjust-confirm">OK, Use ${actualVolume.toFixed(2)} mL</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('.volume-adjust-cancel');
    const confirmBtn = overlay.querySelector('.volume-adjust-confirm');

    cancelBtn.addEventListener('click', () => {
        overlay.remove();
        if (onCancel) onCancel();
    });

    confirmBtn.addEventListener('click', () => {
        overlay.remove();
        if (onConfirm) onConfirm(actualVolume);
    });
}

// ========================================
// LOADING STATE
// ========================================

let loadingOverlay = null;

/**
 * Show loading overlay
 * @param {string} message - Loading message
 */
function showLoading(message = 'Loading...') {
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner lg"></div>
            <div class="loading-text"></div>
        `;
        document.body.appendChild(loadingOverlay);
    }

    loadingOverlay.querySelector('.loading-text').textContent = message;
    loadingOverlay.classList.remove('hidden');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

// ========================================
// DEBOUNCE & THROTTLE
// ========================================

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function}
 */
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ========================================
// PAGE NAVIGATION
// ========================================

/**
 * Navigate to another page
 * @param {string} page - Page URL
 */
function navigateTo(page) {
    window.location.href = page;
}

/**
 * Redirect to login if not authenticated
 */
function requireAuth() {
    if (!FirebaseApp.isAuthenticated()) {
        navigateTo('index.html');
        return false;
    }
    return true;
}

/**
 * Redirect to device page if no device selected
 */
function requireDevice() {
    const deviceId = getSavedDeviceId();
    if (!deviceId) {
        navigateTo('device.html');
        return false;
    }
    return true;
}

// ========================================
// EXPORT
// ========================================

window.Utils = {
    // Constants
    DEVICE_ID_REGEX,
    STORAGE_KEYS,
    ERRORS,

    // Validation
    isValidDeviceId,
    normalizeDeviceId,

    // Storage
    saveToStorage,
    loadFromStorage,
    removeFromStorage,
    getSavedDeviceId,
    saveDeviceId,
    clearSavedDeviceId,
    saveLastStatus,
    getLastStatus,

    // Formatting
    formatRelativeTime,
    formatDateTime,
    formatDuration,
    formatVolume,
    formatFlowRate,
    calculateDispenseTime,

    // UI Helpers
    showElement,
    hideElement,
    toggleElement,
    setText,
    setHtml,
    addClass,
    removeClass,
    toggleClass,

    // Toasts
    showToast,
    showSuccess,
    showError,
    showWarning,
    showBlockingError,
    showVolumeAdjustment,

    // Loading
    showLoading,
    hideLoading,

    // Utils
    debounce,
    throttle,

    // Navigation
    navigateTo,
    requireAuth,
    requireDevice
};

console.log('Utils module loaded');
