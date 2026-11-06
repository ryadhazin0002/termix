import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'

export const filesRouter = Router()
filesRouter.use(authenticate)

// File operations are proxied through the WebSocket relay to the agent
// REST endpoints here are placeholders for future direct HTTP file transfer
filesRouter.get('/list', async (_req, res) => {
  res.json({ message: 'File listing is done via WebSocket to the agent' })
})
