import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { registry } from '../dist/socket/registry.js';

// Setup environment variables if not set
if (!process.env.FIREBASE_PROJECT_ID) {
  process.env.PORT = '3002';
  process.env.FIREBASE_PROJECT_ID = 'termix-2207d';
  process.env.CLIENT_ORIGIN = 'http://localhost:3000';
}

console.log('====================================================');
console.log('M2 CHALLENGER 1: BACKEND THROTTLING & TELEMETRY SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name}: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// PART 1: TELEMETRY CACHE THROTTLE BOUNDARY & INVARIANT ORACLE TESTS
// ---------------------------------------------------------------------------
console.log('--- Part 1: In-Memory Telemetry Cache & Throttle Boundary Oracles ---');

// Test 1.1: First heartbeat triggers persist, caches stats and lastSeen
{
  registry.clearAllDeviceTelemetry();
  const devId = 'dev-m2-first-hb';
  const stats = { cpuPercent: 12.5, memUsedMb: 1024, memTotalMb: 4096, uptimeSeconds: 300 };
  const nowIso = '2026-11-05T22:00:00.000Z';
  const nowMs = 1_000_000;
  const interval = 180_000;

  const isDue = registry.recordHeartbeat(devId, stats, nowIso, nowMs, interval);
  const cachedStats = registry.getDeviceStats(devId);
  const cachedLastSeen = registry.getDeviceLastSeen(devId);
  const telemetry = registry.getDeviceTelemetry(devId);

  report(
    'recordHeartbeat: first call returns true, caches stats, lastSeen, and records lastPersistedAt',
    isDue === true &&
    cachedStats?.cpuPercent === 12.5 &&
    cachedStats?.memUsedMb === 1024 &&
    cachedLastSeen === nowIso &&
    telemetry?.lastPersistedAt === nowMs
  );
}

// Test 1.2: Immediate consecutive calls (0ms, 1ms later) return false and preserve persist timestamp
{
  const devId = 'dev-m2-first-hb';
  const stats2 = { cpuPercent: 14.0, memUsedMb: 1050 };
  const iso2 = '2026-11-05T22:00:00.001Z';

  const isDue0 = registry.recordHeartbeat(devId, stats2, iso2, 1_000_000, 180_000);
  const isDue1 = registry.recordHeartbeat(devId, stats2, iso2, 1_000_001, 180_000);
  const telemetry = registry.getDeviceTelemetry(devId);

  report(
    'recordHeartbeat: immediate consecutive calls (0ms, 1ms) return false while updating stats',
    isDue0 === false &&
    isDue1 === false &&
    telemetry?.lastPersistedAt === 1_000_000 &&
    telemetry?.stats?.cpuPercent === 14.0
  );
}

// Test 1.3: Rigorous boundary checks: 15s, 60s, 179,999ms, 180,000ms, 180,001ms, 360,000ms
{
  const devId = 'dev-m2-boundary';
  registry.clearDeviceTelemetry(devId);
  const t0 = 10_000_000;
  const interval = 180_000;

  // First call at t0
  const r0 = registry.recordHeartbeat(devId, { cpu: 1 }, 't0', t0, interval);
  assert.equal(r0, true, 't0 must be true');

  // Sub-interval calls: 15s (15,000ms), 60s (60,000ms), 120s (120,000ms)
  const r15s = registry.recordHeartbeat(devId, { cpu: 2 }, 't15s', t0 + 15_000, interval);
  const r60s = registry.recordHeartbeat(devId, { cpu: 3 }, 't60s', t0 + 60_000, interval);
  const r120s = registry.recordHeartbeat(devId, { cpu: 4 }, 't120s', t0 + 120_000, interval);

  // Exact boundary: 179,999ms (1ms before 180s)
  const r179999 = registry.recordHeartbeat(devId, { cpu: 5 }, 't179999', t0 + 179_999, interval);

  // Exact boundary: 180,000ms (exactly 180s)
  const r180000 = registry.recordHeartbeat(devId, { cpu: 6 }, 't180000', t0 + 180_000, interval);

  // Immediately after boundary: 180,001ms (1ms after reset)
  const r180001 = registry.recordHeartbeat(devId, { cpu: 7 }, 't180001', t0 + 180_001, interval);

  // Next boundary: 359,999ms (1ms before 360s)
  const r359999 = registry.recordHeartbeat(devId, { cpu: 8 }, 't359999', t0 + 359_999, interval);

  // Next boundary: 360,000ms (exactly 360s)
  const r360000 = registry.recordHeartbeat(devId, { cpu: 9 }, 't360000', t0 + 360_000, interval);

  report(
    'recordHeartbeat: strict boundary oracle (179,999ms=false, 180,000ms=true, 180,001ms=false, 360,000ms=true)',
    r15s === false &&
    r60s === false &&
    r120s === false &&
    r179999 === false &&
    r180000 === true &&
    r180001 === false &&
    r359999 === false &&
    r360000 === true
  );
}

// Test 1.4: Configurable persist interval (e.g. 300,000ms / 5 minutes)
{
  const devId = 'dev-m2-custom-interval';
  registry.clearDeviceTelemetry(devId);
  const t0 = 20_000_000;
  const interval5Min = 300_000;

  const r0 = registry.recordHeartbeat(devId, { cpu: 1 }, 't0', t0, interval5Min);
  const r180s = registry.recordHeartbeat(devId, { cpu: 2 }, 't180s', t0 + 180_000, interval5Min);
  const r299999 = registry.recordHeartbeat(devId, { cpu: 3 }, 't299999', t0 + 299_999, interval5Min);
  const r300000 = registry.recordHeartbeat(devId, { cpu: 4 }, 't300000', t0 + 300_000, interval5Min);

  report(
    'recordHeartbeat: respects custom persist interval (e.g. 300,000ms / 5min)',
    r0 === true &&
    r180s === false &&
    r299999 === false &&
    r300000 === true
  );
}

// Test 1.5: Clock skew / backwards time jump recovery
{
  const devId = 'dev-m2-clock-skew';
  registry.clearDeviceTelemetry(devId);
  const t0 = 50_000_000;

  registry.recordHeartbeat(devId, { cpu: 1 }, 't0', t0, 180_000);

  // Simulate system clock stepping back by 1 hour (backward time jump)
  const tBackwards = t0 - 3_600_000;
  const rBackwards = registry.recordHeartbeat(devId, { cpu: 2 }, 'tBack', tBackwards, 180_000);
  const telemetry = registry.getDeviceTelemetry(devId);

  report(
    'recordHeartbeat: recovers from backwards time drift/clock skew and resets baseline',
    rBackwards === true &&
    telemetry?.lastPersistedAt === tBackwards &&
    telemetry?.stats?.cpu === 2
  );
}

// Test 1.6: Partial payload preserves previously cached stats
{
  const devId = 'dev-m2-partial-payload';
  registry.clearDeviceTelemetry(devId);

  registry.recordHeartbeat(devId, { cpuPercent: 55.5, memUsedMb: 4096 }, 'iso-1', 1000);
  // Send heartbeat with stats undefined
  registry.recordHeartbeat(devId, undefined, 'iso-2', 2000);

  const cachedStats = registry.getDeviceStats(devId);
  const cachedLastSeen = registry.getDeviceLastSeen(devId);

  report(
    'recordHeartbeat: undefined stats payload preserves previous stats while updating lastSeen',
    cachedStats?.cpuPercent === 55.5 &&
    cachedStats?.memUsedMb === 4096 &&
    cachedLastSeen === 'iso-2'
  );
}

// Test 1.7: Defensive copy invariant of getDeviceTelemetry
{
  const devId = 'dev-m2-defensive-copy';
  registry.clearDeviceTelemetry(devId);

  registry.recordHeartbeat(devId, { cpu: 10 }, 'iso-orig', 5000);
  const copy = registry.getDeviceTelemetry(devId);
  assert.ok(copy);

  // Mutate returned object
  copy.lastSeen = 'MUTATED';
  copy.lastPersistedAt = 999999999;

  const fresh = registry.getDeviceTelemetry(devId);
  report(
    'getDeviceTelemetry: returns defensive shallow copy protecting internal registry state',
    fresh?.lastSeen === 'iso-orig' &&
    fresh?.lastPersistedAt === 5000
  );
}

// Test 1.8: markLastSeenPersisted establishes persist baseline
{
  const devId = 'dev-m2-anchor-test';
  registry.clearDeviceTelemetry(devId);
  const baselineMs = 70_000_000;
  const baselineIso = '2026-11-05T22:30:00.000Z';

  // Device connects and persists baseline
  registry.markLastSeenPersisted(devId, baselineMs, baselineIso);

  // First 15s heartbeat arrives
  const r15s = registry.recordHeartbeat(devId, { cpu: 5 }, '2026-11-05T22:30:15.000Z', baselineMs + 15_000, 180_000);
  // Heartbeat at 179s arrives
  const r179s = registry.recordHeartbeat(devId, { cpu: 10 }, '2026-11-05T22:32:59.000Z', baselineMs + 179_000, 180_000);
  // Heartbeat at 180s arrives
  const r180s = registry.recordHeartbeat(devId, { cpu: 15 }, '2026-11-05T22:33:00.000Z', baselineMs + 180_000, 180_000);

  report(
    'markLastSeenPersisted: successfully anchors persist baseline and throttles first 15s heartbeat',
    r15s === false &&
    r179s === false &&
    r180s === true
  );
}

// Test 1.9: Null and boundary inputs
{
  const rEmpty = registry.recordHeartbeat('');
  const rNull = registry.recordHeartbeat(null);
  const rUndefined = registry.recordHeartbeat(undefined);
  const statsEmpty = registry.getDeviceStats('');
  const lastSeenNull = registry.getDeviceLastSeen(null);
  const telemUndefined = registry.getDeviceTelemetry(undefined);
  const clearEmpty = registry.clearDeviceTelemetry('');

  report(
    'Boundary and invalid deviceId inputs return safely without exceptions',
    rEmpty === false &&
    rNull === false &&
    rUndefined === false &&
    statsEmpty === undefined &&
    lastSeenNull === undefined &&
    telemUndefined === undefined &&
    clearEmpty === false
  );
}

// ---------------------------------------------------------------------------
// PART 2: CONCURRENCY & HIGH-FREQUENCY BURST STRESS TESTS
// ---------------------------------------------------------------------------
console.log('\n--- Part 2: Concurrency & High-Frequency Burst Stress Tests ---');

// Test 2.1: Single-device 10,000 rapid parallel heartbeats
{
  const devId = 'dev-m2-burst-single';
  registry.clearDeviceTelemetry(devId);
  const BURST_COUNT = 10000;
  const t0 = 80_000_000;
  const interval = 180_000;

  const results = [];
  const startPerf = Date.now();

  // Fire 10,000 synchronous/parallel invocations simulating high-frequency agent telemetry bursts
  for (let i = 0; i < BURST_COUNT; i++) {
    const isDue = registry.recordHeartbeat(
      devId,
      { cpuPercent: (i % 100) + 0.1, iter: i },
      `2026-11-05T22:00:00.${String(i).padStart(4, '0')}Z`,
      t0 + (i % 500), // All arrive within 500ms of t0 (< 180s)
      interval
    );
    results.push(isDue);
  }

  const duration = Date.now() - startPerf;
  const dueCount = results.filter(r => r === true).length;
  const throttledCount = results.filter(r => r === false).length;
  const finalTelemetry = registry.getDeviceTelemetry(devId);

  report(
    `High-frequency burst (10,000 heartbeats in ${duration}ms): exactly 1 persist trigger, 9,999 throttled`,
    dueCount === 1 &&
    throttledCount === BURST_COUNT - 1 &&
    finalTelemetry !== undefined &&
    finalTelemetry.lastPersistedAt === t0,
    `Persists: ${dueCount}, Throttled: ${throttledCount}`
  );
}

// Test 2.2: Multi-device concurrency: 100 devices × 100 parallel heartbeats (10,000 total)
{
  const DEVICE_COUNT = 100;
  const BURST_PER_DEV = 100;
  const t0 = 90_000_000;
  const interval = 180_000;

  for (let d = 0; d < DEVICE_COUNT; d++) {
    registry.clearDeviceTelemetry(`dev-multi-${d}`);
  }

  const allResults = [];
  const startMulti = Date.now();

  for (let i = 0; i < BURST_PER_DEV; i++) {
    for (let d = 0; d < DEVICE_COUNT; d++) {
      const devId = `dev-multi-${d}`;
      const isDue = registry.recordHeartbeat(
        devId,
        { cpu: d * 10 + i },
        `iso-${i}`,
        t0 + i,
        interval
      );
      allResults.push({ devId, isDue });
    }
  }

  const multiDuration = Date.now() - startMulti;
  let allDevicesExactOnePersist = true;

  for (let d = 0; d < DEVICE_COUNT; d++) {
    const devResults = allResults.filter(r => r.devId === `dev-multi-${d}`);
    const devDues = devResults.filter(r => r.isDue === true).length;
    if (devDues !== 1) {
      allDevicesExactOnePersist = false;
      break;
    }
  }

  const totalDues = allResults.filter(r => r.isDue === true).length;

  report(
    `Multi-device burst (100 devices x 100 heartbeats = 10,000 calls in ${multiDuration}ms): each device gets exactly 1 persist`,
    allDevicesExactOnePersist && totalDues === DEVICE_COUNT,
    `Total dues: ${totalDues}/${DEVICE_COUNT}`
  );
}

// Test 2.3: Long-running stream simulation (1,000 ticks at 15s cadence = 4.16 hours)
{
  const devId = 'dev-m2-stream-sim';
  registry.clearDeviceTelemetry(devId);
  const TICKS = 1000;
  const CADENCE_MS = 15_000; // 15 seconds
  const INTERVAL_MS = 180_000; // 3 minutes
  const tStart = 100_000_000;

  let persistCount = 0;
  let broadcastCount = 0;

  for (let i = 0; i < TICKS; i++) {
    const currentMs = tStart + (i * CADENCE_MS);
    const isDue = registry.recordHeartbeat(
      devId,
      { uptime: i * 15, cpu: (i % 20) + 10 },
      new Date(currentMs).toISOString(),
      currentMs,
      INTERVAL_MS
    );

    // Heartbeat broadcast is unconditional
    broadcastCount++;
    if (isDue) {
      persistCount++;
    }
  }

  // In 1,000 ticks of 15s (15,000s = 250 minutes = 4.16h):
  // Persist at t = 0s, 180s, 360s, ..., 14940s.
  // Expected persists = floor(14985 / 180) + 1 = 83 + 1 = 84.
  const expectedPersists = Math.floor(((TICKS - 1) * CADENCE_MS) / INTERVAL_MS) + 1;
  const reductionPercent = (((TICKS - persistCount) / TICKS) * 100).toFixed(1);

  report(
    `Simulated 4.16h agent lifecycle (1,000 heartbeats at 15s): ${persistCount} persists vs 1,000 broadcasts (${reductionPercent}% Firestore write reduction)`,
    persistCount === expectedPersists && broadcastCount === 1000,
    `Actual persists: ${persistCount}, Expected: ${expectedPersists}`
  );
}

// ---------------------------------------------------------------------------
// PART 3: WEBSOCKET REAL-TIME BROADCAST & FIRESTORE THROTTLING INTEGRATION
// ---------------------------------------------------------------------------
console.log('\n--- Part 3: WebSocket Real-Time Broadcast & Throttled Persistence ---');

// Mock Firestore store
const inMemoryFirestore = {
  devices: new Map(),
};

function createMockFirestore() {
  return {
    collection(colName) {
      const store = inMemoryFirestore[colName] || (inMemoryFirestore[colName] = new Map());
      return {
        doc(docId) {
          return {
            id: docId,
            async get() {
              const data = store.get(docId);
              return {
                id: docId,
                exists: data !== undefined,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              };
            },
            async set(newData, options = {}) {
              if (options.merge) {
                const current = store.get(docId) || {};
                store.set(docId, { ...current, ...newData });
              } else {
                store.set(docId, JSON.parse(JSON.stringify(newData)));
              }
              return { writeTime: new Date() };
            },
            async update(updateData) {
              const current = store.get(docId);
              if (!current) throw new Error('NOT_FOUND');
              const updated = { ...current, ...updateData };
              store.set(docId, updated);
              return { writeTime: new Date() };
            },
            async delete() {
              store.delete(docId);
              return { writeTime: new Date() };
            },
          };
        },
        where(field, op, val) {
          return {
            async get() {
              const matches = [];
              for (const [id, doc] of store.entries()) {
                if (op === '==' && doc[field] === val) {
                  matches.push({
                    id,
                    data: () => JSON.parse(JSON.stringify(doc)),
                  });
                }
              }
              return { docs: matches };
            },
          };
        },
      };
    },
  };
}

const { db, auth } = await import('../dist/lib/firebase.js');
const mockFs = createMockFirestore();
db.collection = mockFs.collection.bind(mockFs);
auth.verifyIdToken = async (token) => {
  return { uid: token, email: `${token}@test.com` };
};

// Setup Socket.IO Server mock to track disconnects and room events
const socketIoServer = createServer();
const sockModule = await import('../dist/socket/index.js');
sockModule.setupSocketIO(socketIoServer);
const io = sockModule.io;

const clientRoomEvents = [];

// Intercept io.of('/client').to(room).emit
const originalOf = io.of.bind(io);
io.of = (nsp) => {
  const ns = originalOf(nsp);
  if (nsp === '/client') {
    return {
      ...ns,
      to(room) {
        return {
          emit(event, payload) {
            clientRoomEvents.push({ room, event, payload });
            return true;
          },
        };
      },
    };
  }
  return ns;
};

const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');

// Test 3.1: Verify client room `device:${deviceId}` receives `device:stats` on EVERY heartbeat
{
  const devId = 'dev-ws-unconditional';
  const sockId = 'agent-sock-ws-1';

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-user',
    trustStatus: 'trusted',
    status: 'online',
    lastSeen: new Date(Date.now() - 300_000).toISOString(),
  });
  registry.registerAgent(devId, sockId);
  registry.markLastSeenPersisted(devId, Date.now() - 300_000);

  let firestoreUpdates = 0;
  const originalCollection = db.collection;
  db.collection = (col) => {
    const colRef = originalCollection(col);
    if (col === 'devices') {
      return {
        ...colRef,
        doc(id) {
          const docRef = colRef.doc(id);
          if (id === devId) {
            const origUpdate = docRef.update;
            docRef.update = async (data) => {
              firestoreUpdates++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  clientRoomEvents.length = 0;
  const mockAgent = {
    id: sockId,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };
  handleAgentSocket(mockAgent);
  const heartbeatHandler = mockAgent.listeners.get('agent:heartbeat');
  assert.ok(heartbeatHandler);

  // Send 25 rapid heartbeats:
  // 1st heartbeat is due (interval expired > 180s) -> 1 Firestore update, 1 WS broadcast
  // 2nd - 25th heartbeats are NOT due (< 180s) -> 0 Firestore updates, 24 WS broadcasts
  for (let i = 1; i <= 25; i++) {
    await heartbeatHandler({
      deviceId: devId,
      stats: { cpuPercent: i * 2, memUsedMb: 1000 + i },
    });
  }

  db.collection = originalCollection;

  const roomBroadcasts = clientRoomEvents.filter(
    e => e.room === `device:${devId}` && e.event === 'device:stats'
  );

  report(
    'WebSocket real-time broadcast: client room device:${deviceId} receives device:stats on EVERY heartbeat (25/25) while Firestore writes are throttled to 1',
    firestoreUpdates === 1 &&
    roomBroadcasts.length === 25 &&
    roomBroadcasts[24].payload.stats.cpuPercent === 50,
    `Firestore writes: ${firestoreUpdates}, WS Broadcasts: ${roomBroadcasts.length}`
  );

  registry.unregisterAgent(sockId);
  registry.clearDeviceTelemetry(devId);
}

// Test 3.2: Room Isolation: telemetry broadcasts strictly to target device room
{
  const devA = 'dev-iso-alpha';
  const devB = 'dev-iso-beta';
  const sockA = 'agent-sock-alpha';
  const sockB = 'agent-sock-beta';

  inMemoryFirestore.devices.set(devA, { ownerId: 'u1', trustStatus: 'trusted', status: 'online' });
  inMemoryFirestore.devices.set(devB, { ownerId: 'u1', trustStatus: 'trusted', status: 'online' });
  registry.registerAgent(devA, sockA);
  registry.registerAgent(devB, sockB);

  clientRoomEvents.length = 0;

  const agentA = {
    id: sockA,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };
  const agentB = {
    id: sockB,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };
  handleAgentSocket(agentA);
  handleAgentSocket(agentB);

  const hbA = agentA.listeners.get('agent:heartbeat');
  const hbB = agentB.listeners.get('agent:heartbeat');

  await hbA({ deviceId: devA, stats: { cpu: 111 } });
  await hbB({ deviceId: devB, stats: { cpu: 222 } });

  const eventsDevA = clientRoomEvents.filter(e => e.room === `device:${devA}`);
  const eventsDevB = clientRoomEvents.filter(e => e.room === `device:${devB}`);

  report(
    'WebSocket room isolation: device:stats events never cross-talk between device rooms',
    eventsDevA.length === 1 &&
    eventsDevA[0].payload.stats.cpu === 111 &&
    eventsDevB.length === 1 &&
    eventsDevB[0].payload.stats.cpu === 222
  );

  registry.unregisterAgent(sockA);
  registry.unregisterAgent(sockB);
  registry.clearDeviceTelemetry(devA);
  registry.clearDeviceTelemetry(devB);
}

// Test 3.3: Heartbeat payload without explicit deviceId falls back to socket mapping
{
  const devMapped = 'dev-mapped-lookup';
  const sockMapped = 'agent-sock-mapped';

  inMemoryFirestore.devices.set(devMapped, { ownerId: 'u1', trustStatus: 'trusted', status: 'online' });
  registry.registerAgent(devMapped, sockMapped);

  clientRoomEvents.length = 0;
  const agentMapped = {
    id: sockMapped,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };
  handleAgentSocket(agentMapped);
  const hbMapped = agentMapped.listeners.get('agent:heartbeat');

  // Payload omits deviceId
  await hbMapped({ stats: { memFreeMb: 4096 } });

  const mappedBroadcast = clientRoomEvents.find(
    e => e.room === `device:${devMapped}` && e.event === 'device:stats'
  );

  report(
    'agent:heartbeat payload missing explicit deviceId resolves deviceId from registry.getDeviceIdForAgent',
    mappedBroadcast !== undefined &&
    mappedBroadcast.payload.deviceId === devMapped &&
    mappedBroadcast.payload.stats.memFreeMb === 4096
  );

  registry.unregisterAgent(sockMapped);
  registry.clearDeviceTelemetry(devMapped);
}

// Test 3.4: Resilience to Firestore write failures: unhandled rejection guard
{
  const devFail = 'dev-firestore-fail';
  const sockFail = 'agent-sock-fail';

  inMemoryFirestore.devices.set(devFail, { ownerId: 'u1', trustStatus: 'trusted', status: 'online' });
  registry.registerAgent(devFail, sockFail);
  // Ensure isDue = true by clearing baseline
  registry.clearDeviceTelemetry(devFail);

  const originalCollection = db.collection;
  db.collection = (col) => {
    const colRef = originalCollection(col);
    if (col === 'devices') {
      return {
        ...colRef,
        doc(id) {
          if (id === devFail) {
            return {
              update: async () => {
                throw new Error('DEADLINE_EXCEEDED: Firestore write timed out');
              },
            };
          }
          return colRef.doc(id);
        },
      };
    }
    return colRef;
  };

  clientRoomEvents.length = 0;
  const agentFail = {
    id: sockFail,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };
  handleAgentSocket(agentFail);
  const hbFail = agentFail.listeners.get('agent:heartbeat');

  let threwError = false;
  try {
    await hbFail({ deviceId: devFail, stats: { cpu: 99 } });
  } catch {
    threwError = true;
  }

  db.collection = originalCollection;

  const wsDelivered = clientRoomEvents.find(
    e => e.room === `device:${devFail}` && e.event === 'device:stats'
  );

  report(
    'Heartbeat error resilience: Firestore write rejection is caught safely and WebSocket broadcast succeeds',
    threwError === false &&
    wsDelivered !== undefined &&
    wsDelivered.payload.stats.cpu === 99
  );

  registry.unregisterAgent(sockFail);
  registry.clearDeviceTelemetry(devFail);
}

// ---------------------------------------------------------------------------
// PART 4: REST API TELEMETRY ENRICHMENT & LIFECYCLE
// ---------------------------------------------------------------------------
console.log('\n--- Part 4: REST API Telemetry Enrichment & Cleanup Lifecycle ---');

const { devicesRouter } = await import('../dist/routes/devices.js');
const app = express();
app.use(express.json());
app.use('/api/devices', devicesRouter);

function simulateRequest(method, url, options = {}) {
  return new Promise((resolve) => {
    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer user-rest-challenger',
      ...(options.headers || {}),
    };

    let bodyData = {};
    if (options.body) {
      bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    }

    const req = {
      method,
      url,
      originalUrl: url,
      baseUrl: '',
      path: url.split('?')[0],
      headers,
      body: bodyData,
      query: {},
      params: {},
    };

    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, data });
      },
      send(data) {
        resolve({ status: this.statusCode, data });
      },
      end() {
        resolve({ status: this.statusCode, data: null });
      },
      setHeader() {},
      getHeader() {},
    };

    app.handle(req, res, (err) => {
      if (err) {
        resolve({ status: 500, data: { error: err.message } });
      } else {
        resolve({ status: 404, data: { error: 'Not found' } });
      }
    });
  });
}

