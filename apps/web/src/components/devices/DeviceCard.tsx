'use client'

import { useState } from 'react'
import type { Device, DeviceTrustStatus } from '@termix/shared'
import { formatBytes, formatUptime } from '@termix/shared'
import { OSIcon, OSBadge, getDeviceOSInfo } from './OSIcon'
import {
  Terminal,
  Folder,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  MoreVertical,
  ShieldCheck,
  ShieldAlert,
  Key,
  Trash2,
  Copy,
  Check,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useDevicesStore } from '@/store/devices'
import { api } from '@/lib/api'

interface Props {
  device: Device
}

const osEmoji: Record<string, string> = {
  windows: '🪟',
  linux: '🐧',
  macos: '🍎',
  unknown: '🖥️',
}

export function DeviceCard({ device }: Props) {
  const { token } = useAuthStore()
  const { updateDevice, removeDevice } = useDevicesStore()

  const [isApproving, setIsApproving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false)
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isOnline = device.status === 'online'
  const osInfo = getDeviceOSInfo(device)

  const handleUpdateTrust = async (newTrustStatus: DeviceTrustStatus) => {
    if (!token) return
    setIsApproving(true)
    setErrorMessage(null)
    try {
      await api.patch(`/api/devices/${device.id}`, { trustStatus: newTrustStatus }, token)
      const updates: Partial<Device> = { trustStatus: newTrustStatus }
      if (newTrustStatus === 'blocked') {
        updates.status = 'offline'
      }
      updateDevice(device.id, updates)
    } catch (err: any) {
      console.error('Failed to update device trust status:', err)
      setErrorMessage(err.message || 'Failed to update trust status')
    } finally {
      setIsApproving(false)
    }
  }

  const handleDelete = async () => {
    if (!token) return
    setIsDeleting(true)
    setErrorMessage(null)
    try {
      await api.delete(`/api/devices/${device.id}`, token)
      removeDevice(device.id)
      setIsDeleteOpen(false)
    } catch (err: any) {
      console.error('Failed to delete device:', err)
      setErrorMessage(err.message || 'Failed to delete device')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRegenerateToken = async () => {
    if (!token) return
    setIsRegeneratingToken(true)
    try {
      const res = await api.post<{ token: string }>(`/api/devices/${device.id}/token`, {}, token)
      updateDevice(device.id, { agentToken: res.token })
    } catch (err: any) {
      console.error('Failed to regenerate agent token:', err)
      setErrorMessage(err.message || 'Failed to regenerate agent token')
    } finally {
      setIsRegeneratingToken(false)
    }
  }

  const getEnvContent = () => {
    return [
      `TERMIX_SERVER_URL=${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}`,
      `TERMIX_DEVICE_ID=${device.id}`,
      `TERMIX_DEVICE_TOKEN=${device.agentToken || '<token>'}`,
      `TERMIX_DEVICE_NAME=${device.name}`,
    ].join('\n')
  }

  const copyEnv = async () => {
    try {
      await navigator.clipboard.writeText(getEnvContent())
      setCopiedEnv(true)
      setTimeout(() => setCopiedEnv(false), 2000)
    } catch (err) {
      console.error('Failed to copy .env to clipboard', err)
    }
  }

  const copyToken = async () => {
    if (!device.agentToken) return
    try {
      await navigator.clipboard.writeText(device.agentToken)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } catch (err) {
      console.error('Failed to copy token to clipboard', err)
    }
  }

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 hover:border-zinc-700 transition-colors relative">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center shrink-0 shadow-inner">
              <OSIcon distroId={osInfo.distroId} os={osInfo.os} className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm text-zinc-100">{device.name}</h3>
                <span className="sr-only">{osEmoji[device.os] ?? '🖥️'}</span>
              </div>
              <p className="text-xs text-zinc-500">{device.hostname || 'No hostname'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full',
                isOnline ? 'bg-brand-500/10 text-brand-500' : 'bg-zinc-800 text-zinc-500'
              )}
            >
              <span
                className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-brand-500 animate-pulse' : 'bg-zinc-500')}
              />
              {isOnline ? 'Online' : 'Offline'}
            </div>

            {/* Actions Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors outline-none"
                  aria-label="Device actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  className="z-50 min-w-[190px] bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 shadow-xl text-xs text-zinc-200 outline-none animate-in fade-in-50"
                >
                  {device.trustStatus !== 'trusted' ? (
                    <DropdownMenu.Item
                      onSelect={() => handleUpdateTrust('trusted')}
                      disabled={isApproving}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer outline-none hover:bg-zinc-800 hover:text-white transition-colors text-green-400"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Approve / Trust
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item
                      onSelect={() => handleUpdateTrust('blocked')}
                      disabled={isApproving}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer outline-none hover:bg-zinc-800 hover:text-white transition-colors text-yellow-400"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      Revoke Trust (Block)
                    </DropdownMenu.Item>
                  )}

                  <DropdownMenu.Separator className="h-px bg-zinc-800 my-1" />

                  <DropdownMenu.Item asChild>
                    <Link
                      href={`/dashboard/devices/${device.id}/files`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer outline-none hover:bg-zinc-800 hover:text-white transition-colors',
                        (!isOnline || device.trustStatus !== 'trusted') && 'opacity-50 pointer-events-none'
                      )}
                    >
                      <Folder className="w-4 h-4 text-zinc-400" />
                      Browse Files
                    </Link>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="h-px bg-zinc-800 my-1" />

                  <DropdownMenu.Item
                    onSelect={() => setIsSetupOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer outline-none hover:bg-zinc-800 hover:text-white transition-colors"
                  >
                    <Key className="w-4 h-4 text-zinc-400" />
                    Setup & .env Token
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="h-px bg-zinc-800 my-1" />

                  <DropdownMenu.Item
                    onSelect={() => setIsDeleteOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer outline-none text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Device
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Stats */}
        {device.stats && isOnline && (
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              CPU {device.stats.cpuPercent}%
            </div>
            <div className="flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5 text-purple-400" />
              {formatBytes(device.stats.memUsedMb * 1024 * 1024)} RAM
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-orange-400" />
              {device.stats.diskUsedGb}GB disk
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              {formatUptime(device.stats.uptimeSeconds)}
            </div>
          </div>
        )}

        {/* OS & Distribution Badge + Custom Tags */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <OSBadge device={device} />
          {device.tags && device.tags.length > 0 &&
            device.tags
              .filter((t) => t.toLowerCase() !== osInfo.distroId && !osInfo.distro.toLowerCase().includes(t.toLowerCase()))
              .map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-zinc-800/80 text-zinc-400 text-xs rounded-md border border-zinc-700/40">
                  {tag}
                </span>
              ))}
        </div>

        {/* Inline Error Notice */}
        {errorMessage && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {errorMessage}
          </div>
        )}

        {/* Trust status banners & actions */}
        {device.trustStatus === 'pending' && (
          <div className="flex items-center justify-between gap-3 text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Awaiting trust approval</span>
            </div>
            <button
              type="button"
              onClick={() => handleUpdateTrust('trusted')}
              disabled={isApproving}
              className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-semibold rounded text-xs transition-colors disabled:opacity-50 shrink-0"
            >
              {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Approve
            </button>
          </div>
        )}

        {device.trustStatus === 'blocked' && (
          <div className="flex items-center justify-between gap-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Device is blocked</span>
            </div>
            <button
              type="button"
              onClick={() => handleUpdateTrust('trusted')}
              disabled={isApproving}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-500 hover:bg-red-400 text-white font-semibold rounded text-xs transition-colors disabled:opacity-50 shrink-0"
            >
              {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Unblock
            </button>
          </div>
        )}

        {/* Dual Action Buttons: Terminal & Files */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <Link
            href={`/dashboard/devices/${device.id}/terminal`}
            className={cn(
              'flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
              isOnline && device.trustStatus === 'trusted'
                ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed pointer-events-none'
            )}
            aria-disabled={!isOnline || device.trustStatus !== 'trusted'}
            tabIndex={isOnline && device.trustStatus === 'trusted' ? 0 : -1}
          >
            <Terminal className="w-3.5 h-3.5" />
            Terminal
          </Link>

          <Link
            href={`/dashboard/devices/${device.id}/files`}
            className={cn(
              'flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors border',
              isOnline && device.trustStatus === 'trusted'
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border-zinc-700/80 shadow-sm'
                : 'bg-zinc-800/50 text-zinc-600 border-zinc-800/40 cursor-not-allowed pointer-events-none'
            )}
            aria-disabled={!isOnline || device.trustStatus !== 'trusted'}
            tabIndex={isOnline && device.trustStatus === 'trusted' ? 0 : -1}
          >
            <Folder className="w-3.5 h-3.5 text-brand-400" />
            Files
          </Link>
        </div>
      </div>

      {/* Setup / .env Dialog */}
      <Dialog.Root open={isSetupOpen} onOpenChange={setIsSetupOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-in fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl z-50 text-zinc-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-brand-500" />
                  Device Setup & Configuration
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400 mt-1">
                  Configure the Termix agent on <strong>{device.name}</strong> using these settings.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* .env Snippet */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Agent .env file</span>
                <button
                  type="button"
                  onClick={copyEnv}
                  className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white transition-colors"
                >
                  {copiedEnv ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400">Copied .env</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy .env</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre">
                {getEnvContent()}
              </pre>
            </div>

            {/* Dedicated Token Row */}
            <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-medium">Agent Token</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyToken}
                    disabled={!device.agentToken}
                    className="flex items-center gap-1 text-zinc-300 hover:text-white disabled:opacity-50 transition-colors"
                  >
                    {copiedToken ? (
                      <>
                        <Check className="w-3 h-3 text-green-400" />
                        <span className="text-green-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Token</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateToken}
                    disabled={isRegeneratingToken}
                    className="flex items-center gap-1 text-brand-500 hover:text-brand-400 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={cn('w-3 h-3', isRegeneratingToken && 'animate-spin')} />
                    <span>Reset Token</span>
                  </button>
                </div>
              </div>
              <code className="text-zinc-200 font-mono break-all bg-zinc-900 px-2 py-1 rounded">
                {device.agentToken || '<token not set - click Reset Token>'}
              </code>
            </div>

            {/* Quick Steps */}
            <div className="text-xs text-zinc-400 flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
              <p className="font-medium text-zinc-300">Quick Installation:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Create an <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">.env</code> file in your agent folder.</li>
                <li>Paste the configuration above.</li>
                <li>Start the agent: <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">pnpm start</code>.</li>
                <li>Approve the device once it connects.</li>
              </ol>
            </div>

            <div className="flex justify-end pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-in fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl z-50 text-zinc-100 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-red-500/10 text-red-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-zinc-100">
                  Delete {device.name}?
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400 mt-1">
                  Are you sure you want to delete this device? This will permanently remove its credentials and immediately terminate any active remote sessions. This action cannot be undone.
                </Dialog.Description>
              </div>
            </div>

            {errorMessage && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                {errorMessage}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isDeleting}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isDeleting ? 'Deleting...' : 'Delete Device'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

