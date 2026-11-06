'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { Socket } from 'socket.io-client'
import { useSettingsStore } from '@/store/settings'
import type { UserSettings } from '@termix/shared'
import {
  resolveTerminalTheme,
  getFontFamilyWithFallback,
} from './terminalThemes'
import '@xterm/xterm/css/xterm.css'

export interface TerminalViewProps {
  sessionId: string
  socket: Socket
  className?: string
  settingsOverride?: Partial<UserSettings>
}

/**
 * Synthesizes an authentic terminal bell sound using Web Audio API.
 */
function playTerminalBellSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.12)

    setTimeout(() => {
      ctx.close().catch(() => {})
    }, 200)
  } catch {
    // Graceful fallback if audio context is blocked by browser autoplay policy
  }
}

export function TerminalView({
  sessionId,
  socket,
  className,
  settingsOverride,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const bellDisposableRef = useRef<{ dispose: () => void } | null>(null)

  // Reactive settings from Zustand store
  const storeSettings = useSettingsStore((state) => state.settings)
  const settings = { ...storeSettings, ...settingsOverride }

  // Track system dark mode preference for theme === 'system'
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  })

  // Watch for OS theme changes when theme === 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
    mediaQuery.addListener(handler)
    return () => mediaQuery.removeListener(handler)
  }, [])

  const { theme: activeTheme } = resolveTerminalTheme(settings.theme, systemPrefersDark)

  // Keep a mutable ref to bellEnabled for onBell callback to avoid re-binding
  const bellEnabledRef = useRef(settings.bellEnabled)
  useEffect(() => {
    bellEnabledRef.current = settings.bellEnabled
  }, [settings.bellEnabled])

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      socket.emit('terminal:resize', { sessionId, cols, rows })
    },
    [socket, sessionId]
  )

  // Terminal lifecycle: Mounts ONCE per sessionId and socket.
  // Never re-run on settings changes to prevent disposing the terminal buffer!
  useEffect(() => {
    if (!containerRef.current) return

    // Clean container in case of remount
    containerRef.current.innerHTML = ''

    const initialPrefersDark =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true
    const initialTheme = resolveTerminalTheme(settings.theme, initialPrefersDark).theme

    const term = new Terminal({
      theme: initialTheme,
      fontSize: settings.fontSize,
      fontFamily: getFontFamilyWithFallback(settings.fontFamily),
      cursorBlink: true,
      cursorStyle: settings.cursorStyle,
      scrollback: settings.scrollback,
      allowTransparency: true,
    })

    // Set bellStyle option for options compatibility
    ;(term.options as any).bellStyle = settings.bellEnabled ? 'sound' : 'none'

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    // Protect against xterm.js race condition in React StrictMode/Hot Reload:
    // xterm Viewport schedules asynchronous syncScrollArea via setTimeout/RAF.
    // If term is disposed or not fully initialized, reading dimensions throws TypeError.
    try {
      const core = (term as any)._core
      if (core?._renderService) {
        const renderServiceProto = Object.getPrototypeOf(core._renderService)
        if (renderServiceProto && !renderServiceProto._patchedDimensions) {
          renderServiceProto._patchedDimensions = true
          const origGetter = Object.getOwnPropertyDescriptor(renderServiceProto, 'dimensions')?.get
          if (origGetter) {
            Object.defineProperty(renderServiceProto, 'dimensions', {
              get() {
                if (!this._renderer?.value) {
                  return {
                    css: {
                      canvas: { width: 0, height: 0 },
                      cell: { width: 0, height: 0 },
                    },
                    device: {
                      canvas: { width: 0, height: 0 },
                      cell: { width: 0, height: 0 },
                      char: { width: 0, height: 0, left: 0, top: 0 },
                    },
                  }
                }
                return origGetter.call(this)
              },
              configurable: true,
              enumerable: true,
            })
          }
        }
      }

      if (core?.viewport) {
        const viewportProto = Object.getPrototypeOf(core.viewport)
        if (viewportProto && !viewportProto._patchedSyncScrollArea) {
          viewportProto._patchedSyncScrollArea = true
          const origSync = viewportProto.syncScrollArea
          viewportProto.syncScrollArea = function (e?: boolean) {
            try {
              if (this._renderService && !this._renderService._renderer?.value) {
                return
              }
              return origSync.call(this, e)
            } catch {
              // Ignore scroll sync error on unmounted/disposing terminal
            }
          }
        }
      }
    } catch {
      // Safe guard
    }

    termRef.current = term
    fitAddonRef.current = fitAddon

    const safeFit = () => {
      if (!termRef.current || !fitAddonRef.current || !containerRef.current) return
      if (containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) return
      try {
        fitAddonRef.current.fit()
        sendResize(termRef.current.cols, termRef.current.rows)
      } catch {
        // Safe fallback
      }
    }

    let rafId: number | null = requestAnimationFrame(() => {
      safeFit()
    })
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      safeFit()
      term.focus()
      // Send an initial return to prompt shell display
      socket.emit('terminal:input', { sessionId, data: '\r' })
    }, 100)

    // Send terminal user input to server
    term.onData((data) => {
      socket.emit('terminal:input', { sessionId, data })
    })

    // Handle terminal bell
    const bellDisposable = term.onBell(() => {
      if (bellEnabledRef.current) {
        playTerminalBellSound()
      }
    })
    bellDisposableRef.current = bellDisposable

    // Receive terminal output from server
    const handleOutput = (payload: { sessionId: string; data: string }) => {
      if (payload.sessionId === sessionId && termRef.current) {
        try {
          termRef.current.write(payload.data)
        } catch {
          // Safe write
        }
      }
    }
    socket.on('terminal:output', handleOutput)

    // Handle container resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          safeFit()
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    // Initial size notification
    sendResize(term.cols, term.rows)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (timeoutId) clearTimeout(timeoutId)
      socket.off('terminal:output', handleOutput)
      resizeObserver.disconnect()
      bellDisposable.dispose()
      try {
        if ((term as any)._core?.viewport) {
          ;(term as any)._core.viewport.syncScrollArea = () => {}
        }
        term.dispose()
      } catch {
        // Safe disposal
      }
      termRef.current = null
      fitAddonRef.current = null
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, socket, sendResize])

  // Dynamic settings synchronization: updates existing terminal options without disposing
  useEffect(() => {
    const term = termRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !fitAddon) return

    let needsRefit = false

    // Dynamic Font Size
    if (term.options.fontSize !== settings.fontSize) {
      term.options.fontSize = settings.fontSize
      needsRefit = true
    }

    // Dynamic Font Family
    const resolvedFont = getFontFamilyWithFallback(settings.fontFamily)
    if (term.options.fontFamily !== resolvedFont) {
      term.options.fontFamily = resolvedFont
      needsRefit = true
    }

    // Dynamic Cursor Style
    if (term.options.cursorStyle !== settings.cursorStyle) {
      term.options.cursorStyle = settings.cursorStyle
    }

    // Dynamic Scrollback
    if (term.options.scrollback !== settings.scrollback) {
      term.options.scrollback = settings.scrollback
    }

    // Dynamic Bell Style option
    ;(term.options as any).bellStyle = settings.bellEnabled ? 'sound' : 'none'

    // Dynamic Theme Update
    term.options.theme = { ...activeTheme }

    // If font size or font family changed, recalculate geometry after layout render tick
    if (needsRefit) {
      requestAnimationFrame(() => {
        if (!termRef.current || !fitAddonRef.current) return
        try {
          fitAddonRef.current.fit()
          sendResize(termRef.current.cols, termRef.current.rows)
        } catch {
          // Safe fallback
        }
      })
    }
  }, [
    settings.fontSize,
    settings.fontFamily,
    settings.cursorStyle,
    settings.scrollback,
    settings.bellEnabled,
    activeTheme,
    sendResize,
  ])

  return (
    <div
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
      className={`w-full h-full cursor-text ${className ?? ''}`}
      style={{ background: activeTheme.background }}
    />
  )
}
