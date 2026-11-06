import test, { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Device, DeviceStatus, DeviceStats } from '@termix/shared'
import { useDevicesStore } from '../store/devices'
import { EventEmitter } from 'node:events'

// Simulated Socket.IO client interface for event tracking
interface EmittedEvent {
  event: string
  payload: any
}

class MockSocket extends EventEmitter {
  emitted: EmittedEvent[] = []

  emit(event: string, ...args: any[]): boolean {
    this.emitted.push({ event, payload: args[0] })
    return super.emit(event, ...args)
  }

  // Count emissions of a specific event
  countEmitted(eventName: string): number {
    return this.emitted.filter((e) => e.event === eventName).length
  }

  getEmissions(eventName: string): EmittedEvent[] {
    return this.emitted.filter((e) => e.event === eventName)
  }
}

/**
 * Harness simulating the exact React effect lifecycle of DashboardPage
 */
class DashboardSubscriptionHarness {
  private socket: MockSocket
  private token: string | null = null
  private cleanupListeners: (() => void) | null = null
  private cleanupSubscriptions: (() => void) | null = null
  private prevDeviceIdsKey: string | null = null

  constructor(socket: MockSocket) {
    this.socket = socket
  }

  mount(token: string) {
    this.token = token
    this.runListenersEffect()
    this.runSubscriptionsEffect()
  }

  unmount() {
    if (this.cleanupSubscriptions) {
      this.cleanupSubscriptions()
      this.cleanupSubscriptions = null
    }
    if (this.cleanupListeners) {
      this.cleanupListeners()
      this.cleanupListeners = null
    }
    this.prevDeviceIdsKey = null
    this.token = null
  }

  // Effect 2: Real-time Socket.IO listeners for status and stats updates
  private runListenersEffect() {
    if (!this.token) return
    const socket = this.socket
    const updateDevice = useDevicesStore.getState().updateDevice

    const handleStatus = ({ deviceId, status }: { deviceId: string; status: DeviceStatus }) => {
      updateDevice(deviceId, { status })
    }

    const handleStats = ({ deviceId, stats }: { deviceId: string; stats: DeviceStats }) => {
      updateDevice(deviceId, { stats })
    }

    socket.on('device:status', handleStatus)
    socket.on('device:stats', handleStats)

    this.cleanupListeners = () => {
      socket.off('device:status', handleStatus)
      socket.off('device:stats', handleStats)
    }
  }

  // Effect 3: Room subscriptions for user devices based on deviceIdsKey
  computeDeviceIdsKey(): string {
    const devices = useDevicesStore.getState().devices
    return devices.map((d) => d.id).sort().join(',')
  }

  runSubscriptionsEffect() {
    if (!this.token) return
    const deviceIdsKey = this.computeDeviceIdsKey()
    if (!deviceIdsKey) return

    // If key has not changed, React does not re-run this effect
    if (this.prevDeviceIdsKey === deviceIdsKey) {
      return
    }

    // Dependency changed: execute cleanup of previous effect if it existed
    if (this.cleanupSubscriptions) {
      this.cleanupSubscriptions()
    }

    this.prevDeviceIdsKey = deviceIdsKey
    const socket = this.socket
    const ids = deviceIdsKey.split(',').filter(Boolean)

    const subscribeAll = () => {
      for (const deviceId of ids) {
        socket.emit('device:subscribe', { deviceId })
      }
    }

    // Subscribe immediately and re-subscribe if socket reconnects
    subscribeAll()
    socket.on('connect', subscribeAll)

    this.cleanupSubscriptions = () => {
      socket.off('connect', subscribeAll)
      for (const deviceId of ids) {
        socket.emit('device:unsubscribe', { deviceId })
      }
    }
  }

  // Called whenever Zustand store state updates, mirroring React re-render
  onStateUpdate() {
    this.runSubscriptionsEffect()
  }
}

