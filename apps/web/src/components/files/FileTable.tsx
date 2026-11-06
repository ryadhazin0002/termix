'use client'

import React, { useMemo, useState } from 'react'
import type { FileEntry } from '@termix/shared'
import { formatBytes, getFileCategory } from './pathUtils'
import {
  Folder,
  FileText,
  FileCode,
  Archive,
  File,
  Image,
  Film,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit3,
} from 'lucide-react'

export interface FileTableProps {
  entries: FileEntry[]
  onNavigate: (path: string) => void
  onOpenFile: (file: FileEntry) => void
  onDelete: (entry: FileEntry) => void
}

export type SortField = 'name' | 'size' | 'modifiedAt'
export type SortOrder = 'asc' | 'desc'

export function getFileIcon(entry: { isDirectory: boolean; name: string }) {
  if (entry.isDirectory) {
    return <Folder className="w-4 h-4 text-amber-400 shrink-0" />
  }
  const category = getFileCategory(entry.name)
  switch (category) {
    case 'code':
      return <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
    case 'doc':
      return <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
    case 'archive':
      return <Archive className="w-4 h-4 text-purple-400 shrink-0" />
    case 'image':
      return <Image className="w-4 h-4 text-pink-400 shrink-0" />
    case 'video':
      return <Film className="w-4 h-4 text-indigo-400 shrink-0" />
    default:
      return <File className="w-4 h-4 text-zinc-400 shrink-0" />
  }
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function FileTable({ entries, onNavigate, onOpenFile, onDelete }: FileTableProps) {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      // 1. Directories always first
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1

      // 2. Secondary sort according to sortField
      let result = 0
      if (sortField === 'name') {
        result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      } else if (sortField === 'size') {
        result = a.size - b.size
      } else if (sortField === 'modifiedAt') {
        result = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()
      }
      return sortOrder === 'asc' ? result : -result
    })
  }, [entries, sortField, sortOrder])

  return (
    <div className="h-full overflow-auto border border-zinc-800 rounded-xl bg-zinc-900/60 shadow-inner">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-zinc-800 text-xs font-semibold text-zinc-400 bg-zinc-900/95 sticky top-0 z-10 backdrop-blur">
            <th
              className="py-2.5 px-4 cursor-pointer select-none hover:text-zinc-200 transition-colors"
              onClick={() => handleToggleSort('name')}
            >
              <div className="flex items-center gap-1.5">
                <span>Name</span>
                {sortField === 'name' && (
                  sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                )}
              </div>
            </th>

            <th
              className="py-2.5 px-4 cursor-pointer select-none hover:text-zinc-200 w-28 transition-colors"
              onClick={() => handleToggleSort('size')}
            >
              <div className="flex items-center gap-1.5">
                <span>Size</span>
                {sortField === 'size' && (
                  sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                )}
              </div>
            </th>

            <th className="py-2.5 px-4 w-28 hidden sm:table-cell text-zinc-400">Permissions</th>

            <th
              className="py-2.5 px-4 cursor-pointer select-none hover:text-zinc-200 w-44 hidden md:table-cell transition-colors"
              onClick={() => handleToggleSort('modifiedAt')}
            >
              <div className="flex items-center gap-1.5">
                <span>Modified</span>
                {sortField === 'modifiedAt' && (
                  sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                )}
              </div>
            </th>

            <th className="py-2.5 px-4 w-20 text-right text-zinc-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr
              key={entry.path}
              className="border-b border-zinc-800/40 hover:bg-zinc-800/40 transition-colors group cursor-pointer text-xs"
              onClick={() => {
                if (entry.isDirectory) {
                  onNavigate(entry.path)
                } else {
                  onOpenFile(entry)
                }
              }}
            >
              <td className="py-2.5 px-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  {getFileIcon(entry)}
                  <span
                    className={
                      entry.isDirectory
                        ? 'font-medium text-zinc-100 group-hover:text-brand-400 transition-colors truncate'
                        : 'text-zinc-300 group-hover:text-zinc-100 transition-colors truncate'
                    }
                  >
                    {entry.name}
                  </span>
                </div>
              </td>

              <td className="py-2.5 px-4 text-zinc-400 font-mono whitespace-nowrap">
                {entry.isDirectory ? '—' : formatBytes(entry.size)}
              </td>

              <td className="py-2.5 px-4 text-zinc-500 font-mono hidden sm:table-cell">
                {entry.permissions || (entry.isDirectory ? '0755' : '0644')}
              </td>

              <td className="py-2.5 px-4 text-zinc-400 hidden md:table-cell whitespace-nowrap">
                {formatDate(entry.modifiedAt)}
              </td>

              <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {!entry.isDirectory && (
                    <button
                      type="button"
                      onClick={() => onOpenFile(entry)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
                      title="Edit file"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                    title={entry.isDirectory ? 'Delete folder' : 'Delete file'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
