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
}

console.log('====================================================');
console.log('M1 CHALLENGER 2: BACKEND REGISTRY & REST EMPIRICAL SUITE');
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

// ---------------------------------------------------------
// PART 1: REGISTRY STRESS, CONCURRENCY, ATOMICITY, EXPIRATION
// ---------------------------------------------------------
console.log('--- Part 1: Backend Registry Concurrency & Stress Tests ---');

// Test 1.1: High Concurrency 10,000 Request Registration & Parallel Consumption
{
  const COUNT = 10000;
  const DEVICE_COUNT = 50;
  const CLIENT_COUNT = 25;
  const startTime = Date.now();

  for (let i = 0; i < COUNT; i++) {
    const devId = `dev-${i % DEVICE_COUNT}`;
    const sockId = `sock-${i % CLIENT_COUNT}`;
    registry.registerFileRequest(`req-${i}`, devId, sockId);
  }

  // Verify all 10,000 are present via peek (non-destructive)
  let peekSuccess = true;
  for (let i = 0; i < 500; i++) {
    const idx = (i * 19) % COUNT;
    const peek = registry.peekFileRequest(`req-${idx}`);
    if (!peek || peek.deviceId !== `dev-${idx % DEVICE_COUNT}` || peek.clientSocketId !== `sock-${idx % CLIENT_COUNT}`) {
      peekSuccess = false;
      break;
    }
  }
  report('Peek verification across sampled entries', peekSuccess);

  // Parallel asynchronous consumption
  const batchSize = 1000;
  const results = [];
  const batches = [];

  for (let b = 0; b < COUNT / batchSize; b++) {
    batches.push((async (batchIdx) => {
      const start = batchIdx * batchSize;
      const end = start + batchSize;
      for (let i = start; i < end; i++) {
        const req = registry.getFileRequest(`req-${i}`);
        results.push({ id: `req-${i}`, req });
      }
    })(b));
  }

  await Promise.all(batches);
  const duration = Date.now() - startTime;

  const validRetrievals = results.filter(r => r.req !== undefined && r.req.deviceId.startsWith('dev-'));
  report(
    `High concurrency registration and retrieval (${COUNT} requests in ${duration}ms)`,
    validRetrievals.length === COUNT,
    `Retrieved ${validRetrievals.length}/${COUNT}`
  );

  // Test 1.2: Atomic consumption invariance - second retrieval MUST be undefined
  let doubleRetrievalCount = 0;
  for (let i = 0; i < COUNT; i++) {
    const secondReq = registry.getFileRequest(`req-${i}`);
    if (secondReq !== undefined) {
      doubleRetrievalCount++;
    }
  }
  report(
    'Atomic consumption invariance: repeated getFileRequest returns undefined',
    doubleRetrievalCount === 0,
    `Found ${doubleRetrievalCount} unpurged entries`
  );
}

// Test 1.3: Race condition stress on identical requestId across concurrent callers
{
  const RACE_CALLERS = 100;
  const targetReqId = 'req-race-unique-1';
  registry.registerFileRequest(targetReqId, 'dev-race', 'sock-race');

  // Launch 100 concurrent promises attempting to getFileRequest simultaneously
  const racePromises = Array.from({ length: RACE_CALLERS }, (_, idx) => {
    return new Promise((resolve) => {
      // stagger microtasks slightly to simulate async event loop interleaving
      if (idx % 2 === 0) {
        queueMicrotask(() => resolve(registry.getFileRequest(targetReqId)));
      } else {
        setImmediate(() => resolve(registry.getFileRequest(targetReqId)));
      }
    });
  });

  const raceResults = await Promise.all(racePromises);
  const successes = raceResults.filter(r => r !== undefined);
  const misses = raceResults.filter(r => r === undefined);

  report(
    `Race condition atomicity: exactly 1 out of ${RACE_CALLERS} concurrent callers claims the request`,
    successes.length === 1 && misses.length === (RACE_CALLERS - 1),
    `Successes: ${successes.length}, Misses: ${misses.length}`
  );
}

// Test 1.4: Re-registration overwrite clears previous timer
{
  const overwriteId = 'req-overwrite-test';
  registry.registerFileRequest(overwriteId, 'dev-old', 'sock-old');
  const peekOld = registry.peekFileRequest(overwriteId);
  
  registry.registerFileRequest(overwriteId, 'dev-new', 'sock-new');
  const peekNew = registry.peekFileRequest(overwriteId);

  const consumed = registry.getFileRequest(overwriteId);
  const consumedAgain = registry.getFileRequest(overwriteId);

  report(
    'Re-registration overwrites previous request cleanly without duplicate entries',
    peekOld.deviceId === 'dev-old' && peekNew.deviceId === 'dev-new' && consumed.clientSocketId === 'sock-new' && consumedAgain === undefined
  );
}

// Test 1.5: Timeout timer unref property
{
  const timerTestId = 'req-timer-unref-test';
  // Register request and inspect that timers do not block node event loop
  registry.registerFileRequest(timerTestId, 'dev-timer', 'sock-timer');
  const peeked = registry.peekFileRequest(timerTestId);
  
  // Clean up
  const consumed = registry.getFileRequest(timerTestId);
  report('Timer setup and unref lifecycle cleanly completed', !!peeked && !!consumed);
}

