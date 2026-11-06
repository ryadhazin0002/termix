'use client'

import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderPlus, X, Loader2, AlertTriangle } from 'lucide-react'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { requestFileMkdir } from '@/lib/fileSocket'
import { joinPath } from './pathUtils'

export interface CreateFolderDialogProps {
  isOpen: boolean
  onClose: () => void
  deviceId: string
  currentPath: string
  onSuccess?: (createdPath: string) => void
}

export function CreateFolderDialog({
  isOpen,
  onClose,
  deviceId,
  currentPath,
  onSuccess,
}: CreateFolderDialogProps) {
  const { token } = useAuthStore()
  const [folderName, setFolderName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || loading) return

    const trimmed = folderName.trim()
    if (!trimmed) {
      setError('Folder name cannot be empty.')
      return
    }
    if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) {
      setError('Directory traversal (..) is not allowed.')
      return
    }
    if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) {
      setError('Folder name contains invalid characters.')
      return
    }

    setLoading(true)
    setError(null)

    const fullPath = joinPath(currentPath, trimmed)

    try {
      const socket = getSocket(token)
      await requestFileMkdir(socket, deviceId, fullPath)
      setFolderName('')
      onSuccess?.(fullPath)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create directory')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setFolderName('')
    setError(null)
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl z-50 text-zinc-100 flex flex-col gap-4 outline-none">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-brand-500" />
                Create New Folder
              </Dialog.Title>
              <Dialog.Description className="text-xs text-zinc-400 mt-1">
                Enter a directory name to create in{' '}
                <code className="text-zinc-300 font-mono break-all bg-zinc-950 px-1.5 py-0.5 rounded">
                  {currentPath || '/'}
                </code>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="folderNameInput" className="text-xs font-medium text-zinc-300">
                Folder Name
              </label>
              <input
                id="folderNameInput"
                type="text"
                autoFocus
                value={folderName}
                onChange={(e) => {
                  setFolderName(e.target.value)
                  setError(null)
                }}
                placeholder="e.g. logs or app-data"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-brand-500 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !folderName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{loading ? 'Creating...' : 'Create Folder'}</span>
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
