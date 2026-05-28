'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Shield, Eye, MonitorPlay,
  ArrowLeft, Loader2, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { storage, generateFingerprint } from '@/lib/storage'
import { useSocketStore } from '@/stores/useSocketStore'
import { useTeamStore } from '@/stores/useTeamStore'
import { useAudienceStore } from '@/stores/useAudienceStore'
import { CONNECTION_EVENTS, JOIN_EVENTS } from '@apoquiz/socket-events'
import type { RejoinPayload } from '@apoquiz/socket-events'
import { UserRole } from '@apoquiz/shared-types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'role' | 'team' | 'moderator' | 'audience' | 'screen' | 'connecting'

interface RoleCard {
  role: Step
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

const ROLES: RoleCard[] = [
  {
    role: 'team',
    label: 'Team Member',
    description: 'Join your team and answer questions',
    icon: <Users className="h-7 w-7" />,
    color: '#3B82F6',
  },
  {
    role: 'moderator',
    label: 'Moderator',
    description: 'Control the quiz flow and reveals',
    icon: <Shield className="h-7 w-7" />,
    color: '#8B5CF6',
  },
  {
    role: 'audience',
    label: 'Audience',
    description: 'Watch, predict and react',
    icon: <Eye className="h-7 w-7" />,
    color: '#F59E0B',
  },
  {
    role: 'screen',
    label: 'View Screen',
    description: 'Open the projector display',
    icon: <MonitorPlay className="h-7 w-7" />,
    color: '#10B981',
  },
]

// ─── Animation Variants ───────────────────────────────────────────────────────

const slide = {
  initial:  { opacity: 0, y: 20 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -20 },
}

// ─── Component ────────────────────────────────────────────────────────────────

function JoinPageInner(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<Step>('role')
  const [sessionCode, setSessionCode] = useState(
    searchParams.get('session') ?? searchParams.get('code') ?? '',
  )
  const [teamJoinCode, setTeamJoinCode] = useState('')
  const [pin, setPin] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const { connect, emit } = useSocketStore()
  const setTeamIdentity = useTeamStore((s) => s.setIdentity)
  const setAudienceIdentity = useAudienceStore((s) => s.setIdentity)

  // Detect stored credentials and surface a "Continue as X" card instead of auto-redirecting.
  // This lets users join a new session without being silently hijacked by old credentials.
  const [resumeTeam, setResumeTeam] = useState<import('@/lib/storage').TeamStorage | null>(null)
  const [resumeModerator, setResumeModerator] = useState<import('@/lib/storage').ModeratorStorage | null>(null)

  useEffect(() => {
    setResumeTeam(storage.getTeam())
    setResumeModerator(storage.getModerator())
    // QR scan deep-link: skip role selector and land directly on audience form
    if (searchParams.get('role') === 'audience' && searchParams.get('session')) {
      setStep('audience')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRoleSelect(role: Step) {
    setError(null)
    if (role === 'screen') {
      setStep('screen')
      return
    }
    setStep(role)
  }

  async function handleTeamJoin(e: React.FormEvent) {
    e.preventDefault()
    const code = teamJoinCode.trim().toUpperCase()
    if (code.length !== 8) {
      setError('Enter your 8-character team join code.')
      return
    }
    setConnecting(true)
    setError(null)
    setStep('connecting')

    try {
      const socket = connect()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timed out')), 8000)

        function doJoin() {
          const payload: RejoinPayload = { role: UserRole.TEAM, teamCode: code }
          emit(CONNECTION_EVENTS.REJOIN, payload)
        }

        if (socket.connected) {
          doJoin()
        } else {
          socket.once(CONNECTION_EVENTS.CONNECT, doJoin)
        }

        socket.once('team:joined', (data: { teamId: string; name: string; color: string; sessionId: string }) => {
          clearTimeout(timeout)
          storage.setTeam({
            teamId: data.teamId,
            sessionId: data.sessionId,
            joinCode: code,
            name: data.name,
            color: data.color,
          })
          setTeamIdentity({
            teamId: data.teamId,
            sessionId: data.sessionId,
            name: data.name,
            color: data.color,
            pin: code, // kept for store compat — stores joinCode in pin field
          })
          resolve()
          router.push(`/team/${data.sessionId}`)
        })

        socket.once('error', (err: { message: string }) => {
          clearTimeout(timeout)
          reject(new Error(err.message))
        })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setStep('team')
    } finally {
      setConnecting(false)
    }
  }

  async function handleModeratorJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionCode.trim() || !pin.trim()) {
      setError('Enter both session code and moderator PIN.')
      return
    }
    setConnecting(true)
    setError(null)
    setStep('connecting')

    try {
      const socket = connect()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timed out')), 8000)

        function doJoin() {
          const payload: RejoinPayload = {
            role: UserRole.MODERATOR,
            sessionId: sessionCode.trim(),
            pin: pin.trim(),
          }
          emit(CONNECTION_EVENTS.REJOIN, payload)
        }

        if (socket.connected) {
          doJoin()
        } else {
          socket.once(CONNECTION_EVENTS.CONNECT, doJoin)
        }

        socket.once('moderator:joined', (data: { sessionId: string }) => {
          clearTimeout(timeout)
          storage.setModerator({ sessionId: data.sessionId, pin: pin.trim() })
          resolve()
          router.push(`/moderator/${data.sessionId}`)
        })

        socket.once('error', (err: { message: string }) => {
          clearTimeout(timeout)
          reject(new Error(err.message))
        })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setStep('moderator')
    } finally {
      setConnecting(false)
    }
  }

  async function handleAudienceJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionCode.trim()) {
      setError('Enter the session code.')
      return
    }
    if (!fullName.trim()) {
      setError('Enter your full name.')
      return
    }
    if (fullName.trim().length > 40) {
      setError('Name must be 40 characters or less.')
      return
    }
    setConnecting(true)
    setError(null)
    setStep('connecting')

    // Pass the code directly to the socket — the server resolves sessionCode OR audienceCode OR id.
    // Stored audienceId is passed so the server can reconnect the same member without re-registering.
    const existingAudience = storage.getAudience()
    const fingerprint = existingAudience?.fingerprint ?? generateFingerprint()

    try {
      const socket = connect()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timed out')), 8000)

        function doJoin() {
          emit(CONNECTION_EVENTS.REJOIN, {
            role: UserRole.AUDIENCE,
            sessionId: sessionCode.trim().toUpperCase(),
            audienceId: existingAudience?.audienceId,
            nickname: fullName.trim(),
            fingerprint,
          } as RejoinPayload)
        }

        if (socket.connected) {
          doJoin()
        } else {
          socket.once(CONNECTION_EVENTS.CONNECT, doJoin)
        }

        socket.once(JOIN_EVENTS.AUDIENCE_JOINED, (data: { audienceId: string; sessionId: string }) => {
          clearTimeout(timeout)
          const name = fullName.trim()
          storage.setAudience({ audienceId: data.audienceId, sessionId: data.sessionId, fullName: name, fingerprint })
          setAudienceIdentity({ audienceId: data.audienceId, sessionId: data.sessionId, fullName: name, fingerprint })
          resolve()
          router.push(`/audience/${data.sessionId}`)
        })

        socket.once('error', (err: { message: string }) => {
          clearTimeout(timeout)
          reject(new Error(err.message))
        })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join. Check the session code.')
      setStep('audience')
    } finally {
      setConnecting(false)
    }
  }

