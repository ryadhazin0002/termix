import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { defaultUserSettings, type UserSettings } from '@termix/shared'
import { api } from '@/lib/api'

export interface SettingsState {
  settings: UserSettings
  loading: boolean
  saving: boolean
  error: string | null
  setSettings: (settings: UserSettings) => void
  updateSettings: (updates: Partial<UserSettings>) => void
  resetSettings: () => void
  fetchSettings: (token: string) => Promise<void>
  saveSettings: (settings: Partial<UserSettings>, token: string) => Promise<boolean>
  setLoading: (loading: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultUserSettings,
      loading: false,
      saving: false,
      error: null,

      setSettings: (settings: UserSettings) => set({ settings, error: null }),

      updateSettings: (updates: Partial<UserSettings>) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
          error: null,
        })),

      resetSettings: () => set({ settings: defaultUserSettings, error: null }),

      fetchSettings: async (token: string) => {
        if (!token) return
        set({ loading: true, error: null })
        try {
          const remote = await api.get<UserSettings>('/api/auth/settings', token)
          if (remote) {
            set((state) => ({
              settings: {
                ...defaultUserSettings,
                ...state.settings,
                ...remote,
              },
              loading: false,
            }))
          } else {
            set({ loading: false })
          }
        } catch (err: any) {
          console.error('Failed to fetch user settings:', err)
          set({
            error: err?.message ?? 'Failed to fetch settings',
            loading: false,
          })
        }
      },

      saveSettings: async (newSettings: Partial<UserSettings>, token: string) => {
        if (!token) return false
        set({ saving: true, error: null })
        try {
          const merged = { ...get().settings, ...newSettings }
          await api.patch('/api/auth/settings', merged, token)
          set({ settings: merged, saving: false })
          return true
        } catch (err: any) {
          console.error('Failed to save settings:', err)
          set({
            error: err?.message ?? 'Failed to save settings',
            saving: false,
          })
          return false
        }
      },

      setLoading: (loading: boolean) => set({ loading }),
    }),
    {
      name: 'termix-user-settings',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return window.localStorage
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          length: 0,
          clear: () => {},
          key: () => null,
        } as Storage
      }),
      partialize: (state) => ({ settings: state.settings }),
      merge: (persistedState: any, currentState: SettingsState) => ({
        ...currentState,
        ...persistedState,
        settings: {
          ...defaultUserSettings,
          ...(persistedState?.settings || {}),
        },
      }),
    }
  )
)
