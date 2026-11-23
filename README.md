# SinoLab – Frog Pump Web App

PWA for remote control of the Frog Pump (ESP32 peristaltic pump) over
Firebase Realtime Database. Plain HTML/JS, no build step.

- `index.html` – Google sign-in
- `device.html` – link / select a device (`FROG-XXXXXX`)
- `dashboard.html` – live status, RPM/flow control, RPM and volume dispense, maintenance
- `simulator.html` – simulated device for testing without hardware
- `DATABASE_STRUCTURE.md` – data contract with the firmware, security rules, pending firmware changes

## Firebase Rules
`database.rules.json` (configured in `firebase.json`).

Test against the local emulator (needs Java):
```bash
cd tests/rules && npm install && npm test
```

Deploy (after testing, from a machine logged in with `firebase login`):
```bash
firebase deploy --only database --project cinokor-4414b
```

## Unit tests
```bash
node --test tests/unit/*.test.mjs
```

## Deploying the app
After changing any JS/CSS, bump `CACHE_VERSION` in `sw.js`, otherwise
installed PWAs keep serving the old files.