// Test 4.1: GET /api/devices enriches list with fresh in-memory stats & status
{
  const devId = 'dev-rest-enrich-list';
  inMemoryFirestore.devices.set(devId, {
    ownerId: 'user-rest-challenger',
    name: 'Rest Host 1',
    status: 'offline', // Firestore says offline
    lastSeen: '2026-11-05T20:00:00Z',
    stats: { cpuPercent: 5.0 }, // Firestore says 5%
    createdAt: '2026-11-05T19:00:00Z',
  });

  // Agent connects and sends live heartbeat
  registry.registerAgent(devId, 'agent-sock-rest-list');
  registry.recordHeartbeat(devId, { cpuPercent: 88.8, ramMb: 16384 }, '2026-11-05T22:45:00Z');

  const listRes = await simulateRequest('GET', '/api/devices');
  const enrichedItem = listRes.data?.find(d => d.id === devId);

  report(
    'GET /api/devices delivers real-time in-memory telemetry (cpuPercent: 88.8%) and status: "online"',
    listRes.status === 200 &&
    enrichedItem?.status === 'online' &&
    enrichedItem?.stats?.cpuPercent === 88.8 &&
    enrichedItem?.stats?.ramMb === 16384 &&
    enrichedItem?.lastSeen === '2026-11-05T22:45:00Z'
  );

  registry.unregisterAgent('agent-sock-rest-list');
  registry.clearDeviceTelemetry(devId);
}

