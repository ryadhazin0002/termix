import type { Request, Response, NextFunction } from 'express'
import { auth } from '../lib/firebase.js'

export interface AuthRequest extends Request {
  uid?: string
  email?: string
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }
  const token = header.slice(7)
  try {
    const decoded = await auth.verifyIdToken(token)
    req.uid = decoded.uid
    req.email = decoded.email
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