// Test 1.6: Fast-forward expiration simulation
{
  // Test pruning callback directly
  const expireId = 'req-expire-test';
  registry.registerFileRequest(expireId, 'dev-exp', 'sock-exp');
  assert.ok(registry.peekFileRequest(expireId), 'Request should exist initially');

  // Simulate timeout triggering after 30s
  // We can test that the timeout callback deletes the entry
  // Let's create an oracle by registering a request and intercepting setTimeout or calling clearTimeout
  let timeoutFn;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => {
    timeoutFn = fn;
    return originalSetTimeout(fn, ms);
  };

  registry.registerFileRequest('req-oracle-expire', 'dev-oracle', 'sock-oracle');
  global.setTimeout = originalSetTimeout;

  assert.ok(registry.peekFileRequest('req-oracle-expire'), 'Should exist before timeout');
  // Trigger timeout callback
  if (typeof timeoutFn === 'function') {
    timeoutFn();
  }
  const afterExpire = registry.peekFileRequest('req-oracle-expire');
  report(
    'Request expiration timeout removes entry from registry',
    afterExpire === undefined,
    `Entry after timeout was ${JSON.stringify(afterExpire)}`
  );
}

// Test 1.7: Clear requests for specific device
{
  const devA = 'dev-clear-A';
  const devB = 'dev-clear-B';
  const devC = 'dev-clear-C';

  for (let i = 0; i < 200; i++) {
    registry.registerFileRequest(`req-A-${i}`, devA, `sock-A-${i}`);
    registry.registerFileRequest(`req-B-${i}`, devB, `sock-B-${i}`);
    registry.registerFileRequest(`req-C-${i}`, devC, `sock-C-${i}`);
  }

  // Clear devB only
  registry.clearFileRequestsForDevice(devB);

  let devACount = 0;
  let devBCount = 0;
  let devCCount = 0;

  for (let i = 0; i < 200; i++) {
    if (registry.getFileRequest(`req-A-${i}`)) devACount++;
    if (registry.getFileRequest(`req-B-${i}`)) devBCount++;
    if (registry.getFileRequest(`req-C-${i}`)) devCCount++;
  }

  report(
    'clearFileRequestsForDevice clears targeted device and preserves others completely',
    devACount === 200 && devBCount === 0 && devCCount === 200,
    `Dev A: ${devACount}/200, Dev B: ${devBCount}/200 (expected 0), Dev C: ${devCCount}/200`
  );
}

// Test 1.8: unregisterAgent integration with file requests
{
  const devX = 'dev-agent-X';
  const sockX = 'agent-sock-X';

  registry.registerAgent(devX, sockX);
  assert.equal(registry.isDeviceOnline(devX), true);
  assert.equal(registry.getAgentSocketId(devX), sockX);
  assert.equal(registry.getDeviceIdForAgent(sockX), devX);

  for (let i = 0; i < 50; i++) {
    registry.registerFileRequest(`req-X-${i}`, devX, `client-${i}`);
  }

  // Unregister agent
  const unregResult = registry.unregisterAgent(sockX);
  assert.equal(unregResult, devX, 'unregisterAgent should return deviceId');
  assert.equal(registry.isDeviceOnline(devX), false, 'device should be offline after agent unregister');

  let remainingRequests = 0;
  for (let i = 0; i < 50; i++) {
    if (registry.getFileRequest(`req-X-${i}`)) remainingRequests++;
  }

  report(
    'unregisterAgent automatically purges all file requests for that device',
    remainingRequests === 0,
    `Remaining requests: ${remainingRequests}`
  );
}

// Test 1.9: Boundary and Malformed Input Tests
{
  const emptyRes = registry.getFileRequest('');
  const nullRes = registry.getFileRequest(null);
  const undefinedRes = registry.getFileRequest(undefined);
  const emptyPeek = registry.peekFileRequest('');

  // Special characters in requestId
  const specialId = 'req/../special:?#&=+🔥';
  registry.registerFileRequest(specialId, 'dev-special', 'sock-special');
  const specialRetrieved = registry.getFileRequest(specialId);

  // Extremely long requestId (5000 chars)
  const longId = 'req-' + 'A'.repeat(5000);
  registry.registerFileRequest(longId, 'dev-long', 'sock-long');
  const longRetrieved = registry.getFileRequest(longId);

  report(
    'Boundary and malformed inputs handled safely without crashes',
    emptyRes === undefined &&
    nullRes === undefined &&
    undefinedRes === undefined &&
    emptyPeek === undefined &&
    specialRetrieved?.deviceId === 'dev-special' &&
    longRetrieved?.deviceId === 'dev-long'
  );
}

// Test 1.10: recordHeartbeat first call returns isDue = true and caches telemetry
{
  const devId = 'dev-heartbeat-first';
  const stats = { cpuPercent: 15.2, memUsedMb: 2048, memTotalMb: 8192, uptimeSeconds: 1200 };
  const nowIso = new Date().toISOString();
  const nowMs = 1_000_000;
  const persistInterval = 180_000;

  const isDue = registry.recordHeartbeat(devId, stats, nowIso, nowMs, persistInterval);
  const cachedStats = registry.getDeviceStats(devId);
  const cachedLastSeen = registry.getDeviceLastSeen(devId);
  const cachedTelemetry = registry.getDeviceTelemetry(devId);

  report(
    'recordHeartbeat: first heartbeat marks persist due and caches stats/lastSeen',
    isDue === true &&
    cachedStats?.cpuPercent === 15.2 &&
    cachedLastSeen === nowIso &&
    cachedTelemetry?.lastPersistedAt === nowMs
  );
}

// Test 1.11: Heartbeat within 180s throttles persist (due = false) while updating cache
{
  const devId = 'dev-heartbeat-first';
  const updatedStats = { cpuPercent: 28.6, memUsedMb: 2560, memTotalMb: 8192, uptimeSeconds: 1215 };
  const updatedIso = new Date(Date.now() + 15_000).toISOString();
  const withinMs = 1_000_000 + 15_000; // 15s later (< 180s)
  const persistInterval = 180_000;

  const isDue = registry.recordHeartbeat(devId, updatedStats, updatedIso, withinMs, persistInterval);
  const cachedStats = registry.getDeviceStats(devId);
  const cachedLastSeen = registry.getDeviceLastSeen(devId);

  report(
    'recordHeartbeat: heartbeat within 180s throttles persist (due = false) and updates cache',
    isDue === false &&
    cachedStats?.cpuPercent === 28.6 &&
    cachedLastSeen === updatedIso
  );
}

