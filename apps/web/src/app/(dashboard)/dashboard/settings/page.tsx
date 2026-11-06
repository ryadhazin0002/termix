'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { api } from '@/lib/api'
import { defaultUserSettings, type UserSettings } from '@termix/shared'
import {
  Type,
  MousePointer,
  Scroll,
  Bell,
  Sun,
  Moon,
  Monitor,
  Save,
  RotateCcw,
  Undo2,
  Check,
  AlertCircle,
  Loader2,
  Terminal as TerminalIcon,
  Volume2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FONT_SIZES = [12, 14, 16, 18] as const

const FONT_FAMILIES = [
  {
    label: 'JetBrains Mono',
    value: 'JetBrains Mono, Menlo, monospace',
    description: 'Modern developer font with clean ligatures',
  },
  {
    label: 'Fira Code',
    value: 'Fira Code, monospace',
    description: 'Popular monospace font designed for code readability',
  },
  {
    label: 'Menlo',
    value: 'Menlo, Monaco, monospace',
    description: 'Classic Apple macOS terminal monospace',
  },
  {
    label: 'System Monospace',
    value: 'monospace',
    description: 'System-default generic monospace fallback',
  },
]

const CURSOR_STYLES = [
  { value: 'block', label: 'Block', symbol: '█' },
  { value: 'bar', label: 'Bar', symbol: '|' },
  { value: 'underline', label: 'Underline', symbol: ' ' },
] as const

const SCROLLBACK_OPTIONS = [
  { value: 1000, label: '1,000 lines', description: 'Standard buffer' },
  { value: 5000, label: '5,000 lines', description: 'Recommended default' },
  { value: 10000, label: '10,000 lines', description: 'Extended history' },
] as const

const THEMES = [
  { value: 'dark', label: 'Dark', icon: Moon, desc: 'Deep zinc & high contrast' },
  { value: 'light', label: 'Light', icon: Sun, desc: 'Clean white background' },
  { value: 'system', label: 'System', icon: Monitor, desc: 'Match OS dark/light mode' },
] as const

export default function SettingsPage() {
  const { user, token } = useAuthStore()
  const { settings, setSettings, fetchSettings } = useSettingsStore()

  const [formSettings, setFormSettings] = useState<UserSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch latest settings from server on mount
  useEffect(() => {
    if (token) {
      fetchSettings(token)
    }
  }, [token, fetchSettings])

  // Synchronize local form when store settings change
  useEffect(() => {
    setFormSettings(settings)
  }, [settings])

  const isDirty = useMemo(() => {
    return JSON.stringify(formSettings) !== JSON.stringify(settings)
  }, [formSettings, settings])

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await api.patch('/api/auth/settings', formSettings, token)
      setSettings(formSettings)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Failed to save settings:', err)
      setSaveError(err?.message || 'Failed to save settings to server')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    setFormSettings(settings)
    setSaveError(null)
  }

  const handleResetDefaults = () => {
    setFormSettings(defaultUserSettings)
  }

  // Synthesized audio beep using Web Audio API to test terminal bell
  const playTestBell = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
      setTimeout(() => {
        ctx.close().catch(() => {})
      }, 200)
    } catch (err) {
      console.warn('Audio test failed:', err)
    }
  }

  if (!mounted) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Terminal Settings</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Configure appearance, cursor style, scrollback buffers, and behavior across all terminal sessions.
          </p>
        </div>

        {/* Global Save / Discard Actions */}
        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Discard
            </button>
          )}

          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm',
              isDirty
                ? 'bg-brand-500 hover:bg-brand-600 text-white cursor-pointer'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            )}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-3.5 h-3.5 text-green-300" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-4 py-3 rounded-xl animate-in fade-in">
          <Check className="w-4 h-4 shrink-0" />
          <span>Terminal settings successfully saved and synced across all devices.</span>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Grid: Settings Form & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Account Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-300">
                  {user?.displayName ? user.displayName[0]?.toUpperCase() : 'U'}
                </div>
              )}
              <div>
                <p className="font-medium text-sm text-zinc-100">{user?.displayName || 'Termix User'}</p>
                <p className="text-xs text-zinc-400">{user?.email || 'Logged in'}</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 bg-zinc-800 text-zinc-400 rounded-full font-mono">
              Profile Synced
            </span>
          </div>

          {/* Section: Typography & Font */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm border-b border-zinc-800 pb-3">
              <Type className="w-4 h-4 text-brand-500" />
              <span>Typography & Sizing</span>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Font Size</span>
                <span className="text-brand-500 font-mono text-xs">{formSettings.fontSize}px</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setFormSettings((s) => ({ ...s, fontSize: size }))}
                    className={cn(
                      'py-2 px-3 rounded-lg text-xs font-mono font-medium border transition-all text-center',
                      formSettings.fontSize === size
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-zinc-300 block">Font Family</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {FONT_FAMILIES.map((font) => (
                  <button
                    key={font.label}
                    type="button"
                    onClick={() => setFormSettings((s) => ({ ...s, fontFamily: font.value }))}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1',
                      formSettings.fontFamily === font.value
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    <span className="text-xs font-semibold text-zinc-200" style={{ fontFamily: font.value }}>
                      {font.label}
                    </span>
                    <span className="text-[11px] text-zinc-500 line-clamp-1">{font.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Cursor & Interaction */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm border-b border-zinc-800 pb-3">
              <MousePointer className="w-4 h-4 text-brand-500" />
              <span>Cursor & History</span>
            </div>

            {/* Cursor Style */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 block">Cursor Style</label>
              <div className="grid grid-cols-3 gap-2">
                {CURSOR_STYLES.map((cursor) => (
                  <button
                    key={cursor.value}
                    type="button"
                    onClick={() => setFormSettings((s) => ({ ...s, cursorStyle: cursor.value }))}
                    className={cn(
                      'py-2.5 px-3 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-2',
                      formSettings.cursorStyle === cursor.value
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    <span className="font-mono text-base font-bold text-emerald-400">{cursor.symbol}</span>
                    <span>{cursor.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollback Buffer */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-zinc-300 flex items-center gap-1.5">
                  <Scroll className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Scrollback Buffer Limit</span>
                </label>
                <span className="text-zinc-400 font-mono text-[11px]">{formSettings.scrollback.toLocaleString()} lines</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SCROLLBACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormSettings((s) => ({ ...s, scrollback: opt.value }))}
                    className={cn(
                      'py-2 px-3 rounded-lg border text-xs font-medium transition-all text-center',
                      formSettings.scrollback === opt.value
                        ? 'bg-brand-500/10 border-brand-500 text-brand-400 shadow-sm'
                        : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Color Theme & Bell */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm border-b border-zinc-800 pb-3">
              <Sun className="w-4 h-4 text-brand-500" />
              <span>Theme & Audio Behavior</span>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 block">Terminal Color Scheme</label>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((theme) => {
                  const Icon = theme.icon
                  return (
                    <button
                      key={theme.value}
                      type="button"
                      onClick={() => setFormSettings((s) => ({ ...s, theme: theme.value }))}
                      className={cn(
                        'py-3 px-3 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1.5',
                        formSettings.theme === theme.value
                          ? 'bg-brand-500/10 border-brand-500 text-brand-400 shadow-sm'
                          : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{theme.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bell Toggle */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-200">Terminal Audio Bell</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Emit an audible tone when the ASCII bell character (<code className="text-zinc-300">\a</code>) is received.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {formSettings.bellEnabled && (
                  <button
                    type="button"
                    onClick={playTestBell}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                    title="Test audible bell"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Test</span>
                  </button>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={formSettings.bellEnabled}
                  onClick={() => setFormSettings((s) => ({ ...s, bellEnabled: !s.bellEnabled }))}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer',
                    formSettings.bellEnabled ? 'bg-brand-500' : 'bg-zinc-700'
                  )}
                >
                  <span
                    className={cn(
                      'block w-4 h-4 rounded-full bg-white transition-transform transform top-1 absolute left-1',
                      formSettings.bellEnabled && 'translate-x-5'
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sticky Live Visual Preview */}
        <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-brand-500" />
              Live Terminal Preview
            </h2>
            <span className="text-[11px] text-zinc-500">Real-time simulation</span>
          </div>

          {/* Terminal Window Frame */}
          <div
            className={cn(
              'border rounded-xl shadow-2xl overflow-hidden transition-all',
              formSettings.theme === 'light'
                ? 'bg-white border-zinc-300 text-zinc-900 shadow-zinc-200'
                : 'bg-[#0d0d0d] border-zinc-800 text-zinc-200 shadow-black/80'
            )}
          >
            {/* Title Bar */}
            <div
              className={cn(
                'px-4 py-2.5 flex items-center justify-between border-b text-xs select-none',
                formSettings.theme === 'light'
                  ? 'bg-zinc-100 border-zinc-200 text-zinc-600'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              )}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="font-mono text-[11px] font-medium opacity-80">
                preview@termix: ~
              </span>
              <span className="text-[10px] font-mono opacity-50">bash</span>
            </div>

            {/* Terminal Body */}
            <div
              className="p-5 font-mono overflow-x-auto min-h-[340px] flex flex-col justify-between leading-relaxed"
              style={{
                fontFamily: formSettings.fontFamily,
                fontSize: `${formSettings.fontSize}px`,
              }}
            >
              <div className="space-y-2">
                <div>
                  <span className={formSettings.theme === 'light' ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-bold'}>
                    termix@cloud
                  </span>
                  <span className="opacity-60">:</span>
                  <span className="text-blue-400">~</span>
                  <span className="opacity-60">$ </span>
                  <span>termix-info --summary</span>
                </div>

                {/* Simulated Output with ANSI-like colors */}
                <div className="space-y-1 text-xs opacity-90 pl-1 border-l-2 border-emerald-500/30">
                  <p>
                    <span className="text-zinc-500">Terminal:</span> Termix Web Client (XTerm.js v5)
                  </p>
                  <p>
                    <span className="text-zinc-500">Font:</span> {formSettings.fontFamily.split(',')[0]} @ {formSettings.fontSize}px
                  </p>
                  <p>
                    <span className="text-zinc-500">Cursor:</span> {formSettings.cursorStyle} (blinking)
                  </p>
                  <p>
                    <span className="text-zinc-500">Buffer:</span> {formSettings.scrollback.toLocaleString()} lines
                  </p>
                  <p>
                    <span className="text-zinc-500">Theme:</span> {formSettings.theme}
                  </p>
                  <p>
                    <span className="text-zinc-500">Bell:</span> {formSettings.bellEnabled ? 'Audio Alert Enabled' : 'Muted'}
                  </p>
                </div>

                <div className="pt-2">
                  <span className={formSettings.theme === 'light' ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-bold'}>
                    termix@cloud
                  </span>
                  <span className="opacity-60">:</span>
                  <span className="text-blue-400">~</span>
                  <span className="opacity-60">$ </span>
                  <span className="text-yellow-400">echo &quot;Ready for production&quot;</span>
                </div>

                <div className="text-zinc-400">
                  Ready for production
                </div>

                {/* Active Prompt with Dynamic Cursor */}
                <div className="pt-1 flex items-baseline">
                  <span className={formSettings.theme === 'light' ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-bold'}>
                    termix@cloud
                  </span>
                  <span className="opacity-60">:</span>
                  <span className="text-blue-400">~</span>
                  <span className="opacity-60">$ </span>
                  <span className="mr-0.5">cat settings.json</span>

                  {/* Dynamic Cursor Element */}
                  {formSettings.cursorStyle === 'block' && (
                    <span className="inline-block w-[0.55em] h-[1.15em] bg-emerald-500 align-text-bottom animate-pulse ml-0.5" />
                  )}
                  {formSettings.cursorStyle === 'bar' && (
                    <span className="inline-block w-[2px] h-[1.15em] bg-emerald-500 align-text-bottom animate-pulse ml-0.5" />
                  )}
                  {formSettings.cursorStyle === 'underline' && (
                    <span className="inline-block w-[0.55em] h-[2px] bg-emerald-500 align-baseline animate-pulse ml-0.5" />
                  )}
                </div>
              </div>

              {/* Status bar inside preview */}
              <div
                className={cn(
                  'mt-6 pt-3 border-t flex items-center justify-between text-[11px] font-mono opacity-60',
                  formSettings.theme === 'light' ? 'border-zinc-200' : 'border-zinc-800/80'
                )}
              >
                <span>UTF-8</span>
                <span>80x24</span>
                <span>{formSettings.scrollback}L</span>
              </div>
            </div>
          </div>

          {/* Quick Info Callout */}
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-200">Live Preview Note</p>
            <p>
              Changes applied here will immediately take effect in all active terminal tabs upon saving.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
