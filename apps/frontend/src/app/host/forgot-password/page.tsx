'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'

export default function ForgotPasswordPage(): React.ReactElement {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/auth/forgot-password', { email })
      setMessage('If an account exists for this email, we have sent password reset instructions.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm px-6"
      >
        <div className="mb-8 text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-[#3B82F6]" strokeWidth={1.5} />
          <h1 className="text-3xl font-black tracking-tight text-white">Reset Password</h1>
          <p className="mt-2 text-xs text-white/40">Enter your email to receive recovery instructions</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm">
          {message ? (
            <div className="space-y-4">
              <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 p-4 rounded-xl leading-relaxed">
                {message}
              </div>
              <button
                onClick={() => router.push('/host')}
                className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold tracking-widest uppercase text-white/50">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
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
                disabled={loading || !email.trim()}
                className="w-full rounded-xl bg-[#3B82F6] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
