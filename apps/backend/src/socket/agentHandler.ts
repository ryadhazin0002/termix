import type { Socket } from 'socket.io'
import { registry } from './registry.js'
import { db } from '../lib/firebase.js'
import { io } from './index.js'

export async function handleAgentSocket(socket: Socket) {
  console.log(`[agent] connected: ${socket.id}`)

  // Agent must authenticate with its token within 10 seconds
  const authTimeout = setTimeout(() => {
    console.log(`[agent] auth timeout: ${socket.id}`)
    socket.disconnect(true)
  }, 10_000)

  socket.on('agent:register', async (payload: {
    deviceId: string
    token: string
    name: string
    hostname: string
    os: string
    distro?: string
    distroId?: string
    osVersion?: string
    agentVersion: string
    stats?: object
  }) => {
    try {
      clearTimeout(authTimeout)
      const { deviceId, token, ...info } = payload
      console.log(`[agent] registering device: ${deviceId} (${info.distro || info.os || 'unknown'})`)

      // Verify token against Firestore
      const deviceRef = db.collection('devices').doc(deviceId)
      const snap = await deviceRef.get()
      if (!snap.exists || snap.data()?.agentToken !== token) {
        console.warn(`[agent] token mismatch or device not found for ${deviceId}`)
        socket.emit('server:error', { message: 'Invalid device token' })
        socket.disconnect(true)
        return
      }
      if (snap.data()?.trustStatus === 'blocked') {
        socket.emit('server:error', { message: 'Device is blocked' })
        socket.disconnect(true)
        return
      }

      // Update device status and OS telemetry
      const nowIso = new Date().toISOString()
      const nowMs = Date.now()
      await deviceRef.update({
        status: 'online',
        lastSeen: nowIso,
        hostname: info.hostname,
        os: info.os || 'unknown',
        ...(info.distro ? { distro: info.distro } : {}),
        ...(info.distroId ? { distroId: info.distroId } : {}),
        ...(info.osVersion ? { osVersion: info.osVersion } : {}),
        agentVersion: info.agentVersion,
      })

      registry.registerAgent(deviceId, socket.id)
      registry.markLastSeenPersisted(deviceId, nowMs, nowIso)
      if (info.stats) {
        const persistInterval = parseInt(process.env.DEVICE_LAST_SEEN_PERSIST_INTERVAL_MS ?? '180000', 10)
        registry.recordHeartbeat(deviceId, info.stats, nowIso, nowMs, persistInterval)
      }

      // Notify all clients subscribed to this device with complete OS info
      io.of('/client').to(`device:${deviceId}`).emit('device:status', {
        deviceId,
        status: 'online',
        os: info.os,
        distro: info.distro,
        distroId: info.distroId,
        osVersion: info.osVersion,
      })

      console.log(`[agent] registered: device=${deviceId}`)
    } catch (err) {
      console.error('[agent] register error', err)
      socket.disconnect(true)
    }
  })

  socket.on('agent:heartbeat', async (payload: { deviceId?: string; stats?: object }) => {
    try {
      const deviceId = payload?.deviceId || registry.getDeviceIdForAgent(socket.id)
      if (!deviceId) return
      const stats = payload?.stats ?? {}

      const nowIso = new Date().toISOString()
      const nowMs = Date.now()
      const persistInterval = parseInt(process.env.DEVICE_LAST_SEEN_PERSIST_INTERVAL_MS ?? '180000', 10)

      // 1. Store live stats and lastSeen in memory registry and check if periodic persist is due
      const shouldPersist = registry.recordHeartbeat(deviceId, stats, nowIso, nowMs, persistInterval)

      // 2. Real-time stats must continue to be broadcast to clients via WebSockets unconditionally
      io.of('/client').to(`device:${deviceId}`).emit('device:stats', { deviceId, stats })

      // 3. Persist to Firestore only periodically (every 3 to 5 minutes)
      if (shouldPersist) {
        await db.collection('devices').doc(deviceId).update({
          lastSeen: nowIso,
          stats,
        }).catch((err) => {
          console.warn(`[agent] failed to persist throttled lastSeen for ${deviceId}:`, err)
        })
      }
    } catch (err) {
      console.error(`[agent] error handling heartbeat for ${socket.id}:`, err)
    }
  })

  socket.on('agent:terminal:output', (payload: { sessionId: string; data: string }) => {
    registry.appendSessionOutput(payload.sessionId, payload.data)
    const session = registry.getSession(payload.sessionId)
    if (!session) return
    io.of('/client').to(session.clientSocketId).emit('terminal:output', payload)
  })

  socket.on('agent:terminal:closed', (payload: { sessionId: string }) => {
    const session = registry.getSession(payload.sessionId)
    if (session) {
      io.of('/client').to(session.clientSocketId).emit('terminal:closed', payload)
      registry.unregisterSession(payload.sessionId)
    }
    db.collection('sessions').doc(payload.sessionId).update({
      status: 'closed',
      closedAt: new Date().toISOString(),
    }).catch(() => {})
  })

  // Helper to forward file operation results to client socket or device room fallback
  function forwardFileResult(
    eventName: string,
    payload: { requestId?: string; deviceId?: string; [key: string]: unknown }
  ) {
    const deviceId = payload.deviceId || registry.getDeviceIdForAgent(socket.id)
    const resultPayload = deviceId && !payload.deviceId ? { ...payload, deviceId } : payload

    const req = payload.requestId ? registry.getFileRequest(payload.requestId) : undefined
    if (req) {
      io.of('/client').to(req.clientSocketId).emit(eventName, resultPayload)
    } else if (deviceId) {
      io.of('/client').to(`device:${deviceId}`).emit(eventName, resultPayload)
    }
  }

  // --- Remote File Operation Results ---
  socket.on('file:list:result', (payload: { requestId?: string; deviceId?: string; [key: string]: unknown }) =>
    forwardFileResult('file:list:result', payload)
  )
  socket.on('file:read:result', (payload: { requestId?: string; deviceId?: string; [key: string]: unknown }) =>
    forwardFileResult('file:read:result', payload)
  )
  socket.on('file:write:result', (payload: { requestId?: string; deviceId?: string; [key: string]: unknown }) =>
    forwardFileResult('file:write:result', payload)
  )
  socket.on('file:delete:result', (payload: { requestId?: string; deviceId?: string; [key: string]: unknown }) =>
    forwardFileResult('file:delete:result', payload)
  )
  socket.on('file:mkdir:result', (payload: { requestId?: string; deviceId?: string; [key: string]: unknown }) =>
    forwardFileResult('file:mkdir:result', payload)
  )

  socket.on('disconnect', async () => {
    const deviceId = registry.unregisterAgent(socket.id)
    if (deviceId) {
      const nowIso = new Date().toISOString()
      const nowMs = Date.now()
      await db.collection('devices').doc(deviceId).update({
        status: 'offline',
        lastSeen: nowIso,
      }).catch((err) => {
        console.warn(`[agent] failed to persist offline status for ${deviceId}:`, err)
      })
      registry.markLastSeenPersisted(deviceId, nowMs, nowIso)

      io.of('/client').to(`device:${deviceId}`).emit('device:status', {
        deviceId,
        status: 'offline',
      })
      console.log(`[agent] disconnected: device=${deviceId}`)
    }
  })
}
