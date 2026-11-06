'use client'

import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { requestFileDelete } from '@/lib/fileSocket'
import type { FileEntry } from '@termix/shared'

export interface DeleteConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  deviceId: string
  item: FileEntry | null
  onSuccess?: () => void
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  deviceId,
  item,
  onSuccess,
}: DeleteConfirmDialogProps) {
  const { token } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!item) return null

  const isRoot = item.path === '/' || /^[a-zA-Z]:\\?$/.test(item.path.trim())

  const handleDelete = async () => {
    if (!token || loading) return
    if (isRoot) {
      setError('Cannot delete filesystem root directory.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const socket = getSocket(token)
      await requestFileDelete(socket, deviceId, item.path)
      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to delete remote item')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setError(null)
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl z-50 text-zinc-100 flex flex-col gap-4 outline-none">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-red-500/10 text-red-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-zinc-100">
                  {item.isDirectory ? 'Delete Directory?' : 'Delete File?'}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400 mt-1">
                  {item.isDirectory ? (
                    <>
                      Are you sure you want to delete <strong>{item.name}</strong>?
                    </>
                  ) : (
                    <>
                      Are you sure you want to permanently delete <strong>{item.name}</strong>? This action cannot be undone.
                    </>
                  )}
                </Dialog.Description>
              </div>
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

          {/* Destructive recursive warning for directories */}
          {item.isDirectory && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-200">Warning: Recursive Deletion</p>
                <p className="mt-0.5 leading-relaxed text-zinc-300">
                  This will permanently delete the folder and <strong>all files and subfolders</strong> it contains.
                </p>
              </div>
            </div>
          )}

          {/* Remote Path Box */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 font-mono text-xs text-zinc-300 break-all select-all">
            {item.path}
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={loading}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading || isRoot}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Trash2 className="w-3.5 h-3.5" />
              <span>{loading ? 'Deleting...' : item.isDirectory ? 'Delete Folder' : 'Delete File'}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
