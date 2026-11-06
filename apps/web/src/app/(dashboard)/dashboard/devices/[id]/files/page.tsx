'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useDevicesStore } from '@/store/devices'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { DeviceHeader } from '@/components/devices/DeviceHeader'
import { FileExplorer } from '@/components/files/FileExplorer'
import type { Device, DeviceStatus, DeviceStats } from '@termix/shared'

export default function DeviceFilesPage() {
  const { id: deviceId } = useParams<{ id: string }>()
  const { token } = useAuthStore()
  const { devices, updateDevice } = useDevicesStore()
  const storeDevice = devices.find((d) => d.id === deviceId) || null
  const [device, setDevice] = useState<Device | null>(storeDevice)
  const [loadingDevice, setLoadingDevice] = useState(!storeDevice)

  // 1. Fetch device metadata once if not in store
  useEffect(() => {
    if (!token || !deviceId) return
    if (devices.some((d) => d.id === deviceId)) {
      setLoadingDevice(false)
      return
    }

    setLoadingDevice(true)
    api.get<Device>(`/api/devices/${deviceId}`, token)
      .then((data) => {
        setDevice(data)
        updateDevice(deviceId, data)
      })
      .catch((err) => console.error('Failed to load device:', err))
      .finally(() => setLoadingDevice(false))
  }, [token, deviceId])

  // 2. Real-time status subscription
  useEffect(() => {
    if (!token || !deviceId) return
    const socket = getSocket(token)

    const handleStatus = ({ deviceId: id, status }: { deviceId: string; status: DeviceStatus }) => {
      if (id === deviceId) {
        setDevice((prev) => (prev ? { ...prev, status } : prev))
        updateDevice(deviceId, { status })
      }
    }

    const handleStats = ({ deviceId: id, stats }: { deviceId: string; stats: DeviceStats }) => {
      if (id === deviceId) {
        setDevice((prev) => (prev ? { ...prev, stats } : prev))
        updateDevice(deviceId, { stats })
      }
    }

    socket.emit('device:subscribe', { deviceId })
    socket.on('device:status', handleStatus)
    socket.on('device:stats', handleStats)

    return () => {
      socket.off('device:status', handleStatus)
      socket.off('device:stats', handleStats)
      socket.emit('device:unsubscribe', { deviceId })
    }
  }, [token, deviceId, updateDevice])

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      <DeviceHeader device={device} deviceId={deviceId} activeTab="files" />
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        <FileExplorer
          deviceId={deviceId}
          device={device}
          loadingDevice={loadingDevice}
        />
      </div>
    </div>
  )
}
