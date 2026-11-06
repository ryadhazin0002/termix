'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import { Monitor, Settings, LogOut, Terminal } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Devices', icon: Monitor },
  { href: '/dashboard/sessions', label: 'Sessions', icon: Terminal },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

  const handleLogout = async () => {
    await signOut(auth)
    router.replace('/')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-56 flex flex-col bg-zinc-900 border-r border-zinc-800 shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 gap-3 border-b border-zinc-800">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-sm shrink-0">
            ⌨
          </div>
          <span className="font-bold text-lg hidden md:block">Termix</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium',
                pathname === href
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="p-2 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-3 py-2">
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt="avatar"
                className="w-7 h-7 rounded-full shrink-0"
              />
            )}
            <span className="hidden md:block text-xs text-zinc-400 truncate flex-1">
              {user.displayName ?? user.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="hidden md:block">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
