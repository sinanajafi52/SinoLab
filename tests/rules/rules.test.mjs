// Firebase Realtime Database rules tests.
// Run: cd tests/rules && npm install && npm test   (needs Java for the emulator)
//
// The payloads below mirror what the web app (js/*.js) and the ESP32
// firmware (IoTManager.cpp) actually write.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';

const DEV = 'FROG-A1B2C3';
const NOW = Date.now();
let env;

const rulesPath = fileURLToPath(new URL('../../database.rules.json', import.meta.url));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-frogpump',
    database: { rules: readFileSync(rulesPath, 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      users: {
        alice: { email: 'alice@example.com', linkedDevices: { [DEV]: { linkedAt: NOW, nickname: '' } } },
      },
      devices: {
        [DEV]: {
          identity: { mac: '30:C6:F7:41:2D:E0', firmware: 'v1.0.3' },
          connection: { online: true, ip: '192.168.1.5', lastSeen: NOW },
          tubeConfig: { tubeName: '2mm', mlPerRev: 1.2, antiDrip: true },
          liveStatus: { activeMode: 'NONE', acknowledged: true, direction: 'CW', currentRPM: 0 },
          maintenance: { tubeRuntimeSeconds: 100, totalRuntimeSeconds: 500, lastTubeChange: 0 },
        },
      },
    });
  });
});

// ── Clients ──────────────────────────────────────────────────────────
const google = (uid, email) =>
  env.authenticatedContext(uid, { email, firebase: { sign_in_provider: 'google.com' } }).database();
const alice = () => google('alice', 'alice@example.com');          // linked to DEV
const bob = () => google('bob', 'bob@example.com');                // not linked
const device = () =>
  env.authenticatedContext('anon-device', { firebase: { sign_in_provider: 'anonymous' } }).database();
const nobody = () => env.unauthenticatedContext().database();

const linkBob = () =>
  env.withSecurityRulesDisabled((ctx) =>
    ctx.database().ref(`users/bob/linkedDevices/${DEV}`).set({ linkedAt: NOW }));

const dev = (db) => db.ref(`devices/${DEV}`);

// ── Reading ──────────────────────────────────────────────────────────
test('unauthenticated clients cannot read anything', async () => {
  await assertFails(dev(nobody()).child('identity').once('value'));
  await assertFails(nobody().ref('devices').once('value'));
});

test('nobody can list all devices', async () => {
  await assertFails(alice().ref('devices').once('value'));
  await assertFails(device().ref('devices').once('value'));
});

test('any signed-in user can check a device exists (identity) before linking', async () => {
  await assertSucceeds(dev(bob()).child('identity').once('value'));
  await assertFails(dev(bob()).child('liveStatus').once('value'));
  await assertFails(dev(bob()).once('value'));
});

test('linked user can read the whole device', async () => {
  await assertSucceeds(dev(alice()).once('value'));
});

test('device can read what the firmware needs, but not the session', async () => {
  const d = device();
  for (const node of ['liveStatus/acknowledged', 'liveStatus/activeMode', 'rpmDispense', 'volumeDispense', 'maintenance/lastTubeChange']) {
    await assertSucceeds(dev(d).child(node).once('value'));
  }
  await assertFails(dev(d).child('session').once('value'));
  await assertFails(dev(d).once('value'));
});

// ── Users ────────────────────────────────────────────────────────────
test('users manage only their own profile and links', async () => {
  await assertSucceeds(bob().ref('users/bob').update({
    email: 'bob@example.com', displayName: 'Bob', photoURL: 'https://x/y.png', lastLogin: NOW, createdAt: NOW,
  }));
  await assertSucceeds(bob().ref(`users/bob/linkedDevices/${DEV}`).set({ linkedAt: NOW, nickname: 'Lab' }));
  await assertFails(bob().ref('users/alice/linkedDevices/FROG-000000').set({ linkedAt: NOW }));
  await assertFails(bob().ref('users/alice').once('value'));
  await assertFails(bob().ref('users/bob/linkedDevices/not-a-device').set({ linkedAt: NOW }));
  await assertFails(device().ref('users/anon-device').set({ email: 'x' }));
});

