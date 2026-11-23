// Unit tests for js/utils.js helpers (no browser needed).
// Run: node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load the browser script into a sandbox with a minimal window/document
const source = readFileSync(new URL('../../js/utils.js', import.meta.url), 'utf8');
const sandbox = { console: { log() {}, error() {} }, document: {}, localStorage: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const Utils = sandbox.Utils;

const NOW = 1_800_000_000_000; // fixed "server time"

test('escapeHtml neutralises markup', () => {
  assert.equal(Utils.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(Utils.escapeHtml(`"a" & 'b'`), '&quot;a&quot; &amp; &#39;b&#39;');
  assert.equal(Utils.escapeHtml(null), '');
  assert.equal(Utils.escapeHtml(42), '42');
});

test('device is online only with a recent heartbeat', () => {
  assert.equal(Utils.isDeviceOnline({ online: true, lastSeen: NOW - 10_000 }, NOW), true);
  assert.equal(Utils.isDeviceOnline({ online: true, lastSeen: NOW - 89_000 }, NOW), true);
  // power cut: flag stays true but heartbeats stopped
  assert.equal(Utils.isDeviceOnline({ online: true, lastSeen: NOW - 5 * 60_000 }, NOW), false);
});

test('explicitly offline or missing data is offline', () => {
  assert.equal(Utils.isDeviceOnline({ online: false, lastSeen: NOW }, NOW), false);
  assert.equal(Utils.isDeviceOnline(null, NOW), false);
  assert.equal(Utils.isDeviceOnline({}, NOW), false);
});

test('lastSeen without wall-clock time (no NTP yet) falls back to the flag', () => {
  // firmware writes millis() uptime until NTP is synced
  assert.equal(Utils.isDeviceOnline({ online: true, lastSeen: 123456 }, NOW), true);
  assert.equal(Utils.isDeviceOnline({ online: true }, NOW), true);
});

test('volume dispense time matches the firmware (120 RPM)', () => {
  // 12 mL at 1.2 mL/rev = 10 rev; at 120 RPM = 5 s
  assert.equal(Utils.calculateDispenseTime(12, 1.2, 120), 5);
  assert.equal(Utils.calculateDispenseTime(12, 0, 120), 0);
});
