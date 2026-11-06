'use client'

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  FileCode,
  Save,
  X,
  Loader2,
  AlertTriangle,
  Check,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes, joinPath } from './pathUtils'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth'
import { requestFileRead, requestFileWrite } from '@/lib/fileSocket'

export interface FileEditorModalProps {
  isOpen: boolean
  onClose: () => void
  deviceId: string
  mode: 'edit' | 'create'
  filePath?: string // For 'edit' mode: absolute path to file
  currentDirectory?: string // For 'create' mode: directory for new file
  initialContent?: string
  onSaveSuccess?: (savedPath: string) => void
}

const MAX_SAFE_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export function FileEditorModal({
  isOpen,
  onClose,
  deviceId,
  mode,
  filePath = '',
  currentDirectory = '',
  initialContent = '',
  onSaveSuccess,
}: FileEditorModalProps) {
  const { token } = useAuthStore()

  // Editor states
  const [content, setContent] = useState<string>(initialContent)
  const [originalContent, setOriginalContent] = useState<string>(initialContent)
  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [showDirtyConfirm, setShowDirtyConfirm] = useState<boolean>(false)
  const [isLargeFile, setIsLargeFile] = useState<boolean>(false)

  // Create Mode state
  const [newFileName, setNewFileName] = useState<string>('')
  const [fileNameError, setFileNameError] = useState<string | null>(null)

  // Cursor position tracking
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })

  // DOM Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  const isDirty = useMemo(() => content !== originalContent, [content, originalContent])

  // Derive active display name and target path
  const activeFileName = useMemo(() => {
    if (mode === 'create') return newFileName || 'new-file.txt'
    const parts = filePath.split(/[/\\]/)
    return parts[parts.length - 1] || 'untitled'
  }, [mode, newFileName, filePath])

  // Split lines for gutter
  const lines = useMemo(() => {
    return content.split('\n')
  }, [content])

  // Reset or load content when modal opens or target changes
  useEffect(() => {
    if (!isOpen) return

    if (mode === 'create') {
      setContent(initialContent || '')
      setOriginalContent(initialContent || '')
      setNewFileName('')
      setFileNameError(null)
      setError(null)
      setShowDirtyConfirm(false)
      setIsLargeFile(false)
      return
    }

    if (mode === 'edit' && filePath) {
      if (initialContent) {
        setContent(initialContent)
        setOriginalContent(initialContent)
        setError(null)
        setShowDirtyConfirm(false)
        setIsLargeFile(new Blob([initialContent]).size > MAX_SAFE_FILE_SIZE_BYTES)
        return
      }

      if (!token) return
      setLoading(true)
      setError(null)
      setShowDirtyConfirm(false)

      const socket = getSocket(token)
      requestFileRead(socket, deviceId, filePath)
        .then((res) => {
          const text = res.content ?? ''
          setContent(text)
          setOriginalContent(text)
          setIsLargeFile(new Blob([text]).size > MAX_SAFE_FILE_SIZE_BYTES)
        })
        .catch((err: any) => {
          setError(err.message || 'Failed to read file content')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [isOpen, mode, filePath, initialContent, deviceId, token])

  // Synchronize gutter vertical scroll with textarea
  const handleScroll = useCallback(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  // Cursor position tracking
  const handleCursorMove = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const selStart = textarea.selectionStart
    const textBefore = content.substring(0, selStart)
    const lineList = textBefore.split('\n')
    const currentLine = lineList.length
    const currentCol = lineList[lineList.length - 1].length + 1
    setCursorPos({ line: currentLine, col: currentCol })
  }, [content])

  // Save Routine
  const handleSave = useCallback(async () => {
    if (saving || loading || !token) return
    setError(null)

    let targetPath = filePath
    if (mode === 'create') {
      const trimmed = newFileName.trim()
      if (!trimmed) {
        setFileNameError('File name is required.')
        return
      }
      if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) {
        setFileNameError('Relative path traversal (..) is not allowed.')
        return
      }
      if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) {
        setFileNameError('File name contains invalid characters.')
        return
      }
      setFileNameError(null)
      targetPath = joinPath(currentDirectory, trimmed)
    }

    setSaving(true)
    try {
      const socket = getSocket(token)
      await requestFileWrite(socket, deviceId, targetPath, content)
      setOriginalContent(content)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
      onSaveSuccess?.(targetPath)
      if (mode === 'create') {
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save file')
    } finally {
      setSaving(false)
    }
  }, [
    saving,
    loading,
    token,
    filePath,
    mode,
    newFileName,
    currentDirectory,
    deviceId,
    content,
    onSaveSuccess,
    onClose,
  ])

  // Keyboard events: Tab key interception & Ctrl+S / Cmd+S
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleSave()
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const val = textarea.value

      const updated = val.substring(0, start) + '  ' + val.substring(end)
      setContent(updated)

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
        handleCursorMove()
      })
    }
  }

  // Global Ctrl+S listener while modal is mounted
  useEffect(() => {
    if (!isOpen) return
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onGlobalKey)
    return () => window.removeEventListener('keydown', onGlobalKey)
  }, [isOpen, handleSave])

  // Close attempt with dirty check
  const handleRequestClose = () => {
    if (isDirty) {
      setShowDirtyConfirm(true)
    } else {
      onClose()
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleRequestClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content
          onPointerDownOutside={(e) => {
            if (isDirty) {
              e.preventDefault()
              setShowDirtyConfirm(true)
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault()
              setShowDirtyConfirm(true)
            }
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-5xl h-[88vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden text-zinc-100 outline-none"
        >
          {/* Header */}
          <div className="h-14 px-5 border-b border-zinc-800 flex items-center justify-between gap-4 shrink-0 bg-zinc-900/90">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {mode === 'create' ? (
                <Plus className="w-5 h-5 text-brand-400 shrink-0" />
              ) : (
                <FileCode className="w-5 h-5 text-brand-400 shrink-0" />
              )}

              {mode === 'create' ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs text-zinc-400 font-mono truncate max-w-xs">
                    {currentDirectory || '/'}/
                  </span>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => {
                      setNewFileName(e.target.value)
                      setFileNameError(null)
                    }}
                    placeholder="filename.ext"
                    className="bg-zinc-950 border border-zinc-700 focus:border-brand-500 rounded px-2.5 py-1 text-xs text-zinc-100 font-mono outline-none w-48 sm:w-64"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Dialog.Title className="text-sm font-semibold text-zinc-100 truncate">
                      {activeFileName}
                    </Dialog.Title>
                    {isDirty && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Modified
                      </span>
                    )}
                  </div>
                  <Dialog.Description className="text-[11px] text-zinc-500 font-mono truncate max-w-lg mt-0.5">
                    {filePath}
                  </Dialog.Description>
                </div>
              )}
            </div>

            {/* Header Right Status & Actions */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-400 font-mono">
                <span>{lines.length} lines</span>
                <span>•</span>
                <span>{formatBytes(new Blob([content]).size)}</span>
              </div>

              <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  saveSuccess
                    ? 'bg-green-600 text-white'
                    : 'bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50'
                )}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>
                  {saveSuccess
                    ? 'Saved!'
                    : saving
                    ? 'Saving...'
                    : mode === 'create'
                    ? 'Create File'
                    : 'Save Changes'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleRequestClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Validation or Socket Error Alert */}
          {(error || fileNameError) && (
            <div className="bg-red-500/10 border-b border-red-500/20 px-5 py-2 flex items-center justify-between text-xs text-red-400">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{fileNameError || error}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setFileNameError(null)
                }}
                className="text-red-400 hover:text-red-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Large File Warning Alert */}
          {isLargeFile && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2 flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Caution: This file exceeds 2MB. Large files may impact editor performance.
              </span>
            </div>
          )}

          {/* Editor Body */}
          <div className="flex-1 flex overflow-hidden bg-zinc-950 font-mono text-xs sm:text-sm relative">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center gap-3 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                <span>Loading remote file content...</span>
              </div>
            ) : (
              <>
                {/* Line Numbers Gutter */}
                <div
                  ref={gutterRef}
                  className="w-12 sm:w-16 py-3 pr-3 text-right bg-zinc-900/50 border-r border-zinc-800/80 text-zinc-500 select-none overflow-hidden shrink-0"
                  style={{ lineHeight: '1.5rem' }}
                  aria-hidden="true"
                >
                  {lines.map((_, idx) => (
                    <div key={idx} className="h-6">
                      {idx + 1}
                    </div>
                  ))}
                </div>

                {/* Main Textarea */}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={handleScroll}
                  onClick={handleCursorMove}
                  onKeyUp={handleCursorMove}
                  onSelect={handleCursorMove}
                  className="flex-1 w-full h-full bg-transparent text-zinc-100 font-mono text-xs sm:text-sm resize-none outline-none p-3 pl-4 whitespace-pre overflow-auto scrollbar-thin"
                  style={{ lineHeight: '1.5rem', tabSize: 2 }}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                />
              </>
            )}

            {/* Unsaved Changes Confirmation Dialog Overlay */}
            {showDirtyConfirm && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>Discard unsaved changes?</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    You have unsaved edits in <strong>{activeFileName}</strong>. If you close now,
                    your changes will be lost.
                  </p>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowDirtyConfirm(false)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors"
                    >
                      Keep Editing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDirtyConfirm(false)
                        onClose()
                      }}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Discard & Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="h-9 px-4 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-[11px] text-zinc-500 font-mono shrink-0 select-none">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">Ctrl+S</kbd> to save
              </span>
              <span>•</span>
              <span>
                <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">Tab</kbd> inserts 2
                spaces
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span>UTF-8</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