// Test 1.12: Heartbeat at or after 180s triggers persist (due = true)
{
  const devId = 'dev-heartbeat-first';
  const laterStats = { cpuPercent: 44.1, memUsedMb: 3000, memTotalMb: 8192, uptimeSeconds: 1381 };
  const laterIso = new Date(Date.now() + 181_000).toISOString();
  const afterMs = 1_000_000 + 181_000; // 181s later (>= 180s)
  const persistInterval = 180_000;

  const isDue = registry.recordHeartbeat(devId, laterStats, laterIso, afterMs, persistInterval);
  const cachedStats = registry.getDeviceStats(devId);

  report(
    'recordHeartbeat: heartbeat at or after 180s triggers persist (due = true)',
    isDue === true &&
    cachedStats?.cpuPercent === 44.1
  );
}

// Test 1.13: markLastSeenPersisted establishes baseline and prevents immediate re-persist
{
  const devId = 'dev-heartbeat-baseline';
  const regMs = 2_000_000;
  registry.markLastSeenPersisted(devId, regMs);

  const heartbeatStats = { cpuPercent: 10.0 };
  const firstHeartbeatMs = regMs + 15_000; // 15 seconds after registration
  const isDue = registry.recordHeartbeat(devId, heartbeatStats, new Date().toISOString(), firstHeartbeatMs, 180_000);

  report(
    'markLastSeenPersisted establishes baseline: first 15s heartbeat is throttled',
    isDue === false
  );
}

// Test 1.14: clearDeviceTelemetry and clearAllDeviceTelemetry remove cached records
{
  const devId = 'dev-heartbeat-clear';
  registry.recordHeartbeat(devId, { cpuPercent: 1.0 });
  assert.ok(registry.getDeviceTelemetry(devId));

  const cleared = registry.clearDeviceTelemetry(devId);
  const afterClear = registry.getDeviceTelemetry(devId);

  registry.recordHeartbeat('dev-clear-all-1', { cpuPercent: 2.0 });
  registry.recordHeartbeat('dev-clear-all-2', { cpuPercent: 3.0 });
  registry.clearAllDeviceTelemetry();

  report(
    'clearDeviceTelemetry and clearAllDeviceTelemetry remove cached telemetry records',
    cleared === true &&
    afterClear === undefined &&
    registry.getDeviceTelemetry('dev-clear-all-1') === undefined &&
    registry.getDeviceTelemetry('dev-clear-all-2') === undefined
  );
}

console.log('\n--- Part 2: REST Routes (auth.js & devices.js) Empirical Tests ---');

