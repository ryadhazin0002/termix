'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { getSocket } from '@/lib/socket'
import { api } from '@/lib/api'
import { TerminalView } from '@/components/terminal/TerminalView'
import Link from 'next/link'
import { Terminal, Folder, Plus, XCircle, RefreshCw } from 'lucide-react'
import { resolveTerminalTheme } from '@/components/terminal/terminalThemes'
import { cn } from '@/lib/utils'
import type { TerminalSession } from '@termix/shared'
import type { Socket } from 'socket.io-client'

export default function TerminalPage() {
  const { id: deviceId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const requestedSessionId = searchParams.get('sessionId')

  const { token } = useAuthStore()
  const { settings, fetchSettings } = useSettingsStore()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [session, setSession] = useState<TerminalSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(true)

  // Track system preference for theme === 'system'
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
    mediaQuery.addListener(handler)
    return () => mediaQuery.removeListener(handler)
  }, [])

  // Fetch user settings on mount if authenticated
  useEffect(() => {
    if (token) {
      fetchSettings(token).catch(() => {})
    }
  }, [token, fetchSettings])

  const currentSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token) return

    const s = getSocket(token)
    setSocket(s)

    const handleCreated = (payload: { session: TerminalSession; resumed?: boolean }) => {
      currentSessionIdRef.current = payload.session.id
      setSession(payload.session)
      setConnecting(false)
      setError(null)
    }

    const handleError = (payload: { message: string }) => {
      setError(payload.message)
      setConnecting(false)
    }

    const handleClosed = (payload?: { sessionId?: string }) => {
      if (!payload?.sessionId || payload.sessionId === currentSessionIdRef.current) {
        setError('Terminal session ended')
        setSession(null)
      }
    }

    s.on('terminal:created', handleCreated)
    s.on('terminal:error', handleError)
    s.on('terminal:closed', handleClosed)

    // Request to join requested session or resume active session
    s.emit('terminal:create', {
      deviceId,
      cols: 220,
      rows: 50,
      sessionId: requestedSessionId || undefined,
    })

    return () => {
      s.off('terminal:created', handleCreated)
      s.off('terminal:error', handleError)
      s.off('terminal:closed', handleClosed)
      // NOTE: We intentionally do NOT emit 'terminal:close' here!
      // This preserves the session in the background when the user navigates to Files, Devices, etc.
    }
  }, [token, deviceId, requestedSessionId])

  const handleKillSession = async () => {
    if (!session || !socket) return
    const confirmed = window.confirm('Are you sure you want to terminate this terminal session?')
    if (!confirmed) return

    const sid = session.id
    socket.emit('terminal:close', { sessionId: sid })
    if (token) {
      api.delete(`/api/sessions/${sid}`, token).catch(() => {})
    }
    setSession(null)
    setError('Session terminated')
  }

  const handleNewSession = () => {
    if (!socket) return
    setConnecting(true)
    setSession(null)
    setError(null)
    socket.emit('terminal:create', { deviceId, cols: 220, rows: 50, forceNew: true })
  }

  const { isDark, theme } = resolveTerminalTheme(settings.theme, systemPrefersDark)

  if (connecting) {
    return (
      <div className="h-full flex items-center justify-center gap-3 text-zinc-400">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        Connecting to terminal...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-red-400">
        <p className="text-sm font-medium">❌ {error}</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setError(null)
              setConnecting(true)
              if (socket) {
                socket.emit('terminal:create', { deviceId, cols: 220, rows: 50, forceNew: true })
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors border border-zinc-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Launch New Session</span>
          </button>
          <Link
            href="/dashboard/sessions"
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded-lg transition-colors border border-zinc-800"
          >
            View All Sessions
          </Link>
        </div>
      </div>
    )
  }

  if (!socket || !session) return null

  return (
    <div
      className="h-full flex flex-col transition-colors duration-200"
      style={{ background: theme.background }}
    >
      {/* Terminal toolbar */}
      <div
        className={cn(
          'h-10 flex items-center px-4 gap-2 border-b shrink-0 transition-colors',
          !isDark
            ? 'bg-zinc-100 border-zinc-200 text-zinc-600'
            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
        )}
      >
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs ml-2 font-mono opacity-80 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Session: {session.id.slice(0, 8)}...
          </span>
          <span className="text-[10px] text-zinc-500 hidden md:inline-block bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-700/50">
            Preserved on navigation
          </span>
        </div>

        {/* Action Controls */}
        <div className="ml-auto flex items-center gap-2">
          {/* New session */}
          <button
            onClick={handleNewSession}
            title="Start a new parallel terminal session"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700/60"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">New Session</span>
          </button>

          {/* Kill session */}
          <button
            onClick={handleKillSession}
            title="Kill and terminate this session"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 transition-colors border border-red-800/50"
          >
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Kill</span>
          </button>

          {/* Tab switcher: Terminal <-> Files */}
          <div className="flex items-center bg-zinc-950/40 p-0.5 rounded-lg border border-zinc-800/80">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-100 shadow-sm">
              <Terminal className="w-3.5 h-3.5 text-brand-400" />
              <span>Terminal</span>
            </span>
            <Link
              href={`/dashboard/devices/${deviceId}/files`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            >
              <Folder className="w-3.5 h-3.5" />
              <span>Files</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 overflow-hidden p-1">
        <TerminalView sessionId={session.id} socket={socket} />
      </div>
    </div>
  )
}
