import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { handleClientSocket } from './clientHandler.js'
import { handleAgentSocket } from './agentHandler.js'

export let io: Server

export function setupSocketIO(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // Client namespace (web/mobile apps)
  const clientNs = io.of('/client')
  clientNs.on('connection', handleClientSocket)

  // Agent namespace (daemons running on target devices)
  const agentNs = io.of('/agent')
  agentNs.on('connection', handleAgentSocket)

  console.log('🔌 Socket.IO initialized')
}
