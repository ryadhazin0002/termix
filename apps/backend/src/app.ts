import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authRouter } from './routes/auth.js'
import { devicesRouter } from './routes/devices.js'
import { sessionsRouter } from './routes/sessions.js'
import { filesRouter } from './routes/files.js'
import { installerRouter } from './routes/installer.js'
import { errorHandler } from './middleware/errorHandler.js'

export const app = express()

app.use(helmet())
app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRouter)
app.use('/api/devices', devicesRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/files', filesRouter)
app.use('/api', installerRouter)

app.use(errorHandler)
