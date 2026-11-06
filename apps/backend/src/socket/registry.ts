import type { DeviceStats } from '@termix/shared'

// Maps deviceId → agent socket id
const deviceToAgent = new Map<string, string>()
// Maps agent socket id → deviceId
const agentToDevice = new Map<string, string>()
// Maps sessionId → { deviceId, clientSocketId, buffer: string[] }
interface SessionEntry {
  deviceId: string
  clientSocketId: string
  buffer: string[]
}
const sessions = new Map<string, SessionEntry>()

interface FileRequest {
  deviceId: string
  clientSocketId: string
  timer: NodeJS.Timeout
}
// Maps requestId → FileRequest
const fileRequests = new Map<string, FileRequest>()

export interface DeviceTelemetryEntry {
  stats?: DeviceStats | Record<string, unknown> | any
  lastSeen: string
  lastPersistedAt: number
}
// Maps deviceId → DeviceTelemetryEntry
const deviceTelemetry = new Map<string, DeviceTelemetryEntry>()

export const registry = {
  registerAgent(deviceId: string, socketId: string) {
    deviceToAgent.set(deviceId, socketId)
    agentToDevice.set(socketId, deviceId)
  },
  unregisterAgent(socketId: string) {
    const deviceId = agentToDevice.get(socketId)
    if (deviceId) {
      deviceToAgent.delete(deviceId)
      this.clearFileRequestsForDevice(deviceId)
    }
    agentToDevice.delete(socketId)
    return deviceId
  },
  getAgentSocketId(deviceId: string) {
    return deviceToAgent.get(deviceId)
  },
  getDeviceIdForAgent(socketId: string) {
    return agentToDevice.get(socketId)
  },
  registerSession(sessionId: string, deviceId: string, clientSocketId: string) {
    sessions.set(sessionId, { deviceId, clientSocketId, buffer: [] })
  },
  unregisterSession(sessionId: string) {
    sessions.delete(sessionId)
  },
  getSession(sessionId: string) {
    return sessions.get(sessionId)
  },
  updateSessionClient(sessionId: string, clientSocketId: string) {
    const s = sessions.get(sessionId)
    if (s) {
      s.clientSocketId = clientSocketId
      return true
    }
    return false
  },
  appendSessionOutput(sessionId: string, data: string) {
    const s = sessions.get(sessionId)
    if (s) {
      s.buffer.push(data)
      // Keep last 300 chunks (roughly 300KB) to prevent unbounded memory growth
      if (s.buffer.length > 300) {
        s.buffer.splice(0, s.buffer.length - 300)
      }
    }
  },
  getSessionBuffer(sessionId: string): string {
    const s = sessions.get(sessionId)
    return s ? s.buffer.join('') : ''
  },
  findActiveSessionForDevice(deviceId: string): { sessionId: string; entry: SessionEntry } | undefined {
    for (const [sessionId, entry] of sessions.entries()) {
      if (entry.deviceId === deviceId) {
        return { sessionId, entry }
      }
    }
    return undefined
  },
  isDeviceOnline(deviceId: string) {
    return deviceToAgent.has(deviceId)
  },

  // File request correlation with 30s timeout
  registerFileRequest(requestId: string, deviceId: string, clientSocketId: string) {
    const existing = fileRequests.get(requestId)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(() => {
      fileRequests.delete(requestId)
    }, 30_000)

    if (timer.unref) {
      timer.unref()
    }

    fileRequests.set(requestId, { deviceId, clientSocketId, timer })
  },

  getFileRequest(requestId: string) {
    if (!requestId) return undefined
    const req = fileRequests.get(requestId)
    if (!req) return undefined
    clearTimeout(req.timer)
    fileRequests.delete(requestId)
    return { deviceId: req.deviceId, clientSocketId: req.clientSocketId }
  },

  peekFileRequest(requestId: string) {
    if (!requestId) return undefined
    const req = fileRequests.get(requestId)
    if (!req) return undefined
    return { deviceId: req.deviceId, clientSocketId: req.clientSocketId }
  },

  clearFileRequestsForDevice(deviceId: string) {
    for (const [requestId, req] of fileRequests.entries()) {
      if (req.deviceId === deviceId) {
        clearTimeout(req.timer)
        fileRequests.delete(requestId)
      }
    }
  },

  // --- In-Memory Device Telemetry & Throttling Methods ---

  /**
   * Stores live device stats and lastSeen in memory.
   * Returns true if lastSeen should be persisted to Firestore (persisted periodically every 3-5 mins, or first time).
   */
  recordHeartbeat(
    deviceId: string,
    stats?: any,
    lastSeen: string = new Date().toISOString(),
    nowMs: number = Date.now(),
    persistIntervalMs: number = 180_000
  ): boolean {
    if (!deviceId) return false

    const existing = deviceTelemetry.get(deviceId)
    const lastPersistedAt = existing?.lastPersistedAt ?? 0
    const isDue =
      lastPersistedAt === 0 ||
      (nowMs - lastPersistedAt) >= persistIntervalMs ||
      nowMs < lastPersistedAt

    deviceTelemetry.set(deviceId, {
      stats: stats !== undefined ? stats : existing?.stats,
      lastSeen,
      lastPersistedAt: isDue ? nowMs : lastPersistedAt,
    })

    return isDue
  },

  /**
   * Retrieves latest cached live telemetry stats for a device.
   */
  getDeviceStats(deviceId: string): any {
    if (!deviceId) return undefined
    return deviceTelemetry.get(deviceId)?.stats
  },

  /**
   * Retrieves latest cached lastSeen ISO string for a device.
   */
  getDeviceLastSeen(deviceId: string): string | undefined {
    if (!deviceId) return undefined
    return deviceTelemetry.get(deviceId)?.lastSeen
  },

  /**
   * Retrieves complete cached telemetry entry (stats, lastSeen, lastPersistedAt).
   */
  getDeviceTelemetry(deviceId: string): DeviceTelemetryEntry | undefined {
    if (!deviceId) return undefined
    const entry = deviceTelemetry.get(deviceId)
    if (!entry) return undefined
    return { ...entry }
  },

  /**
   * Marks that a device's lastSeen timestamp was persisted to Firestore.
   */
  markLastSeenPersisted(
    deviceId: string,
    timestampMs: number = Date.now(),
    lastSeen: string = new Date(timestampMs).toISOString()
  ): void {
    if (!deviceId) return
    const existing = deviceTelemetry.get(deviceId)
    deviceTelemetry.set(deviceId, {
      stats: existing?.stats,
      lastSeen: lastSeen ?? existing?.lastSeen ?? new Date(timestampMs).toISOString(),
      lastPersistedAt: timestampMs,
    })
  },

  /**
   * Clears telemetry for a specific device (e.g., when device is deleted).
   */
  clearDeviceTelemetry(deviceId: string): boolean {
    if (!deviceId) return false
    return deviceTelemetry.delete(deviceId)
  },

  /**
   * Clears all telemetry records (useful for test isolation).
   */
  clearAllDeviceTelemetry(): void {
    deviceTelemetry.clear()
  },
}
