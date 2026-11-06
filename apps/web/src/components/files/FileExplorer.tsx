'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '@/store/auth'
import { getSocket } from '@/lib/socket'
import { requestFileList } from '@/lib/fileSocket'
import { getParentPath, parseBreadcrumbs } from './pathUtils'
import { FileTable } from './FileTable'
import { FileEditorModal } from './FileEditorModal'
import { CreateFolderDialog } from './CreateFolderDialog'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  Search,
  Plus,
  FolderPlus,
  FolderOpen,
  AlertCircle,
  Copy,
  Check,
  Edit2,
  Lock,
} from 'lucide-react'
import type { Device, FileEntry } from '@termix/shared'

export interface FileExplorerProps {
  deviceId: string
  device: Device | null
  loadingDevice?: boolean
}

export function FileExplorer({ deviceId, device, loadingDevice = false }: FileExplorerProps) {
  const { token } = useAuthStore()

  // Navigation & Directory state
  const [currentPath, setCurrentPath] = useState<string>('')
  const [history, setHistory] = useState<string[]>([''])
  const [historyIndex, setHistoryIndex] = useState<number>(0)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Direct Path Input & Filtering
  const [isEditingPath, setIsEditingPath] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedPath, setCopiedPath] = useState(false)

  // Dialog states
  const [selectedFileForEdit, setSelectedFileForEdit] = useState<FileEntry | null>(null)
  const [isNewFileOpen, setIsNewFileOpen] = useState(false)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<FileEntry | null>(null)

  const isOnline = device?.status === 'online'
  const isTrusted = device?.trustStatus === 'trusted'

  // Directory fetch routine
  const loadDirectory = useCallback(
    async (targetPath: string) => {
      if (!token || !deviceId) return
      setLoading(true)
      setError(null)

      try {
        const socket = getSocket(token)
        const result = await requestFileList(socket, deviceId, targetPath)
        setCurrentPath(result.path)
        setEntries(result.entries || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load directory')
      } finally {
        setLoading(false)
      }
    },
    [token, deviceId]
  )

  const hasLoadedInitialRef = useRef(false)

  // Initial directory discovery (starts with path: '') - runs strictly ONCE on mount
  useEffect(() => {
    if (!token || !deviceId) return
    if (hasLoadedInitialRef.current) return

    // If device info is available, ensure it is online and trusted
    if (device && (!isOnline || !isTrusted)) {
      setLoading(false)
      return
    }

    hasLoadedInitialRef.current = true
    loadDirectory('')
  }, [token, deviceId, isOnline, isTrusted, loadDirectory])

  // Navigation handlers
  const navigateTo = (newPath: string) => {
    if (newPath === currentPath) return
    const updatedHistory = history.slice(0, historyIndex + 1)
    updatedHistory.push(newPath)
    setHistory(updatedHistory)
    setHistoryIndex(updatedHistory.length - 1)
    loadDirectory(newPath)
  }

  const goBack = () => {
    if (historyIndex > 0) {
      const prevPath = history[historyIndex - 1]
      setHistoryIndex(historyIndex - 1)
      loadDirectory(prevPath)
    }
  }

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const nextPath = history[historyIndex + 1]
      setHistoryIndex(historyIndex + 1)
      loadDirectory(nextPath)
    }
  }

  const goUp = () => {
    const parent = getParentPath(currentPath)
    if (parent) {
      navigateTo(parent)
    }
  }

  const refresh = () => {
    loadDirectory(currentPath)
  }

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsEditingPath(false)
    if (pathInput.trim()) {
      navigateTo(pathInput.trim())
    }
  }

  const copyCurrentPath = async () => {
    if (!currentPath) return
    try {
      await navigator.clipboard.writeText(currentPath)
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 2000)
    } catch {}
  }

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase().trim()
    return entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [entries, searchQuery])

  const breadcrumbs = useMemo(() => parseBreadcrumbs(currentPath), [currentPath])
  const canGoUp = Boolean(getParentPath(currentPath))

  if (device && (!isOnline || !isTrusted)) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center border border-zinc-800 rounded-xl bg-zinc-900/40">
        {!isTrusted ? (
          <Lock className="w-12 h-12 text-yellow-500/80 mb-3" />
        ) : (
          <AlertCircle className="w-12 h-12 text-zinc-600 mb-3" />
        )}
        <h3 className="text-base font-semibold text-zinc-300">File Explorer Unavailable</h3>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          {!isOnline
            ? 'The device agent is currently offline. File browsing will become active as soon as the agent connects.'
            : 'This device is awaiting approval or has been blocked. Approve the device on the dashboard to access remote files.'}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Explorer Toolbar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: History buttons & Breadcrumbs */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goBack}
              disabled={historyIndex <= 0 || loading}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 rounded-lg transition-colors"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goForward}
              disabled={historyIndex >= history.length - 1 || loading}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 rounded-lg transition-colors"
              title="Forward"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goUp}
              disabled={!canGoUp || loading}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 rounded-lg transition-colors"
              title="Up"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Breadcrumb or Direct Path Input */}
          <div className="flex-1 min-w-[180px] bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 flex items-center gap-1 overflow-hidden">
            {isEditingPath ? (
              <form onSubmit={handlePathSubmit} className="w-full flex items-center gap-1">
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onBlur={() => setIsEditingPath(false)}
                  autoFocus
                  className="w-full bg-transparent text-xs text-zinc-100 font-mono outline-none"
                  placeholder="Enter remote path..."
                />
              </form>
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs font-mono text-zinc-400 flex-1">
                {breadcrumbs.length === 0 ? (
                  <span className="text-zinc-600">~</span>
                ) : (
                  breadcrumbs.map((segment, idx) => (
                    <React.Fragment key={segment.fullPath}>
                      <button
                        type="button"
                        onClick={() => navigateTo(segment.fullPath)}
                        className="hover:text-brand-400 text-zinc-300 transition-colors shrink-0"
                      >
                        {segment.label}
                      </button>
                      {idx < breadcrumbs.length - 1 && (
                        <span className="text-zinc-600 select-none">/</span>
                      )}
                    </React.Fragment>
                  ))
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setPathInput(currentPath)
                setIsEditingPath(!isEditingPath)
              }}
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Edit path directly"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={copyCurrentPath}
              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Copy path"
            >
              {copiedPath ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />}
            </button>
          </div>
        </div>

        {/* Right: Search filter & File/Folder Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500 w-36 sm:w-44 transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsNewFileOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-medium transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New File</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateFolderOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Folder</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center gap-3 text-zinc-400 bg-zinc-900/30 border border-zinc-800 rounded-xl">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading directory contents...</span>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-xs font-medium max-w-md">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/30 border border-zinc-800 rounded-xl p-8 text-center">
            <FolderOpen className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm font-medium text-zinc-400">This folder is empty</p>
            {searchQuery && (
              <p className="text-xs text-zinc-500 mt-1">No files match &quot;{searchQuery}&quot;</p>
            )}
          </div>
        ) : (
          <FileTable
            entries={filteredEntries}
            onNavigate={navigateTo}
            onOpenFile={(file) => setSelectedFileForEdit(file)}
            onDelete={(entry) => setEntryToDelete(entry)}
          />
        )}
      </div>

      {/* Dialogs and Modals */}
      {/* 1. Edit existing file modal */}
      {selectedFileForEdit && (
        <FileEditorModal
          isOpen={Boolean(selectedFileForEdit)}
          onClose={() => setSelectedFileForEdit(null)}
          deviceId={deviceId}
          mode="edit"
          filePath={selectedFileForEdit.path}
          onSaveSuccess={() => {
            refresh()
          }}
        />
      )}

      {/* 2. Create new file modal */}
      {isNewFileOpen && (
        <FileEditorModal
          isOpen={isNewFileOpen}
          onClose={() => setIsNewFileOpen(false)}
          deviceId={deviceId}
          mode="create"
          currentDirectory={currentPath}
          onSaveSuccess={() => {
            refresh()
          }}
        />
      )}

      {/* 3. Create folder dialog */}
      <CreateFolderDialog
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        deviceId={deviceId}
        currentPath={currentPath}
        onSuccess={() => {
          refresh()
        }}
      />

      {/* 4. Delete confirm dialog */}
      <DeleteConfirmDialog
        isOpen={Boolean(entryToDelete)}
        onClose={() => setEntryToDelete(null)}
        deviceId={deviceId}
        item={entryToDelete}
        onSuccess={() => {
          refresh()
        }}
      />
    </div>
  )
}
