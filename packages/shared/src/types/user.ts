export interface User {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  createdAt: string
  settings: UserSettings
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'system'
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'bar' | 'underline'
  scrollback: number
  bellEnabled: boolean
}

export const defaultUserSettings: UserSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Menlo, monospace',
  cursorStyle: 'block',
  scrollback: 5000,
  bellEnabled: false,
}
