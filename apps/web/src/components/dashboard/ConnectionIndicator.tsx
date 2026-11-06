'use client'

import { useEffect, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting'

interface StatusDisplayConfig {
  label: string
  emoji: string
  dotClass: string
  containerClass: string
}

const STATUS_CONFIG: Record<ConnectionStatus, StatusDisplayConfig> = {
  connected: {
    label: 'Connected',
    emoji: '🟢',
    dotClass: 'bg-emerald-400',
    containerClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  },
  connecting: {
    label: 'Connecting...',
    emoji: '🟡',
    dotClass: 'bg-yellow-400 animate-pulse',
    containerClass: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  },
  reconnecting: {
    label: 'Reconnecting...',
    emoji: '🔴',
    dotClass: 'bg-red-400 animate-pulse',
    containerClass: 'bg-red-500/10 text-red-400 border border-red-500/20',
  },
}

/**
 * Hook to track client Socket.IO connection status.
 * Handles connect, disconnect, connect_error, reconnect_attempt, reconnect, and reconnect_error events.
 * Cleans up all listeners on unmount or token change to prevent memory leaks.
 */
export function useSocketConnection(providedSocket?: any): ConnectionStatus {
  const { token } = useAuthStore()
  const [status, setStatus] = useState<ConnectionStatus>(() => {
    if (providedSocket) {
      return providedSocket.connected ? 'connected' : 'connecting'
    }
    return 'connecting'
  })

  useEffect(() => {
    if (!token && !providedSocket) {
      setStatus('connecting')
      return
    }

    const socket = providedSocket ?? (token ? getSocket(token) : null)
    if (!socket) {
      setStatus('connecting')
      return
    }

    // Synchronize immediate state upon mount or socket change
    if (socket.connected) {
      setStatus('connected')
    } else {
      setStatus('connecting')
    }

    const handleConnect = () => setStatus('connected')
    const handleDisconnect = () => setStatus('reconnecting')
    const handleConnectError = () => setStatus('reconnecting')
    const handleReconnectAttempt = () => setStatus('reconnecting')
    const handleReconnect = () => setStatus('connected')
    const handleReconnectError = () => setStatus('reconnecting')

    // Socket-level listeners
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)

    // Manager-level reconnection listeners
    const manager = socket.io
    if (manager && typeof manager.on === 'function') {
      manager.on('reconnect_attempt', handleReconnectAttempt)
      manager.on('reconnect', handleReconnect)
      manager.on('reconnect_error', handleReconnectError)
    }

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)

      if (manager && typeof manager.off === 'function') {
        manager.off('reconnect_attempt', handleReconnectAttempt)
        manager.off('reconnect', handleReconnect)
        manager.off('reconnect_error', handleReconnectError)
      }
    }
  }, [token, providedSocket])

  return status
}

export interface ConnectionIndicatorProps {
  className?: string
  showLabel?: boolean
  status?: ConnectionStatus
  socket?: any
}

/**
 * Visual WebSocket Connection Indicator Pill.
 * Displays the client socket connection state (Connected 🟢, Connecting... 🟡, Reconnecting... 🔴).
 */
export function ConnectionIndicator({
  className,
  showLabel = true,
  status: statusProp,
  socket: socketProp,
}: ConnectionIndicatorProps = {}) {
  const dynamicStatus = useSocketConnection(socketProp)
  const status = statusProp ?? dynamicStatus
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.connecting

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`WebSocket: ${config.label} ${config.emoji}`}
      title={`WebSocket: ${config.label} ${config.emoji}`}
      data-testid="connection-indicator"
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors select-none',
        config.containerClass,
        className
      )}
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', config.dotClass)} />
      {showLabel && <span>{config.label}</span>}
    </div>
  )
}

export default ConnectionIndicator
