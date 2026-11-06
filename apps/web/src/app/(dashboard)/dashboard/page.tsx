'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { useDevicesStore } from '@/store/devices'
import { getSocket } from '@/lib/socket'
import { api } from '@/lib/api'
import { DeviceCard } from '@/components/devices/DeviceCard'
import { PlusCircle, AlertCircle, RefreshCw } from 'lucide-react'
import type { Device, DeviceStatus, DeviceStats } from '@termix/shared'
import Link from 'next/link'
import { ConnectionIndicator } from '@/components/dashboard/ConnectionIndicator'

export default function DashboardPage() {
  const { token } = useAuthStore()
  const { devices, loading, setDevices, updateDevice, setLoading } = useDevicesStore()
  const [error, setError] = useState<string | null>(null)

  // 1. Initial device fetch with automatic silent retry for transient glitches
  const fetchDevices = useCallback((isRetry = false) => {
    if (!token) return
    if (!isRetry && devices.length === 0) setLoading(true)
    setError(null)
    api.get<Device[]>('/api/devices', token)
      .then((data) => {
        setDevices(data)
        setError(null)
      })
      .catch(async (err) => {
        console.warn('Device fetch attempt failed:', err)
        // Auto-retry once after 1 second for transient auth refresh / connection glitches
        if (!isRetry) {
          await new Promise((r) => setTimeout(r, 1000))
          return fetchDevices(true)
        }
        setError(err instanceof Error ? err.message : 'Failed to load devices')
      })
      .finally(() => setLoading(false))
  }, [token, setDevices, setLoading, devices.length])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // 2. Real-time Socket.IO listeners for status and stats updates.
  // Bound to [token, updateDevice] so listener registration remains stable across heartbeats.
  useEffect(() => {
    if (!token) return
    const socket = getSocket(token)

    const handleStatus = ({ deviceId, status }: { deviceId: string; status: DeviceStatus }) => {
      updateDevice(deviceId, { status })
    }

    const handleStats = ({ deviceId, stats }: { deviceId: string; stats: DeviceStats }) => {
      updateDevice(deviceId, { stats })
    }

    socket.on('device:status', handleStatus)
    socket.on('device:stats', handleStats)

    return () => {
      socket.off('device:status', handleStatus)
      socket.off('device:stats', handleStats)
    }
  }, [token, updateDevice])

  // 3. Room subscriptions for user devices.
  // Memoized string key ensures that periodic heartbeat updates (which change stats/status but not device IDs)
  // do NOT trigger re-subscription loops.
  const deviceIdsKey = useMemo(() => devices.map((d) => d.id).sort().join(','), [devices])

  useEffect(() => {
    if (!token || !deviceIdsKey) return
    const socket = getSocket(token)
    const ids = deviceIdsKey.split(',').filter(Boolean)

    const subscribeAll = () => {
      for (const deviceId of ids) {
        socket.emit('device:subscribe', { deviceId })
      }
    }

    // Subscribe immediately and re-subscribe if socket reconnects
    subscribeAll()
    socket.on('connect', subscribeAll)

    return () => {
      socket.off('connect', subscribeAll)
      for (const deviceId of ids) {
        socket.emit('device:unsubscribe', { deviceId })
      }
    }
  }, [token, deviceIdsKey])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {devices.length} device{devices.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionIndicator />
          <Link
            href="/dashboard/devices/add"
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Add Device
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between text-red-400 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchDevices(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Device grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        error ? (
          <div className="text-center py-20 text-zinc-500 flex flex-col items-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-base font-medium mb-1 text-zinc-300">Unable to load devices</p>
            <p className="text-xs text-zinc-500 mb-4">A temporary authentication refresh is in progress.</p>
            <button
              onClick={() => fetchDevices(false)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors border border-zinc-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="text-center py-24 text-zinc-500 flex flex-col items-center">
            <div className="text-5xl mb-4">🖥️</div>
            <p className="text-lg font-medium mb-1 text-zinc-300">No devices yet</p>
            <p className="text-sm text-zinc-500 mb-6">Add your first device to get started.</p>
            <Link
              href="/dashboard/devices/add"
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-brand-500/20"
            >
              <PlusCircle className="w-4 h-4" />
              Add New Device
            </Link>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  )
}
