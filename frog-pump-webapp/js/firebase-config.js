/**
 * Frog Pump WebApp - Firebase Configuration
 * Initializes Firebase services: Auth and Realtime Database
 */

// Firebase configuration object
const firebaseConfig = {
    apiKey: "AIzaSyBt3RJnGPb_41z7dbeuFyO5b_Fq4rpgaAs",
    authDomain: "cinokor-4414b.firebaseapp.com",
    databaseURL: "https://cinokor-4414b-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "cinokor-4414b",
    storageBucket: "cinokor-4414b.firebasestorage.app",
    messagingSenderId: "171316395457",
    appId: "1:171316395457:web:9eb58e49e36c2ecd9c4340"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebase.auth();
const database = firebase.database();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Connection state monitoring
let isFirebaseConnected = false;
const connectionRef = database.ref('.info/connected');

connectionRef.on('value', (snapshot) => {
    isFirebaseConnected = snapshot.val() === true;

    // Dispatch custom event for connection state changes
    window.dispatchEvent(new CustomEvent('firebase-connection-change', {
        detail: { connected: isFirebaseConnected }
    }));

    console.log('Firebase connection status:', isFirebaseConnected ? 'Connected' : 'Disconnected');
});

/**
 * Check if Firebase is connected
 * @returns {boolean}
 */
function isConnected() {
    return isFirebaseConnected;
}

/**
 * Get current authenticated user
 * @returns {firebase.User|null}
 */
function getCurrentUser() {
    return auth.currentUser;
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
function isAuthenticated() {
    return auth.currentUser !== null;
}

/**
 * Sign in with Google popup
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function signInWithGoogle() {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        return result;
    } catch (error) {
        console.error('Google sign-in error:', error);
        throw error;
    }
}

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
async function signOut() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error('Sign out error:', error);
        throw error;
    }
}

/**
 * Listen for auth state changes
 * @param {Function} callback - Called with user object or null
 * @returns {Function} Unsubscribe function
 */
function onAuthStateChange(callback) {
    return auth.onAuthStateChanged(callback);
}

/**
 * Get database reference
 * @param {string} path - Database path
 * @returns {firebase.database.Reference}
 */
function getRef(path) {
    return database.ref(path);
}

/**
 * Get device reference
 * @param {string} deviceId - Device ID
 * @returns {firebase.database.Reference}
 */
function getDeviceRef(deviceId) {
    return database.ref(`devices/${deviceId}`);
}

/**
 * Get user reference
 * @param {string} uid - User ID
 * @returns {firebase.database.Reference}
 */
function getUserRef(uid) {
    return database.ref(`users/${uid}`);
}

// Export for use in other modules
window.FirebaseApp = {
    auth,
    database,
    googleProvider,
    isConnected,
    getCurrentUser,
    isAuthenticated,
    signInWithGoogle,
    signOut,
    onAuthStateChange,
    getRef,
    getDeviceRef,
    getUserRef
};

console.log('Firebase initialized successfully');
