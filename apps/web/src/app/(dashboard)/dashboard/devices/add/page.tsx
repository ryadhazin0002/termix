'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useDevicesStore } from '@/store/devices'
import { auth } from '@/lib/firebase'
import { api } from '@/lib/api'
import type { Device } from '@termix/shared'
import { Copy, Check, ArrowLeft, Terminal, AlertCircle, Laptop, Code2, FileText, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function AddDevicePage() {
  const router = useRouter()
  const { token, user } = useAuthStore()
  const { addDevice } = useDevicesStore()
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [device, setDevice] = useState<(Device & { agentToken?: string }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'linux' | 'windows' | 'pnpm' | 'env'>('linux')

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter a device name.')
      return
    }

    setLoading(true)
    try {
      let activeToken = token
      if (typeof window !== 'undefined' && auth?.currentUser) {
        try {
          activeToken = await auth.currentUser.getIdToken()
        } catch {
          // fallback to store token
        }
      }

      const newDevice = await api.post<Device & { agentToken?: string }>(
        '/api/devices',
        {
          name: name.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        },
        activeToken || undefined
      )
      addDevice(newDevice)
      setDevice(newDevice)
    } catch (err: unknown) {
      console.error('Error creating device:', err)
      const message = err instanceof Error ? err.message : 'Failed to create device'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

  const linuxCmd = device
    ? `curl -sSL "${backendUrl}/api/install.sh?id=${device.id}&token=${device.agentToken || ''}&name=${encodeURIComponent(device.name)}" | bash`
    : ''

  const windowsCmd = device
    ? `irm "${backendUrl}/api/install.ps1?id=${device.id}&token=${device.agentToken || ''}&name=${encodeURIComponent(device.name)}" | iex`
    : ''

  const pnpmCmd = device
    ? `pnpm --filter @termix/agent start -- --id ${device.id} --token ${device.agentToken || ''} --server ${backendUrl}`
    : ''

  const envContent = device
    ? [
        `TERMIX_SERVER_URL=${backendUrl}`,
        `TERMIX_DEVICE_ID=${device.id}`,
        `TERMIX_DEVICE_TOKEN=${device.agentToken || '<token>'}`,
        `TERMIX_DEVICE_NAME=${device.name}`,
        `HEARTBEAT_INTERVAL_MS=15000`,
      ].join('\n')
    : ''

  const getCurrentSnippet = () => {
    switch (activeTab) {
      case 'linux':
        return linuxCmd
      case 'windows':
        return windowsCmd
      case 'pnpm':
        return pnpmCmd
      case 'env':
        return envContent
    }
  }

  const copyToClipboard = (text: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard"
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Add a Device</h1>
      </div>

      {!device ? (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">
              Device Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              placeholder="e.g. Home Server, Gaming PC, Work Laptop"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. home, linux, production"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Creating device...</span>
              </>
            ) : (
              'Create Device'
            )}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl p-4 text-sm flex items-center gap-2">
            <span>✅ Device <strong>{device.name}</strong> created! Choose your install method below:</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
            {/* Install Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-800/80 rounded-lg text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('linux')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'linux' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>🐧 Linux / macOS (1-Line)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('windows')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'windows' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>🪟 Windows (1-Line)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pnpm')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'pnpm' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>⚡ PNPM / CLI</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('env')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'env' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>📄 Manual .env</span>
              </button>
            </div>

            {/* Explanatory description */}
            <p className="text-xs text-zinc-400">
              {activeTab === 'linux' && 'Paste this single command on your Linux or macOS machine. It automatically configures and runs the agent.'}
              {activeTab === 'windows' && 'Paste this single command in Windows PowerShell. It automatically writes the config and connects.'}
              {activeTab === 'pnpm' && 'If you cloned the Termix repository, run this single command to connect and auto-save configuration.'}
              {activeTab === 'env' && 'Create apps/agent/.env and paste these environment variables manually.'}
            </p>

            {/* Code Block with Copy Button */}
            <div className="relative">
              <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3.5 pr-20 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                {getCurrentSnippet()}
              </pre>
              <button
                type="button"
                onClick={() => copyToClipboard(getCurrentSnippet())}
                className="absolute top-2.5 right-2.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md transition-colors flex items-center gap-1.5 text-xs text-zinc-200 shadow-sm"
                title="Copy command"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="font-medium">Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-zinc-800/80">
              <Link
                href="/dashboard"
                className="flex-1 py-2 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg text-center transition-colors shadow-lg shadow-brand-500/20"
              >
                Go to Dashboard
              </Link>
              <Link
                href={`/dashboard/devices/${device.id}/terminal`}
                className="py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg text-center transition-colors flex items-center gap-2"
              >
                <Terminal className="w-4 h-4" />
                Terminal
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
