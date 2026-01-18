# Frog Pump - Database Structure & Protocol

This document outlines the Firebase Realtime Database structure implemented in the Web App (`js/dashboard.js`, `js/device.js`).

## 🌳 Database Tree Overview

```json
devices/
└── {DEVICE_ID}/
    ├── identity/           (Device Identity)
    ├── connection/         (Connection Status)
    ├── tubeConfig/         (Calibration & Tube Settings)
    ├── maintenance/        (Tube Life & Maintenance)
    ├── liveStatus/         (Main Control & Status Loop)
    ├── rpmDispense/        (Parameters for Timed/RPM Mode)
    └── volumeDispense/     (Parameters for Volume Mode)
```

---

## 📊 Read/Write Access Table

| Node / Path | Web App Action | Board Action | Description |
|------------|----------------|--------------|-------------|
| **`identity/`** | **READ** | **WRITE** | Static info (MAC, Firmware) written by Board on boot. |
| **`connection/`** | **READ** | **WRITE** | Connection state (Heartbeat). |
| **`tubeConfig/`** | **READ** | **WRITE** | Calibration settings (set via device menu or calibration process). |
| **`maintenance/`** | **READ + WRITE** | **READ** | Web App tracks runtime and records tube changes. |
| **`liveStatus/`** | **READ + WRITE** | **READ + WRITE** | Web App commands start/stop. Board confirms with `acknowledged`. |
| **`rpmDispense/`** | **WRITE** | **READ** | Parameters for Timed Dispense mode. |
| **`volumeDispense/`** | **WRITE** | **READ** | Parameters for Volume Dispense mode. |

---

## 📝 Detailed Schema & Parameters

### 1. `identity/`
*Information identifying the hardware.*
*   `mac` (string): e.g., "30:C6:F7:41:2D:E0"
*   `firmware` (string): e.g., "v1.0.3"

### 2. `connection/`
*Real-time connectivity status.*
*   `online` (boolean): `true` if connected, `false` otherwise.
*   `ip` (string): Local IP address, e.g., "192.168.1.10".
*   `lastSeen` (timestamp): Time of last heartbeat.

### 3. `tubeConfig/`
*Calibration data. Currently read-only for Web App (display only).*
*   `tubeName` (string): Name of the installed tube (e.g., "2mm Silicone").
*   `mlPerRev` (number): Calibration factor (mL per Revolution).
*   `calibrationType` (string): "basic" or "advanced".
*   `lastCalibrated` (timestamp/string).
*   `antiDrip` (boolean).

### 4. `maintenance/`
*Maintenance tracking.*
*   `lastTubeChange` (timestamp): Written by Web App when user confirms tube change.
*   `tubeRuntimeSeconds` (number): Runtime since last tube change. Incremented by Web App while running.
*   `totalRuntimeSeconds` (number): Total lifetime runtime. Incremented by Web App while running.
*   `preFlushEnabled` (boolean): (Optional) Flag for pre-flush feature.

### 5. `liveStatus/`
*The primary control node. Changes here trigger actions on the board.*

*   **`activeMode`** (string): Defines the current operation state.
    *   `"NONE"`: Pump is stopped/idle.
    *   `"STATUS"`: Manual Run (Start button on dashboard).
    *   `"RPM"`: Timed Dispense running.
    *   `"VOLUME"`: Volume Dispense running.
    *   `"PREFLUSH"`: Pre-flush sequence running.

*   **`inputMode`** (string): `"RPM"` or `"FLOW"` (Used mainly in STATUS mode to tell board how speed was calculated).
*   **`currentRPM`** (number): The target/current RPM speed (1-400).
*   **`currentFlowRate`** (number): The calculated flow rate in mL/min (sent only if calibrated, otherwise null/0).
*   **`direction`** (string): `"CW"` (Clockwise) or `"CCW"` (Counter-Clockwise).
*   **`acknowledged`** (boolean): 
    *   Web App sets to `false` when sending a new command.
    *   Board sets to `true` when it receives and processes the command.
*   `lastIssuedBy` (string): User ID of the operator.
*   `lastUpdated` (ISO String): Timestamp of the last command.

### 6. `rpmDispense/`
*Parameters read by the board when `activeMode` becomes `"RPM"`.*
*   `rpm` (number): Speed.
*   `onTime` (number): Duration to run (in ms).
*   `offTime` (number): Pause duration (in ms).
*   `direction` (string).

### 7. `volumeDispense/`
*Parameters read by the board when `activeMode` becomes `"VOLUME"`.*
*   `targetVolume` (number): Volume to dispense in mL.
*   `offTime` (number): Pause duration (in ms).
*   `direction` (string).

---

## 🚀 Workflow Examples

### Start Manual Run (Status Page)
1.  **Web App:** Writes to `liveStatus`:
    ```json
    {
      "activeMode": "STATUS",
      "inputMode": "RPM",
      "currentRPM": 150,
      "direction": "CW",
      "acknowledged": false
    }
    ```
2.  **Board:** Detects change, starts motor at 150 RPM, sets `acknowledged` to `true`.

### Stop Pump
1.  **Web App:** Writes to `liveStatus`:
    ```json
    { "activeMode": "NONE", "acknowledged": false }
    ```
2.  **Board:** Detects change, stops motor.

### Start Volume Dispense
1.  **Web App:** write params to `volumeDispense`:
    ```json
    { "targetVolume": 100, "offTime": 2000, "direction": "CW" }
    ```
2.  **Web App:** Then updates `liveStatus`:
    ```json
    { "activeMode": "VOLUME", "acknowledged": false }
    ```
3.  **Board:** Reads `volumeDispense` params, calculates required turns based on calibration, starts motor.
