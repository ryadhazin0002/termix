'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'
import {
  Terminal,
  Monitor,
  Play,
  XCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react'
import type { TerminalSession } from '@termix/shared'
import { OSIcon, OSBadge, getDeviceOSInfo } from '@/components/devices/OSIcon'

interface EnrichedSession extends TerminalSession {
  deviceName?: string
  isDeviceOnline?: boolean
  os?: string
  distro?: string
  distroId?: string
  closedAt?: string
}

export default function SessionsPage() {
  const { token } = useAuthStore()
  const [sessions, setSessions] = useState<EnrichedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all')
  const [killingId, setKillingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = () => {
    if (!token) return
    setLoading(true)
    setError(null)
    api
      .get<EnrichedSession[]>('/api/sessions', token)
      .then((data) => {
        setSessions(data)
      })
      .catch((err) => {
        console.error('Failed to load sessions:', err)
        setError('Failed to load sessions from server.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSessions()
  }, [token])

  const handleKill = async (sessionId: string) => {
    if (!token) return
    const confirmed = window.confirm('Are you sure you want to terminate this terminal session?')
    if (!confirmed) return

    setKillingId(sessionId)
    try {
      await api.delete(`/api/sessions/${sessionId}`, token)
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'closed' as const } : s))
      )
    } catch (err) {
      console.error('Failed to kill session:', err)
      alert('Could not terminate session.')
    } finally {
      setKillingId(null)
    }
  }

  const filteredSessions = useMemo(() => {
    if (filter === 'active') return sessions.filter((s) => s.status === 'active')
    if (filter === 'closed') return sessions.filter((s) => s.status !== 'active')
    return sessions
  }, [sessions, filter])

  const activeCount = sessions.filter((s) => s.status === 'active').length

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-brand-400" />
            <span>Terminal Sessions</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your active background terminal sessions, reconnect, or terminate them.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors border border-zinc-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === 'all' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === 'active'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === 'closed'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Closed ({sessions.length - activeCount})
          </button>
        </div>

        {activeCount > 0 && (
          <div className="text-xs text-zinc-400 hidden sm:block">
            <span className="text-emerald-400 font-semibold">{activeCount}</span> running session{activeCount > 1 ? 's' : ''} in the background
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sessions List */}
      {loading && sessions.length === 0 ? (
        <div className="text-center py-24 text-zinc-500 space-y-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm">Loading sessions...</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/40 border border-zinc-800/80 rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-500">
            <Terminal className="w-6 h-6" />
          </div>
          <h3 className="text-base font-medium text-zinc-300">
            {filter === 'active' ? 'No active sessions' : 'No sessions found'}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {filter === 'active'
              ? 'All previous terminal sessions are closed. Open a device to start a new terminal.'
              : 'Launch a terminal session from any registered device to manage it.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Go to Devices</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map((s) => {
            const isActive = s.status === 'active'

            return (
              <div
                key={s.id}
                className={`flex flex-col justify-between rounded-xl p-5 border transition-all duration-200 ${
                  isActive
                    ? 'bg-zinc-900/90 border-zinc-700/80 shadow-lg shadow-black/40 hover:border-zinc-600'
                    : 'bg-zinc-900/40 border-zinc-800/70 opacity-75'
                }`}
              >
                {/* Card Top: Device & Status */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          isActive
                            ? 'bg-zinc-800/90 border border-zinc-700/80 text-emerald-400'
                            : 'bg-zinc-800/50 text-zinc-500'
                        }`}
                      >
                        <OSIcon distroId={getDeviceOSInfo({ distro: s.distro, distroId: s.distroId, os: s.os as any, name: s.deviceName }).distroId} os={s.os} className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
                          {s.deviceName || 'Device'}
                          {s.isDeviceOnline && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Device is online" />
                          )}
                          <OSBadge device={{ distro: s.distro, distroId: s.distroId, os: s.os as any, name: s.deviceName }} className="py-0.2 px-1.5 text-[10px]" />
                        </h4>
                        <p className="font-mono text-xs text-zinc-500 tracking-wider">
                          ID: {s.id.slice(0, 8)}...{s.id.slice(-4)}
                        </p>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        isActive
                          ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/50'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-zinc-500" />
                          <span>Closed</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60">
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">Started: {formatDate(s.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <span>Size:</span>
                      <span className="font-mono text-zinc-400">
                        {s.cols || 80}x{s.rows || 24}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-3">
                  {isActive ? (
                    <>
                      {/* Enter / Resume button */}
                      <Link
                        href={`/dashboard/devices/${s.deviceId}/terminal?sessionId=${s.id}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Enter Terminal</span>
                      </Link>

                      {/* Kill button */}
                      <button
                        onClick={() => handleKill(s.id)}
                        disabled={killingId === s.id}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 text-xs font-medium border border-red-800/50 transition-colors"
                        title="Kill and terminate shell process"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span>{killingId === s.id ? 'Killing...' : 'Kill'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Start new session on this device */}
                      <Link
                        href={`/dashboard/devices/${s.deviceId}/terminal`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors border border-zinc-700"
                      >
                        <Terminal className="w-3.5 h-3.5 text-brand-400" />
                        <span>New Session</span>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
