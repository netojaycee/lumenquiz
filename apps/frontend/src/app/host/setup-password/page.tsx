'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'

export default function SetupPasswordPage(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams ? searchParams.get('token') : null

  const [loading, setLoading] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [invitation, setInvitation] = useState<any>(null)
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token')
      setLoading(false)
      return
    }

    api.get<any>(`/auth/verify-invite?token=${token}`)
      .then((res) => {
        setInvitation(res)
        setTokenValid(true)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Invalid or expired invitation link')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/auth/setup-password', { token, password })
      setSuccess(true)
      setTimeout(() => {
        router.push('/host')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save password')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080E] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#3B82F6] animate-spin" />
      </div>
    )
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
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm px-6"
      >
        <div className="mb-8 text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-[#3B82F6]" strokeWidth={1.5} />
          <h1 className="text-3xl font-black tracking-tight text-white">Account Setup</h1>
          {invitation && (
            <p className="mt-2 text-xs text-white/40">
              Welcome {invitation.name}! Set up your password for {invitation.areaName || 'Global/Admin'}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm">
          {success ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-400" />
              <h3 className="text-lg font-bold text-white">Password Saved!</h3>
              <p className="text-xs text-white/40">Redirecting to login dashboard...</p>
            </div>
          ) : !tokenValid ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="h-4 w-4" />
                {error || 'This invitation link is invalid or expired.'}
              </div>
              <button
                onClick={() => router.push('/host')}
                className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold tracking-widest uppercase text-white/50">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/20 outline-none focus:border-[#3B82F6]/60 focus:ring-2 focus:ring-[#3B82F6]/20 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold tracking-widest uppercase text-white/50">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/20 outline-none focus:border-[#3B82F6]/60 focus:ring-2 focus:ring-[#3B82F6]/20 text-sm"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#3B82F6] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Complete Setup'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
