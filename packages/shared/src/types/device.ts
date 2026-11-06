export type DeviceStatus = 'online' | 'offline' | 'connecting'
export type DeviceOS = 'windows' | 'linux' | 'macos' | 'unknown'
export type DeviceTrustStatus = 'pending' | 'trusted' | 'blocked'

export interface Device {
  id: string
  name: string
  os: DeviceOS
  distro?: string          // e.g. "Windows 11", "Windows 10", "Arch Linux", "Ubuntu 24.04", "Debian 12"
  distroId?: string        // e.g. "windows11", "windows10", "arch", "ubuntu", "debian", "fedora", "alpine"
  osVersion?: string       // e.g. "10.0.26300", "6.6.10-arch1-1"
  status: DeviceStatus
  trustStatus: DeviceTrustStatus
  tags: string[]
  ownerId: string           // Firebase UID
  agentVersion: string
  hostname: string
  ipAddress?: string
  lastSeen: string          // ISO date string
  createdAt: string
  stats?: DeviceStats
  agentToken?: string
}

export interface DeviceStats {
  cpuPercent: number
  memUsedMb: number
  memTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  uptimeSeconds: number
  networkRxBps: number
  networkTxBps: number
}
