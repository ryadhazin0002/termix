import type { Socket } from 'socket.io'
import { registry } from './registry.js'
import { auth } from '../lib/firebase.js'
import { db } from '../lib/firebase.js'
import { io } from './index.js'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from '@termix/shared'

export async function handleClientSocket(socket: Socket) {
  console.log(`[client] connected: ${socket.id}`)

  // Verify Firebase token
  const token = socket.handshake.auth.token as string | undefined
  if (!token) {
    socket.disconnect(true)
    return
  }

  let uid: string
  try {
    const decoded = await auth.verifyIdToken(token)
    uid = decoded.uid
  } catch {
    console.log(`[client] invalid token: ${socket.id}`)
    socket.disconnect(true)
    return
  }

  socket.on('device:subscribe', ({ deviceId }: { deviceId: string }) => {
    // Verify ownership before subscribing (async, best-effort)
    db.collection('devices').doc(deviceId).get().then(snap => {
      if (snap.exists && snap.data()?.ownerId === uid) {
        socket.join(`device:${deviceId}`)
        // Send current online status
        socket.emit('device:status', {
          deviceId,
          status: registry.isDeviceOnline(deviceId) ? 'online' : 'offline',
        })
      }
    })
  })

  socket.on('device:unsubscribe', ({ deviceId }: { deviceId: string }) => {
    socket.leave(`device:${deviceId}`)
  })

  socket.on('terminal:create', async (payload: {
    deviceId: string
    cols?: number
    rows?: number
    sessionId?: string
    forceNew?: boolean
  }) => {
    const { deviceId, cols = DEFAULT_TERMINAL_COLS, rows = DEFAULT_TERMINAL_ROWS, sessionId: requestedSessionId, forceNew = false } = payload

    // Check device trust & ownership
    const snap = await db.collection('devices').doc(deviceId).get()
    if (!snap.exists || snap.data()?.ownerId !== uid) {
      socket.emit('terminal:error', { sessionId: '', message: 'Device not found or access denied' })
      return
    }
    if (snap.data()?.trustStatus !== 'trusted') {
      socket.emit('terminal:error', { sessionId: '', message: 'Device not trusted yet' })
      return
    }

    const agentSocketId = registry.getAgentSocketId(deviceId)
    if (!agentSocketId) {
      socket.emit('terminal:error', { sessionId: '', message: 'Device is offline' })
      return
    }

    // Check if we should resume an existing active session
    let targetSessionId = requestedSessionId
    if (!targetSessionId && !forceNew) {
      const active = registry.findActiveSessionForDevice(deviceId)
      if (active) {
        targetSessionId = active.sessionId
      }
    }

    if (targetSessionId && registry.getSession(targetSessionId)) {
      // Resume existing running session
      registry.updateSessionClient(targetSessionId, socket.id)
      const sessionDoc = await db.collection('sessions').doc(targetSessionId).get()
      const session = sessionDoc.exists ? { id: targetSessionId, ...sessionDoc.data() } : {
        id: targetSessionId,
        deviceId,
        userId: uid,
        status: 'active',
        createdAt: new Date().toISOString(),
        cols,
        rows,
      }

      socket.emit('terminal:created', { session, resumed: true })

      // Replay buffered scrollback output so the user sees their shell immediately
      const history = registry.getSessionBuffer(targetSessionId)
      if (history) {
        socket.emit('terminal:output', { sessionId: targetSessionId, data: history })
      }
      return
    }

    const sessionId = uuidv4()
    const session = {
      id: sessionId,
      deviceId,
      userId: uid,
      status: 'active',
      createdAt: new Date().toISOString(),
      cols,
      rows,
    }

    // Persist session
    await db.collection('sessions').doc(sessionId).set(session)
    registry.registerSession(sessionId, deviceId, socket.id)

    // Tell agent to spawn terminal
    io.of('/agent').to(agentSocketId).emit('server:terminal:create', { sessionId, cols, rows })
    socket.emit('terminal:created', { session })
  })

  socket.on('terminal:input', (payload: { sessionId: string; data: string }) => {
    const session = registry.getSession(payload.sessionId)
    if (!session) return
    const agentSocketId = registry.getAgentSocketId(session.deviceId)
    if (!agentSocketId) return
    io.of('/agent').to(agentSocketId).emit('server:terminal:input', payload)
  })

  socket.on('terminal:resize', (payload: { sessionId: string; cols: number; rows: number }) => {
    const session = registry.getSession(payload.sessionId)
    if (!session) return
    const agentSocketId = registry.getAgentSocketId(session.deviceId)
    if (!agentSocketId) return
    io.of('/agent').to(agentSocketId).emit('server:terminal:resize', payload)
  })

  socket.on('terminal:close', (payload: { sessionId: string }) => {
    const session = registry.getSession(payload.sessionId)
    if (!session) return
    const agentSocketId = registry.getAgentSocketId(session.deviceId)
    if (agentSocketId) {
      io.of('/agent').to(agentSocketId).emit('server:terminal:close', payload)
    }
    registry.unregisterSession(payload.sessionId)
    db.collection('sessions').doc(payload.sessionId).update({
      status: 'closed',
      closedAt: new Date().toISOString(),
    }).catch(() => {})
  })

  // Helper to verify device ownership, trust, and online status for file operations
  async function verifyDeviceAccess(deviceId: string): Promise<
    { ok: true; agentSocketId: string } | { ok: false; error: string }
  > {
    try {
      const snap = await db.collection('devices').doc(deviceId).get()
      if (!snap.exists || snap.data()?.ownerId !== uid) {
        return { ok: false, error: 'Device not found or access denied' }
      }
      if (snap.data()?.trustStatus !== 'trusted') {
        return { ok: false, error: 'Device not trusted yet' }
      }
      const agentSocketId = registry.getAgentSocketId(deviceId)
      if (!agentSocketId) {
        return { ok: false, error: 'Device is offline' }
      }
      return { ok: true, agentSocketId }
    } catch (err) {
      console.error(`[client] error verifying device ${deviceId}:`, err)
      return { ok: false, error: 'Internal server error verifying device' }
    }
  }

  // --- Remote File Operations ---
  socket.on('file:list', async (payload: { deviceId: string; path?: string; requestId: string }) => {
    const { deviceId, path = '', requestId } = payload
    if (!deviceId || !requestId) return

    const check = await verifyDeviceAccess(deviceId)
    if (!check.ok) {
      socket.emit('file:list:result', {
        deviceId,
        path,
        entries: [],
        error: check.error,
        requestId,
      })
      return
    }

    registry.registerFileRequest(requestId, deviceId, socket.id)
    io.of('/agent').to(check.agentSocketId).emit('file:list', {
      deviceId,
      path,
      requestId,
    })
  })

  socket.on('file:read', async (payload: { deviceId: string; path: string; requestId: string }) => {
    const { deviceId, path, requestId } = payload
    if (!deviceId || !requestId) return

    const check = await verifyDeviceAccess(deviceId)
    if (!check.ok) {
      socket.emit('file:read:result', {
        deviceId,
        path,
        error: check.error,
        requestId,
      })
      return
    }

    registry.registerFileRequest(requestId, deviceId, socket.id)
    io.of('/agent').to(check.agentSocketId).emit('file:read', {
      deviceId,
      path,
      requestId,
    })
  })

  socket.on('file:write', async (payload: { deviceId: string; path: string; content: string; requestId: string }) => {
    const { deviceId, path, content, requestId } = payload
    if (!deviceId || !requestId) return

    const check = await verifyDeviceAccess(deviceId)
    if (!check.ok) {
      socket.emit('file:write:result', {
        deviceId,
        path,
        success: false,
        error: check.error,
        requestId,
      })
      return
    }

    registry.registerFileRequest(requestId, deviceId, socket.id)
    io.of('/agent').to(check.agentSocketId).emit('file:write', {
      deviceId,
      path,
      content,
      requestId,
    })
  })

  socket.on('file:delete', async (payload: { deviceId: string; path: string; requestId: string }) => {
    const { deviceId, path, requestId } = payload
    if (!deviceId || !requestId) return

    const check = await verifyDeviceAccess(deviceId)
    if (!check.ok) {
      socket.emit('file:delete:result', {
        deviceId,
        path,
        success: false,
        error: check.error,
        requestId,
      })
      return
    }

    registry.registerFileRequest(requestId, deviceId, socket.id)
    io.of('/agent').to(check.agentSocketId).emit('file:delete', {
      deviceId,
      path,
      requestId,
    })
  })

  socket.on('file:mkdir', async (payload: { deviceId: string; path: string; requestId: string }) => {
    const { deviceId, path, requestId } = payload
    if (!deviceId || !requestId) return

    const check = await verifyDeviceAccess(deviceId)
    if (!check.ok) {
      socket.emit('file:mkdir:result', {
        deviceId,
        path,
        success: false,
        error: check.error,
        requestId,
      })
      return
    }

    registry.registerFileRequest(requestId, deviceId, socket.id)
    io.of('/agent').to(check.agentSocketId).emit('file:mkdir', {
      deviceId,
      path,
      requestId,
    })
  })

  socket.on('disconnect', () => {
    console.log(`[client] disconnected: ${socket.id}`)
  })
}