// ── Firmware writes ──────────────────────────────────────────────────
test('device publishes identity, heartbeat and calibration', async () => {
  const d = device();
  await assertSucceeds(dev(d).child('identity/mac').set('30:C6:F7:41:2D:E0'));
  await assertSucceeds(dev(d).child('identity/firmware').set('v1.0.3'));
  await assertSucceeds(dev(d).child('connection/online').set(true));
  await assertSucceeds(dev(d).child('connection/ip').set('192.168.1.7'));
  await assertSucceeds(dev(d).child('connection/lastSeen').set(NOW));
  await assertSucceeds(dev(d).child('tubeConfig/mlPerRev').set(1.25));
  await assertSucceeds(dev(d).child('tubeConfig/calibrationType').set('advanced'));
  await assertSucceeds(dev(d).child('tubeConfig/lastCalibrated').set(NOW));
  await assertSucceeds(dev(d).child('tubeConfig/tubeName').set('3mm'));
  await assertSucceeds(dev(d).child('tubeConfig/antiDrip').set(false));
  await assertSucceeds(dev(d).child('maintenance/tubeRuntimeSeconds').set(160));
  await assertSucceeds(dev(d).child('maintenance/totalRuntimeSeconds').set(560));
});

test('device can acknowledge and stop, but never start or change parameters', async () => {
  const d = device();
  await assertSucceeds(dev(d).child('liveStatus/acknowledged').set(true));
  await assertSucceeds(dev(d).child('liveStatus/activeMode').set('NONE'));
  await assertSucceeds(dev(d).child('liveStatus/pumpStartedAt').set(NOW));

  await assertFails(dev(d).child('liveStatus/activeMode').set('STATUS'));
  await assertFails(dev(d).child('liveStatus/acknowledged').set(false));
  await assertFails(dev(d).child('liveStatus/currentRPM').set(300));
  await assertFails(dev(d).child('rpmDispense').set({ rpm: 300, onTime: 1000, offTime: 0, direction: 'CW' }));
  await assertFails(dev(d).child('volumeDispense/targetVolume').set(500));
  await assertFails(dev(d).child('maintenance/lastTubeChange').set(NOW));
  await assertFails(dev(d).child('session').set({ activeUser: 'anon-device', lastActive: NOW }));
});

test('web users cannot impersonate the device', async () => {
  const a = alice();
  await assertFails(dev(a).child('tubeConfig/mlPerRev').set(3));
  await assertFails(dev(a).child('connection/online').set(false));
  await assertFails(dev(a).child('identity/firmware').set('hacked'));
  // maintenance/ runtime counters stay writable for linked users: the
  // "tube change" action resets tubeRuntimeSeconds to 0.
});

// ── Web app commands (payloads from js/dashboard.js and js/device.js) ─
test('linked user starts and stops the pump (STATUS)', async () => {
  const a = alice();
  await assertSucceeds(dev(a).child('liveStatus').update({
    activeMode: 'STATUS', inputMode: 'RPM', currentRPM: 120, currentFlowRate: 144,
    direction: 'CCW', pumpStartedAt: NOW, acknowledged: false, lastIssuedBy: 'alice', lastUpdated: NOW,
  }));
  await assertSucceeds(dev(a).child('liveStatus').update({
    activeMode: 'NONE', inputMode: null, currentRPM: 0, currentFlowRate: null, pumpStartedAt: null,
    acknowledged: false, lastIssuedBy: 'alice', lastUpdated: NOW,
  }));
});

