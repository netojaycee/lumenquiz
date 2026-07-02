'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionId } from '@/hooks/useSessionId'
import Link from 'next/link'
import {
  ArrowLeft, RefreshCw, Users, Wifi, WifiOff,
  Loader2, AlertCircle, Trophy, Radio, Copy, Check, ShieldAlert
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useSocketStore } from '@/stores/useSocketStore'
import type { Session, SessionTeam, Team } from '@apoquiz/shared-types'
import { SessionStatus } from '@apoquiz/shared-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveSession extends Session {
  quiz?: { name: string; id: string }
  sessionTeams?: (SessionTeam & { team: Team })[]
  // API returns audienceMembers array (those with connected:true), not a pre-counted number
  audienceMembers?: Array<{ id: string; fullName: string; totalPoints: number; connected: boolean }>
}

const STATUS_LABELS: Record<string, string> = {
  lobby:            'Lobby',
  audience_vote:    'Audience Vote',
  round_intro:      'Round Intro',
  question_open:    'Question Open',
  question_locked:  'Question Locked',
  answer_reveal:    'Answer Reveal',
  question_summary: 'Question Summary',
  round_summary:    'Round Summary',
  session_end:      'Session Ended',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveClient(): React.ReactElement {
  const sessionId = useSessionId()
  const router    = useRouter()
  const { on, off, emit } = useSocketStore()

  function copySessionId() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (session as any)?.sessionCode ?? sessionId
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const [session, setSession]       = useState<LiveSession | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [copied, setCopied]         = useState(false)

  // Score override dialog
  const [overrideOpen, setOverrideOpen]   = useState(false)
  const [overrideTeamId, setOverrideTeamId] = useState('')
  const [overrideAdj, setOverrideAdj]     = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [applyingOverride, setApplyingOverride] = useState(false)

  // Scores from live socket events
  const [liveScores, setLiveScores] = useState<Record<string, number>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset team slot
  const [resetSlotTeamId, setResetSlotTeamId] = useState<string | null>(null)
  const [resetSlotResult, setResetSlotResult] = useState<Record<string, string>>({}) // teamId → new join code
  const [copiedSlotTeamId, setCopiedSlotTeamId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (sessionId === '_') return
    try {
      const data = await api.get<LiveSession>(`/sessions/${sessionId}`)
      setSession(data)
      // Seed live scores from DB
      const initial: Record<string, number> = {}
      data.sessionTeams?.forEach((st) => { initial[st.teamId] = st.score })
      setLiveScores(initial)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // Initial load; only poll if session is live
  useEffect(() => {
    load()
    pollRef.current = setInterval(() => {
      if (session && ((session.status as string) === SessionStatus.SESSION_END || (session.status as string) === 'completed')) {
        if (pollRef.current) clearInterval(pollRef.current)
        return
      }
      load()
      setLastRefresh(Date.now())
    }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to score updates from the socket
  useEffect(() => {
    function onScoresUpdate(data: unknown) {
      const typed = data as { scores: Array<{ teamId: string; score: number }> }
      const map: Record<string, number> = {}
      typed.scores?.forEach((s) => { map[s.teamId] = s.score })
      setLiveScores(map)
    }
    on('scores:update', onScoresUpdate)
    return () => off('scores:update', onScoresUpdate)
  }, [on, off])

  async function handleScoreOverride(e: React.FormEvent) {
    e.preventDefault()
    const adj = parseInt(overrideAdj, 10)
    if (isNaN(adj)) return
    setApplyingOverride(true)
    try {
      emit('moderator:score:override', {
        sessionId,
        teamId: overrideTeamId,
        adjustment: adj,
        reason: overrideReason,
      })
      setOverrideOpen(false)
      setOverrideTeamId('')
      setOverrideAdj('')
      setOverrideReason('')
      setTimeout(load, 500)
    } finally {
      setApplyingOverride(false)
    }
  }

  function openOverride(teamId: string) {
    setOverrideTeamId(teamId)
    setOverrideAdj('')
    setOverrideReason('')
    setOverrideOpen(true)
  }

  async function handleResetSlot(teamId: string) {
    setResetSlotTeamId(teamId)
    try {
      const result = await api.post<{ teamId: string; newJoinCode: string }>(
        `/sessions/${sessionId}/teams/${teamId}/reset-slot`,
        {},
      )
      setResetSlotResult((prev) => ({ ...prev, [teamId]: result.newJoinCode }))
      setTimeout(load, 300)
    } catch {
      // silently ignore — host can retry
    } finally {
      setResetSlotTeamId(null)
    }
  }

  async function copyNewCode(teamId: string, code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedSlotTeamId(teamId)
    setTimeout(() => setCopiedSlotTeamId(null), 2000)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-blitz-accent animate-spin" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-wrong mb-4">
          <AlertCircle className="h-5 w-5" />
          {error ?? 'Session not found'}
        </div>
        <Button variant="ghost" onClick={() => router.push('/host')} size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    )
  }

  const sessionTeams = session.sessionTeams ?? []
  const statusStr = session.status as string
  const isEnded = statusStr === SessionStatus.SESSION_END || statusStr === 'completed'
  const isLive  = !isEnded
  const quizId  = session.quizId

  // Sort teams by score
  const sortedTeams = [...sessionTeams].sort((a, b) => {
    const scoreA = liveScores[a.teamId] ?? a.score
    const scoreB = liveScores[b.teamId] ?? b.score
    return scoreB - scoreA
  })

  const maxScore = Math.max(...sortedTeams.map((st) => liveScores[st.teamId] ?? st.score), 1)

  return (
    <>
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href={`/host/quiz/${quizId}`} className="text-text-muted hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">
                  {session.quiz?.name ?? 'Live Session'}
                </h1>
                {isLive ? (
                  <span className="flex items-center gap-1.5 text-correct text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-correct animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <Badge variant="default">Ended</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                <span className="text-text-muted text-sm">{STATUS_LABELS[session.status] ?? session.status}</span>
                <span className="text-text-muted text-sm">·</span>
                <button
                  onClick={copySessionId}
                  className="flex items-center gap-1 text-sm font-mono text-text-secondary hover:text-white transition-colors group"
                  title="Click to copy session code"
                >
                  <span className="text-text-muted text-xs">Code:</span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="tracking-widest font-bold">{(session as any).sessionCode ?? sessionId}</span>
                  {copied
                    ? <Check className="h-3 w-3 text-correct" />
                    : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
                {isEnded && (
                  <>
                    <span className="text-text-muted text-sm">·</span>
                    <Link href={`/host/results/${sessionId}`} className="text-sm text-blitz-accent hover:underline">
                      View full results →
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { load(); setLastRefresh(Date.now()) }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Connection status row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="h-4 w-4 text-text-muted" />
              <span className="text-text-muted text-xs font-medium uppercase tracking-wider">Teams</span>
            </div>
            <div className="space-y-2">
              {sessionTeams.map((st) => {
                const newCode = resetSlotResult[st.teamId]
                return (
                  <div key={st.teamId} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.team?.color ?? '#666' }} />
                      <span className="text-white text-sm truncate flex-1">{st.team?.name ?? 'Team'}</span>
                      {st.connected
                        ? <Wifi className="h-3 w-3 text-correct flex-shrink-0" />
                        : (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <WifiOff className="h-3 w-3 text-wrong flex-shrink-0" />
                            <button
                              onClick={() => handleResetSlot(st.teamId)}
                              disabled={resetSlotTeamId === st.teamId}
                              title="Reset team slot — clears device binding and generates a new join code"
                              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-amber-400 transition-colors disabled:opacity-50"
                            >
                              {resetSlotTeamId === st.teamId
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <ShieldAlert className="h-3 w-3" />}
                              Reset
                            </button>
                          </div>
                        )}
                    </div>
                    {/* Show new join code after slot reset so host can give it to the team */}
                    {newCode && (
                      <div className="flex items-center gap-2 pl-4 text-[11px]">
                        <span className="text-amber-400 font-mono tracking-widest font-bold">{newCode}</span>
                        <button
                          onClick={() => copyNewCode(st.teamId, newCode)}
                          className="text-text-muted hover:text-white transition-colors"
                          title="Copy new join code"
                        >
                          {copiedSlotTeamId === st.teamId
                            ? <Check className="h-3 w-3 text-correct" />
                            : <Copy className="h-3 w-3" />}
                        </button>
                        <span className="text-text-muted">new code — give to team</span>
                      </div>
                    )}
                  </div>
                )
              })}
              {sessionTeams.length === 0 && <p className="text-text-muted text-sm">No teams</p>}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-text-muted" />
              <span className="text-text-muted text-xs font-medium uppercase tracking-wider">Audience</span>
            </div>
            <p className="text-3xl font-bold text-white">{session.audienceMembers?.length ?? 0}</p>
            <p className="text-text-muted text-xs mt-0.5">connected</p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-text-muted" />
              <span className="text-text-muted text-xs font-medium uppercase tracking-wider">State</span>
            </div>
            <p className="text-white text-sm font-medium">{STATUS_LABELS[session.status] ?? session.status}</p>
            {session.currentRoundId && (
              <p className="text-text-muted text-xs mt-0.5">Round active</p>
            )}
          </div>
        </div>

        {/* Scores */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Scores</h2>
            <Button size="sm" variant="outline" onClick={() => setOverrideOpen(true)}>
              Override Score
            </Button>
          </div>

          {sortedTeams.length === 0 ? (
            <p className="text-text-muted text-sm">No teams in session</p>
          ) : (
            <div className="space-y-3">
              {sortedTeams.map((st, i) => {
                const score = liveScores[st.teamId] ?? st.score
                const pct   = Math.round((score / maxScore) * 100)
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                return (
                  <div key={st.teamId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {medal && <span>{medal}</span>}
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: st.team?.color ?? '#666' }} />
                        <span className="text-white">{st.team?.name ?? 'Team'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-text-secondary font-mono">{score} pts</span>
                        <button
                          onClick={() => openOverride(st.teamId)}
                          className="text-text-muted hover:text-white text-xs transition-colors"
                        >
                          ±
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: st.team?.color ?? '#3B82F6' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Last refresh note */}
        <p className="text-text-muted text-xs mt-3 text-right">
          Auto-refreshing every 5s · Last: {new Date(lastRefresh).toLocaleTimeString()}
        </p>
      </div>

      {/* Score override dialog */}
      <Dialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Override Score"
        description="Manually adjust a team's score"
      >
        <form onSubmit={handleScoreOverride} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="override-team">Team</Label>
            <select
              id="override-team"
              value={overrideTeamId}
              onChange={(e) => setOverrideTeamId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-white text-sm focus:outline-none focus:ring-2 focus:ring-blitz-accent/50"
            >
              <option value="">Select team…</option>
              {sessionTeams.map((st) => (
                <option key={st.teamId} value={st.teamId}>{st.team?.name ?? st.teamId}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-adj">Adjustment (e.g. +5 or -3)</Label>
            <Input
              id="override-adj"
              type="number"
              placeholder="+5 or -3"
              value={overrideAdj}
              onChange={(e) => setOverrideAdj(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Reason</Label>
            <Input
              id="override-reason"
              placeholder="e.g. Disputed question ruling"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={applyingOverride || !overrideTeamId || !overrideAdj} className="flex-1">
              {applyingOverride ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
