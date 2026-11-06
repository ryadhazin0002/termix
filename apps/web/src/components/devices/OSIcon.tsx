'use client'

import React from 'react'
import type { Device } from '@termix/shared'
import { cn } from '@/lib/utils'

export interface OSInfo {
  os: 'windows' | 'linux' | 'macos' | 'unknown'
  distro: string
  distroId: string
  badgeColor: {
    bg: string
    border: string
    text: string
  }
}

/**
 * Robust helper to resolve OS and distribution details, with smart heuristics
 * for existing devices where telemetry is still arriving.
 */
export function getDeviceOSInfo(device?: Partial<Device> | null): OSInfo {
  if (!device) {
    return {
      os: 'unknown',
      distro: 'Unknown OS',
      distroId: 'unknown',
      badgeColor: { bg: 'bg-zinc-800/80', border: 'border-zinc-700/50', text: 'text-zinc-400' },
    }
  }

  const rawOs = (device.os || '').toLowerCase()
  const rawDistro = (device.distro || '').trim()
  const rawDistroId = (device.distroId || '').toLowerCase().trim()
  const hostname = (device.hostname || '').toLowerCase()
  const name = (device.name || '').toLowerCase()
  const tags = (device.tags || []).map((t) => t.toLowerCase())

  // 1. Explicit Distro ID from agent
  if (rawDistroId) {
    if (rawDistroId === 'windows11') {
      return {
        os: 'windows',
        distro: rawDistro || 'Windows 11',
        distroId: 'windows11',
        badgeColor: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
      }
    }
    if (rawDistroId === 'windows10') {
      return {
        os: 'windows',
        distro: rawDistro || 'Windows 10',
        distroId: 'windows10',
        badgeColor: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
      }
    }
    if (rawDistroId === 'arch') {
      return {
        os: 'linux',
        distro: rawDistro || 'Arch Linux',
        distroId: 'arch',
        badgeColor: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
      }
    }
    if (rawDistroId === 'ubuntu') {
      return {
        os: 'linux',
        distro: rawDistro || 'Ubuntu',
        distroId: 'ubuntu',
        badgeColor: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
      }
    }
    if (rawDistroId === 'debian') {
      return {
        os: 'linux',
        distro: rawDistro || 'Debian',
        distroId: 'debian',
        badgeColor: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
      }
    }
    if (rawDistroId === 'fedora') {
      return {
        os: 'linux',
        distro: rawDistro || 'Fedora',
        distroId: 'fedora',
        badgeColor: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
      }
    }
    if (rawDistroId === 'alpine') {
      return {
        os: 'linux',
        distro: rawDistro || 'Alpine Linux',
        distroId: 'alpine',
        badgeColor: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400' },
      }
    }
    if (rawDistroId === 'manjaro') {
      return {
        os: 'linux',
        distro: rawDistro || 'Manjaro',
        distroId: 'manjaro',
        badgeColor: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
      }
    }
    if (rawDistroId === 'mint' || rawDistroId === 'linuxmint') {
      return {
        os: 'linux',
        distro: rawDistro || 'Linux Mint',
        distroId: 'mint',
        badgeColor: { bg: 'bg-lime-500/10', border: 'border-lime-500/30', text: 'text-lime-400' },
      }
    }
  }

  // 2. Explicit Distro name string from agent
  if (rawDistro) {
    const lower = rawDistro.toLowerCase()
    if (lower.includes('windows 11')) {
      return {
        os: 'windows',
        distro: rawDistro,
        distroId: 'windows11',
        badgeColor: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
      }
    }
    if (lower.includes('windows 10')) {
      return {
        os: 'windows',
        distro: rawDistro,
        distroId: 'windows10',
        badgeColor: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
      }
    }
    if (lower.includes('arch')) {
      return {
        os: 'linux',
        distro: rawDistro,
        distroId: 'arch',
        badgeColor: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
      }
    }
    if (lower.includes('ubuntu')) {
      return {
        os: 'linux',
        distro: rawDistro,
        distroId: 'ubuntu',
        badgeColor: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
      }
    }
    if (lower.includes('debian')) {
      return {
        os: 'linux',
        distro: rawDistro,
        distroId: 'debian',
        badgeColor: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
      }
    }
    if (lower.includes('fedora')) {
      return {
        os: 'linux',
        distro: rawDistro,
        distroId: 'fedora',
        badgeColor: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
      }
    }
    if (lower.includes('alpine')) {
      return {
        os: 'linux',
        distro: rawDistro,
        distroId: 'alpine',
        badgeColor: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400' },
      }
    }
  }

  // 3. Heuristic matching from hostname, tags, or device name
  const allText = `${hostname} ${tags.join(' ')} ${name}`

  if (allText.includes('arch')) {
    return {
      os: 'linux',
      distro: 'Arch Linux',
      distroId: 'arch',
      badgeColor: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
    }
  }

  if (allText.includes('ubuntu')) {
    return {
      os: 'linux',
      distro: 'Ubuntu',
      distroId: 'ubuntu',
      badgeColor: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    }
  }

  if (allText.includes('debian')) {
    return {
      os: 'linux',
      distro: 'Debian',
      distroId: 'debian',
      badgeColor: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
    }
  }

  if (allText.includes('fedora')) {
    return {
      os: 'linux',
      distro: 'Fedora',
      distroId: 'fedora',
      badgeColor: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
    }
  }

  if (allText.includes('alpine')) {
    return {
      os: 'linux',
      distro: 'Alpine Linux',
      distroId: 'alpine',
      badgeColor: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400' },
    }
  }

  if (rawOs === 'windows' || allText.includes('win')) {
    const isWin10 = allText.includes('win10') || allText.includes('windows 10')
    const distroName = isWin10 ? 'Windows 10' : 'Windows 11'
    const id = isWin10 ? 'windows10' : 'windows11'
    return {
      os: 'windows',
      distro: distroName,
      distroId: id,
      badgeColor: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
    }
  }

  if (rawOs === 'macos' || allText.includes('mac') || allText.includes('apple')) {
    return {
      os: 'macos',
      distro: 'macOS',
      distroId: 'macos',
      badgeColor: { bg: 'bg-zinc-700/20', border: 'border-zinc-500/30', text: 'text-zinc-200' },
    }
  }

  if (rawOs === 'linux') {
    return {
      os: 'linux',
      distro: 'Linux',
      distroId: 'linux',
      badgeColor: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    }
  }

  return {
    os: 'unknown',
    distro: 'Unknown OS',
    distroId: 'unknown',
    badgeColor: { bg: 'bg-zinc-800/80', border: 'border-zinc-700/50', text: 'text-zinc-400' },
  }
}

