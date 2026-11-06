'use client'

import React from 'react'
import Link from 'next/link'
import { Terminal, Folder, ArrowLeft, AlertTriangle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Device } from '@termix/shared'
import { OSIcon, OSBadge, getDeviceOSInfo } from './OSIcon'

const osEmoji: Record<string, string> = {
  windows: '🪟',
  linux: '🐧',
  macos: '🍎',
  unknown: '🖥️',
}

export interface DeviceHeaderProps {
  device?: Device | null
  deviceId: string
  activeTab: 'terminal' | 'files'
}

export function DeviceHeader({ device, deviceId, activeTab }: DeviceHeaderProps) {
  const isOnline = device?.status === 'online'
  const isBlocked = device?.trustStatus === 'blocked'
  const isPending = device?.trustStatus === 'pending'

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 shrink-0">
      {/* Top bar: Back link, device name, and tabs */}
      <div className="h-14 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1 text-xs"
            title="Back to devices"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Devices</span>
          </Link>

          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center shrink-0">
              <OSIcon distroId={getDeviceOSInfo(device).distroId} os={device?.os} className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-zinc-100 truncate">
                  {device?.name || 'Device'}
                </h1>
                <OSBadge device={device} className="hidden sm:inline-flex py-0.5 px-2 text-[10px]" />
              </div>
              <p className="text-[11px] text-zinc-500 font-mono truncate">
                {device?.hostname || deviceId.slice(0, 12)}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
          <Link
            href={`/dashboard/devices/${deviceId}/terminal`}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === 'terminal'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </Link>

          <Link
            href={`/dashboard/devices/${deviceId}/files`}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === 'files'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Files</span>
          </Link>
        </div>
      </div>

      {/* Reactive Status Banners */}
      {device && !isOnline && (
        <div className="bg-zinc-800/80 border-t border-zinc-700/50 px-4 py-2 flex items-center gap-2 text-xs text-zinc-300">
          <span className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />
          <span>Device is currently <strong>offline</strong>. Remote operations will fail until the agent reconnects.</span>
        </div>
      )}

      {isPending && (
        <div className="bg-yellow-500/10 border-t border-yellow-500/20 px-4 py-2 flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Device is <strong>pending approval</strong>. Approve this device on the Dashboard to authorize remote file access.</span>
        </div>
      )}

      {isBlocked && (
        <div className="bg-red-500/10 border-t border-red-500/20 px-4 py-2 flex items-center gap-2 text-xs text-red-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Device trust is <strong>blocked</strong>. Unblock this device to restore remote file access.</span>
        </div>
      )}
    </div>
  )
}
