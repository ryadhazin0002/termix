import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config()

import { createServer } from 'http'
import { app } from './app.js'
import { setupSocketIO } from './socket/index.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const httpServer = createServer(app)

setupSocketIO(httpServer)

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err)
})

httpServer.listen(PORT, () => {
  console.log(`🚀 Termix backend running on port ${PORT}`)
})