interface OSIconProps {
  distroId?: string
  os?: string
  className?: string
  alt?: string
}

/**
 * High-definition vector SVG symbol for each operating system & distribution.
 */
export function OSIcon({ distroId, os, className = 'w-6 h-6' }: OSIconProps) {
  const id = (distroId || os || 'unknown').toLowerCase()

  // Windows 11 (Modern symmetrical 4-blue-tiles)
  if (id === 'windows11' || id === 'win11') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="9.5" height="9.5" rx="1.5" fill="#00A4EF" />
        <rect x="12.5" y="2" width="9.5" height="9.5" rx="1.5" fill="#00A4EF" />
        <rect x="2" y="12.5" width="9.5" height="9.5" rx="1.5" fill="#00A4EF" />
        <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="1.5" fill="#00A4EF" />
      </svg>
    )
  }

  // Windows 10 (Perspective angled 4-pane)
  if (id === 'windows10' || id === 'win10' || id === 'windows') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="#0078D7" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 5.16L10.3 4v7.3H2V5.16zm0 8.34h8.3V20L2 18.84V13.5zm9.5-9.7l10.5-1.5v9.4h-10.5V3.8zm0 9.7H22v9.4l-10.5-1.5v-7.9z" />
      </svg>
    )
  }

  // Arch Linux (Famous swoosh triangle in #1793D1)
  if (id === 'arch' || id === 'archlinux') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2C11.3 3.6 10.7 5.1 10.1 6.8C8.8 10.3 7.2 13.9 5.3 18C6.6 16.7 7.9 15.6 9.1 15.1C9 15.3 8.9 15.6 8.7 16C7.6 18.5 6.1 21.7 3.8 22C6.6 20.5 8.7 19.2 10.3 17.9C11.1 17.3 11.9 16.5 12.8 15.6C13.7 16.5 14.5 17.3 15.3 17.9C16.9 19.2 19 20.5 21.8 22C19.5 21.7 18 18.5 16.9 16C16.7 15.6 16.6 15.3 16.5 15.1C17.7 15.6 19 16.7 20.3 18C18.4 13.9 16.8 10.3 15.5 6.8C14.9 5.1 14.3 3.6 13.6 2L12 2Z"
          fill="#1793D1"
        />
        <path
          d="M12.4 8.5C11.8 10.2 11.2 11.8 10.6 13.4C11.2 13 11.8 12.8 12.4 12.8C13 12.8 13.6 13 14.2 13.4C13.6 11.8 13 10.2 12.4 8.5Z"
          fill="#33AADD"
        />
      </svg>
    )
  }

  // Ubuntu (Circle-of-friends with 3 dots in #E95420)
  if (id === 'ubuntu') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10.5" fill="#E95420" />
        <circle cx="12" cy="5.8" r="1.6" fill="#FFFFFF" />
        <circle cx="6.6" cy="15.2" r="1.6" fill="#FFFFFF" />
        <circle cx="17.4" cy="15.2" r="1.6" fill="#FFFFFF" />
        <path
          d="M12 8.4a3.6 3.6 0 102.5 6.2l1.6 1.6a5.8 5.8 0 11-4.1-10v2.2zm-2.5 6.2a3.6 3.6 0 005 0l1.6 1.6a5.8 5.8 0 01-8.2 0l1.6-1.6z"
          fill="#FFFFFF"
        />
      </svg>
    )
  }

  // Debian (Swirl in #D70A53)
  if (id === 'debian') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10.5" fill="#D70A53" />
        <path
          d="M12 5.5c-3.6 0-6.5 2.9-6.5 6.5s2.9 6.5 6.5 6.5c2.3 0 4.3-1.2 5.4-3.1l-1.8-1.1c-.8 1.4-2.2 2.3-3.8 2.3-2.4 0-4.4-2-4.4-4.4s2-4.4 4.4-4.4c1.6 0 3 .9 3.8 2.3l1.8-1.1C16.3 6.7 14.3 5.5 12 5.5z"
          fill="#FFFFFF"
        />
        <circle cx="14" cy="11" r="1.5" fill="#FFFFFF" />
      </svg>
    )
  }

  // Fedora (Infinity 'f' in #51A2DA)
  if (id === 'fedora') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10.5" fill="#294172" />
        <path
          d="M16.5 6.5a4 4 0 00-4 4v1.5h-2v3h2v4.5h3V15h2.5l-.5-3h-2v-1.5a1 1 0 011-1h1.5V6.5h-1.5z"
          fill="#51A2DA"
        />
        <path
          d="M10.5 9.5a4 4 0 00-4 4v1.5h-2v3h2v4.5h3V18h2.5l-.5-3h-2v-1.5a1 1 0 011-1h1.5V9.5h-1.5z"
          fill="#FFFFFF"
        />
      </svg>
    )
  }

  // Alpine Linux (Mountain peaks in #0D597F)
  if (id === 'alpine') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="4" fill="#0D597F" />
        <path d="M12 5L4.5 18h15L12 5z" fill="#FFFFFF" fillOpacity="0.9" />
        <path d="M15.5 12L12 18h7l-3.5-6z" fill="#0D597F" />
        <path d="M9 13.5L5.5 18h7L9 13.5z" fill="#2E7599" />
      </svg>
    )
  }

  // Linux Mint (Leaf icon in #87CF3E)
  if (id === 'mint' || id === 'linuxmint') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10.5" fill="#87CF3E" />
        <path
          d="M6 8v8h12V8H6zm2 2h2v5H8v-5zm3 0h2v4a1 1 0 002 0v-4h2v4a3 3 0 01-6 0v-4z"
          fill="#FFFFFF"
        />
      </svg>
    )
  }

  // Manjaro (3-column green logo #35BF5C)
  if (id === 'manjaro') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="5.5" height="18" rx="1" fill="#35BF5C" />
        <rect x="9.5" y="9.5" width="5.5" height="11.5" rx="1" fill="#35BF5C" />
        <rect x="9.5" y="3" width="11.5" height="5.5" rx="1" fill="#35BF5C" />
        <rect x="15.5" y="9.5" width="5.5" height="11.5" rx="1" fill="#35BF5C" />
      </svg>
    )
  }

  // macOS (Crisp Apple silhouette)
  if (id === 'macos' || id === 'darwin') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="#A2AAAD" xmlns="http://www.w3.org/2000/svg">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.47c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.8 1.44-.6.69-1.13 1.83-1 2.93 1.07.08 2.15-.53 2.81-1.33z" />
      </svg>
    )
  }

  // Generic Linux (Tux Penguin)
  if (id === 'linux') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="12" cy="14" rx="7" ry="8" fill="#1E1E24" />
        <ellipse cx="12" cy="15" rx="5" ry="6" fill="#F4F4F6" />
        <circle cx="12" cy="7.5" r="4.5" fill="#1E1E24" />
        <circle cx="10.5" cy="7" r="1.2" fill="#FFFFFF" />
        <circle cx="13.5" cy="7" r="1.2" fill="#FFFFFF" />
        <circle cx="10.7" cy="7.2" r="0.6" fill="#1E1E24" />
        <circle cx="13.3" cy="7.2" r="0.6" fill="#1E1E24" />
        <path d="M10 9l2 2 2-2z" fill="#FFA500" />
        <ellipse cx="9" cy="21.5" rx="2.5" ry="1.2" fill="#FFA500" />
        <ellipse cx="15" cy="21.5" rx="2.5" ry="1.2" fill="#FFA500" />
      </svg>
    )
  }

  // Fallback: Generic monitor icon
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

/**
 * Elegant OS & Distro pill badge with responsive layout and distinct brand colors.
 */
export function OSBadge({ device, className }: { device?: Partial<Device> | null; className?: string }) {
  const osInfo = getDeviceOSInfo(device)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border shadow-xs',
        osInfo.badgeColor.bg,
        osInfo.badgeColor.border,
        osInfo.badgeColor.text,
        className
      )}
      title={`${osInfo.distro} (${osInfo.os})`}
    >
      <OSIcon distroId={osInfo.distroId} os={osInfo.os} className="w-3.5 h-3.5 shrink-0" />
      <span className="font-semibold tracking-tight">{osInfo.distro}</span>
    </div>
  )
}
