/**
 * Database Migration Utility
 * Migrates old Frog Pump DB schema to the new structure
 */

window.Migration = {
    /**
     * Check and run migration if needed
     * @param {string} deviceId 
     */
    async checkAndMigrate(deviceId) {
        if (!deviceId) return;

        try {
            const ref = FirebaseApp.getDeviceRef(deviceId);
            const snapshot = await ref.once('value');
            const data = snapshot.val();

            if (!data) return;

            // Check if legacy 'settings' node exists - indicates old schema
            if (data.settings && !data.tubeConfig) {
                console.log('⚠️ Old database schema detected. Starting migration for', deviceId);
                await this.performMigration(ref, data);
            } else {
                console.log('✅ Database schema is up to date.');
            }
        } catch (error) {
            console.error('Migration check failed:', error);
        }
    },

    /**
     * Execute the migration transformation
     * @param {Object} ref - Firebase reference
     * @param {Object} data - Current data snapshot
     */
    async performMigration(ref, data) {
        const updates = {};
        const now = new Date().toISOString();

        // 1. Move Settings -> tubeConfig
        if (data.settings) {
            updates['tubeConfig'] = {
                tubeName: data.settings.tubeName || '',
                mlPerRev: data.settings.mlPerRev || 0,
                calibrationType: data.settings.calibrationType || 'none',
                lastCalibrated: data.settings.lastCalibrated || 0,
                antiDrip: data.settings.antiDrip || false
            };
            updates['settings'] = null; // Delete old
        }

        // 2. Move Info -> identity
        if (data.info) {
            updates['identity'] = {
                mac: data.info.mac || 'Unknown',
                firmware: data.info.firmware || 'v0.0.0'
            };
            // 'info' deleted below
        }

        // 3. Extract Status/Info -> connection
        updates['connection'] = {
            ip: data.info?.ip || '0.0.0.0',
            lastSeen: data.info?.lastSeen || now,
            online: data.status?.online || false
        };
        updates['info'] = null; // Delete old

        // 4. Move Maintenance -> maintenance (structure update)
        if (data.maintenance) {
            updates['maintenance'] = {
                lastTubeChange: data.maintenance.lastTubeChange || 0,
                tubeRuntimeSeconds: data.maintenance.runtimeSeconds || 0,
                totalRuntimeSeconds: data.maintenance.runtimeSeconds || 0
            };
        }

        // 5. Move Status/Control -> liveStatus
        const isActive = data.status?.pumpRunning === true;
        const currentRPM = data.status?.currentRPM || 0;
        const direction = (data.control?.direction === 'CW' || data.status?.direction === true) ? 'CW' : 'CCW';

        updates['liveStatus'] = {
            activeMode: isActive ? 'STATUS' : 'NONE',
            inputMode: 'RPM',
            currentRPM: currentRPM,
            currentFlowRate: 0, // Reset
            direction: direction,
            acknowledged: true,
            lastIssuedBy: 'migration',
            lastUpdated: now
        };
        updates['status'] = null; // Delete old
        updates['control'] = null; // Delete old

        // 6. Init missing nodes
        if (!data.rpmDispense) {
            updates['rpmDispense'] = {
                rpm: 100,
                onTime: 5000,
                offTime: 0,
                direction: 'CW'
            };
        }
        if (!data.volumeDispense) {
            updates['volumeDispense'] = {
                targetVolume: 100,
                offTime: 0,
                direction: 'CW'
            };
        }

        // Apply all updates atomically
        await ref.update(updates);

        console.log('🎉 Migration completed successfully!');
        Utils.showSuccess('Database updated to new version');

        // Reload to ensure fresh state
        setTimeout(() => location.reload(), 1500);
    }
};
