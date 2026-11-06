import admin from 'firebase-admin'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Critical Firebase Env Missing in backend:', {
      hasProjectId: !!projectId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKey,
    })
  }

  if (privateKey && privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n')
  }

  const options: admin.AppOptions = {
    projectId,
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  }
  if (process.env.FIREBASE_DATABASE_URL) {
    options.databaseURL = process.env.FIREBASE_DATABASE_URL
  }
  admin.initializeApp(options)
}

export const db = admin.firestore()
try {
  db.settings({
    ignoreUndefinedProperties: true,
  })
} catch {
  // ignore if already configured
}

export const auth = admin.auth()

/**
 * Universal auto-retry helper for Firestore queries.
 * Automatically recovers from transient gRPC 16 UNAUTHENTICATED / token-refresh timing glitches
 * by forcing an OAuth token refresh and retrying with exponential backoff.
 */
export async function retryFirestore<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (err: any) {
      lastError = err
      const isTransientAuth =
        err?.message?.includes('UNAUTHENTICATED') ||
        err?.code === 16 ||
        err?.details?.includes('UNAUTHENTICATED') ||
        err?.message?.includes('invalid authentication credentials')

      if (isTransientAuth && attempt < maxRetries) {
        console.warn(`[firestore] transient auth refresh glitch (attempt ${attempt + 1}/${maxRetries}), forcing token refresh...`)
        try {
          const cred = admin.app()?.options?.credential as any
          if (cred && typeof cred.getAccessToken === 'function') {
            await cred.getAccessToken(true)
          }
        } catch (credErr) {
          console.warn('[firestore] error forcing token refresh:', credErr)
        }
        const delay = 350 * Math.pow(2, attempt)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw lastError
}

export default admin