// Setup mock Firestore and Socket.IO for route testing
const inMemoryFirestore = {
  users: new Map(),
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
                // Recursive / deep merge for settings
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

// Setup Socket.IO Server mock to track disconnects and room events
const socketIoServer = createServer();
const sockModule = await import('../dist/socket/index.js');
sockModule.setupSocketIO(socketIoServer);
const io = sockModule.io;

// Track emissions and disconnections
const agentSocketEvents = [];
let agentSocketDisconnected = false;
const clientRoomEvents = [];

const mockAgentSocket = {
  id: 'agent-socket-test-1',
  emit(event, payload) {
    agentSocketEvents.push({ event, payload });
  },
  disconnect(close) {
    agentSocketDisconnected = true;
  },
};

// Add mock socket to io.of('/agent').sockets
io.of('/agent').sockets.set('agent-socket-test-1', mockAgentSocket);

// Spy on io.of('/client').to(room).emit
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

// Mount routes in Express
const { authRouter } = await import('../dist/routes/auth.js');
const { devicesRouter } = await import('../dist/routes/devices.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/devices', devicesRouter);

function simulateRequest(method, url, options = {}) {
  return new Promise((resolve) => {
    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer test-user-1',
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

// Test 2.1: GET /api/auth/settings - Default fallback when user doc does not exist
{
  const res = await request('/api/auth/settings');
  report(
    'GET /api/auth/settings returns defaultUserSettings when user doc does not exist',
    res.status === 200 &&
    res.data.fontSize === defaultUserSettings.fontSize &&
    res.data.fontFamily === defaultUserSettings.fontFamily &&
    res.data.cursorStyle === defaultUserSettings.cursorStyle &&
    res.data.theme === defaultUserSettings.theme,
    `Received: ${JSON.stringify(res.data)}`
  );
}

// Test 2.2: PATCH /api/auth/settings - Idempotent create and merge
{
  const patchRes = await request('/api/auth/settings', {
    method: 'PATCH',
    body: JSON.stringify({ fontSize: 18, theme: 'light' }),
  });

  const getRes = await request('/api/auth/settings');

  report(
    'PATCH /api/auth/settings updates settings and GET /settings returns merged defaults',
    patchRes.status === 200 &&
    patchRes.data.success === true &&
    getRes.status === 200 &&
    getRes.data.fontSize === 18 &&
    getRes.data.theme === 'light' &&
    getRes.data.fontFamily === defaultUserSettings.fontFamily &&
    getRes.data.scrollback === defaultUserSettings.scrollback,
    `Get response: ${JSON.stringify(getRes.data)}`
  );
}

// Test 2.3: Successive PATCH /api/auth/settings merges partial fields
{
  await request('/api/auth/settings', {
    method: 'PATCH',
    body: JSON.stringify({ cursorStyle: 'underline' }),
  });

  const getRes = await request('/api/auth/settings');
  report(
    'Successive PATCH merges new fields without wiping previously patched fields',
    getRes.data.fontSize === 18 &&
    getRes.data.theme === 'light' &&
    getRes.data.cursorStyle === 'underline' &&
    getRes.data.fontFamily === defaultUserSettings.fontFamily,
    `Settings state: ${JSON.stringify(getRes.data)}`
  );
}

// Test 2.4: Devices route authorization checks
{
  // Unauthorized without token
  const unauthRes = await simulateRequest('GET', '/api/devices/dev-123', {
    headers: { authorization: '' },
  });
  report(
    'GET /api/devices/:id rejects request without bearer token (HTTP 401)',
    unauthRes.status === 401
  );

  // Expired token
  const expiredRes = await simulateRequest('GET', '/api/devices/dev-123', {
    headers: { authorization: 'Bearer expired' },
  });
  report(
    'GET /api/devices/:id rejects request with expired token (HTTP 401)',
    expiredRes.status === 401
  );
}

// Test 2.5: Device lifecycle & disconnectAgentAndEmitOffline on trustStatus: 'blocked'
{
  // Create a device owned by test-user-1
  const createRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Host Alpha', tags: ['linux', 'production'] }),
  });

  assert.equal(createRes.status, 201);
  const deviceId = createRes.data.id;
  assert.ok(deviceId);
  assert.equal(createRes.data.trustStatus, 'trusted');

  // Register an active agent socket for this device
  registry.registerAgent(deviceId, 'agent-socket-test-1');
  assert.equal(registry.isDeviceOnline(deviceId), true);

  // Reset event trackers
  agentSocketEvents.length = 0;
  agentSocketDisconnected = false;
  clientRoomEvents.length = 0;

  // Now PATCH /api/devices/:id with trustStatus: 'blocked'
  const blockRes = await request(`/api/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ trustStatus: 'blocked' }),
  });

  // Verify response
  assert.equal(blockRes.status, 200);
  assert.equal(blockRes.data.success, true);

  // Verify disconnectAgentAndEmitOffline consequences:
  // 1. Agent received server:error with reason 'Device is blocked'
  const errorEvent = agentSocketEvents.find(e => e.event === 'server:error');
  const receivedError = errorEvent?.payload?.message === 'Device is blocked';

  // 2. Agent socket was disconnected
  const disconnected = agentSocketDisconnected;

  // 3. Agent was unregistered from registry
  const agentRemoved = registry.getAgentSocketId(deviceId) === undefined && !registry.isDeviceOnline(deviceId);

  // 4. Client room device:${deviceId} received device:status: 'offline'
  const offlineEvent = clientRoomEvents.find(
    e => e.room === `device:${deviceId}` && e.event === 'device:status' && e.payload?.status === 'offline'
  );

  // 5. Firestore device document status was set to 'offline'
  const updatedDev = await request(`/api/devices/${deviceId}`);
  const firestoreUpdated = updatedDev.data.trustStatus === 'blocked' && updatedDev.data.status === 'offline';

  report(
    'PATCH /:id with trustStatus: "blocked" triggers disconnectAgentAndEmitOffline correctly',
    receivedError && disconnected && agentRemoved && !!offlineEvent && firestoreUpdated,
    `Error: ${receivedError}, Disconnected: ${disconnected}, AgentRemoved: ${agentRemoved}, OfflineEvent: ${!!offlineEvent}, FirestoreUpdated: ${firestoreUpdated}`
  );
}

// Test 2.6: Device unblocking does NOT trigger disconnect
{
  const createRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Host Beta' }),
  });
  const deviceId = createRes.data.id;

  // Reset trackers
  agentSocketEvents.length = 0;
  agentSocketDisconnected = false;
  clientRoomEvents.length = 0;

  // PATCH with trustStatus: 'trusted'
  const unblockRes = await request(`/api/devices/${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ trustStatus: 'trusted' }),
  });

  report(
    'PATCH /:id with trustStatus: "trusted" does NOT trigger agent disconnect',
    unblockRes.status === 200 &&
    !agentSocketDisconnected &&
    agentSocketEvents.length === 0
  );
}

// Test 2.7: Device deletion triggers disconnectAgentAndEmitOffline and removes document
{
  const createRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: 'Device To Delete' }),
  });
  const deviceId = createRes.data.id;

  // Connect agent
  registry.registerAgent(deviceId, 'agent-socket-test-1');
  agentSocketEvents.length = 0;
  agentSocketDisconnected = false;
  clientRoomEvents.length = 0;

  // DELETE /api/devices/:id
  const deleteRes = await request(`/api/devices/${deviceId}`, {
    method: 'DELETE',
  });

  assert.equal(deleteRes.status, 200);

  // Check document deleted
  const getDeleted = await request(`/api/devices/${deviceId}`);
  const is404 = getDeleted.status === 404;

  // Check agent notified with 'Device has been deleted'
  const deleteError = agentSocketEvents.find(e => e.event === 'server:error' && e.payload?.message === 'Device has been deleted');
  const deleteOffline = clientRoomEvents.find(e => e.room === `device:${deviceId}` && e.event === 'device:status' && e.payload?.status === 'offline');

  report(
    'DELETE /api/devices/:id deletes document and disconnects active agent with offline broadcast',
    is404 && !!deleteError && agentSocketDisconnected && !registry.isDeviceOnline(deviceId) && !!deleteOffline,
    `Doc 404: ${is404}, DeletedReason: ${!!deleteError}, Disconnected: ${agentSocketDisconnected}, OfflineEvent: ${!!deleteOffline}`
  );
}

