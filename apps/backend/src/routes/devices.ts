import { Router } from 'express'
import { authenticate, type AuthRequest } from '../middleware/authenticate.js'
import { db, retryFirestore } from '../lib/firebase.js'
import { v4 as uuidv4 } from 'uuid'
import { registry } from '../socket/registry.js'
import { io } from '../socket/index.js'

export const devicesRouter = Router()
devicesRouter.use(authenticate)

function disconnectAgentAndEmitOffline(deviceId: string, reason: string) {
  const agentSocketId = registry.getAgentSocketId(deviceId)
  if (agentSocketId) {
    const agentSocket = io?.of('/agent')?.sockets?.get(agentSocketId)
    if (agentSocket) {
      agentSocket.emit('server:error', { message: reason })
      agentSocket.disconnect(true)
    }
    registry.unregisterAgent(agentSocketId)
  }
  io?.of('/client')?.to(`device:${deviceId}`)?.emit('device:status', {
    deviceId,
    status: 'offline',
  })
}

// List all devices for the logged-in user
devicesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.uid) {
      return res.status(401).json({ error: 'Unauthorized: missing user ID' })
    }
    const snap = await retryFirestore(() =>
      db.collection('devices')
        .where('ownerId', '==', req.uid)
        .get()
    )
    const devices = snap.docs.map(d => {
      const data = d.data()
      const stats = registry.getDeviceStats(d.id) ?? data.stats
      const lastSeen = registry.getDeviceLastSeen(d.id) ?? data.lastSeen
      return {
        id: d.id,
        ...data,
        status: registry.isDeviceOnline(d.id) ? 'online' : 'offline',
        ...(stats !== undefined ? { stats } : {}),
        ...(lastSeen !== undefined ? { lastSeen } : {}),
      }
    })
    devices.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    res.json(devices)
  } catch (err: any) {
    console.error('Failed to fetch devices:', err)
    res.status(500).json({
      error: err?.message ? `Firestore error: ${err.message}` : 'Failed to fetch devices',
      details: err?.details,
    })
  }
})

// Create a new device
devicesRouter.post('/', async (req: AuthRequest, res) => {
  try {
    if (!req.uid) {
      return res.status(401).json({ error: 'Unauthorized: missing user ID' })
    }
    const { name, tags = [] } = req.body
    if (!name) return res.status(400).json({ error: 'Device name is required' })

    const agentToken = uuidv4()
    const now = new Date().toISOString()
    const deviceData = {
      name,
      tags: Array.isArray(tags) ? tags : [],
      os: 'unknown',
      status: 'offline',
      trustStatus: 'trusted',
      ownerId: req.uid,
      agentToken,
      agentVersion: '1.0.0',
      hostname: '',
      createdAt: now,
      lastSeen: now,
    }

    const docRef = await retryFirestore(() => db.collection('devices').add(deviceData))
    res.status(201).json({ id: docRef.id, ...deviceData })
  } catch (err: any) {
    console.error('Error creating device:', err)
    res.status(500).json({
      error: err?.message ? `Firestore error: ${err.message}` : 'Failed to create device',
      details: err?.details,
    })
  }
})

// Get a single device
devicesRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const snap = await retryFirestore(() => db.collection('devices').doc(req.params.id).get())
    if (!snap.exists) return res.status(404).json({ error: 'Device not found' })
    const data = snap.data()!
    if (data.ownerId !== req.uid) return res.status(403).json({ error: 'Forbidden' })
    const stats = registry.getDeviceStats(snap.id) ?? data.stats
    const lastSeen = registry.getDeviceLastSeen(snap.id) ?? data.lastSeen
    res.json({
      id: snap.id,
      ...data,
      status: registry.isDeviceOnline(snap.id) ? 'online' : 'offline',
      ...(stats !== undefined ? { stats } : {}),
      ...(lastSeen !== undefined ? { lastSeen } : {}),
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch device' })
  }
})

// Update device (name, tags, trustStatus)
devicesRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const snap = await retryFirestore(() => db.collection('devices').doc(req.params.id).get())
    if (!snap.exists) return res.status(404).json({ error: 'Device not found' })
    if (snap.data()!.ownerId !== req.uid) return res.status(403).json({ error: 'Forbidden' })
    const allowed = ['name', 'tags', 'trustStatus']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in req.body) update[key] = req.body[key]
    }

    if (update.trustStatus === 'blocked') {
      update.status = 'offline'
      disconnectAgentAndEmitOffline(req.params.id, 'Device is blocked')
    }

    await db.collection('devices').doc(req.params.id).update(update)
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to update device' })
  }
})

// Delete a device
devicesRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const snap = await retryFirestore(() => db.collection('devices').doc(req.params.id).get())
    if (!snap.exists) return res.status(404).json({ error: 'Device not found' })
    if (snap.data()!.ownerId !== req.uid) return res.status(403).json({ error: 'Forbidden' })

    await db.collection('devices').doc(req.params.id).delete()
    disconnectAgentAndEmitOffline(req.params.id, 'Device has been deleted')
    registry.clearDeviceTelemetry(req.params.id)

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to delete device' })
  }
})

// Generate an agent token for a device
devicesRouter.post('/:id/token', async (req: AuthRequest, res) => {
  try {
    const snap = await retryFirestore(() => db.collection('devices').doc(req.params.id).get())
    if (!snap.exists) return res.status(404).json({ error: 'Device not found' })
    if (snap.data()!.ownerId !== req.uid) return res.status(403).json({ error: 'Forbidden' })
    // Simple token: in production use JWT with expiry
    const token = uuidv4()
    await db.collection('devices').doc(req.params.id).update({ agentToken: token })
    res.json({ token })
  } catch {
    res.status(500).json({ error: 'Failed to generate token' })
  }
})
