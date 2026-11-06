import { Router } from 'express'
import { authenticate, type AuthRequest } from '../middleware/authenticate.js'
import { db, retryFirestore } from '../lib/firebase.js'
import { registry } from '../socket/registry.js'
import { io } from '../socket/index.js'

export const sessionsRouter = Router()
sessionsRouter.use(authenticate)

// List sessions for the authenticated user with enriched device info & live status
sessionsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { deviceId } = req.query
    let query = db.collection('sessions').where('userId', '==', req.uid)
    if (deviceId) query = query.where('deviceId', '==', deviceId) as any
    const snap = await retryFirestore(() => query.limit(100).get())

    // Fetch user's devices to map deviceId -> device info
    const devicesSnap = await retryFirestore(() => db.collection('devices').where('ownerId', '==', req.uid).get())
    const deviceMap = new Map<string, { name: string; isOnline: boolean; os?: string; distro?: string; distroId?: string }>()
    devicesSnap.docs.forEach((doc) => {
      const dev = doc.data()
      deviceMap.set(doc.id, {
        name: dev.name || 'Unnamed Device',
        isOnline: registry.isDeviceOnline(doc.id),
        os: dev.os,
        distro: dev.distro,
        distroId: dev.distroId,
      })
    })

    const sessions = snap.docs.map((d) => {
      const data = d.data()
      const liveSession = registry.getSession(d.id)
      const devInfo = deviceMap.get(data.deviceId)
      return {
        id: d.id,
        ...data,
        deviceName: devInfo?.name || 'Unknown Device',
        isDeviceOnline: devInfo?.isOnline || false,
        os: devInfo?.os,
        distro: devInfo?.distro,
        distroId: devInfo?.distroId,
        // Live status: active if currently running in registry, otherwise fallback to stored status
        status: liveSession ? 'active' : data.status || 'closed',
      }
    })

    sessions.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    res.json(sessions)
  } catch (err) {
    console.error('Failed to fetch sessions:', err)
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

// Terminate / Kill a specific terminal session
sessionsRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const sessionId = req.params.id
    const docRef = db.collection('sessions').doc(sessionId)
    const snap = await docRef.get()

    if (!snap.exists || snap.data()?.userId !== req.uid) {
      return res.status(404).json({ error: 'Session not found or access denied' })
    }

    const sessionData = snap.data()
    const deviceId = sessionData?.deviceId

    // If running on agent, instruct agent to terminate shell process
    if (deviceId) {
      const agentSocketId = registry.getAgentSocketId(deviceId)
      if (agentSocketId && io) {
        io.of('/agent').to(agentSocketId).emit('server:terminal:close', { sessionId })
      }
    }

    // Notify connected web client if any
    const liveSession = registry.getSession(sessionId)
    if (liveSession && io) {
      io.of('/client').to(liveSession.clientSocketId).emit('terminal:closed', { sessionId })
    }

    registry.unregisterSession(sessionId)

    await docRef.update({
      status: 'closed',
      closedAt: new Date().toISOString(),
    })

    res.json({ success: true, message: `Session ${sessionId} closed` })
  } catch (err) {
    console.error('Failed to close session:', err)
    res.status(500).json({ error: 'Failed to close session' })
  }
})
