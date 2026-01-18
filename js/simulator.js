/**
 * Frog Pump Device Simulator
 * Emulates the physical board firmware for testing purposes.
 * Device ID: FROG-TEST38
 */

const TEST_DEVICE_ID = 'FROG-AA00BB';

const Simulator = {
    heartbeatInterval: null,
    deviceRef: null,
    isOnline: true,

    async init() {
        console.log(`🚀 Starting Simulator for ${TEST_DEVICE_ID}...`);

        this.deviceRef = FirebaseApp.getDeviceRef(TEST_DEVICE_ID);

        // 1. Initialize Device Data (if missing or always to reset)
        await this.initializeData();

        // 2. Start Heartbeat Loop (Keep Online)
        this.startHeartbeat();

        // 3. Listen for Commands (Act like the board)
        this.listenForCommands();

        // 4. Update UI
        this.updateUiStatus();
        document.getElementById('deviceId').textContent = TEST_DEVICE_ID;

        // Bind UI inputs to actions
        this.bindUiActions();

        Utils.showSuccess('Simulator is Online!');
    },

    async initializeData() {
        console.log('📦 Initializing Database Structure...');

        // Only set if not exists, or update vital parts to ensure consistency
        const initialData = {
            identity: {
                mac: "AA:BB:CC:DD:EE:FF",
                firmware: "v-SIMULATOR"
            },
            // Default config
            tubeConfig: {
                tubeName: "2mm",
                mlPerRev: 1.5,
                calibrationType: "basic",
                lastCalibrated: Date.now(),
                antiDrip: true
            },
            // Ensure connection node exists
            connection: {
                online: true,
                ip: "127.0.0.1 (Sim)",
                lastSeen: Date.now()
            },
            // Reset status
            liveStatus: {
                activeMode: "NONE",
                inputMode: "RPM",
                currentRPM: 0,
                direction: "CW",
                acknowledged: true,
                lastIssuedBy: "simulator",
                lastUpdated: new Date().toISOString()
            }
        };

        // Use set() instead of update() to completely reset liveStatus
        await this.deviceRef.set(initialData);

        // Load initial values into inputs
        document.getElementById('simTubeName').value = "2mm";
        document.getElementById('simMlPerRev').value = 1.5;
        document.getElementById('simAntiDrip').checked = true;
    },

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        this.isOnline = true;
        console.log('💓 Heartbeat started...');

        const sendHeartbeat = () => {
            if (!this.isOnline) return;

            const now = Date.now();
            this.deviceRef.child('connection').update({
                online: true,
                ip: "127.0.0.1 (Sim)",
                lastSeen: now
            });

            document.getElementById('lastHeartbeat').textContent = new Date(now).toLocaleTimeString();
        };

        sendHeartbeat();
        this.heartbeatInterval = setInterval(sendHeartbeat, 5000); // 5s interval
        this.updateUiStatus();
    },

    stopHeartbeat() {
        this.isOnline = false;
        console.log('💔 Heartbeat stopped (Simulating Offline)...');
        // Optionally write online: false immediately
        this.deviceRef.child('connection').update({ online: false });
        this.updateUiStatus();
    },

    toggleConnection() {
        if (this.isOnline) {
            this.stopHeartbeat();
        } else {
            this.startHeartbeat();
        }
    },

    listenForCommands() {
        console.log('👂 Listening for commands...');

        this.deviceRef.child('liveStatus').on('value', (snapshot) => {
            const status = snapshot.val();
            if (!status) return;

            // Update UI
            document.getElementById('activeMode').textContent = status.activeMode;
            document.getElementById('rpm').textContent = status.currentRPM;

            const ackStatus = status.acknowledged ? 'Matched (True)' : 'Pending (False)';
            document.getElementById('ackStatus').textContent = ackStatus;
            document.getElementById('ackStatus').style.color = status.acknowledged ? '#00ff88' : '#ffaa00';

            // Logic: If acknowledged is FALSE, we must process and set to TRUE
            if (status.acknowledged === false) {
                console.log(`⚡ Command Received: ${status.activeMode}`);

                // Simulate processing delay (e.g., motor spin up)
                setTimeout(() => {
                    this.deviceRef.child('liveStatus').update({
                        acknowledged: true
                    });
                    console.log('✅ Command Acknowledged');
                }, 800);
            }
        });
    },

    // ==========================================
    // Manual Controls (Simulating Physical Menu)
    // ==========================================

    updateCalibration() {
        const tubeName = document.getElementById('simTubeName').value;
        const mlPerRev = parseFloat(document.getElementById('simMlPerRev').value);
        const antiDrip = document.getElementById('simAntiDrip').checked;

        this.deviceRef.child('tubeConfig').update({
            tubeName: tubeName,
            mlPerRev: mlPerRev,
            antiDrip: antiDrip,
            lastCalibrated: Date.now()
        }).then(() => {
            Utils.showSuccess('Tube Config Updated!');
        });
    },

    updateUiStatus() {
        const statusEl = document.getElementById('status');
        const btnEl = document.getElementById('toggleConnBtn');

        if (this.isOnline) {
            statusEl.textContent = 'ONLINE';
            statusEl.style.color = '#00ff88';
            btnEl.textContent = '🔌 Disconnect (Go Offline)';
            btnEl.classList.remove('btn-offline');
        } else {
            statusEl.textContent = 'OFFLINE';
            statusEl.style.color = '#ff4444';
            btnEl.textContent = '🔌 Connect (Go Online)';
            btnEl.classList.add('btn-offline');
        }
    },

    bindUiActions() {
        document.getElementById('toggleConnBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('updateConfigBtn').addEventListener('click', () => this.updateCalibration());
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Simulate board power-up sequence
    console.log('🔌 Powering up simulator...');

    // Direct authentication (Board-style)
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log('🔑 Authenticated as device:', user.uid);
            Simulator.init();
        } else {
            console.log('🔒 Attempting anonymous device login...');
            firebase.auth().signInAnonymously()
                .catch((error) => {
                    console.error('Login Failed:', error);
                    document.getElementById('status').textContent = 'Auth Error: ' + error.message;
                    Utils.showError('Could not authenticate device. Enable Anonymous Auth in Firebase Console.');
                });
        }
    });
});