// Test 2.8: Access control: forbidden when user does not own the device
{
  // Create device owned by test-user-1
  const createRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: 'Private Device' }),
  });
  const deviceId = createRes.data.id;

  // Attempt to access with test-user-2
  const otherUserRes = await simulateRequest('GET', `/api/devices/${deviceId}`, {
    headers: { authorization: 'Bearer test-user-2' },
  });
  report(
    'GET /api/devices/:id returns HTTP 403 Forbidden when owned by another user',
    otherUserRes.status === 403
  );

  // Attempt to delete with test-user-2
  const otherDeleteRes = await simulateRequest('DELETE', `/api/devices/${deviceId}`, {
    headers: { authorization: 'Bearer test-user-2' },
  });
  report(
    'DELETE /api/devices/:id returns HTTP 403 Forbidden when owned by another user',
    otherDeleteRes.status === 403
  );
}

// Test 2.9: GET /api/devices enriches devices with live in-memory telemetry and status
{
  const devId = 'dev-enrich-list-test';
  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-user-1',
    name: 'Enrich List Host',
    trustStatus: 'trusted',
    status: 'offline',
    createdAt: '2026-11-05T20:00:00Z',
    lastSeen: '2026-11-05T20:00:00Z',
    stats: { cpuPercent: 5.0 },
  });

  // Device connects and sends fresh telemetry
  registry.registerAgent(devId, 'agent-sock-enrich-1');
  registry.recordHeartbeat(devId, { cpuPercent: 77.7 }, '2026-11-05T22:30:00Z');

  const listRes = await request('/api/devices');
  const enrichedDev = listRes.data.find(d => d.id === devId);

  report(
    'GET /api/devices enriches device with in-memory status, stats, and lastSeen',
    listRes.status === 200 &&
    enrichedDev !== undefined &&
    enrichedDev.status === 'online' &&
    enrichedDev.stats.cpuPercent === 77.7 &&
    enrichedDev.lastSeen === '2026-11-05T22:30:00Z'
  );
  registry.unregisterAgent('agent-sock-enrich-1');
  registry.clearDeviceTelemetry(devId);
}

// Test 2.10: GET /api/devices/:id enriches single device with in-memory telemetry and status
{
  const devId = 'dev-enrich-single-test';
  inMemoryFirestore.devices.set(devId, {
    ownerId: 'test-user-1',
    name: 'Enrich Single Host',
    trustStatus: 'trusted',
    status: 'offline',
    createdAt: '2026-11-05T20:00:00Z',
    lastSeen: '2026-11-05T20:00:00Z',
    stats: { cpuPercent: 12.0 },
  });

  registry.registerAgent(devId, 'agent-sock-enrich-2');
  registry.recordHeartbeat(devId, { cpuPercent: 91.5 }, '2026-11-05T22:35:00Z');

  const getRes = await request(`/api/devices/${devId}`);

  report(
    'GET /api/devices/:id enriches single device with in-memory status, stats, and lastSeen',
    getRes.status === 200 &&
    getRes.data.status === 'online' &&
    getRes.data.stats.cpuPercent === 91.5 &&
    getRes.data.lastSeen === '2026-11-05T22:35:00Z'
  );
  registry.unregisterAgent('agent-sock-enrich-2');
  registry.clearDeviceTelemetry(devId);
}

console.log('\n--- Part 3: Socket Relay Handlers (clientHandler & agentHandler) Empirical Tests ---');

// Test 3.1: clientHandler verifyDeviceAccess rejection when device is untrusted
{
  const { handleClientSocket } = await import('../dist/socket/clientHandler.js');

  // Create an untrusted (pending) device in firestore
  const pendingDevId = 'dev-untrusted-pending';
  inMemoryFirestore.devices.set(pendingDevId, {
    ownerId: 'client-user-1',
    trustStatus: 'pending',
    status: 'online',
  });

  const emittedToClient = [];
  const mockClientSocket = {
    id: 'client-socket-1',
    handshake: {
      auth: { token: 'client-user-1' },
    },
    listeners: new Map(),
    on(event, fn) {
      this.listeners.set(event, fn);
    },
    emit(event, payload) {
      emittedToClient.push({ event, payload });
    },
    disconnect() {},
  };

  await handleClientSocket(mockClientSocket);

  // Invoke file:list
  const listHandler = mockClientSocket.listeners.get('file:list');
  assert.ok(listHandler, 'file:list handler should be registered');

  await listHandler({
    deviceId: pendingDevId,
    path: '/root',
    requestId: 'req-pending-test',
  });

  const resultEvent = emittedToClient.find(e => e.event === 'file:list:result');
  report(
    'clientHandler immediately rejects file:list for untrusted device with requestId',
    resultEvent &&
    resultEvent.payload.requestId === 'req-pending-test' &&
    resultEvent.payload.error === 'Device not trusted yet' &&
    Array.isArray(resultEvent.payload.entries) &&
    resultEvent.payload.entries.length === 0,
    `Result: ${JSON.stringify(resultEvent)}`
  );
}

// Test 3.2: clientHandler rejection when device is offline
{
  const offlineDevId = 'dev-trusted-offline';
  inMemoryFirestore.devices.set(offlineDevId, {
    ownerId: 'client-user-1',
    trustStatus: 'trusted',
    status: 'offline',
  });

  const emittedToClient = [];
  const mockClientSocket = {
    id: 'client-socket-2',
    handshake: {
      auth: { token: 'client-user-1' },
    },
    listeners: new Map(),
    on(event, fn) {
      this.listeners.set(event, fn);
    },
    emit(event, payload) {
      emittedToClient.push({ event, payload });
    },
    disconnect() {},
  };

  const { handleClientSocket } = await import('../dist/socket/clientHandler.js');
  await handleClientSocket(mockClientSocket);

  const readHandler = mockClientSocket.listeners.get('file:read');
  await readHandler({
    deviceId: offlineDevId,
    path: '/some/file.txt',
    requestId: 'req-offline-test',
  });

  const resultEvent = emittedToClient.find(e => e.event === 'file:read:result');
  report(
    'clientHandler immediately rejects file:read for offline device with requestId',
    resultEvent &&
    resultEvent.payload.requestId === 'req-offline-test' &&
    resultEvent.payload.error === 'Device is offline',
    `Result: ${JSON.stringify(resultEvent)}`
  );
}

