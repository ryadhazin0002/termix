import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { registry } from '../dist/socket/registry.js';
import { defaultUserSettings } from '@termix/shared';

// Load env variables if not set
if (!process.env.FIREBASE_PROJECT_ID) {
  process.env.PORT = '3001';
  process.env.FIREBASE_PROJECT_ID = 'termix-2207d';
  process.env.CLIENT_ORIGIN = 'http://localhost:3000';
  process.env.DEVICE_LAST_SEEN_PERSIST_INTERVAL_MS = '180000';
}

console.log('================================================================================');
console.log('M2 CHALLENGER 2: ADVERSARIAL BACKEND THROTTLING & STATUS PERSISTENCE SUITE');
console.log('================================================================================\n');

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
// Setup Mock Firestore and Socket.IO infrastructure
// ---------------------------------------------------------------------------
const inMemoryFirestore = {
  users: new Map(),
  devices: new Map(),
  sessions: new Map(),
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
                const merged = { ...current };
                for (const key of Object.keys(newData)) {
                  if (typeof newData[key] === 'object' && newData[key] !== null && !Array.isArray(newData[key])) {
                    merged[key] = { ...(merged[key] || {}), ...newData[key] };
                  } else {
                    merged[key] = newData[key];
                  }
                }
                store.set(docId, merged);
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
        async add(data) {
          const id = `auto-id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          store.set(id, JSON.parse(JSON.stringify(data)));
          return { id };
        },
      };
    },
  };
}

// Monkey-patch db and auth in firebase.js
const { db, auth } = await import('../dist/lib/firebase.js');
const mockFs = createMockFirestore();
db.collection = mockFs.collection.bind(mockFs);
auth.verifyIdToken = async (token) => {
  if (token === 'expired') throw new Error('Token expired');
  return { uid: token, email: `${token}@test.com` };
};

// Setup Socket.IO Server mock
const socketIoServer = createServer();
const sockModule = await import('../dist/socket/index.js');
sockModule.setupSocketIO(socketIoServer);
const io = sockModule.io;

const clientRoomBroadcasts = [];
const agentEmittedEvents = new Map(); // socketId -> array of events

const originalOf = io.of.bind(io);
io.of = (nsp) => {
  const ns = originalOf(nsp);
  if (nsp === '/client') {
    return {
      ...ns,
      to(room) {
        return {
          emit(event, payload) {
            clientRoomBroadcasts.push({ room, event, payload, timestamp: Date.now() });
            return true;
          },
        };
      },
    };
  }
  return ns;
};

// Mount Express routes
const { devicesRouter } = await import('../dist/routes/devices.js');
const app = express();
app.use(express.json());
app.use('/api/devices', devicesRouter);

function simulateRequest(method, url, options = {}) {
  return new Promise((resolve) => {
    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer test-owner-1',
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

const request = (path, options = {}) => simulateRequest(options.method || 'GET', path, options);

function createMockAgentSocket(socketId) {
  const socketEvents = [];
  agentEmittedEvents.set(socketId, socketEvents);
  let isDisconnected = false;

  const sock = {
    id: socketId,
    listeners: new Map(),
    on(event, fn) {
      this.listeners.set(event, fn);
    },
    emit(event, payload) {
      socketEvents.push({ event, payload });
    },
    disconnect(close) {
      isDisconnected = true;
    },
    get disconnected() {
      return isDisconnected;
    },
  };
  io.of('/agent').sockets.set(socketId, sock);
  return sock;
}

const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');

// ===========================================================================
// SECTION 1: STATUS CHANGE IMMEDIATE PERSISTENCE & THROTTLING BASELINE
// ===========================================================================
console.log('--- Section 1: Immediate Persistence & Throttle Baseline on Status Changes ---');

// Test 1.1: agent:register immediately writes status: 'online' and sets throttle baseline
{
  const devId = 'dev-m2-reg-test-1';
  const sockId = 'agent-sock-m2-reg-1';
  let updateCalls = 0;
  let lastUpdatePayload = null;

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-reg-secret-1',
    trustStatus: 'trusted',
    status: 'offline',
    lastSeen: '2026-11-05T00:00:00Z',
  });

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
              updateCalls++;
              lastUpdatePayload = data;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);
  const regHandler = agentSock.listeners.get('agent:register');
  assert.ok(regHandler, 'agent:register must be defined');

  clientRoomBroadcasts.length = 0;

  await regHandler({
    deviceId: devId,
    token: 'token-reg-secret-1',
    hostname: 'worker-node-1',
    os: 'linux',
    distro: 'Ubuntu 24.04 LTS',
    distroId: 'ubuntu',
    osVersion: '6.8.0-generic',
    agentVersion: '2.0.0',
    stats: { cpuPercent: 12.5, memUsedMb: 4096 },
  });

  const firestoreRecord = inMemoryFirestore.devices.get(devId);
  const telemetry = registry.getDeviceTelemetry(devId);
  const isOnline = registry.isDeviceOnline(devId);
  const statusBroadcast = clientRoomBroadcasts.find(b => b.room === `device:${devId}` && b.event === 'device:status');

  db.collection = originalCollection;

  report(
    'agent:register immediately writes status "online" to Firestore and establishes baseline',
    updateCalls === 1 &&
    lastUpdatePayload?.status === 'online' &&
    firestoreRecord?.status === 'online' &&
    isOnline === true &&
    telemetry !== undefined &&
    telemetry.stats?.cpuPercent === 12.5 &&
    statusBroadcast?.payload?.status === 'online' &&
    statusBroadcast?.payload?.distro === 'Ubuntu 24.04 LTS',
    `UpdateCalls: ${updateCalls}, status: ${firestoreRecord?.status}, isOnline: ${isOnline}`
  );
}

// Test 1.2: agent:register without stats anchors baseline, subsequent 15s heartbeats are throttled
{
  const devId = 'dev-m2-reg-no-stats';
  const sockId = 'agent-sock-m2-reg-2';
  let updateCalls = 0;

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-reg-secret-2',
    trustStatus: 'trusted',
    status: 'offline',
  });

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
              updateCalls++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);
  const regHandler = agentSock.listeners.get('agent:register');
  const heartbeatHandler = agentSock.listeners.get('agent:heartbeat');

  // Register without stats
  await regHandler({
    deviceId: devId,
    token: 'token-reg-secret-2',
    hostname: 'barebones-node',
    os: 'linux',
    agentVersion: '2.0.0',
  });

  assert.equal(updateCalls, 1, 'Registration must immediately write once');

  // Subsequent heartbeat 15 seconds later
  clientRoomBroadcasts.length = 0;
  await heartbeatHandler({
    deviceId: devId,
    stats: { cpuPercent: 5.0, memUsedMb: 1024 },
  });

  db.collection = originalCollection;

  const telemetry = registry.getDeviceTelemetry(devId);
  const statsBroadcast = clientRoomBroadcasts.find(b => b.room === `device:${devId}` && b.event === 'device:stats');

  report(
    'agent:register without stats establishes baseline; first subsequent heartbeat is throttled in Firestore',
    updateCalls === 1 &&
    telemetry?.stats?.cpuPercent === 5.0 &&
    statsBroadcast?.payload?.stats?.cpuPercent === 5.0,
    `UpdateCalls: ${updateCalls} (expected 1), cachedStats: ${JSON.stringify(telemetry?.stats)}`
  );
}

// Test 1.3: Cadence simulation: 10 successive heartbeats within 180s throttle window produce 0 additional Firestore writes
{
  const devId = 'dev-m2-heartbeat-series';
  const sockId = 'agent-sock-m2-series';
  let firestoreHeartbeatWrites = 0;

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-series',
    trustStatus: 'trusted',
    status: 'online',
  });

  registry.registerAgent(devId, sockId);
  const startTime = Date.now();
  registry.markLastSeenPersisted(devId, startTime);

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
              firestoreHeartbeatWrites++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);
  const heartbeatHandler = agentSock.listeners.get('agent:heartbeat');

  let totalBroadcasts = 0;
  // Simulate 10 heartbeats spaced by 15s (15s, 30s, ..., 150s, all < 180s)
  for (let i = 1; i <= 10; i++) {
    const virtualNowMs = startTime + (i * 15_000);
    // Monkey-patch Date.now for deterministic evaluation inside heartbeatHandler
    const origNow = Date.now;
    Date.now = () => virtualNowMs;

    clientRoomBroadcasts.length = 0;
    await heartbeatHandler({
      deviceId: devId,
      stats: { cpuPercent: i * 5, count: i },
    });

    Date.now = origNow;

    const broadcast = clientRoomBroadcasts.find(b => b.room === `device:${devId}` && b.event === 'device:stats');
    if (broadcast && broadcast.payload.stats.count === i) {
      totalBroadcasts++;
    }
  }

  db.collection = originalCollection;

  const currentStats = registry.getDeviceStats(devId);

  report(
    '10 successive 15s heartbeats produce 0 Firestore writes while broadcasting 10 client updates unconditionally',
    firestoreHeartbeatWrites === 0 &&
    totalBroadcasts === 10 &&
    currentStats?.cpuPercent === 50 &&
    currentStats?.count === 10,
    `Writes: ${firestoreHeartbeatWrites} (expected 0), Broadcasts: ${totalBroadcasts}/10, Latest stats count: ${currentStats?.count}`
  );
}

// Test 1.4: Heartbeat at or beyond 180s triggers Firestore write and re-anchors persist baseline
{
  const devId = 'dev-m2-expire-window';
  const sockId = 'agent-sock-m2-exp';
  let firestoreWrites = 0;

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-exp',
    trustStatus: 'trusted',
    status: 'online',
  });

  const anchorTime = Date.now();
  registry.registerAgent(devId, sockId);
  registry.markLastSeenPersisted(devId, anchorTime);

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
              firestoreWrites++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);
  const heartbeatHandler = agentSock.listeners.get('agent:heartbeat');

  // Trigger heartbeat exactly 180,001 ms later (interval expired)
  const expiredTime = anchorTime + 180_001;
  const origNow = Date.now;
  Date.now = () => expiredTime;

  await heartbeatHandler({
    deviceId: devId,
    stats: { cpuPercent: 99.0 },
  });

  Date.now = origNow;

  assert.equal(firestoreWrites, 1, 'Expired interval must trigger exactly 1 write');

  // Next heartbeat 15 seconds after the persist (should be throttled again)
  const nextTime = expiredTime + 15_000;
  Date.now = () => nextTime;

  await heartbeatHandler({
    deviceId: devId,
    stats: { cpuPercent: 88.0 },
  });

  Date.now = origNow;
  db.collection = originalCollection;

  report(
    'Heartbeat at 180s persists to Firestore and immediately re-anchors baseline for subsequent heartbeats',
    firestoreWrites === 1 && registry.getDeviceStats(devId)?.cpuPercent === 88.0,
    `Writes: ${firestoreWrites} (expected 1), stats: ${registry.getDeviceStats(devId)?.cpuPercent}`
  );
}

// Test 1.5: Socket disconnect immediately writes status 'offline' and lastSeen to Firestore and broadcasts
{
  const devId = 'dev-m2-disconnect-test';
  const sockId = 'agent-sock-m2-disc';
  let disconnectUpdateCalled = false;
  let offlineData = null;

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-disc',
    trustStatus: 'trusted',
    status: 'online',
    lastSeen: '2026-11-05T10:00:00Z',
  });

  registry.registerAgent(devId, sockId);
  assert.equal(registry.isDeviceOnline(devId), true);

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
              disconnectUpdateCalled = true;
              offlineData = data;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  clientRoomBroadcasts.length = 0;
  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);
  const disconnectHandler = agentSock.listeners.get('disconnect');
  assert.ok(disconnectHandler, 'disconnect handler must exist');

  await disconnectHandler();

  db.collection = originalCollection;

  const isOnlineAfter = registry.isDeviceOnline(devId);
  const offlineBroadcast = clientRoomBroadcasts.find(b => b.room === `device:${devId}` && b.event === 'device:status' && b.payload?.status === 'offline');
  const firestoreRecord = inMemoryFirestore.devices.get(devId);

  report(
    'disconnect immediately writes status "offline" to Firestore and broadcasts to client room',
    disconnectUpdateCalled === true &&
    offlineData?.status === 'offline' &&
    firestoreRecord?.status === 'offline' &&
    isOnlineAfter === false &&
    offlineBroadcast !== undefined,
    `UpdateCalled: ${disconnectUpdateCalled}, status: ${firestoreRecord?.status}, isOnlineAfter: ${isOnlineAfter}`
  );
}

// Test 1.6: PATCH /api/devices/:id with trustStatus: 'blocked' immediately writes 'offline' and disconnects agent
{
  const devId = 'dev-m2-block-test';
  const sockId = 'agent-sock-m2-block';

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-block',
    name: 'Block Target Host',
    trustStatus: 'trusted',
    status: 'online',
    lastSeen: '2026-11-05T12:00:00Z',
  });

  registry.registerAgent(devId, sockId);
  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);

  clientRoomBroadcasts.length = 0;

  const patchRes = await request(`/api/devices/${devId}`, {
    method: 'PATCH',
    body: JSON.stringify({ trustStatus: 'blocked' }),
  });

  assert.equal(patchRes.status, 200);

  const firestoreDoc = inMemoryFirestore.devices.get(devId);
  const isOnlineInRegistry = registry.isDeviceOnline(devId);
  const agentEvents = agentEmittedEvents.get(sockId) || [];
  const serverErrorEvent = agentEvents.find(e => e.event === 'server:error' && e.payload?.message === 'Device is blocked');
  const clientOfflineEvent = clientRoomBroadcasts.find(b => b.room === `device:${devId}` && b.event === 'device:status' && b.payload?.status === 'offline');

  report(
    'PATCH /api/devices/:id with trustStatus: "blocked" writes offline to Firestore, disconnects agent, emits server:error',
    firestoreDoc?.trustStatus === 'blocked' &&
    firestoreDoc?.status === 'offline' &&
    isOnlineInRegistry === false &&
    agentSock.disconnected === true &&
    serverErrorEvent !== undefined &&
    clientOfflineEvent !== undefined,
    `DocStatus: ${firestoreDoc?.status}, Disconnected: ${agentSock.disconnected}, AgentEvent: ${JSON.stringify(serverErrorEvent)}`
  );
}

// Test 1.7: Blocked device rejects reconnection attempt in agent:register
{
  const devId = 'dev-m2-block-test';
  const newSockId = 'agent-sock-m2-reconnect-blocked';
  const newAgentSock = createMockAgentSocket(newSockId);
  handleAgentSocket(newAgentSock);

  const regHandler = newAgentSock.listeners.get('agent:register');
  assert.ok(regHandler);

  await regHandler({
    deviceId: devId,
    token: 'token-block',
    hostname: 'blocked-host',
    os: 'linux',
    agentVersion: '2.0.0',
  });

  const agentEvents = agentEmittedEvents.get(newSockId) || [];
  const rejectedError = agentEvents.find(e => e.event === 'server:error' && e.payload?.message === 'Device is blocked');
  const isOnline = registry.isDeviceOnline(devId);

  report(
    'Blocked device is rejected with "Device is blocked" and disconnected on subsequent register attempt',
    newAgentSock.disconnected === true &&
    rejectedError !== undefined &&
    isOnline === false,
    `Disconnected: ${newAgentSock.disconnected}, isOnline: ${isOnline}`
  );
}

// ===========================================================================
// SECTION 2: REST ROUTE ENRICHMENT & CACHE LIFECYCLE
// ===========================================================================
console.log('\n--- Section 2: REST Route Enrichment & Cache Lifecycle ---');

// Test 2.1: GET /api/devices enriches live status, fresh stats, and lastSeen over stale Firestore
{
  const devId1 = 'dev-m2-rest-enrich-1';
  const devId2 = 'dev-m2-rest-enrich-2';

  // Device 1: Stale in Firestore, but LIVE in registry with newer telemetry
  inMemoryFirestore.devices.set(devId1, {
    ownerId: 'test-owner-1',
    name: 'Server Node 1',
    trustStatus: 'trusted',
    status: 'offline', // Stale Firestore status
    lastSeen: '2026-11-05T01:00:00Z', // Stale
    stats: { cpuPercent: 5.0, memUsedMb: 1000 },
    createdAt: '2026-11-05T00:00:00Z',
  });

  // Device 2: Truly offline, no in-memory telemetry
  inMemoryFirestore.devices.set(devId2, {
    ownerId: 'test-owner-1',
    name: 'Server Node 2',
    trustStatus: 'trusted',
    status: 'offline',
    lastSeen: '2026-11-04T12:00:00Z',
    stats: { cpuPercent: 1.0, memUsedMb: 500 },
    createdAt: '2026-11-04T00:00:00Z',
  });

  // Connect Device 1 to registry with live heartbeat
  registry.registerAgent(devId1, 'agent-sock-rest-1');
  registry.recordHeartbeat(devId1, { cpuPercent: 88.8, memUsedMb: 6000 }, '2026-11-05T22:50:00Z');

  const listRes = await request('/api/devices');
  assert.equal(listRes.status, 200);

  const enriched1 = listRes.data.find(d => d.id === devId1);
  const enriched2 = listRes.data.find(d => d.id === devId2);

  report(
    'GET /api/devices enriches device with live online status and cached in-memory telemetry',
    enriched1?.status === 'online' &&
    enriched1?.stats?.cpuPercent === 88.8 &&
    enriched1?.lastSeen === '2026-11-05T22:50:00Z' &&
    enriched2?.status === 'offline' &&
    enriched2?.stats?.cpuPercent === 1.0 &&
    enriched2?.lastSeen === '2026-11-04T12:00:00Z',
    `Dev1 status: ${enriched1?.status}, cpu: ${enriched1?.stats?.cpuPercent}, lastSeen: ${enriched1?.lastSeen}`
  );
}

// Test 2.2: GET /api/devices/:id returns live enriched stats and status
{
  const devId1 = 'dev-m2-rest-enrich-1';
  const getRes = await request(`/api/devices/${devId1}`);

  report(
    'GET /api/devices/:id enriches single device with fresh stats, lastSeen, and live status',
    getRes.status === 200 &&
    getRes.data.status === 'online' &&
    getRes.data.stats?.cpuPercent === 88.8 &&
    getRes.data.lastSeen === '2026-11-05T22:50:00Z',
    `Status: ${getRes.data?.status}, Stats: ${JSON.stringify(getRes.data?.stats)}`
  );
}

// Test 2.3: DELETE /api/devices/:id cleans up device from registry telemetry cache
{
  const devId = 'dev-m2-delete-cache-test';
  const sockId = 'agent-sock-m2-delete';

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    name: 'To Delete Host',
    trustStatus: 'trusted',
    status: 'online',
    agentToken: 'token-del',
  });

  registry.registerAgent(devId, sockId);
  registry.recordHeartbeat(devId, { cpuPercent: 33.3 }, '2026-11-05T23:00:00Z');

  // Verify telemetry exists in registry before delete
  assert.ok(registry.getDeviceTelemetry(devId), 'Telemetry must exist before delete');
  assert.equal(registry.isDeviceOnline(devId), true, 'Device must be online before delete');

  const agentSock = createMockAgentSocket(sockId);

  // Invoke DELETE
  const delRes = await request(`/api/devices/${devId}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);

  // Verify post-conditions:
  const telemetryAfter = registry.getDeviceTelemetry(devId);
  const statsAfter = registry.getDeviceStats(devId);
  const lastSeenAfter = registry.getDeviceLastSeen(devId);
  const isOnlineAfter = registry.isDeviceOnline(devId);
  const docAfter = inMemoryFirestore.devices.get(devId);

  report(
    'DELETE /api/devices/:id completely cleans up device from registry telemetry cache and unregisters agent',
    delRes.data.success === true &&
    telemetryAfter === undefined &&
    statsAfter === undefined &&
    lastSeenAfter === undefined &&
    isOnlineAfter === false &&
    docAfter === undefined &&
    agentSock.disconnected === true,
    `Telemetry: ${telemetryAfter}, isOnline: ${isOnlineAfter}, docExists: ${docAfter !== undefined}`
  );
}

