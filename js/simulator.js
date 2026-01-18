/**
 * Frog Pump Device Simulator
 * Emulates the physical board firmware for testing purposes.
 * Device ID: FROG-TEST38678
 */

const TEST_DEVICE_ID = 'FROG-TEST38678';

const Simulator = {
    async init() {
        console.log(`🚀 Starting Simulator for ${TEST_DEVICE_ID}...`);

        const deviceRef = FirebaseApp.getDeviceRef(TEST_DEVICE_ID);

        // 1. Initialize Device Data (if missing or always to reset)
        await this.initializeData(deviceRef);

        // 2. Start Heartbeat Loop (Keep Online)
        this.startHeartbeat(deviceRef);

        // 3. Listen for Commands (Act like the board)
        this.listenForCommands(deviceRef);

        // 4. Update UI
        document.getElementById('status').textContent = 'Running';
        document.getElementById('deviceId').textContent = TEST_DEVICE_ID;
        Utils.showSuccess('Simulator is Online!');
    },

    async initializeData(ref) {
        console.log('📦 Initializing Database Structure...');

        const initialData = {
            identity: {
                mac: "AA:BB:CC:DD:EE:FF",
                firmware: "v-SIMULATOR"
            },
            tubeConfig: {
                tubeName: "Simulator Tube 3mm",
                mlPerRev: 1.5, // Good calibration value
                calibrationType: "advanced",
                lastCalibrated: Date.now(),
                antiDrip: true
            },
            rpmDispense: {
                rpm: 100, onTime: 5000, offTime: 0, direction: "CW"
            },
            volumeDispense: {
                targetVolume: 100, offTime: 0, direction: "CW"
            },
            liveStatus: {
                activeMode: "NONE",
                inputMode: "RPM",
                currentRPM: 0,
                direction: "CW",
                acknowledged: true,
                lastIssuedBy: "simulator",
                lastUpdated: new Date().toISOString()
            },
            // Maintenance is managed by WebApp, but we ensure node exists
            maintenance: {
                lastTubeChange: Date.now(),
                tubeRuntimeSeconds: 0,
                totalRuntimeSeconds: 3600 // Start with 1 hour
            }
        };

        // We use update to avoid overwriting existing maintenance data if we want
        // But for a fresh test device, set is fine. Let's use update for safety.
        await ref.update(initialData);
    },

    startHeartbeat(ref) {
        console.log('💓 Heartbeat started...');

        const sendHeartbeat = () => {
            const now = Date.now();
            ref.child('connection').set({
                online: true,
                ip: "127.0.0.1 (Sim)",
                lastSeen: now
            });

            // Update UI
            document.getElementById('lastHeartbeat').textContent = new Date(now).toLocaleTimeString();
        };

        // Send immediately then every 5s
        sendHeartbeat();
        setInterval(sendHeartbeat, 5000);
    },

    listenForCommands(ref) {
        console.log('👂 Listening for commands...');

        ref.child('liveStatus').on('value', (snapshot) => {
            const status = snapshot.val();
            if (!status) return;

            // Update UI
            document.getElementById('activeMode').textContent = status.activeMode;
            document.getElementById('rpm').textContent = status.currentRPM;

            // Logic: If acknowledged is FALSE, we must process and set to TRUE
            if (status.acknowledged === false) {
                console.log(`⚡ Command Received: ${status.activeMode}`);

                // Simulate processing delay (e.g., motor spin up)
                setTimeout(() => {
                    ref.child('liveStatus').update({
                        acknowledged: true
                    });
                    console.log('✅ Command Acknowledged');
                }, 500);
            }
        });
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth (anonymous or existing)
    Auth.initAuth(() => {
        Simulator.init();
    });
});