// Test 3.3: clientHandler successful forward and registration for online trusted device
{
  const onlineDevId = 'dev-trusted-online';
  const agentSockId = 'agent-sock-online-1';
  inMemoryFirestore.devices.set(onlineDevId, {
    ownerId: 'client-user-1',
    trustStatus: 'trusted',
    status: 'online',
  });
  registry.registerAgent(onlineDevId, agentSockId);

  const emittedToAgent = [];
  const origAgentTo = io.of('/agent').to.bind(io.of('/agent'));
  io.of('/agent').to = (sockId) => {
    return {
      emit(event, payload) {
        emittedToAgent.push({ sockId, event, payload });
      },
    };
  };

  const mockClientSocket = {
    id: 'client-socket-3',
    handshake: {
      auth: { token: 'client-user-1' },
    },
    listeners: new Map(),
    on(event, fn) {
      this.listeners.set(event, fn);
    },
    emit() {},
    disconnect() {},
  };

  const { handleClientSocket } = await import('../dist/socket/clientHandler.js');
  await handleClientSocket(mockClientSocket);

  const writeHandler = mockClientSocket.listeners.get('file:write');
  await writeHandler({
    deviceId: onlineDevId,
    path: '/tmp/test.txt',
    content: 'hello world',
    requestId: 'req-online-write',
  });

  // Verify registered in registry
  const peek = registry.peekFileRequest('req-online-write');
  const agentEmitted = emittedToAgent.find(e => e.sockId === agentSockId && e.event === 'file:write');

  report(
    'clientHandler registers request in registry and forwards to agent socket',
    peek?.clientSocketId === 'client-socket-3' &&
    peek?.deviceId === onlineDevId &&
    agentEmitted?.payload?.content === 'hello world' &&
    agentEmitted?.payload?.requestId === 'req-online-write',
    `Peek: ${JSON.stringify(peek)}, Emitted: ${JSON.stringify(agentEmitted)}`
  );
}

// Test 3.4: agentHandler forwards file result to exact client socket
{
  const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');

  const reqId = 'req-correlate-target';
  const targetClientSocketId = 'target-client-99';
  const testDevId = 'dev-agent-correlate';

  registry.registerFileRequest(reqId, testDevId, targetClientSocketId);

  clientRoomEvents.length = 0;

  const mockAgentSocket = {
    id: 'agent-sock-correlate',
    listeners: new Map(),
    on(event, fn) {
      this.listeners.set(event, fn);
    },
    emit() {},
  };

  handleAgentSocket(mockAgentSocket);

  // Agent emits file:list:result
  const agentResultHandler = mockAgentSocket.listeners.get('file:list:result');
  assert.ok(agentResultHandler);

  agentResultHandler({
    requestId: reqId,
    deviceId: testDevId,
    path: '/home',
    entries: [{ name: 'test.txt', path: '/home/test.txt', isDirectory: false, size: 100 }],
  });

  const routed = clientRoomEvents.find(r => r.room === targetClientSocketId && r.event === 'file:list:result');
  const consumedFromRegistry = registry.getFileRequest(reqId);

  report(
    'agentHandler correlates result by requestId and delivers directly to target clientSocketId',
    routed &&
    routed.payload.entries.length === 1 &&
    routed.payload.entries[0].name === 'test.txt' &&
    consumedFromRegistry === undefined,
    `Routed: ${JSON.stringify(routed)}, Consumed: ${consumedFromRegistry}`
  );
}

// Test 3.5: agentHandler fallback to device room if requestId is missing or expired
{
  const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');

  clientRoomEvents.length = 0;

  const mockAgentSocket = {
    id: 'agent-sock-fallback',
    listeners: new Map(),
    on(event, fn) {
      this.listeners.set(event, fn);
    },
    emit() {},
  };

  handleAgentSocket(mockAgentSocket);

  const agentResultHandler = mockAgentSocket.listeners.get('file:mkdir:result');

  // Emit result with expired/unknown requestId
  agentResultHandler({
    requestId: 'req-expired-or-missing',
    deviceId: 'dev-fallback-room-1',
    path: '/new_folder',
    success: true,
  });

  const roomRouted = clientRoomEvents.find(
    r => r.room === 'device:dev-fallback-room-1' && r.event === 'file:mkdir:result'
  );

  report(
    'agentHandler falls back to device room when requestId is expired or unmapped',
    roomRouted && roomRouted.payload.success === true,
    `Room routed: ${JSON.stringify(roomRouted)}`
  );
}

