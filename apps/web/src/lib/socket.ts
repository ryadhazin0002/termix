import { io, type Socket } from 'socket.io-client'
import { getBackendUrl } from './api'

let socket: Socket | null = null
let currentToken: string | null = null

export function getSocket(token?: string): Socket {
  const backendUrl = getBackendUrl()

  // If a socket instance already exists:
  if (socket) {
    // If a new/different token is supplied, disconnect and recreate
    if (token && token !== currentToken) {
      socket.disconnect()
      socket = null
    } else {
      // Reconnect if manually disconnected
      if (!socket.connected && socket.disconnected) {
        socket.connect()
      }
      return socket
    }
  }

  currentToken = token ?? null
  socket = io(`${backendUrl}/client`, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
  })

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
    currentToken = null
  }
}