// ===========================================================================
// SECTION 3: ADVERSARIAL STRESS & CONCURRENCY ORACLES
// ===========================================================================
console.log('\n--- Section 3: Adversarial Stress & Concurrency Oracles ---');

// Test 3.1: Throttling Storm: 50 concurrent devices emitting 20 heartbeats each (1,000 parallel heartbeats)
{
  const DEVICE_COUNT = 50;
  const HEARTBEATS_PER_DEV = 20;
  const devIds = Array.from({ length: DEVICE_COUNT }, (_, i) => `storm-dev-${i}`);
  let stormFirestoreWrites = 0;

  const nowMs = Date.now();
  for (const id of devIds) {
    inMemoryFirestore.devices.set(id, {
      ownerId: 'test-owner-1',
      trustStatus: 'trusted',
      status: 'online',
    });
    registry.registerAgent(id, `agent-sock-${id}`);
    registry.markLastSeenPersisted(id, nowMs); // Baseline anchored at nowMs
  }

  const originalCollection = db.collection;
  db.collection = (col) => {
    const colRef = originalCollection(col);
    if (col === 'devices') {
      return {
        ...colRef,
        doc(id) {
          const docRef = colRef.doc(id);
          if (id.startsWith('storm-dev-')) {
            const origUpdate = docRef.update;
            docRef.update = async (data) => {
              stormFirestoreWrites++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  const agentSocks = devIds.map(id => {
    const s = createMockAgentSocket(`agent-sock-${id}`);
    handleAgentSocket(s);
    return s;
  });

  const stormStartTime = Date.now();
  const allPromises = [];

  for (let round = 1; round <= HEARTBEATS_PER_DEV; round++) {
    for (let d = 0; d < DEVICE_COUNT; d++) {
      const devId = devIds[d];
      const sock = agentSocks[d];
      const handler = sock.listeners.get('agent:heartbeat');

      allPromises.push(
        handler({
          deviceId: devId,
          stats: { round, cpu: d * 2, mem: round * 100 },
        })
      );
    }
  }

  await Promise.all(allPromises);
  const stormDuration = Date.now() - stormStartTime;
  db.collection = originalCollection;

  // Verify all 50 devices have their latest round in memory
  let accurateCacheCount = 0;
  for (const id of devIds) {
    const stats = registry.getDeviceStats(id);
    if (stats?.round === HEARTBEATS_PER_DEV) {
      accurateCacheCount++;
    }
    registry.clearDeviceTelemetry(id);
    registry.unregisterAgent(`agent-sock-${id}`);
  }

  report(
    `Throttling Storm: 1,000 concurrent heartbeats across 50 devices completed in ${stormDuration}ms with ZERO extra writes`,
    stormFirestoreWrites === 0 && accurateCacheCount === DEVICE_COUNT,
    `Writes: ${stormFirestoreWrites} (expected 0), Accurately updated: ${accurateCacheCount}/${DEVICE_COUNT}`
  );
}

// Test 3.2: Clock skew resilience: negative time delta triggers immediate persist
{
  const devId = 'dev-m2-clock-skew';
  const baselineMs = 5_000_000;
  registry.markLastSeenPersisted(devId, baselineMs);

  // System clock jumps backward 10,000ms
  const skewedNowMs = baselineMs - 10_000;
  const isDue = registry.recordHeartbeat(devId, { cpuPercent: 1.0 }, new Date(skewedNowMs).toISOString(), skewedNowMs, 180_000);

  report(
    'Clock skew guard: negative time delta (nowMs < lastPersistedAt) returns isDue = true to avoid freeze',
    isDue === true
  );
  registry.clearDeviceTelemetry(devId);
}

// Test 3.3: Robustness against malformed heartbeat payloads (null, missing stats, undefined)
{
  const devId = 'dev-m2-malformed';
  const sockId = 'agent-sock-m2-malformed';
  registry.registerAgent(devId, sockId);
  const agentSock = createMockAgentSocket(sockId);
  handleAgentSocket(agentSock);
  const heartbeatHandler = agentSock.listeners.get('agent:heartbeat');

  let crashed = false;
  try {
    await heartbeatHandler(null);
    await heartbeatHandler({});
    await heartbeatHandler({ deviceId: '' });
    await heartbeatHandler({ deviceId: devId, stats: null });
    await heartbeatHandler({ deviceId: devId, stats: 'invalid-string' });
    await heartbeatHandler({ deviceId: devId, stats: { nested: { array: [1, 2, 3] } } });
  } catch (err) {
    crashed = true;
  }

  const finalStats = registry.getDeviceStats(devId);

  report(
    'Malformed and boundary heartbeat payloads handled gracefully without unhandled exceptions',
    !crashed && finalStats?.nested?.array?.length === 3
  );
  registry.clearDeviceTelemetry(devId);
  registry.unregisterAgent(sockId);
}

// Test 3.4: Complete lifecycle cycle: register -> heartbeats -> disconnect -> re-register -> throttled
{
  const devId = 'dev-m2-full-cycle';
  const sock1 = 'agent-sock-cycle-1';
  const sock2 = 'agent-sock-cycle-2';
  let totalDocUpdates = 0;

  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-owner-1',
    agentToken: 'token-cycle',
    trustStatus: 'trusted',
    status: 'offline',
  });

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
              totalDocUpdates++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  // Step 1: First agent connects and registers
  const agentSock1 = createMockAgentSocket(sock1);
  handleAgentSocket(agentSock1);
  await agentSock1.listeners.get('agent:register')({
    deviceId: devId,
    token: 'token-cycle',
    hostname: 'cycle-host',
    os: 'linux',
    agentVersion: '1.0.0',
  });
  assert.equal(totalDocUpdates, 1, 'Register 1 must write');

  // Step 2: Heartbeat 1 (throttled)
  await agentSock1.listeners.get('agent:heartbeat')({ deviceId: devId, stats: { phase: 1 } });
  assert.equal(totalDocUpdates, 1, 'Heartbeat 1 must be throttled');

  // Step 3: Agent 1 disconnects (immediate write)
  await agentSock1.listeners.get('disconnect')();
  assert.equal(totalDocUpdates, 2, 'Disconnect must write immediately');
  assert.equal(registry.isDeviceOnline(devId), false);

  // Step 4: Agent 2 connects and registers (immediate write)
  const agentSock2 = createMockAgentSocket(sock2);
  handleAgentSocket(agentSock2);
  await agentSock2.listeners.get('agent:register')({
    deviceId: devId,
    token: 'token-cycle',
    hostname: 'cycle-host',
    os: 'linux',
    agentVersion: '1.0.0',
  });
  assert.equal(totalDocUpdates, 3, 'Register 2 must write immediately');
  assert.equal(registry.isDeviceOnline(devId), true);

  // Step 5: Heartbeat 2 on new connection (must be throttled based on new baseline!)
  await agentSock2.listeners.get('agent:heartbeat')({ deviceId: devId, stats: { phase: 2 } });
  assert.equal(totalDocUpdates, 3, 'Heartbeat on new connection must be throttled');

  db.collection = originalCollection;

  report(
    'Full lifecycle state machine (register -> heartbeat -> disconnect -> re-register -> heartbeat) strictly maintains throttle invariant',
    totalDocUpdates === 3 && registry.getDeviceStats(devId)?.phase === 2,
    `Total writes: ${totalDocUpdates} (expected exactly 3)`
  );
}

// ---------------------------------------------------------------------------
// Summary & Verdict
// ---------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(`SUMMARY: Total Tests: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================================\n');

if (failedTests > 0) {
  console.error('FAILED: One or more empirical tests did not pass!');
  process.exit(1);
} else {
  console.log('VERDICT: ALL 15 M2 CHALLENGER TESTS PASSED EMPIRICALLY!');
  process.exit(0);
}