  async function handleScreenJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!sessionCode.trim()) {
      setError('Enter the session code.')
      return
    }
    setConnecting(true)
    setError(null)
    setStep('connecting')

    try {
      const socket = connect()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timed out')), 8000)

        function doJoin() {
          emit(CONNECTION_EVENTS.REJOIN, {
            role: UserRole.SCREEN,
            sessionId: sessionCode.trim(),
          } as RejoinPayload)
        }

        if (socket.connected) {
          doJoin()
        } else {
          socket.once(CONNECTION_EVENTS.CONNECT, doJoin)
        }

        socket.once(JOIN_EVENTS.SCREEN_JOINED, (data: { sessionId: string }) => {
          clearTimeout(timeout)
          resolve()
          router.push(`/screen/${data.sessionId}`)
        })

        socket.once('error', (err: { message: string }) => {
          clearTimeout(timeout)
          reject(new Error(err.message))
        })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setStep('screen')
    } finally {
      setConnecting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold text-white tracking-tight">
            APO<span className="text-blitz-accent">QUIZ</span>
          </h1>
          <p className="text-text-muted text-sm mt-1">Live Bible Quiz Platform</p>
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── ROLE SELECT ─────────────────────────────────────────── */}
          {step === 'role' && (
            <motion.div key="role" {...slide} className="space-y-3">
              {/* Resume cards — shown when credentials exist from a previous session */}
              {(resumeTeam || resumeModerator) && (
                <div className="mb-5 space-y-2">
                  <p className="text-text-muted text-xs uppercase tracking-widest">Continue session</p>
                  {resumeTeam && (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface">
                      <Users className="h-5 w-5 text-blitz-accent flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{resumeTeam.name}</p>
                        <p className="text-text-muted text-xs">Team · {resumeTeam.sessionId.slice(0, 8)}…</p>
                      </div>
                      <button
                        onClick={() => router.push(`/team/${resumeTeam.sessionId}`)}
                        className="text-blitz-accent text-xs font-semibold hover:underline whitespace-nowrap"
                      >
                        Rejoin
                      </button>
                      <button
                        onClick={() => { storage.clearTeam(); setResumeTeam(null) }}
                        className="text-text-muted hover:text-white text-lg leading-none px-1"
                        title="Clear and join fresh"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {resumeModerator && (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface">
                      <Shield className="h-5 w-5 text-purple-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">Moderator</p>
                        <p className="text-text-muted text-xs">session {resumeModerator.sessionId.slice(0, 8)}…</p>
                      </div>
                      <button
                        onClick={() => router.push(`/moderator/${resumeModerator.sessionId}`)}
                        className="text-purple-400 text-xs font-semibold hover:underline whitespace-nowrap"
                      >
                        Rejoin
                      </button>
                      <button
                        onClick={() => { storage.clearModerator(); setResumeModerator(null) }}
                        className="text-text-muted hover:text-white text-lg leading-none px-1"
                        title="Clear and log in differently"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="border-t border-border pt-3">
                    <p className="text-text-secondary text-center text-sm mb-3">Or join as...</p>
                  </div>
                </div>
              )}
              {!resumeTeam && !resumeModerator && (
                <p className="text-text-secondary text-center text-sm mb-5">I am a...</p>
              )}
              {ROLES.map((r) => (
                <button
                  key={r.role}
                  onClick={() => handleRoleSelect(r.role)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-surface',
                    'hover:border-[var(--hover-color)] hover:bg-surface-elevated transition-all text-left group',
                  )}
                  style={{ '--hover-color': r.color } as React.CSSProperties}
                >
                  <span style={{ color: r.color }}>{r.icon}</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{r.label}</p>
                    <p className="text-text-muted text-xs">{r.description}</p>
                  </div>
                </button>
              ))}
            </motion.div>
          )}

          {/* ── CONNECTING ──────────────────────────────────────────── */}
          {step === 'connecting' && (
            <motion.div key="connecting" {...slide} className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="h-10 w-10 text-blitz-accent animate-spin" />
              <p className="text-text-secondary">Connecting...</p>
            </motion.div>
          )}

          {/* ── TEAM FORM ───────────────────────────────────────────── */}
          {step === 'team' && (
            <motion.div key="team" {...slide}>
              <button
                onClick={() => { setStep('role'); setError(null) }}
                className="flex items-center gap-1 text-text-muted text-sm mb-6 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-white text-xl font-bold mb-1">Join as Team</h2>
              <p className="text-text-muted text-sm mb-6">Enter the 8-character join code given to your team</p>
              <form onSubmit={handleTeamJoin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="team-join-code">Team Join Code</Label>
                  <Input
                    id="team-join-code"
                    placeholder="e.g. KZ7MBP4A"
                    value={teamJoinCode}
                    onChange={(e) => setTeamJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    autoComplete="off"
                    autoFocus
                    className="text-center text-lg tracking-widest font-mono"
                  />
                  <p className="text-text-muted text-xs">{teamJoinCode.length}/8 — found in the Teams tab of the admin dashboard</p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-wrong text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Join Team
                </Button>
              </form>
            </motion.div>
          )}

          {/* ── MODERATOR FORM ──────────────────────────────────────── */}
          {step === 'moderator' && (
            <motion.div key="moderator" {...slide}>
              <button
                onClick={() => { setStep('role'); setError(null) }}
                className="flex items-center gap-1 text-text-muted text-sm mb-6 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-white text-xl font-bold mb-1">Moderator Access</h2>
              <p className="text-text-muted text-sm mb-6">Enter the session code and moderator PIN</p>
              <form onSubmit={handleModeratorJoin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mod-session">Session Code</Label>
                  <Input
                    id="mod-session"
                    placeholder="e.g. KZ7MBP"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mod-pin">Moderator PIN</Label>
                  <Input
                    id="mod-pin"
                    type="password"
                    placeholder="4-digit PIN"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-wrong text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" style={{ background: '#8B5CF6' }} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Open Moderator Panel
                </Button>
              </form>
            </motion.div>
          )}

          {/* ── AUDIENCE FORM ───────────────────────────────────────── */}
          {step === 'audience' && (
            <motion.div key="audience" {...slide}>
              <button
                onClick={() => { setStep('role'); setError(null) }}
                className="flex items-center gap-1 text-text-muted text-sm mb-6 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-white text-xl font-bold mb-1">Join Audience</h2>
              <p className="text-text-muted text-sm mb-6">
                {sessionCode
                  ? 'Session code filled in — just enter your name to join'
                  : 'Enter the session code shown on the big screen'}
              </p>
              <form onSubmit={handleAudienceJoin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="aud-code">Session Code</Label>
                  <Input
                    id="aud-code"
                    placeholder="e.g. KZ7MBP"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    autoComplete="off"
                    autoFocus={!sessionCode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="full-name">Your Full Name</Label>
                  <Input
                    id="full-name"
                    placeholder="e.g. Chiamaka Okonkwo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value.slice(0, 40))}
                    maxLength={40}
                    autoComplete="name"
                    autoFocus={!!sessionCode}
                  />
                  <p className="text-text-muted text-xs">{fullName.length}/40 characters — used to claim prizes</p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-wrong text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  style={{ background: '#F59E0B', color: '#000' }}
                  disabled={connecting}
                >
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Join as Audience
                </Button>
              </form>
            </motion.div>
          )}

          {/* ── SCREEN FORM ─────────────────────────────────────────── */}
          {step === 'screen' && (
            <motion.div key="screen" {...slide}>
              <button
                onClick={() => { setStep('role'); setError(null) }}
                className="flex items-center gap-1 text-text-muted text-sm mb-6 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-white text-xl font-bold mb-1">Projector Screen</h2>
              <p className="text-text-muted text-sm mb-6">Open the full-screen display for your projector or TV</p>
              <form onSubmit={handleScreenJoin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="screen-session">Session Code</Label>
                  <Input
                    id="screen-session"
                    placeholder="e.g. KZ7MBP"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-wrong text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  style={{ background: '#10B981' }}
                  disabled={connecting}
                >
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Open Screen
                </Button>
              </form>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
  )
}

export default function JoinPage(): React.ReactElement {
  return (
    <Suspense>
      <JoinPageInner />
    </Suspense>
  )
}
