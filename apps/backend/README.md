# @termix/backend

The Termix backend is a **Node.js + TypeScript** API server that acts as the central relay between web/mobile clients and remote device agents. It provides:

- **REST API** secured with Firebase ID tokens
- **WebSocket relay** via Socket.IO with two namespaces: `/client` (browser/app) and `/agent` (device daemons)
- **Firestore** persistence for users, devices, and terminal sessions

---

## Setup

### 1. Install dependencies

From the monorepo root:

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example file and fill in your Firebase credentials:

```bash
cp apps/backend/.env.example apps/backend/.env
```

| Variable | Description |
|---|---|
| `PORT` | Port to listen on (default `3001`) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK private key (keep the `\n` escapes) |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK client email |
| `FIREBASE_DATABASE_URL` | Realtime Database URL (used for admin init) |
| `AGENT_SECRET` | Shared secret for additional agent auth (future use) |
| `CLIENT_ORIGIN` | Allowed CORS origin for the web client |
| `NODE_ENV` | `development` or `production` |

### 3. Run in development mode

```bash
pnpm --filter @termix/backend dev
```

The server starts on `http://localhost:3001` with hot-reload via `tsx watch`.

### 4. Build for production

```bash
pnpm --filter @termix/backend build
pnpm --filter @termix/backend start
```

---

## REST API Endpoints

All endpoints (except `/health`) require a Firebase ID token in the `Authorization: Bearer <token>` header.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "ok", timestamp }` — no auth required |

### Auth (`/api/auth`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/me` | Create or retrieve the authenticated user's Firestore document |
| `PATCH` | `/api/auth/settings` | Update the user's settings object |

### Devices (`/api/devices`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/devices` | List all devices owned by the authenticated user |
| `GET` | `/api/devices/:id` | Get a single device |
| `PATCH` | `/api/devices/:id` | Update `name`, `tags`, or `trustStatus` |
| `DELETE` | `/api/devices/:id` | Remove a device |
| `POST` | `/api/devices/:id/token` | Generate a new agent token for the device |

### Sessions (`/api/sessions`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | List sessions for the authenticated user; filter by `?deviceId=` |

### Files (`/api/files`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files/list` | Placeholder — file operations happen over WebSocket |

---

## Socket.IO Namespaces & Events

The server exposes two Socket.IO namespaces on the same HTTP port.

### `/client` — Web / Mobile clients

Connect with a Firebase ID token:

```js
const socket = io('http://localhost:3001/client', {
  auth: { token: '<firebase-id-token>' },
})
```

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `device:subscribe` | `{ deviceId }` | Subscribe to live updates for a device |
| `device:unsubscribe` | `{ deviceId }` | Unsubscribe |
| `terminal:create` | `{ deviceId, cols?, rows? }` | Request a new terminal session |
| `terminal:input` | `{ sessionId, data }` | Send keystrokes to the terminal |
| `terminal:resize` | `{ sessionId, cols, rows }` | Resize the PTY |
| `terminal:close` | `{ sessionId }` | Close the terminal session |

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `device:status` | `{ deviceId, status }` | Online/offline status change |
| `device:stats` | `{ deviceId, stats }` | CPU/memory stats from heartbeat |
| `terminal:created` | `{ session }` | Session created successfully |
| `terminal:output` | `{ sessionId, data }` | PTY output (relay from agent) |
| `terminal:closed` | `{ sessionId }` | Terminal has been closed |
| `terminal:error` | `{ sessionId, message }` | Error creating/using terminal |

---

### `/agent` — Device Daemons

Agents connect and immediately send `agent:register` to authenticate.

#### Agent → Server

| Event | Payload | Description |
|---|---|---|
| `agent:register` | `{ deviceId, token, hostname, os, agentVersion, stats? }` | Authenticate and register the device |
| `agent:heartbeat` | `{ deviceId, stats }` | Periodic stats update |
| `agent:terminal:output` | `{ sessionId, data }` | PTY output to relay to the client |
| `agent:terminal:closed` | `{ sessionId }` | PTY has exited |

#### Server → Agent

| Event | Payload | Description |
|---|---|---|
| `server:terminal:create` | `{ sessionId, cols, rows }` | Spawn a new PTY |
| `server:terminal:input` | `{ sessionId, data }` | Forward keystrokes |
| `server:terminal:resize` | `{ sessionId, cols, rows }` | Resize the PTY |
| `server:terminal:close` | `{ sessionId }` | Kill the PTY |
| `server:error` | `{ message }` | Auth or protocol error |

---

## Architecture Overview

```
Browser / App
     │  (Firebase ID token)
     ▼
 Socket.IO /client ──┐
                      │   Termix Backend (this package)
 REST API ───────────┤   • Express routes
                      │   • In-memory registry (device ↔ socket)
 Socket.IO /agent ──┘   • Firestore (users, devices, sessions)
     ▲
     │  (agent token)
Device Daemon
```
