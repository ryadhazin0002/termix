'use client'

import { useEffect } from 'react'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import { setTokenProvider } from '@/lib/api'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    if (auth) {
      setTokenProvider(async (forceRefresh = false) => {
        if (auth.currentUser) {
          const fresh = await auth.currentUser.getIdToken(forceRefresh)
          useAuthStore.getState().setUser(auth.currentUser, fresh)
          return fresh
        }
        return null
      })
    }

    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken()
        setUser(user, token)
      } else {
        setUser(null, null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [setUser, setLoading])

  return <>{children}</>
}
