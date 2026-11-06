import { Router } from 'express'
import { authenticate, type AuthRequest } from '../middleware/authenticate.js'
import { db } from '../lib/firebase.js'
import { defaultUserSettings } from '@termix/shared'

export const authRouter = Router()

// Called after Google login on the client — creates user doc if first time
authRouter.post('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!
    const userRef = db.collection('users').doc(uid)
    const snap = await userRef.get()
    if (!snap.exists) {
      await userRef.set({
        uid,
        email: req.email ?? '',
        displayName: '',
        photoURL: '',
        createdAt: new Date().toISOString(),
        settings: defaultUserSettings,
      })
    }
    res.json(snap.exists ? snap.data() : (await userRef.get()).data())
  } catch (err) {
    res.status(500).json({ error: 'Failed to get or create user' })
  }
})

// Get user settings
authRouter.get('/settings', authenticate, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!
    const snap = await db.collection('users').doc(uid).get()
    if (!snap.exists) {
      return res.json(defaultUserSettings)
    }
    const data = snap.data()
    const settings = data?.settings ? { ...defaultUserSettings, ...data.settings } : defaultUserSettings
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
})

// Update user settings
authRouter.patch('/settings', authenticate, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!
    await db.collection('users').doc(uid).set({ settings: req.body }, { merge: true })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