// Test 4.2: GET /api/devices/:id delivers fresh in-memory stats
{
  const devId = 'dev-rest-enrich-single';
  inMemoryFirestore.devices.set(devId, {
    ownerId: 'user-rest-challenger',
    name: 'Rest Host Single',
    status: 'offline',
    lastSeen: '2026-11-05T20:00:00Z',
    stats: { cpuPercent: 1.0 },
    createdAt: '2026-11-05T19:00:00Z',
  });

  registry.registerAgent(devId, 'agent-sock-rest-single');
  registry.recordHeartbeat(devId, { cpuPercent: 99.9, thermalC: 62 }, '2026-11-05T22:50:00Z');

  const getRes = await simulateRequest('GET', `/api/devices/${devId}`);

  report(
    'GET /api/devices/:id delivers fresh in-memory telemetry and status: "online"',
    getRes.status === 200 &&
    getRes.data?.status === 'online' &&
    getRes.data?.stats?.cpuPercent === 99.9 &&
    getRes.data?.stats?.thermalC === 62 &&
    getRes.data?.lastSeen === '2026-11-05T22:50:00Z'
  );

  registry.unregisterAgent('agent-sock-rest-single');
  registry.clearDeviceTelemetry(devId);
}

// Test 4.3: DELETE /api/devices/:id cleans up telemetry from in-memory cache
{
  const devId = 'dev-rest-delete-evict';
  inMemoryFirestore.devices.set(devId, {
    ownerId: 'user-rest-challenger',
    name: 'Delete Target',
    status: 'offline',
  });
  registry.recordHeartbeat(devId, { cpuPercent: 42.0 });
  assert.ok(registry.getDeviceTelemetry(devId));

  const deleteRes = await simulateRequest('DELETE', `/api/devices/${devId}`);
  const telemetryAfterDelete = registry.getDeviceTelemetry(devId);

  report(
    'DELETE /api/devices/:id evicts device telemetry from registry.ts cache cleanly',
    deleteRes.status === 200 &&
    telemetryAfterDelete === undefined
  );
}

// ---------------------------------------------------------------------------
// FINAL SUMMARY
// ---------------------------------------------------------------------------
console.log('\n====================================================');
console.log(`SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('====================================================\n');

if (failedTests > 0) {
  console.error(`VERDICT: FAILED — ${failedTests} tests failed.`);
  process.exit(1);
} else {
  console.log('VERDICT: ALL EMPIRICAL CHALLENGER TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