describe('Dashboard Subscription Lifecycle & Thrashing Stress Test', () => {
  let mockSocket: MockSocket
  let harness: DashboardSubscriptionHarness

  const makeDevice = (id: string, name: string): Device => ({
    id,
    name,
    hostname: `${id}.local`,
    os: 'linux',
    status: 'online',
    trustStatus: 'trusted',
    tags: ['test'],
    ownerId: 'test-user',
    agentVersion: '1.0.0',
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  })

  beforeEach(() => {
    mockSocket = new MockSocket()
    harness = new DashboardSubscriptionHarness(mockSocket)
    useDevicesStore.getState().setDevices([])
  })

  it('prevents subscription thrashing across high-frequency periodic heartbeat stats updates', () => {
    const initialDevices = [
      makeDevice('dev-1', 'Server Alpha'),
      makeDevice('dev-2', 'Server Beta'),
      makeDevice('dev-3', 'Edge Device Gamma'),
    ]

    useDevicesStore.getState().setDevices(initialDevices)
    harness.mount('user-jwt-token')

    // Initial mount: each of the 3 devices should be subscribed once
    assert.equal(mockSocket.countEmitted('device:subscribe'), 3)
    assert.equal(mockSocket.countEmitted('device:unsubscribe'), 0)

    const subscribedDevIds = mockSocket
      .getEmissions('device:subscribe')
      .map((e) => e.payload.deviceId)
      .sort()
    assert.deepEqual(subscribedDevIds, ['dev-1', 'dev-2', 'dev-3'])

    // Simulate 50 periodic heartbeat stats and status events
    for (let i = 1; i <= 50; i++) {
      const targetId = `dev-${(i % 3) + 1}`
      const isStatsUpdate = i % 2 === 0

      if (isStatsUpdate) {
        mockSocket.emit('device:stats', {
          deviceId: targetId,
          stats: {
            cpuPercent: 20 + (i % 60),
            memUsedMb: 1000 + i * 10,
            memTotalMb: 4096,
            diskUsedGb: 15,
            diskTotalGb: 64,
            uptimeSeconds: 1000 + i * 2,
            networkRxBps: 100,
            networkTxBps: 200,
          },
        })
      } else {
        mockSocket.emit('device:status', {
          deviceId: targetId,
          status: 'online',
        })
      }

      // Trigger re-render check as React would
      harness.onStateUpdate()
    }

    // VERIFICATION:
    // 1. Exactly 3 subscribe emissions ever happened (initial only)
    assert.equal(
      mockSocket.countEmitted('device:subscribe'),
      3,
      'device:subscribe count must remain strictly 3 despite 50 heartbeat updates'
    )

    // 2. Exactly 0 unsubscribe emissions occurred (zero thrashing)
    assert.equal(
      mockSocket.countEmitted('device:unsubscribe'),
      0,
      'device:unsubscribe count must remain 0 during periodic heartbeats'
    )

    // 3. Store devices reflect latest stats from heartbeats
    const storeDevices = useDevicesStore.getState().devices
    assert.equal(storeDevices.length, 3)
    const dev1 = storeDevices.find((d) => d.id === 'dev-1')!
    assert.ok(dev1.stats)
    assert.ok(dev1.stats.cpuPercent > 0)
  })

  it('correctly updates subscriptions when a device is added or removed', () => {
    useDevicesStore.getState().setDevices([makeDevice('dev-1', 'Alpha'), makeDevice('dev-2', 'Beta')])
    harness.mount('user-jwt-token')

    assert.equal(mockSocket.countEmitted('device:subscribe'), 2)
    assert.equal(mockSocket.countEmitted('device:unsubscribe'), 0)

    // 1. Add device-3
    const dev3 = makeDevice('dev-3', 'Gamma')
    useDevicesStore.getState().setDevices([...useDevicesStore.getState().devices, dev3])
    harness.onStateUpdate()

    // Previous devices (dev-1, dev-2) unsubscribed in cleanup
    assert.equal(mockSocket.countEmitted('device:unsubscribe'), 2)
    // New set (dev-1, dev-2, dev-3) subscribed
    assert.equal(mockSocket.countEmitted('device:subscribe'), 5) // 2 initial + 3 new

    // 2. Remove dev-1
    useDevicesStore.getState().removeDevice('dev-1')
    harness.onStateUpdate()

    // dev-1, dev-2, dev-3 unsubscribed in cleanup
    assert.equal(mockSocket.countEmitted('device:unsubscribe'), 5) // 2 previous + 3
    // Remaining dev-2, dev-3 subscribed
    assert.equal(mockSocket.countEmitted('device:subscribe'), 7) // 5 previous + 2

    const remaining = useDevicesStore.getState().devices.map((d) => d.id)
    assert.deepEqual(remaining, ['dev-2', 'dev-3'])
  })

  it('re-subscribes to devices upon socket reconnection', () => {
    useDevicesStore.getState().setDevices([makeDevice('dev-1', 'Alpha'), makeDevice('dev-2', 'Beta')])
    harness.mount('user-jwt-token')

    assert.equal(mockSocket.countEmitted('device:subscribe'), 2)

    // Trigger socket reconnect event
    mockSocket.emit('connect')

    // subscribeAll should have re-emitted subscriptions
    assert.equal(
      mockSocket.countEmitted('device:subscribe'),
      4,
      'Reconnection must re-subscribe all current devices'
    )
  })

  it('completely cleans up all listeners and subscriptions on unmount', () => {
    useDevicesStore.getState().setDevices([makeDevice('dev-1', 'Alpha'), makeDevice('dev-2', 'Beta')])
    harness.mount('user-jwt-token')

    assert.equal(mockSocket.listenerCount('device:status'), 1)
    assert.equal(mockSocket.listenerCount('device:stats'), 1)
    assert.equal(mockSocket.listenerCount('connect'), 1)

    harness.unmount()

    // 1. All listeners removed
    assert.equal(mockSocket.listenerCount('device:status'), 0)
    assert.equal(mockSocket.listenerCount('device:stats'), 0)
    assert.equal(mockSocket.listenerCount('connect'), 0)

    // 2. Unsubscribe emitted for all active devices
    assert.equal(mockSocket.countEmitted('device:unsubscribe'), 2)
    const unsubscribedIds = mockSocket
      .getEmissions('device:unsubscribe')
      .map((e) => e.payload.deviceId)
      .sort()
    assert.deepEqual(unsubscribedIds, ['dev-1', 'dev-2'])
  })
})
