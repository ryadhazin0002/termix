'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'

export default function HomePage() {
  const { user, loading } = useAuthStore()
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect to dashboard if user is already logged in
  useEffect(() => {
    if (!loading && user) {
      window.location.href = '/dashboard'
    }
  }, [user, loading])

  // Handle redirect sign-in results (fallback if popup was blocked)
  useEffect(() => {
    if (!auth) return
    getRedirectResult(auth)
      .then((res) => {
        if (res?.user) {
          window.location.href = '/dashboard'
        }
      })
      .catch((err) => {
        console.error('Redirect sign-in error:', err)
        handleError(err)
      })
  }, [])

  const handleError = (err: any) => {
    const code = err?.code || ''
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : ''

    if (code === 'auth/unauthorized-domain') {
      setUnauthorizedHost(currentHost)
      setAuthError(
        `Domain or IP "${currentHost}" is not authorized in your Firebase Console.`
      )
    } else if (code === 'auth/popup-blocked') {
      setAuthError('Sign-in popup was blocked by your mobile browser. Switching to direct sign-in...')
      // Automatically fallback to redirect on popup-blocked
      signInWithRedirect(auth, googleProvider).catch((e) => {
        setAuthError(e?.message || 'Failed to redirect for sign-in.')
      })
    } else if (code === 'auth/popup-closed-by-user') {
      setAuthError('Sign-in prompt was closed before completion. Please try again.')
    } else if (code === 'auth/network-request-failed') {
      setAuthError('Network error connecting to Firebase. Check your device internet connection.')
    } else {
      setAuthError(err?.message || 'An error occurred during Google sign-in.')
    }
  }

  const handleGoogleLogin = async () => {
    setAuthError(null)
    setUnauthorizedHost(null)
    setIsSubmitting(true)

    try {
      // Use popup first on both mobile and desktop.
      // Modern iOS Safari and Android Chrome handle popups triggered by touch events cleanly,
      // avoiding cross-origin third-party cookie blocking that breaks signInWithRedirect.
      const res = await signInWithPopup(auth, googleProvider)
      if (res?.user) {
        window.location.href = '/dashboard'
        return
      }
    } catch (popupErr: any) {
      console.warn('Popup login attempt error:', popupErr)
      const code = popupErr?.code || ''
      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider)
          return
        } catch (redirectErr: any) {
          handleError(redirectErr)
        }
      } else {
        handleError(popupErr)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-brand-500/20">
          {'⌨'}
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Termix</h1>
        <p className="text-zinc-400 text-center max-w-sm">
          Manage terminals on all your devices from one place.
        </p>
      </div>

      {/* Login card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 w-full max-w-sm flex flex-col gap-4 shadow-xl">
        <h2 className="text-lg font-semibold text-center">Sign in to continue</h2>

        {/* Error Alert Banner */}
        {authError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-xs text-red-300 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>

            {unauthorizedHost && (
              <div className="mt-1 pt-2 border-t border-red-500/20 text-[11px] text-zinc-300 space-y-1">
                <p className="font-semibold text-red-200">How to fix in 30 seconds:</p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Open <strong className="text-white">Firebase Console</strong></li>
                  <li>Go to <strong className="text-white">Authentication &gt; Settings</strong></li>
                  <li>Click <strong className="text-white">Authorized domains</strong></li>
                  <li>Add: <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300 font-mono">{unauthorizedHost}</code></li>
                </ol>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isSubmitting}
          className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span>{isSubmitting ? 'Signing in...' : 'Continue with Google'}</span>
        </button>

        <p className="text-xs text-zinc-500 text-center">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-4 max-w-sm w-full">
        {[
          { icon: '🖥️', label: 'Any device' },
          { icon: '🔒', label: 'Secure' },
          { icon: '⚡', label: 'Real-time' },
        ].map(({ icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-sm text-zinc-400">
            <span className="text-2xl">{icon}</span>
            {label}
          </div>
        ))}
      </div>
    </main>
  )
}
