import test, { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Device, DeviceStats } from '@termix/shared'
import { useDevicesStore } from './devices'

describe('DevicesStore empirical verification', () => {
  const mockDevices: Device[] = [
    {
      id: 'device-1',
      name: 'Raspberry Pi 4',
      hostname: 'pi4-prod',
      os: 'linux',
      status: 'online',
      trustStatus: 'trusted',
      tags: ['edge', 'arm64'],
      ownerId: 'owner-1',
      agentVersion: '1.0.0',
      lastSeen: '2026-11-01T20:00:00Z',
      createdAt: '2026-11-01T20:00:00Z',
      agentToken: 'token-abc',
    },
    {
      id: 'device-2',
      name: 'Mac Mini M2',
      hostname: 'm2-build',
      os: 'macos',
      status: 'offline',
      trustStatus: 'pending',
      tags: ['ci'],
      ownerId: 'owner-1',
      agentVersion: '1.0.0',
      lastSeen: '2026-11-01T20:00:00Z',
      createdAt: '2026-11-01T20:00:00Z',
      agentToken: 'token-xyz',
    },
    {
      id: 'device-3',
      name: 'Windows Server 2022',
      hostname: 'win-box',
      os: 'windows',
      status: 'online',
      trustStatus: 'blocked',
      tags: [],
      ownerId: 'owner-1',
      agentVersion: '1.0.0',
      lastSeen: '2026-11-01T20:00:00Z',
      createdAt: '2026-11-01T20:00:00Z',
    },
  ]

  beforeEach(() => {
    useDevicesStore.getState().setDevices([])
    useDevicesStore.getState().setLoading(false)
  })

  it('initializes with empty devices and loading false', () => {
    const state = useDevicesStore.getState()
    assert.deepEqual(state.devices, [])
    assert.equal(state.loading, false)
  })

  it('setDevices correctly populates the devices array', () => {
    useDevicesStore.getState().setDevices(mockDevices)
    const state = useDevicesStore.getState()
    assert.equal(state.devices.length, 3)
    assert.equal(state.devices[0].id, 'device-1')
    assert.equal(state.devices[1].id, 'device-2')
    assert.equal(state.devices[2].id, 'device-3')
  })

  it('setLoading updates the loading boolean', () => {
    useDevicesStore.getState().setLoading(true)
    assert.equal(useDevicesStore.getState().loading, true)
    useDevicesStore.getState().setLoading(false)
    assert.equal(useDevicesStore.getState().loading, false)
  })

  describe('removeDevice', () => {
    it('removes the specified device and leaves all others untouched', () => {
      useDevicesStore.getState().setDevices(mockDevices)

      // Remove device-2
      useDevicesStore.getState().removeDevice('device-2')
      const remaining = useDevicesStore.getState().devices

      assert.equal(remaining.length, 2)
      assert.equal(remaining[0].id, 'device-1')
      assert.equal(remaining[0].name, 'Raspberry Pi 4')
      assert.equal(remaining[0].agentToken, 'token-abc')
      assert.equal(remaining[1].id, 'device-3')
      assert.equal(remaining[1].name, 'Windows Server 2022')
    })

    it('is a no-op when removing a non-existent ID', () => {
      useDevicesStore.getState().setDevices(mockDevices)
      useDevicesStore.getState().removeDevice('device-non-existent')
      const remaining = useDevicesStore.getState().devices

      assert.equal(remaining.length, 3)
      assert.equal(remaining.map((d) => d.id).join(','), 'device-1,device-2,device-3')
    })

    it('can remove all devices sequentially until empty', () => {
      useDevicesStore.getState().setDevices(mockDevices)
      useDevicesStore.getState().removeDevice('device-1')
      useDevicesStore.getState().removeDevice('device-2')
      useDevicesStore.getState().removeDevice('device-3')
      assert.equal(useDevicesStore.getState().devices.length, 0)
    })
  })

  describe('updateDevice', () => {
    it('updates status correctly without resetting other fields', () => {
      useDevicesStore.getState().setDevices(mockDevices)

      useDevicesStore.getState().updateDevice('device-1', { status: 'offline' })
      const dev1 = useDevicesStore.getState().devices.find((d) => d.id === 'device-1')!

      assert.equal(dev1.status, 'offline')
      assert.equal(dev1.name, 'Raspberry Pi 4')
      assert.equal(dev1.hostname, 'pi4-prod')
      assert.equal(dev1.os, 'linux')
      assert.equal(dev1.trustStatus, 'trusted')
      assert.equal(dev1.agentToken, 'token-abc')
      assert.deepEqual(dev1.tags, ['edge', 'arm64'])
      assert.equal(dev1.createdAt, '2026-11-01T20:00:00Z')
    })

    it('updates stats correctly without resetting other fields', () => {
      useDevicesStore.getState().setDevices(mockDevices)

      const newStats: DeviceStats = {
        cpuPercent: 78.4,
        memUsedMb: 3200,
        memTotalMb: 8192,
        diskUsedGb: 45,
        diskTotalGb: 128,
        uptimeSeconds: 86400,
        networkRxBps: 1024,
        networkTxBps: 2048,
      }

      useDevicesStore.getState().updateDevice('device-1', { stats: newStats })
      const dev1 = useDevicesStore.getState().devices.find((d) => d.id === 'device-1')!

      assert.deepEqual(dev1.stats, newStats)
      assert.equal(dev1.status, 'online')
      assert.equal(dev1.name, 'Raspberry Pi 4')
      assert.equal(dev1.trustStatus, 'trusted')
    })

    it('updates trustStatus and status simultaneously (e.g., when blocking)', () => {
      useDevicesStore.getState().setDevices(mockDevices)

      useDevicesStore.getState().updateDevice('device-1', {
        trustStatus: 'blocked',
        status: 'offline',
      })
      const dev1 = useDevicesStore.getState().devices.find((d) => d.id === 'device-1')!

      assert.equal(dev1.trustStatus, 'blocked')
      assert.equal(dev1.status, 'offline')
      assert.equal(dev1.name, 'Raspberry Pi 4')
    })

    it('updates agentToken (e.g., on token regeneration)', () => {
      useDevicesStore.getState().setDevices(mockDevices)

      useDevicesStore.getState().updateDevice('device-2', {
        agentToken: 'token-new-regenerated-999',
      })
      const dev2 = useDevicesStore.getState().devices.find((d) => d.id === 'device-2')!

      assert.equal(dev2.agentToken, 'token-new-regenerated-999')
      assert.equal(dev2.trustStatus, 'pending')
    })

    it('is a safe no-op when target ID is not in store', () => {
      useDevicesStore.getState().setDevices(mockDevices)

      useDevicesStore.getState().updateDevice('ghost-device-id', { status: 'online' })
      const devs = useDevicesStore.getState().devices

      assert.equal(devs.length, 3)
      assert.equal(devs.find((d) => d.id === 'ghost-device-id'), undefined)
    })
  })
})
