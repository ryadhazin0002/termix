import { create } from 'zustand'
import type { User as FirebaseUser } from 'firebase/auth'

interface AuthState {
  user: FirebaseUser | null
  token: string | null
  loading: boolean
  setUser: (user: FirebaseUser | null, token: string | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: true,
  setUser: (user, token) => set({ user, token }),
  setLoading: (loading) => set({ loading }),
}))
