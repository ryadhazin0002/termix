import { formatBytes } from '@termix/shared'

export { formatBytes }

/**
 * Detects whether a path string represents a Windows path.
 */
export function isWindowsPath(p: string): boolean {
  if (!p) return false
  return /^[a-zA-Z]:[\\/]/.test(p) || p.includes('\\')
}

/**
 * Returns separator ('\\' or '/') based on path characteristics.
 */
export function getPathSeparator(p: string): string {
  return isWindowsPath(p) ? '\\' : '/'
}

/**
 * Calculates parent directory path for both Unix and Windows paths.
 * Returns null if already at filesystem root ('/' or 'C:\\' or 'C:').
 */
export function getParentPath(p: string): string | null {
  if (!p || p === '/' || p === '.' || p.trim() === '') return null
  const isWin = isWindowsPath(p)

  // Clean trailing slashes unless drive root like C:\ or POSIX root /
  let clean = p.trim()
  if (clean === '/' || /^[a-zA-Z]:[\\/]?$/.test(clean)) {
    return null
  }

  // Remove trailing slashes
  while (clean.length > 1 && (clean.endsWith('/') || clean.endsWith('\\'))) {
    // If it's a Windows drive root like C:\, don't strip
    if (isWin && /^[a-zA-Z]:[\\/]$/.test(clean)) {
      return null
    }
    clean = clean.slice(0, -1)
  }

  if (isWin) {
    if (/^[a-zA-Z]:$/.test(clean)) return null

    // Split by slashes or backslashes
    const parts = clean.split(/[\\/]+/).filter(Boolean)
    if (parts.length <= 1) return null

    const parentParts = parts.slice(0, -1)
    if (parentParts.length === 1 && /^[a-zA-Z]:$/.test(parentParts[0])) {
      return `${parentParts[0]}\\`
    }
    return parentParts.join('\\')
  } else {
    const parts = clean.split('/').filter(Boolean)
    if (parts.length <= 1) return '/'
    return '/' + parts.slice(0, -1).join('/')
  }
}

/**
 * Joins a parent directory path and a child name safely.
 */
export function joinPath(parent: string, child: string): string {
  if (!parent || parent === '.') return child
  if (!child) return parent
  const isWin = isWindowsPath(parent)
  const sep = isWin ? '\\' : '/'

  if (parent.endsWith('/') || parent.endsWith('\\')) {
    return `${parent}${child}`
  }
  return `${parent}${sep}${child}`
}

export const joinRemotePath = joinPath

export interface BreadcrumbSegment {
  label: string
  fullPath: string
  path: string
}

/**
 * Parses path into interactive breadcrumb segments.
 */
export function parseBreadcrumbs(pathString: string): BreadcrumbSegment[] {
  if (!pathString || pathString.trim() === '') return []
  const clean = pathString.trim()
  const isWin = isWindowsPath(clean)

  if (isWin) {
    // Match drive root: e.g. 'C:\' or 'C:'
    const driveMatch = clean.match(/^([a-zA-Z]:)([\\/]?)(.*)/)
    if (!driveMatch) {
      return [{ label: clean, fullPath: clean, path: clean }]
    }
    const driveLetter = driveMatch[1]
    const driveRoot = `${driveLetter}\\`
    const rest = driveMatch[3]
    const segments: BreadcrumbSegment[] = [{ label: driveLetter, fullPath: driveRoot, path: driveRoot }]

    const parts = rest.split(/[\\/]+/).filter(Boolean)
    let current = driveRoot
    for (const part of parts) {
      current = joinPath(current, part)
      segments.push({ label: part, fullPath: current, path: current })
    }
    return segments
  } else {
    // POSIX path
    const segments: BreadcrumbSegment[] = [{ label: '/', fullPath: '/', path: '/' }]
    const parts = clean.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current = `${current}/${part}`
      segments.push({ label: part, fullPath: current, path: current })
    }
    return segments
  }
}

export const getBreadcrumbs = parseBreadcrumbs
export const getPathBreadcrumbs = parseBreadcrumbs

export type FileCategory = 'code' | 'doc' | 'archive' | 'image' | 'video' | 'audio' | 'unknown'

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'go', 'html', 'css',
  'scss', 'yaml', 'yml', 'sh', 'bash', 'sql', 'c', 'cpp', 'h', 'hpp',
  'java', 'php', 'toml', 'env', 'xml', 'graphql', 'vue', 'svelte', 'rb',
  'lua', 'swift', 'kt', 'dart', 'scala', 'dockerfile', 'makefile',
])

const DOC_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'log', 'rtf', 'pdf', 'csv', 'tsv', 'doc',
  'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt',
])

const ARCHIVE_EXTENSIONS = new Set([
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2', 'xz', 'iso', 'dmg',
])

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'avif',
])

const MEDIA_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv',
])

export function getFileCategory(fileName: string): FileCategory {
  if (!fileName) return 'unknown'
  const lower = fileName.toLowerCase()
  if (lower === '.env' || lower === 'dockerfile' || lower === 'makefile') {
    return 'code'
  }
  const ext = lower.split('.').pop() || ''
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (DOC_EXTENSIONS.has(ext)) return 'doc'
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (MEDIA_EXTENSIONS.has(ext)) return 'video'
  return 'unknown'
}