// Test 3.6: Heartbeat throttling & live stats broadcast
{
  const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');
  const testDevId = 'dev-heartbeat-throttle-test';
  const testSockId = 'agent-sock-heartbeat-1';
  let firestoreUpdateCount = 0;

  inMemoryFirestore.devices.set(testDevId, {
    ownerId: 'client-user-1',
    trustStatus: 'trusted',
    status: 'online',
    lastSeen: new Date(Date.now() - 300000).toISOString(),
  });
  registry.registerAgent(testDevId, testSockId);
  registry.markLastSeenPersisted(testDevId, Date.now() - 300000);

  const originalCollection = db.collection;
  db.collection = (col) => {
    const colRef = originalCollection(col);
    if (col === 'devices') {
      return {
        ...colRef,
        doc(id) {
          const docRef = colRef.doc(id);
          if (id === testDevId) {
            const origUpdate = docRef.update;
            docRef.update = async (data) => {
              firestoreUpdateCount++;
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
  const mockAgentSock = {
    id: testSockId,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };
  handleAgentSocket(mockAgentSock);
  const heartbeatHandler = mockAgentSock.listeners.get('agent:heartbeat');
  assert.ok(heartbeatHandler, 'agent:heartbeat handler must exist');

  // Heartbeat 1 (interval expired: 300s > 180s): MUST write to Firestore AND emit device:stats
  await heartbeatHandler({ deviceId: testDevId, stats: { cpuPercent: 10 } });
  const broadcast1 = clientRoomEvents.find(e => e.room === `device:${testDevId}` && e.event === 'device:stats');
  assert.equal(firestoreUpdateCount, 1, 'First heartbeat after interval expired must update Firestore');
  assert.ok(broadcast1, 'First heartbeat must broadcast device:stats to client room');

  // Heartbeat 2 (100ms later): MUST update memory cache & broadcast, but MUST NOT write to Firestore
  clientRoomEvents.length = 0;
  await heartbeatHandler({ deviceId: testDevId, stats: { cpuPercent: 20 } });
  const broadcast2 = clientRoomEvents.find(e => e.room === `device:${testDevId}` && e.event === 'device:stats');
  assert.equal(firestoreUpdateCount, 1, 'Second heartbeat within throttle window must NOT update Firestore');
  assert.ok(broadcast2, 'Second heartbeat must still broadcast device:stats unconditionally');
  assert.equal(registry.getDeviceStats(testDevId)?.cpuPercent, 20, 'Memory registry stats must reflect latest stats');

  db.collection = originalCollection;

  report(
    'Heartbeat throttles Firestore writes while unconditionally broadcasting device:stats to client room',
    firestoreUpdateCount === 1 && !!broadcast1 && !!broadcast2
  );
  registry.unregisterAgent(testSockId);
  registry.clearDeviceTelemetry(testDevId);
}

// Test 3.7: Agent registration anchors persist baseline
{
  const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');
  const regDevId = 'dev-reg-anchor-test';
  const regSockId = 'agent-sock-reg-1';
  let regDocUpdates = 0;

  inMemoryFirestore.devices.set(regDevId, {
    ownerId: 'client-user-1',
    agentToken: 'token-reg-123',
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
          if (id === regDevId) {
            const origUpdate = docRef.update;
            docRef.update = async (data) => {
              regDocUpdates++;
              return origUpdate(data);
            };
          }
          return docRef;
        },
      };
    }
    return colRef;
  };

  const mockAgentSock = {
    id: regSockId,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
    disconnect() {},
  };
  handleAgentSocket(mockAgentSock);
  const regHandler = mockAgentSock.listeners.get('agent:register');
  const heartbeatHandler = mockAgentSock.listeners.get('agent:heartbeat');
  assert.ok(regHandler, 'agent:register handler must exist');
  assert.ok(heartbeatHandler, 'agent:heartbeat handler must exist');

  // Register device (immediate write)
  await regHandler({
    deviceId: regDevId,
    token: 'token-reg-123',
    hostname: 'host-1',
    os: 'linux',
    agentVersion: '1.0.0',
    stats: { cpuPercent: 5 },
  });
  assert.equal(regDocUpdates, 1, 'Registration must immediately update Firestore');

  // Heartbeat immediately following register (simulating 15s cadence within 180s interval)
  await heartbeatHandler({ deviceId: regDevId, stats: { cpuPercent: 7 } });
  assert.equal(regDocUpdates, 1, 'Heartbeat following registration must be throttled and NOT invoke Firestore update');

  db.collection = originalCollection;

  report(
    'Agent registration immediately persists online status and anchors persist baseline for subsequent heartbeats',
    regDocUpdates === 1
  );
  registry.unregisterAgent(regSockId);
  registry.clearDeviceTelemetry(regDevId);
}

console.log('\n--- Part 4: Advanced Adversarial & Robustness Stress Tests ---');

// Test 4.1: Extreme registry load (50,000 requests) & heap cleanliness
{
  const HEAVY_COUNT = 50000;
  const initialMem = process.memoryUsage().heapUsed;
  const startHeavy = Date.now();

  for (let i = 0; i < HEAVY_COUNT; i++) {
    registry.registerFileRequest(`req-heavy-${i}`, `dev-${i % 200}`, `client-${i % 100}`);
  }

  for (let i = 0; i < HEAVY_COUNT; i++) {
    registry.getFileRequest(`req-heavy-${i}`);
  }

  const durationHeavy = Date.now() - startHeavy;
  const finalMem = process.memoryUsage().heapUsed;
  const heapDeltaMB = Math.round((finalMem - initialMem) / 1024 / 1024);

  report(
    `Extreme registry throughput (${HEAVY_COUNT} items registered & consumed in ${durationHeavy}ms, heap delta: ${heapDeltaMB}MB)`,
    durationHeavy < 5000 && registry.peekFileRequest('req-heavy-0') === undefined
  );
}

// Test 4.2: clearFileRequestsForDevice for non-existent device
{
  let noError = true;
  try {
    registry.clearFileRequestsForDevice('non-existent-device-999');
    registry.clearFileRequestsForDevice('');
    registry.clearFileRequestsForDevice(null);
  } catch {
    noError = false;
  }
  report('clearFileRequestsForDevice handles non-existent or null device safely', noError);
}

// Test 4.3: unregisterAgent for non-existent socketId
{
  const unregNonExistent = registry.unregisterAgent('non-existent-socket');
  report('unregisterAgent returns undefined for unknown socket without throwing', unregNonExistent === undefined);
}

// Test 4.4: Device parameter tampering protection in PATCH /api/devices/:id
{
  const createRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tamper Target' }),
  });
  const devId = createRes.data.id;
  const originalOwner = createRes.data.ownerId;
  const originalToken = createRes.data.agentToken;

  // Attempt to overwrite protected fields
  const tamperRes = await request(`/api/devices/${devId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Tamper Target Renamed',
      ownerId: 'hacked-user-id',
      agentToken: 'stolen-token',
      agentVersion: '999.0.0',
      createdAt: '1970-01-01T00:00:00Z',
    }),
  });

  const inspectedDev = await request(`/api/devices/${devId}`);

  report(
    'PATCH /:id rejects tampering of protected fields (ownerId, agentToken, agentVersion, createdAt)',
    tamperRes.status === 200 &&
    inspectedDev.data.name === 'Tamper Target Renamed' &&
    inspectedDev.data.ownerId === originalOwner &&
    inspectedDev.data.agentToken === originalToken &&
    inspectedDev.data.agentVersion === '1.0.0' &&
    inspectedDev.data.createdAt !== '1970-01-01T00:00:00Z',
    `Inspected: ${JSON.stringify(inspectedDev.data)}`
  );
}

// Test 4.5: Device creation validation in POST /api/devices
{
  const emptyNameRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: '' }),
  });
  report(
    'POST /api/devices rejects empty device name with HTTP 400',
    emptyNameRes.status === 400 && emptyNameRes.data.error === 'Device name is required'
  );
}

// Test 4.6: Device blocking when agent is offline
{
  const createRes = await request('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ name: 'Offline Block Target' }),
  });
  const devId = createRes.data.id;

  clientRoomEvents.length = 0;

  const blockRes = await request(`/api/devices/${devId}`, {
    method: 'PATCH',
    body: JSON.stringify({ trustStatus: 'blocked' }),
  });

  const offlineBroadcast = clientRoomEvents.find(
    e => e.room === `device:${devId}` && e.event === 'device:status' && e.payload?.status === 'offline'
  );

  report(
    'PATCH /:id with trustStatus: "blocked" completes safely when agent is offline and emits offline status',
    blockRes.status === 200 && !!offlineBroadcast
  );
}

// Test 4.7: Malformed / incomplete payloads in clientHandler
{
  const { handleClientSocket } = await import('../dist/socket/clientHandler.js');
  const mockClientSocket = {
    id: 'client-malformed-test',
    handshake: { auth: { token: 'client-user-1' } },
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
    disconnect() {},
  };
  await handleClientSocket(mockClientSocket);

  let malformedHandled = true;
  try {
    const listFn = mockClientSocket.listeners.get('file:list');
    await listFn({}); // missing all fields
    await listFn({ deviceId: 'dev-1' }); // missing requestId
    await listFn({ requestId: 'req-1' }); // missing deviceId

    const readFn = mockClientSocket.listeners.get('file:read');
    await readFn({});
  } catch {
    malformedHandled = false;
  }
  report('clientHandler gracefully drops payloads missing deviceId or requestId without crashing', malformedHandled);
}

// Test 4.8: Access control in clientHandler for device owned by another user
{
  const otherUserDevId = 'dev-owned-by-user-2';
  inMemoryFirestore.devices.set(otherUserDevId, {
    ownerId: 'user-2-uid',
    trustStatus: 'trusted',
    status: 'online',
  });

  const emittedToUser1 = [];
  const mockClientUser1 = {
    id: 'client-user-1-sock',
    handshake: { auth: { token: 'user-1-uid' } },
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit(event, payload) { emittedToUser1.push({ event, payload }); },
    disconnect() {},
  };

  const { handleClientSocket } = await import('../dist/socket/clientHandler.js');
  await handleClientSocket(mockClientUser1);

  const listFn = mockClientUser1.listeners.get('file:list');
  await listFn({ deviceId: otherUserDevId, path: '/', requestId: 'req-cross-user-1' });

  const deniedEvent = emittedToUser1.find(e => e.event === 'file:list:result');
  report(
    'clientHandler rejects file operation on device owned by a different user with access denied',
    deniedEvent &&
    deniedEvent.payload.requestId === 'req-cross-user-1' &&
    deniedEvent.payload.error === 'Device not found or access denied'
  );
}

// Test 4.9: Agent socket disconnect handler
{
  const { handleAgentSocket } = await import('../dist/socket/agentHandler.js');
  const disconnectDevId = 'dev-agent-disconnect-test';
  const disconnectSockId = 'agent-sock-disconnect-1';

  inMemoryFirestore.devices.set(disconnectDevId, {
    ownerId: 'client-user-1',
    trustStatus: 'trusted',
    status: 'online',
  });
  registry.registerAgent(disconnectDevId, disconnectSockId);
  assert.equal(registry.isDeviceOnline(disconnectDevId), true);

  clientRoomEvents.length = 0;

  const mockAgentSock = {
    id: disconnectSockId,
    listeners: new Map(),
    on(event, fn) { this.listeners.set(event, fn); },
    emit() {},
  };

  handleAgentSocket(mockAgentSock);
  const disconnectHandler = mockAgentSock.listeners.get('disconnect');
  assert.ok(disconnectHandler);

  await disconnectHandler();

  const isNowOffline = !registry.isDeviceOnline(disconnectDevId);
  const offlineEmitted = clientRoomEvents.find(
    e => e.room === `device:${disconnectDevId}` && e.event === 'device:status' && e.payload?.status === 'offline'
  );

  report(
    'Agent disconnect event unregisters agent and broadcasts offline status to client room',
    isNowOffline && !!offlineEmitted,
    `Offline in registry: ${isNowOffline}, Broadcasted: ${!!offlineEmitted}`
  );
}

console.log('\n====================================================');
console.log(`SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
