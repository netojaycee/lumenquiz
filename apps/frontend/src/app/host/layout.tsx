'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Loader2, Eye, EyeOff, AlertCircle, ShieldCheck, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { useHostStore } from '@/stores/useHostStore'
import { cn } from '@/lib/utils'

type AuthState = 'loading' | 'authed' | 'login'

// ─── Beautiful full-page login ────────────────────────────────────────────────

import { Users as UsersIcon } from 'lucide-react'

function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const { setAuthenticated, setUser, loadNetworkInfo } = useHostStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError(null)
    try {
      const u = await api.post<any>('/auth/login', { email, password })
      setAuthenticated(true)
      setUser(u)
      loadNetworkInfo().catch(() => {})
      onAuthed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#08080E] flex items-center justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(59,130,246,0.10) 0%, transparent 70%)',
        }}
      />
      <motion.div
        animate={{ backgroundPositionY: ['0px', '48px'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute top-0 left-0 h-px w-full origin-left"
        style={{ background: 'linear-gradient(90deg, transparent, #3B82F6, transparent)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm px-6"
      >
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, type: 'spring', stiffness: 70 }}
          >
            <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-[#3B82F6]" strokeWidth={1.5} />
          </motion.div>
          <h1 className="text-4xl font-black tracking-tight text-white">
            APO<span className="text-[#3B82F6]">QUIZ</span>
          </h1>
          <p className="mt-1 text-sm font-medium tracking-widest uppercase text-white/30">
            Host &amp; Admin Portal
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="admin-email"
                className="block text-[10px] font-bold tracking-widest uppercase text-white/50"
              >
                Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/20 outline-none transition-all focus:border-[#3B82F6]/60 focus:ring-2 focus:ring-[#3B82F6]/20 text-sm"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="admin-pwd"
                  className="block text-[10px] font-bold tracking-widest uppercase text-white/50"
                >
                  Password
                </label>
                <Link
                  href="/host/forgot-password"
                  className="text-[10px] text-[#3B82F6] hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="admin-pwd"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-12 text-white placeholder-white/20 outline-none transition-all focus:border-[#3B82F6]/60 focus:ring-2 focus:ring-[#3B82F6]/20 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/70"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
              >
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full mt-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-white/20">
          Live Bible Quiz Platform
        </p>
      </motion.div>
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function HostLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const pathname = usePathname()
  const { networkInfo, loadNetworkInfo, setAuthenticated, setUser, user, reset } = useHostStore()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
    } catch {
      // session already gone — continue anyway
    }
    reset()
    setAuthState('login')
    setLoggingOut(false)
  }

  useEffect(() => {
    api.get<any>('/auth/session')
      .then((sessionUser) => {
        setAuthState('authed')
        setAuthenticated(true)
        setUser(sessionUser)
        loadNetworkInfo().catch(() => {})
      })
      .catch(() => setAuthState('login'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#08080E] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#3B82F6] animate-spin" />
      </div>
    )
  }

  const isPublicRoute = 
    pathname?.startsWith('/host/forgot-password') || 
    pathname?.startsWith('/host/setup-password') || 
    pathname?.startsWith('/host/reset-password')

  if (authState === 'login' && !isPublicRoute) {
    return <LoginPage onAuthed={() => setAuthState('authed')} />
  }

  if (isPublicRoute) {
    return <div className="min-h-screen bg-[#08080E]">{children}</div>
  }

  const isQuizSection = pathname?.startsWith('/host/quiz') || pathname === '/host'
  const isUsersSection = pathname?.startsWith('/host/users')

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 border-r border-border bg-surface flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-border">
          <span className="text-xl font-bold text-white tracking-tight">
            APO<span className="text-blitz-accent">QUIZ</span>
          </span>
          {user && (
            <div className="mt-2 text-[10px] text-text-muted font-medium uppercase tracking-wider">
              {user.areaName || 'Super Admin'} · {user.role}
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/host"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              isQuizSection
                ? 'bg-surface-elevated text-white'
                : 'text-text-secondary hover:text-white hover:bg-surface-elevated',
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Quizzes
          </Link>

          {(user?.role === 'ADMIN' || user?.role === 'OWNER') && (
            <Link
              href="/host/users"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isUsersSection
                  ? 'bg-surface-elevated text-white'
                  : 'text-text-secondary hover:text-white hover:bg-surface-elevated',
              )}
            >
              <UsersIcon className="h-4 w-4" />
              Users
            </Link>
          )}
        </nav>
        <div className="p-4 border-t border-border space-y-3">
          {networkInfo ? (
            <div className="text-xs space-y-0.5">
              <p className="text-text-muted font-medium uppercase tracking-wider">Host PC</p>
              <p className="text-text-secondary font-mono">
                {networkInfo.localIP}:{networkInfo.port}
              </p>
            </div>
          ) : (
            <p className="text-xs text-text-muted">Loading network info…</p>
          )}
          <button
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            {loggingOut
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <LogOut className="h-4 w-4" />}
            {loggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">{children}</div>
    </div>
  )
}
