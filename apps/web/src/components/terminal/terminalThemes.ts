import type { ITheme } from '@xterm/xterm'

export const darkTheme: ITheme = {
  background: '#0d0d0d',
  foreground: '#d4d4d4',
  cursor: '#22c55e',
  cursorAccent: '#0d0d0d',
  selectionBackground: '#22c55e33',
  selectionInactiveBackground: '#22c55e1a',
  black: '#000000',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#d4d4d4',
  brightBlack: '#71717a',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
}

export const lightTheme: ITheme = {
  background: '#ffffff',
  foreground: '#18181b',
  cursor: '#16a34a',
  cursorAccent: '#ffffff',
  selectionBackground: '#16a34a33',
  selectionInactiveBackground: '#16a34a1a',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f4f4f5',
  brightBlack: '#71717a',
  brightRed: '#b91c1c',
  brightGreen: '#15803d',
  brightYellow: '#a16207',
  brightBlue: '#1d4ed8',
  brightMagenta: '#7e22ce',
  brightCyan: '#0e7490',
  brightWhite: '#ffffff',
}

/**
 * Resolves the active terminal theme based on user settings and system preference.
 */
export function resolveTerminalTheme(
  themeMode: 'dark' | 'light' | 'system',
  systemPrefersDark: boolean = true
): { isDark: boolean; theme: ITheme } {
  const isDark = themeMode === 'system' ? systemPrefersDark : themeMode === 'dark'
  return {
    isDark,
    theme: isDark ? darkTheme : lightTheme,
  }
}

/**
 * Ensures font family has appropriate monospaced fallbacks.
 */
export function getFontFamilyWithFallback(family: string): string {
  if (!family) return 'JetBrains Mono, Menlo, Monaco, monospace'
  if (family.includes(',')) return family
  return `${family}, Menlo, Monaco, 'Courier New', monospace`
}