test('linked user starts RPM and VOLUME dispense in one atomic update', async () => {
  const a = alice();
  await assertSucceeds(dev(a).update({
    rpmDispense: { rpm: 150, onTime: 300, offTime: 500, direction: 'CW' },
    'liveStatus/activeMode': 'RPM', 'liveStatus/inputMode': null, 'liveStatus/acknowledged': false,
    'liveStatus/lastIssuedBy': 'alice', 'liveStatus/lastUpdated': NOW,
  }));
  await assertSucceeds(dev(a).update({
    volumeDispense: { targetVolume: 12.5, offTime: 2000, direction: 'CCW', rpm: 120, onTime: 5000 },
    'liveStatus/activeMode': 'VOLUME', 'liveStatus/currentRPM': 120, 'liveStatus/inputMode': null,
    'liveStatus/acknowledged': false, 'liveStatus/lastIssuedBy': 'alice', 'liveStatus/lastUpdated': NOW,
  }));
});

test('commands are validated', async () => {
  const a = alice();
  await assertFails(dev(a).child('liveStatus/currentRPM').set(500));
  await assertFails(dev(a).child('liveStatus/direction').set('LEFT'));
  await assertFails(dev(a).child('liveStatus/activeMode').set('TURBO'));
  await assertFails(dev(a).child('liveStatus/unknownField').set(1));
  await assertFails(dev(a).child('volumeDispense/targetVolume').set(0));
  await assertFails(dev(a).child('rpmDispense/rpm').set('fast'));
  // RPM dispense: Off Time 0 is not allowed (firmware would run continuously)
  await assertFails(dev(a).child('rpmDispense').set({ rpm: 100, onTime: 1000, offTime: 0, direction: 'CW' }));
  // Volume dispense: Off Time 0 = single shot, allowed
  await assertSucceeds(dev(a).child('volumeDispense').set({ targetVolume: 5, offTime: 0, direction: 'CW' }));
});

test('unlinked users cannot control a device', async () => {
  const b = bob();
  await assertFails(dev(b).child('liveStatus').update({ activeMode: 'STATUS', currentRPM: 100, acknowledged: false }));
  await assertFails(dev(b).child('rpmDispense').set({ rpm: 100, onTime: 1000, offTime: 0, direction: 'CW' }));
  await assertFails(dev(b).child('maintenance').update({ lastTubeChange: NOW, tubeRuntimeSeconds: 0 }));
});

test('linked user records a tube change', async () => {
  await assertSucceeds(dev(alice()).child('maintenance').update({ lastTubeChange: NOW, tubeRuntimeSeconds: 0 }));
});

test('old-schema nodes cannot be written', async () => {
  await assertFails(dev(alice()).child('settings').set({ mlPerRev: 1 }));
  await assertFails(dev(device()).child('status/pumpRunning').set(true));
});

// ── Session lock (js/session.js) ─────────────────────────────────────
const sessionOf = (uid, email, lastActive) => ({
  activeUser: uid, userEmail: email, userName: email, lastActive, claimedAt: lastActive,
});

test('session: claim, heartbeat and release by the owner', async () => {
  const a = alice();
  await assertSucceeds(dev(a).child('session').set(sessionOf('alice', 'alice@example.com', NOW)));
  await assertSucceeds(dev(a).child('session/lastActive').set(NOW + 60000));
  await assertSucceeds(dev(a).child('session').remove());
});

test('session: a fresh session of another user blocks, a stale one does not', async () => {
  await linkBob();
  await env.withSecurityRulesDisabled((ctx) =>
    dev(ctx.database()).child('session').set(sessionOf('alice', 'alice@example.com', Date.now())));
  await assertFails(dev(bob()).child('session').set(sessionOf('bob', 'bob@example.com', Date.now())));
  await assertFails(dev(bob()).child('session').remove());

  await env.withSecurityRulesDisabled((ctx) =>
    dev(ctx.database()).child('session/lastActive').set(Date.now() - 6 * 60 * 1000));
  await assertSucceeds(dev(bob()).child('session').set(sessionOf('bob', 'bob@example.com', Date.now())));
});

test('session: cannot claim on behalf of someone else', async () => {
  await assertFails(dev(alice()).child('session').set(sessionOf('mallory', 'm@example.com', NOW)));
});
