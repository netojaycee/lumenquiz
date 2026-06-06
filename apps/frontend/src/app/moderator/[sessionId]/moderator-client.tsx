'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionId } from '@/hooks/useSessionId'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  ChevronRight,
  Eye,
  SkipForward,
  Trophy,
  LogOut,
  Wifi,
  WifiOff,
  Users,
  Loader2,
  Pause,
  Plus,
  Minus,
  Lock,
  Zap,
  QrCode,
  BookOpen,
  Cloud,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { storage } from '@/lib/storage'
import { api } from '@/lib/api'
import { useSocketStore } from '@/stores/useSocketStore'
import { ReconnectOverlay } from '@/components/shared/ReconnectOverlay'
import { useScreenStore } from '@/stores/useScreenStore'
import {
  MODERATOR_EVENTS,
  SERVER_EVENTS,
  JOIN_EVENTS,
  CONNECTION_EVENTS,
} from '@apoquiz/socket-events'
import { SessionStatus, UserRole, AudienceEngagementLevel } from '@apoquiz/shared-types'
import type { CumulativeScoresPayload, UCStatePayload } from '@apoquiz/socket-events'

// Local shape matching CachedRound from the session cache
interface RoundInfo {
  id: string
  name: string | null
  order: number
  questionCount: number
  timerSeconds: number
  gameMode: string
}

type ConnectPhase = 'checking' | 'connecting' | 'connected' | 'failed'

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Partial<Record<SessionStatus, string>> = {
  [SessionStatus.LOBBY]: 'Lobby',
  [SessionStatus.AUDIENCE_VOTE]: 'Audience Vote',
  [SessionStatus.ROUND_INTRO]: 'Round Intro',
  [SessionStatus.QUESTION_OPEN]: 'Question Open',
  [SessionStatus.QUESTION_LOCKED]: 'Question Locked',
  [SessionStatus.ANSWER_REVEAL]: 'Answer Reveal',
  [SessionStatus.QUESTION_SUMMARY]: 'Round Done',
  [SessionStatus.ROUND_SUMMARY]: 'Round Summary',
  [SessionStatus.CUMULATIVE_REVEAL]: 'Cumulative',
  [SessionStatus.SESSION_END]: 'Session Ended',
  [SessionStatus.TILE_SELECT]: 'Tile Select',
  [SessionStatus.BONUS_OPEN]: 'Bonus Open',
  [SessionStatus.BONUS_ANSWERING]: 'Bonus Answering',
  [SessionStatus.BONUS_REVEAL]: 'Bonus Reveal',
  [SessionStatus.UC_TEAM_SELECT]: 'Team Select',
  [SessionStatus.UC_ACTIVE]: 'Round Active',
  [SessionStatus.CLUE_OPEN]: 'Clue Open',
  [SessionStatus.CLUE_ANSWERING]: 'Clue Answering',
}

const STATUS_COLORS: Partial<Record<SessionStatus, string>> = {
  [SessionStatus.LOBBY]: 'bg-surface text-text-secondary',
  [SessionStatus.AUDIENCE_VOTE]: 'bg-timer-warning/20 text-timer-warning',
  [SessionStatus.ROUND_INTRO]: 'bg-blitz-accent/20 text-blitz-accent',
  [SessionStatus.QUESTION_OPEN]: 'bg-correct/20 text-correct',
  [SessionStatus.QUESTION_LOCKED]: 'bg-wrong/20 text-wrong',
  [SessionStatus.ANSWER_REVEAL]: 'bg-blitz-accent/20 text-blitz-accent',
  [SessionStatus.QUESTION_SUMMARY]: 'bg-surface text-text-secondary',
  [SessionStatus.ROUND_SUMMARY]: 'bg-correct/20 text-correct',
  [SessionStatus.CUMULATIVE_REVEAL]: 'bg-timer-warning/20 text-timer-warning',
  [SessionStatus.SESSION_END]: 'bg-surface text-text-secondary',
  [SessionStatus.TILE_SELECT]: 'bg-blitz-accent/20 text-blitz-accent',
  [SessionStatus.BONUS_OPEN]: 'bg-timer-warning/20 text-timer-warning',
  [SessionStatus.BONUS_ANSWERING]: 'bg-timer-warning/20 text-timer-warning',
  [SessionStatus.BONUS_REVEAL]: 'bg-blitz-accent/20 text-blitz-accent',
  [SessionStatus.UC_TEAM_SELECT]: 'bg-correct/20 text-correct',
  [SessionStatus.UC_ACTIVE]: 'bg-timer-warning/20 text-timer-warning',
  [SessionStatus.CLUE_OPEN]: 'bg-blitz-accent/20 text-blitz-accent',
  [SessionStatus.CLUE_ANSWERING]: 'bg-timer-warning/20 text-timer-warning',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModeratorClient(): React.ReactElement {
  const sessionId = useSessionId()
  const router = useRouter()

  const { connect, emit, connected, midSessionDisconnect } = useSocketStore()
  const {
    sessionStatus,
    scores,
    completedRoundIds,
    currentRound,
    currentQuestion,
    questionIndex,
    totalQuestions,
    audienceCount,
    allAnswered,
    revealData,
    roundSummary,
    sessionEndData,
    voteTally,
    totalVotes,
    cumulativeData,
    tileBlitz,
    isLastRound,
    ucState,
    clueState,
    audienceLevel,
    activeInteraction,
    setAudienceLevel,
    setAudienceInteractionStart,
    updateAudienceInteraction,
    closeAudienceInteraction,
  } = useScreenStore()

  const [phase, setPhase] = useState<ConnectPhase>('checking')
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [readyForSummary, setReadyForSummary] = useState(false)
  const [timerPaused, setTimerPaused] = useState(false)
  const [overrideTeamId, setOverrideTeamId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'scores' | 'audience'>('scores')
  const [qrOnScreen, setQrOnScreen] = useState(false)
  const [rulesOnScreen, setRulesOnScreen] = useState(false)
  const [pendingAnswer, setPendingAnswer] = useState<{ answer: string; teamName: string; teamColor: string; isBonus: boolean } | null>(null)

  // Audience list popup
  const [audienceListOpen, setAudienceListOpen] = useState(false)
  const [audienceListData, setAudienceListData] = useState<{ id: string; fullName: string; totalPoints: number }[]>([])
  const [audienceListLoading, setAudienceListLoading] = useState(false)

  async function openAudienceList() {
    setAudienceListOpen(true)
    setAudienceListLoading(true)
    try {
      const data = await api.get<{ id: string; fullName: string; totalPoints: number }[]>(`/sessions/${sessionId}/audience`)
      setAudienceListData(data)
    } catch {
      setAudienceListData([])
    } finally {
      setAudienceListLoading(false)
    }
  }

  // Cloud sync state (shown at session end)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [syncAdminPw, setSyncAdminPw]   = useState('')
  const [syncing, setSyncing]           = useState(false)
  const [syncResult, setSyncResult]     = useState<{ ok: boolean; text: string } | null>(null)

  async function handleModeratorSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const body: Record<string, string> = { sessionId }
      if (syncAdminPw.trim()) body.adminPassword = syncAdminPw.trim()
      const res = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port.includes('3003') ? '3002' : window.location.port}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      const data = await res.json() as { ok: boolean; message?: string; error?: string }
      setSyncResult({ ok: data.ok, text: data.ok ? (data.message ?? 'Synced!') : (data.error ?? 'Sync failed') })
    } catch (err) {
      setSyncResult({ ok: false, text: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setSyncing(false)
    }
  }

  // Tile Blitz state moved to global store

  // Ultimate Challenge state — derived from ucState (store), plus local countdown
  const [ucTimeLeft, setUCTimeLeft] = useState(0)
  const [clueTimeLeft, setClueTimeLeft] = useState(0)
  const [answeringTimeLeft, setAnsweringTimeLeft] = useState(0)
  const [localUCState, setLocalUCState] = useState<UCStatePayload | null>(null)

  // ─── Connection ───────────────────────────────────────────────────────────

  useEffect(() => {
    const stored = storage.getModerator()
    if (!stored || stored.sessionId !== sessionId) {
      router.replace('/join')
      return
    }

    const socket = connect()

    const onConnected = () => {
      emit(CONNECTION_EVENTS.REJOIN, {
        role: UserRole.MODERATOR,
        sessionId,
        pin: stored.pin,
      })
    }

    const onJoined = () => setPhase('connected')

    const onRounds = (data: { rounds: RoundInfo[]; completedRoundIds?: string[] }) => {
      setRounds(data.rounds)
    }

    const onReadySummary = () => {
      console.log('🔥 Received ready:summary event')
      setReadyForSummary(true)
    }





    socket.on('connect', onConnected)
    if (socket.connected) onConnected()

    socket.on(JOIN_EVENTS.MODERATOR_JOINED, onJoined)
    socket.on('moderator:rounds', onRounds)
    // socket.on(SERVER_EVENTS.TILEBLITZ_BONUS_RESULT, onBonusResult)
    socket.on('moderator:audience:level_updated', (data: { level: AudienceEngagementLevel }) => setAudienceLevel(data.level))
    socket.on(SERVER_EVENTS.AUDIENCE_INTERACTION_START, setAudienceInteractionStart)
    socket.on(SERVER_EVENTS.AUDIENCE_INTERACTION_UPDATE, updateAudienceInteraction)
    socket.on(SERVER_EVENTS.AUDIENCE_INTERACTION_CLOSE, closeAudienceInteraction)

    socket.on(SERVER_EVENTS.TILEBLITZ_PENDING_ANSWER, (data: { teamName: string; teamColor: string; answer: string; isBonus: boolean }) => {
      setPendingAnswer(data)
    })

    const timeout = setTimeout(() => {
      setPhase((current) => (current === 'connected' ? 'connected' : 'failed'))
    }, 10000)

    setPhase('connecting')

    return () => {
      clearTimeout(timeout)
      socket.off('connect', onConnected)
      socket.off(JOIN_EVENTS.MODERATOR_JOINED, onJoined)
      socket.off('moderator:rounds', onRounds)
      socket.off('round:ready:summary', onReadySummary)
      // socket.off(SERVER_EVENTS.TILEBLITZ_BONUS_RESULT, onBonusResult)
      socket.off(SERVER_EVENTS.TILEBLITZ_PENDING_ANSWER)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // useEffect(() => {
  //   console.log('🔥 readyForSummary updated:', readyForSummary)
  // }, [readyForSummary])

  // Reset per-question state when a new question opens
  useEffect(() => {
    if (sessionStatus === SessionStatus.QUESTION_OPEN) {
      setReadyForSummary(false)
      setTimerPaused(false)
      setPendingAnswer(null)
    }
  }, [sessionStatus])

  // Sync UC state from store into local state
  useEffect(() => {
    if (ucState) setLocalUCState(ucState)
  }, [ucState])

  // UC countdown ticker
  useEffect(() => {
    if (sessionStatus !== SessionStatus.UC_ACTIVE || !localUCState?.timerDeadline) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((localUCState.timerDeadline - Date.now()) / 1000))
      setUCTimeLeft(left)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [sessionStatus, localUCState?.timerDeadline])

  // Clue Reveal countdowns for moderator
  useEffect(() => {
    if (
      (sessionStatus !== SessionStatus.CLUE_OPEN && sessionStatus !== SessionStatus.CLUE_ANSWERING) ||
      !clueState
    )
      return
    const tick = () => {
      setClueTimeLeft(Math.max(0, Math.ceil((clueState.timerDeadline - Date.now()) / 1000)))
      setAnsweringTimeLeft(
        Math.max(0, Math.ceil((clueState.answeringTimerDeadline - Date.now()) / 1000)),
      )
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [sessionStatus, clueState?.timerDeadline, clueState?.answeringTimerDeadline])

  // Wake lock — moderator tablet must NEVER sleep during a live quiz
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    if (connected) {
      ;(navigator as any).wakeLock.request('screen').then((l: WakeLockSentinel) => {
        lock = l
      }).catch(() => {})
    }
    return () => { lock?.release().catch(() => {}) }
  }, [connected])

  // ─── Moderator actions ────────────────────────────────────────────────────

  const startRound = useCallback(
    (roundId: string) => {
      emit(MODERATOR_EVENTS.ROUND_START, { sessionId, roundId })
    },
    [emit, sessionId],
  )

  const openVote = useCallback(
    (roundId: string) => {
      emit(MODERATOR_EVENTS.VOTE_OPEN, { sessionId, roundId })
    },
    [emit, sessionId],
  )

  const closeVote = useCallback(() => {
    emit(MODERATOR_EVENTS.VOTE_CLOSE, { sessionId })
  }, [emit, sessionId])

  const openFirstQuestion = useCallback(() => {
    // Auto-hide rules overlay when advancing to first question
    if (rulesOnScreen) {
      setRulesOnScreen(false)
      emit(MODERATOR_EVENTS.RULES_TOGGLE, { sessionId, show: false })
    }
    emit(MODERATOR_EVENTS.QUESTION_REVEAL, { sessionId })
  }, [emit, sessionId, rulesOnScreen])

  const revealAnswers = useCallback(() => {
    emit(MODERATOR_EVENTS.ANSWER_REVEAL, { sessionId })
  }, [emit, sessionId])

  const nextQuestion = useCallback(() => {
    emit(MODERATOR_EVENTS.NEXT_QUESTION, { sessionId })
  }, [emit, sessionId])

  const showRoundSummary = useCallback(() => {
    emit(MODERATOR_EVENTS.ROUND_SUMMARY, { sessionId })
  }, [emit, sessionId])

  const nextRound = useCallback(() => {
    emit(MODERATOR_EVENTS.NEXT_ROUND, { sessionId })
  }, [emit, sessionId])

  const showCumulative = useCallback(() => {
    emit(MODERATOR_EVENTS.SHOW_CUMULATIVE, { sessionId })
  }, [emit, sessionId])

  const endSession = useCallback(() => {
    emit(MODERATOR_EVENTS.SESSION_END, { sessionId })
  }, [emit, sessionId])

  const setEngagementLevel = useCallback((level: AudienceEngagementLevel) => {
    emit(MODERATOR_EVENTS.SET_AUDIENCE_LEVEL, { sessionId, level })
  }, [emit, sessionId])

const toggleTimer = useCallback(() => {
    const next = !timerPaused
    setTimerPaused(next)
    emit(MODERATOR_EVENTS.TIMER_PAUSE, { sessionId, paused: next })
  }, [emit, sessionId, timerPaused])

  const adjustScore = useCallback(
    (teamId: string, adjustment: number) => {
      emit(MODERATOR_EVENTS.SCORE_OVERRIDE, { sessionId, teamId, adjustment, reason: 'moderator' })
      setOverrideTeamId(null)
    },
    [emit, sessionId],
  )

  // Tile Blitz actions
  const selectTile = useCallback(
    (questionId: string) => {
      emit(MODERATOR_EVENTS.TILEBLITZ_SELECT_TILE, { sessionId, questionId })
    },
    [emit, sessionId],
  )

  const lockTileQuestion = useCallback(() => {
    emit(MODERATOR_EVENTS.TILEBLITZ_LOCK_QUESTION, { sessionId })
    setPendingAnswer(null)
  }, [emit, sessionId])

  const openBonus = useCallback(() => {
    emit(MODERATOR_EVENTS.TILEBLITZ_BONUS_OPEN, { sessionId })
  }, [emit, sessionId])

  const grantBonus = useCallback(() => {
    emit(MODERATOR_EVENTS.TILEBLITZ_BONUS_GRANT, { sessionId })
  }, [emit, sessionId])

  const revealBonusAnswer = useCallback(() => {
    emit(MODERATOR_EVENTS.TILEBLITZ_BONUS_REVEAL, { sessionId })
  }, [emit, sessionId])

  const nextTurn = useCallback(() => {
    emit(MODERATOR_EVENTS.TILEBLITZ_NEXT_TURN, { sessionId })
  }, [emit, sessionId])

  // Ultimate Challenge actions
  const ucSelectTeam = useCallback(
    (teamId: string) => {
      emit(MODERATOR_EVENTS.UC_SELECT_TEAM, { sessionId, teamId })
    },
    [emit, sessionId],
  )

  const ucMarkCorrect = useCallback(() => {
    emit(MODERATOR_EVENTS.UC_MARK_CORRECT, { sessionId })
  }, [emit, sessionId])

  const ucSkip = useCallback(() => {
    emit(MODERATOR_EVENTS.UC_SKIP, { sessionId })
  }, [emit, sessionId])

  const ucEndTurn = useCallback(() => {
    emit(MODERATOR_EVENTS.UC_END_TURN, { sessionId })
  }, [emit, sessionId])

  // ─── Loading states ───────────────────────────────────────────────────────

  if (phase === 'checking' || phase === 'connecting') {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-blitz-accent h-8 w-8 animate-spin" />
          <p className="text-text-secondary text-sm">Connecting to session...</p>
        </div>
      </main>
    )
  }

  if (phase === 'failed') {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <WifiOff className="text-wrong mx-auto mb-4 h-10 w-10" />
          <h2 className="mb-2 font-semibold text-white">Connection failed</h2>
          <p className="text-text-muted mb-6 text-sm">Could not connect to the session.</p>
          <Button onClick={() => router.replace('/join')}>Back to Join</Button>
        </div>
      </main>
    )
  }

  const status = sessionStatus
  // const isLastQuestion = questionIndex + 1 >= totalQuestions && totalQuestions > 0
  const isTileBlitz = currentRound?.gameMode === 'tile_blitz'
  const isUC = currentRound?.gameMode === 'ultimate_challenge'

  // For Tile Blitz answer reveal — detect if the active team answered wrong
  const activeTeamRevealResult = revealData?.teamAnswers.find(
    (a) => a.teamId === tileBlitz?.activeTeamId,
  )
  const tileBlitzMainAnswerWrong =
    isTileBlitz && activeTeamRevealResult && !activeTeamRevealResult.isCorrect

  const isLastQuestion = revealData?.isLastQuestion
  const isEndOfFlow = isLastQuestion
  const showSummary = readyForSummary || isEndOfFlow
  const primaryAction = (() => {
    if (showSummary) return 'summary'
    if (isTileBlitz) return 'tile_next'
    return 'next_question'
  })()
  const showBonus = isTileBlitz && tileBlitzMainAnswerWrong

  const revealedClues = clueState?.clues.slice(0, clueState?.currentClueIndex + 1)

  function toggleQROnScreen() {
    const next = !qrOnScreen
    setQrOnScreen(next)
    emit(MODERATOR_EVENTS.SCREEN_QR, { sessionId, show: next })
  }

  function toggleRulesOnScreen() {
    const next = !rulesOnScreen
    setRulesOnScreen(next)
    emit(MODERATOR_EVENTS.RULES_TOGGLE, { sessionId, show: next })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="bg-background flex min-h-screen flex-col">
      <ReconnectOverlay show={midSessionDisconnect} variant="banner" />
      {/* Header */}
      <header className="border-border bg-surface flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-wide text-white">MODERATOR</span>
          <span className="text-text-muted font-mono text-xs">{sessionId.slice(0, 8)}…</span>
          {status && (
            <span
              className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[status])}
            >
              {STATUS_LABELS[status] ?? status}
            </span>
          )}
        </div>
        <div className="text-text-muted flex items-center gap-4 text-sm">
          <button
            onClick={openAudienceList}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:text-white hover:bg-white/5"
            title="View connected audience members"
          >
            <Users className="h-4 w-4" />
            <span className="font-semibold">{audienceCount}</span>
            <span>audience</span>
          </button>
          <button
            onClick={toggleQROnScreen}
            title={qrOnScreen ? 'Hide QR from screen' : 'Show QR on screen'}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
              qrOnScreen
                ? 'bg-correct/20 text-correct hover:bg-correct/30'
                : 'hover:text-white',
            )}
          >
            <QrCode className="h-4 w-4" />
            {qrOnScreen ? 'Hide QR' : 'QR'}
          </button>
          <span
            className={cn('flex items-center gap-1', connected ? 'text-correct' : 'text-wrong')}
          >
            {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </span>
          <button
            onClick={() => {
              storage.clearModerator()
              router.push('/join')
            }}
            className="flex items-center gap-1 transition-colors hover:text-white"
            title="Leave session"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main Controls ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* LOBBY */}
            {status === SessionStatus.LOBBY && (
              <motion.div
                key="lobby"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="mb-1 text-xl font-bold text-white">Lobby</h2>
                    <p className="text-text-muted text-sm">
                      {scores.length} team{scores.length !== 1 ? 's' : ''} registered
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={qrOnScreen ? 'default' : 'outline'}
                    onClick={toggleQROnScreen}
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    {qrOnScreen ? 'Hide QR' : 'Show QR on Screen'}
                  </Button>
                </div>
                {rounds.length === 0 ? (
                  <p className="text-text-muted text-sm">Waiting for round data…</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-text-secondary mb-3 text-xs tracking-widest uppercase">
                      Select round to start
                    </p>
                    {rounds.map((r) => {
                      const isDone = completedRoundIds.includes(r.id)
                      return (
                        <div
                          key={r.id}
                          className={cn(
                            'border-border flex items-center gap-3 rounded-xl border p-4',
                            isDone ? 'bg-surface/40 opacity-60' : 'bg-surface',
                          )}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-white">
                                {r.name ?? `Round ${r.order}`}
                              </p>
                              {isDone && (
                                <span className="bg-correct/20 text-correct rounded-full px-2 py-0.5 text-xs font-medium">
                                  Done
                                </span>
                              )}
                            </div>
                            <p className="text-text-muted mt-0.5 text-xs">
                              {r.questionCount} questions · {r.timerSeconds}s each · {r.gameMode}
                            </p>
                          </div>
                          {!isDone && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => openVote(r.id)}>
                                Open Vote
                              </Button>
                              <Button size="sm" onClick={() => startRound(r.id)}>
                                <Play className="mr-1 h-3.5 w-3.5" />
                                Start
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* AUDIENCE VOTE */}
            {status === SessionStatus.AUDIENCE_VOTE && (
              <motion.div
                key="vote"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="mb-1 text-xl font-bold text-white">Audience Vote</h2>
                <p className="text-text-muted mb-6 text-sm">
                  Live ranking predictions — {totalVotes} votes cast
                </p>
                <div className="mb-6 space-y-2">
                  {Object.entries(voteTally)
                    .sort(([, a], [, b]) => b - a)
                    .map(([teamId, count]) => {
                      const team = scores.find((s) => s.teamId === teamId)
                      const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0
                      return (
                        <div key={teamId} className="flex items-center gap-3">
                          <div className="w-28 truncate text-sm text-white">
                            {team?.teamName ?? teamId}
                          </div>
                          <div className="bg-surface h-6 flex-1 overflow-hidden rounded">
                            <div
                              className="flex h-full items-center rounded px-2"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: team?.teamColor ?? '#888',
                                transition: 'width 300ms ease',
                              }}
                            >
                              <span className="text-xs font-bold text-white">{count}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
                <Button variant="destructive" onClick={closeVote}>
                  Close Vote
                </Button>
              </motion.div>
            )}

            {/* ROUND INTRO */}
            {status === SessionStatus.ROUND_INTRO && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-blitz-accent mb-2 text-xs tracking-widest uppercase">
                  Round Starting
                </p>
                <h2 className="mb-1 text-2xl font-bold text-white">
                  {currentRound?.name ?? `Round ${currentRound?.order ?? ''}`}
                </h2>
                <p className="text-text-muted mb-6 text-sm">
                  {currentRound?.questionCount ?? 0} questions · {currentRound?.timerSeconds ?? 0}s
                  each
                </p>
                <div className="flex flex-col gap-3">
                  <Button
                    size="sm"
                    variant={rulesOnScreen ? 'default' : 'outline'}
                    onClick={toggleRulesOnScreen}
                    className="w-fit"
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    {rulesOnScreen ? 'Hide Rules from Screen' : 'Show Rules on Screen'}
                  </Button>
                  <Button size="lg" onClick={openFirstQuestion}>
                    <Eye className="mr-2 h-5 w-5" />
                    {isTileBlitz
                      ? 'Show Tile Grid'
                      : isUC
                        ? 'Select First Team'
                        : 'Open First Question'}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* QUESTION OPEN */}
            {status === SessionStatus.QUESTION_OPEN && currentQuestion && (
              <motion.div
                key="qopen"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-text-muted text-xs">
                    Q{questionIndex + 1} of {totalQuestions}
                  </p>
                  <button
                    onClick={toggleTimer}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      timerPaused
                        ? 'border-correct text-correct bg-correct/10'
                        : 'border-border text-text-secondary hover:text-white',
                    )}
                  >
                    {timerPaused ? (
                      <Play className="h-3.5 w-3.5" />
                    ) : (
                      <Pause className="h-3.5 w-3.5" />
                    )}
                    {timerPaused ? 'Resume' : 'Pause'}
                  </button>
                </div>

                <div className="bg-surface border-border mb-4 rounded-xl border p-4">
                  <p className="text-text-muted mb-2 text-xs tracking-wide uppercase">
                    {currentQuestion.type.toUpperCase()}
                  </p>
                  <p className="leading-relaxed font-medium text-white">{currentQuestion.text}</p>
                  {currentQuestion.options && currentQuestion.options.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {currentQuestion.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={cn(
                            'rounded-lg px-3 py-1.5 text-sm',
                            opt.isCorrect
                              ? 'bg-correct/10 text-correct border-correct/30 border'
                              : 'text-text-secondary',
                          )}
                        >
                          <span className="mr-2 font-mono font-bold">{opt.label}.</span>
                          {opt.text}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-correct mt-3 text-xs font-medium">
                    ✓ {currentQuestion.correctAnswer}
                  </p>
                </div>

                {isTileBlitz ? (
                  <div className="space-y-3">
                    {/* Live pending answer monitor */}
                    <div
                      className={cn(
                        'rounded-xl border px-4 py-3 transition-colors',
                        pendingAnswer
                          ? 'border-timer-warning/40 bg-timer-warning/10'
                          : 'border-border bg-surface/50',
                      )}
                    >
                      <p className="text-text-muted mb-1 text-xs tracking-wide uppercase">
                        {pendingAnswer?.isBonus ? 'Bonus — Current Answer' : 'Team Answer (live)'}
                      </p>
                      {pendingAnswer ? (
                        <p
                          className="text-lg font-bold"
                          style={{ color: pendingAnswer.teamColor }}
                        >
                          {pendingAnswer.teamName}:{' '}
                          <span className="text-white">{pendingAnswer.answer}</span>
                        </p>
                      ) : (
                        <p className="text-text-muted text-sm italic">Waiting for input…</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={lockTileQuestion}
                        className="flex items-center gap-2"
                      >
                        <Lock className="h-4 w-4" />
                        Lock Answer
                      </Button>
                      <p className="text-text-muted flex items-center text-sm">
                        Active:{' '}
                        <span
                          style={{
                            color: scores.find((s) => s.teamId === tileBlitz?.activeTeamId)?.teamColor,
                          }}
                          className="ml-1 font-semibold"
                        >
                          {scores.find((s) => s.teamId === tileBlitz?.activeTeamId)?.teamName ?? '—'}
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-text-muted text-sm">Waiting for team answers…</p>
                )}
              </motion.div>
            )}

            {/* TILE BLITZ: TILE SELECT */}
            {status === SessionStatus.TILE_SELECT && (
              <motion.div
                key="tile-select"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-blitz-accent mb-2 text-xs tracking-widest uppercase">
                  Tile Blitz
                </p>
                <h2 className="mb-1 text-xl font-bold text-white">Select a Tile</h2>
                <p className="text-text-muted mb-4 text-sm">
                  Active team:{' '}
                  <span
                    style={{
                      color:
                        scores.find((s) => s.teamId === tileBlitz?.activeTeamId)?.teamColor ?? '#fff',
                    }}
                    className="font-semibold"
                  >
                    {scores.find((s) => s.teamId === tileBlitz?.activeTeamId)?.teamName ?? '—'}
                  </span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {tileBlitz?.tiles.map((tile, i) => (
                    <button
                      key={tile.questionId}
                      disabled={tile.used}
                      onClick={() => selectTile(tile.questionId)}
                      className={cn(
                        'aspect-square rounded-xl border text-lg font-bold transition-all',
                        tile.used
                          ? 'border-border bg-surface/30 text-text-muted cursor-not-allowed opacity-40'
                          : 'border-blitz-accent bg-surface hover:bg-blitz-accent/20 cursor-pointer text-white',
                      )}
                    >
                      {tile.used ? '✓' : i + 1}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* QUESTION LOCKED — Tile Blitz variant shows "Reveal Answer" */}
            {status === SessionStatus.QUESTION_LOCKED && (
              <motion.div
                key="qlocked"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="bg-surface border-border mb-6 rounded-xl border p-6 text-center">
                  {allAnswered ? (
                    <>
                      <p className="text-correct mb-1 text-lg font-bold">
                        {isTileBlitz ? 'Answer locked!' : 'All teams answered!'}
                      </p>
                      <p className="text-text-muted text-sm">Ready to reveal</p>
                    </>
                  ) : (
                    <>
                      <p className="text-timer-warning mb-1 text-lg font-bold">Time&apos;s up!</p>
                      <p className="text-text-muted text-sm">Revealing answers now</p>
                    </>
                  )}
                </div>
                <Button size="lg" onClick={revealAnswers} className="w-full">
                  <Eye className="mr-2 h-5 w-5" />
                  Reveal Answer{isTileBlitz ? '' : 's'}
                </Button>
              </motion.div>
            )}

            {/* ANSWER REVEAL */}
            {status === SessionStatus.ANSWER_REVEAL && (
              <motion.div
                key="reveal"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="mb-4 text-xl font-bold text-white">Answer Revealed</h2>
                {revealData && (
                  <div className="mb-6 space-y-2">
                    {revealData.teamAnswers.map((a) => (
                      <div
                        key={a.teamId}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3',
                          a.isCorrect
                            ? 'border-correct/30 bg-correct/5'
                            : 'border-wrong/30 bg-wrong/5',
                        )}
                      >
                        <div
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: a.teamColor }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">{a.teamName}</p>
                          <p className="text-text-muted truncate text-xs">
                            &quot;{a.submittedAnswer || '—'}&quot;
                          </p>
                        </div>
                        <div
                          className={cn(
                            'text-sm font-bold',
                            a.isCorrect ? 'text-correct' : 'text-wrong',
                          )}
                        >
                          {a.isCorrect ? `+${a.pointsEarned}` : '✗'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  {showBonus && (
                    <Button size="lg" variant="outline" onClick={openBonus} className="flex-1">
                      <Zap className="mr-2 h-5 w-5" />
                      Open Bonus
                    </Button>
                  )}

                  {primaryAction === 'summary' && (
                    <Button size="lg" onClick={showRoundSummary} className="flex-1">
                      <Trophy className="mr-2 h-5 w-5" />
                      Round Summary
                    </Button>
                  )}

                  {primaryAction === 'next_question' && !isLastQuestion && (
                    <Button size="lg" onClick={nextQuestion} className="flex-1">
                      <ChevronRight className="mr-2 h-5 w-5" />
                      Next Question
                    </Button>
                  )}

                  {primaryAction === 'tile_next' && !isLastQuestion && (
                    <Button size="lg" onClick={nextTurn} className="flex-1">
                      <ChevronRight className="mr-2 h-5 w-5" />
                      Next Turn
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* TILE BLITZ: BONUS OPEN */}
            {status === SessionStatus.BONUS_OPEN && (
              <motion.div
                key="bonus-open"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-timer-warning mb-2 text-xs tracking-widest uppercase">
                  Bonus Round
                </p>
                <h2 className="mb-1 text-xl font-bold text-white">Buzz-In Window Open</h2>
                <p className="text-text-muted mb-6 text-sm">
                  First team to press Space Bar wins the bonus
                </p>
                {tileBlitz?.bonusClaimData ? (
                  <div className="mb-4 flex items-center gap-3 rounded-xl border border-blitz-accent/30 bg-blitz-accent/10 p-4">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: tileBlitz.bonusClaimData.teamColor }}
                    />
                    <div className="flex-1 text-sm font-medium text-white">
                      {tileBlitz.bonusClaimData.teamName} buzzed in!
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface border-border mb-6 rounded-xl border p-4 text-center">
                    <Loader2 className="text-timer-warning mx-auto mb-2 h-6 w-6 animate-spin" />
                    <p className="text-text-muted text-sm">Waiting for buzz-in…</p>
                  </div>
                )}
                <div className="flex gap-3">
                  {tileBlitz?.bonusClaimData && (
                    <Button size="lg" onClick={grantBonus} className="flex-1">
                      <Zap className="mr-2 h-5 w-5" />
                      Grant Bonus
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* TILE BLITZ: BONUS ANSWERING */}
            {status === SessionStatus.BONUS_ANSWERING && (
              <motion.div
                key="bonus-answering"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-timer-warning mb-2 text-xs tracking-widest uppercase">
                  Bonus Round
                </p>
                <h2 className="mb-1 text-xl font-bold text-white">Bonus Answering</h2>
                {tileBlitz?.bonusClaimData && (
                  <p className="text-text-muted mb-6 text-sm">
                    <span
                      style={{ color: tileBlitz.bonusClaimData.teamColor }}
                      className="font-semibold"
                    >
                      {tileBlitz.bonusClaimData.teamName}
                    </span>{' '}
                    is selecting their answer
                  </p>
                )}
                <div className="bg-surface border-border mb-6 rounded-xl border p-4">
                  {currentQuestion && (
                    <>
                      <p className="text-text-muted mb-2 text-xs">Same question — bonus attempt</p>
                      <p className="font-medium text-white">{currentQuestion.text}</p>
                      {currentQuestion.options?.map((opt) => (
                        <div
                          key={opt.id}
                          className={cn(
                            'mt-2 rounded-lg px-3 py-1.5 text-sm',
                            opt.isCorrect
                              ? 'bg-correct/10 text-correct border-correct/30 border'
                              : 'text-text-secondary',
                          )}
                        >
                          <span className="mr-2 font-mono font-bold">{opt.label}.</span>
                          {opt.text}
                        </div>
                      ))}
                      <p className="text-correct mt-3 text-xs font-medium">
                        ✓ {currentQuestion.correctAnswer}
                      </p>
                    </>
                  )}
                </div>
                <Button size="lg" onClick={revealBonusAnswer} className="w-full">
                  <Eye className="mr-2 h-5 w-5" />
                  Reveal Bonus Answer
                </Button>
              </motion.div>
            )}

            {/* TILE BLITZ: BONUS REVEAL */}
            {status === SessionStatus.BONUS_REVEAL && (
              <motion.div
                key="bonus-reveal"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-timer-warning mb-2 text-xs tracking-widest uppercase">
                  Bonus Result
                </p>
                <h2 className="mb-4 text-xl font-bold text-white">
                  {tileBlitz?.bonusResult?.isCorrect ? 'Bonus Correct!' : 'Bonus Wrong'}
                </h2>
                {tileBlitz?.bonusResult && (
                  <div
                    className={cn(
                      'mb-6 rounded-xl border p-4',
                      tileBlitz?.bonusResult.isCorrect
                        ? 'border-correct/30 bg-correct/5'
                        : 'border-wrong/30 bg-wrong/5',
                    )}
                  >
                    <p
                      className={cn(
                        'font-semibold',
                        tileBlitz?.bonusResult?.isCorrect ? 'text-correct' : 'text-wrong',
                      )}
                    >
                      {tileBlitz?.bonusResult?.teamName}:{' '}
                      {tileBlitz?.bonusResult?.isCorrect ? 'Correct ✓' : 'Wrong ✗'}
                    </p>
                  </div>
                )}
                {showSummary ? (
                  <Button size="lg" onClick={showRoundSummary} className="w-full">
                    <Trophy className="mr-2 h-5 w-5" />
                    Round Summary
                  </Button>
                ) : (
                  <Button size="lg" onClick={nextTurn} className="w-full">
                    <ChevronRight className="mr-2 h-5 w-5" />
                    Next Turn
                  </Button>
                )}
              </motion.div>
            )}

            {/* CLUE REVEAL: CLUE OPEN — show clue, offer next clue or skip */}
            {status === SessionStatus.CLUE_OPEN && clueState && (
              <motion.div
                key="clue-open-mod"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-blitz-accent mb-2 text-xs tracking-widest uppercase">
                  Clue Reveal — Question {clueState.questionIndex + 1}/{clueState.totalQuestions}
                </p>

                {/* ⏱ Timer */}
                <div
                  className={cn(
                    'bg-surface mb-4 rounded-lg px-3 py-1.5 font-mono text-lg font-bold text-center',
                    clueTimeLeft <= 5 ? 'text-wrong border-wrong border' : 'text-white',
                  )}
                >
                  {clueTimeLeft}s
                </div>

                {/* Current clue */}
                {/* <div className="bg-surface border-border mb-4 rounded-xl border p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-text-muted text-xs tracking-wide uppercase">
                      Clue {clueState.currentClueIndex + 1} of {clueState.clues.length}
                    </p>
                    <span className="text-blitz-accent text-xs font-semibold">
                      {clueState.pointsAvailable} pts
                    </span>
                  </div>
                  <p className="text-lg leading-snug font-semibold text-white">
                    {clueState.currentClueText}
                  </p>
                  {clueState.lockedTeamIds.length > 0 && (
                    <p className="text-wrong mt-2 text-xs">
                      Locked out: {clueState.lockedTeamIds.join(', ')}
                    </p>
                  )}
                </div> */}

                <div className="bg-surface border-border mb-4 rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-text-muted text-xs tracking-wide uppercase">
                      Clue {clueState.currentClueIndex + 1} of {clueState.clues.length}
                    </p>
                    <span className="text-blitz-accent text-xs font-semibold">
                      {clueState.pointsAvailable} pts
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {revealedClues?.map((clue, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <span className="text-text-muted mt-1 text-xs">{index + 1}.</span>
                        <p
                          className={cn(
                            'text-sm font-medium',
                            index === clueState.currentClueIndex
                              ? 'text-white'
                              : 'text-text-muted opacity-70',
                          )}
                        >
                          {clue}
                        </p>
                      </div>
                    ))}
                  </div>

                  {clueState.lockedTeamIds.length > 0 && (
                    <p className="text-wrong mt-3 text-xs">
                      Locked out:{' '}
                      {clueState.lockedTeamIds
                        .map((tid) => scores.find((s) => s.teamId === tid)?.teamName ?? tid)
                        .join(', ')}
                    </p>
                  )}
                </div>

                {/* Correct answer (for moderator reference) */}
                {clueState.correctAnswer && (
                  <div className="bg-correct/5 border-correct/20 mb-4 rounded-lg border px-3 py-2">
                    <p className="text-text-muted mb-0.5 text-xs tracking-wide uppercase">
                      Correct answer
                    </p>
                    <p className="text-correct font-semibold">{clueState.correctAnswer}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {clueState.currentClueIndex + 1 < clueState.clues.length ? (
                    <Button
                      size="lg"
                      className="bg-blitz-accent hover:bg-blitz-accent/80 w-full text-black"
                      onClick={() => emit(MODERATOR_EVENTS.CLUE_REVEAL_NEXT, { sessionId })}
                    >
                      <ChevronRight className="mr-2 h-4 w-4" />
                      Next Clue
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" className="w-full" disabled>
                      Last Clue
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-wrong text-wrong hover:bg-wrong/10 w-full"
                    onClick={() => emit(MODERATOR_EVENTS.CLUE_SKIP, { sessionId })}
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Skip Question
                  </Button>
                </div>
              </motion.div>
            )}

            {/* CLUE REVEAL: CLUE ANSWERING — team is answering */}
            {status === SessionStatus.CLUE_ANSWERING && clueState && (
              <motion.div
                key="clue-answering-mod"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-timer-warning mb-2 text-xs tracking-widest uppercase">
                  Clue Answering
                </p>

                {/* ⏱ Timer */}
                <div className="bg-timer-warning/20 text-timer-warning mb-4 rounded-lg px-3 py-1.5 text-center font-mono text-lg font-bold">
                  {answeringTimeLeft}s
                </div>
                <div className="bg-surface border-border mb-4 flex items-center gap-3 rounded-xl border p-4">
                  {clueState.buzzingTeamColor && (
                    <div
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: clueState.buzzingTeamColor }}
                    />
                  )}
                  <div>
                    <p className="font-bold text-white">{clueState.buzzingTeamName}</p>
                    <p className="text-text-muted text-xs">is answering...</p>
                  </div>
                  <span className="text-blitz-accent ml-auto text-sm font-semibold">
                    {clueState.pointsAvailable} pts
                  </span>
                </div>
                {clueState.correctAnswer && (
                  <div className="bg-correct/5 border-correct/20 rounded-lg border px-3 py-2">
                    <p className="text-text-muted mb-0.5 text-xs tracking-wide uppercase">
                      Correct answer
                    </p>
                    <p className="text-correct font-semibold">{clueState.correctAnswer}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ULTIMATE CHALLENGE: TEAM SELECT */}
            {status === SessionStatus.UC_TEAM_SELECT && localUCState && (
              <motion.div
                key="uc-team-select"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-correct mb-2 text-xs tracking-widest uppercase">
                  Ultimate Challenge
                </p>

                <h2 className="mb-1 text-xl font-bold text-white">Select a Team</h2>

                <p className="text-text-muted mb-4 text-sm">
                  Choose which team goes next. Timer starts on selection.
                </p>

                {/* 🏁 DONE TEAMS */}
                {localUCState.teams?.filter((t) => t.isCompleted).length > 0 && (
                  <div className="mb-4">
                    <p className="text-text-muted mb-2 text-xs tracking-wider uppercase">Done</p>

                    {localUCState.teams
                      .filter((t) => t.isCompleted)
                      .map((t) => (
                        <div
                          key={t.teamId}
                          className="border-border bg-surface/40 mb-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 opacity-60"
                        >
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: t.teamColor }}
                          />
                          <span className="flex-1 text-sm text-white">{t.teamName}</span>
                          <span className="text-correct text-xs">{t.score} pts</span>
                        </div>
                      ))}
                  </div>
                )}

                {/* ⏳ WAITING TEAMS */}
                <p className="text-text-muted mb-2 text-xs tracking-wider uppercase">Waiting</p>

                <div className="space-y-2">
                  {localUCState.teams
                    ?.filter((t) => !t.isCompleted)
                    .map((t) => (
                      <button
                        key={t.teamId}
                        onClick={() => ucSelectTeam(t.teamId)}
                        disabled={t.isActive}
                        className={cn(
                          'border-border bg-surface flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                          t.isActive ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface/80',
                        )}
                      >
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: t.teamColor }}
                        />
                        <span className="flex-1 font-medium text-white">{t.teamName}</span>

                        {t.isActive ? (
                          <span className="text-correct text-xs">Active</span>
                        ) : (
                          <Play className="text-correct h-5 w-5" />
                        )}
                      </button>
                    ))}
                </div>
              </motion.div>
            )}

            {/* ULTIMATE CHALLENGE: ACTIVE */}
            {status === SessionStatus.UC_ACTIVE && localUCState && (
              <motion.div
                key="uc-active"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {/* ACTIVE TEAM (DERIVED) */}
                {(() => {
                  const activeTeam = localUCState.teams?.find((t) => t.isActive) ?? null

                  const currentQuestion = localUCState.currentQuestion ?? null

                  return (
                    <>
                      {/* Header: active team + timer */}
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: activeTeam?.teamColor ?? '#888' }}
                          />

                          <span className="font-bold text-white">
                            {activeTeam?.teamName ?? '—'}
                          </span>

                          {/* ❌ removed global correctCount */}
                          <span className="text-text-muted text-xs">
                            {activeTeam?.score ?? 0} pts
                          </span>
                        </div>

                        <div
                          className={cn(
                            'rounded-lg px-3 py-1.5 font-mono text-lg font-bold',
                            ucTimeLeft <= 10
                              ? 'bg-wrong/20 text-wrong'
                              : ucTimeLeft <= 20
                                ? 'bg-timer-warning/20 text-timer-warning'
                                : 'bg-correct/10 text-correct',
                          )}
                        >
                          {ucTimeLeft}s
                        </div>
                      </div>

                      {/* Current question */}
                      {currentQuestion && activeTeam ? (
                        <div className="bg-surface border-border mb-4 rounded-xl border p-4">
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-text-muted text-xs tracking-wide uppercase">
                              Current question
                            </p>

                            {/* ❌ replaced queueLength */}
                            <p className="text-text-muted text-xs">
                              {activeTeam.remaining} in queue
                            </p>
                          </div>

                          <p className="mb-3 text-lg leading-snug font-semibold text-white">
                            {currentQuestion.text}
                          </p>

                          <div className="border-border border-t pt-3">
                            <p className="text-text-muted mb-0.5 text-xs tracking-wide uppercase">
                              Accepted answer
                            </p>
                            <p className="text-correct font-medium">
                              {currentQuestion.correctAnswer}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-surface border-border mb-4 rounded-xl border p-6 text-center">
                          <p className="text-correct font-bold">All questions answered!</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="mb-3 grid grid-cols-2 gap-3">
                        <Button
                          size="lg"
                          className="bg-correct hover:bg-correct/80 w-full text-white"
                          onClick={ucMarkCorrect}
                          disabled={!currentQuestion}
                        >
                          ✓ Correct
                        </Button>

                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full"
                          onClick={ucSkip}
                          disabled={!currentQuestion}
                        >
                          <SkipForward className="mr-2 h-4 w-4" />
                          Skip
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-text-muted w-full"
                        onClick={ucEndTurn}
                      >
                        End Turn Early
                      </Button>
                    </>
                  )
                })()}
              </motion.div>
            )}

            {/* QUESTION SUMMARY (last question done, waiting for moderator to show summary) */}
            {status === SessionStatus.QUESTION_SUMMARY && (
              <motion.div
                key="qsummary"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="bg-surface border-border mb-6 rounded-xl border p-6 text-center">
                  <p className="mb-1 text-lg font-bold text-white">Round complete!</p>
                  <p className="text-text-muted text-sm">
                    All questions answered. Ready for summary.
                  </p>
                </div>
                <Button size="lg" onClick={showRoundSummary} className="w-full">
                  <Trophy className="mr-2 h-5 w-5" />
                  Show Round Summary
                </Button>
              </motion.div>
            )}

            {/* ROUND SUMMARY */}
            {status === SessionStatus.ROUND_SUMMARY && roundSummary && (
              <motion.div
                key="rsummary"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="mb-4 text-xl font-bold text-white">
                  {roundSummary.roundName ?? 'Round'} Summary
                </h2>
                <div className="mb-6 space-y-2">
                  {roundSummary.teamScores.map((s) => (
                    <div
                      key={s.teamId}
                      className="bg-surface border-border flex items-center gap-3 rounded-xl border p-3"
                    >
                      <span className="text-text-muted w-6 text-center text-sm">#{s.rank}</span>
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: s.teamColor }}
                      />
                      <span className="flex-1 text-sm text-white">{s.teamName}</span>
                      <span className="text-blitz-accent font-bold">{s.score} pts</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    {isLastRound ? (
                      <Button variant="destructive" onClick={endSession} className="flex-1">
                        <LogOut className="mr-2 h-4 w-4" />
                        End Quiz & Declare Winner
                      </Button>
                    ) : (
                      <Button onClick={nextRound} className="flex-1">
                        <SkipForward className="mr-2 h-4 w-4" />
                        Next Round
                      </Button>
                    )}
                  </div>
                  <Button variant="outline" onClick={showCumulative} className="w-full">
                    <Trophy className="mr-2 h-4 w-4" />
                    Show Cumulative Leaderboard
                  </Button>
                </div>
              </motion.div>
            )}

            {/* CUMULATIVE REVEAL */}
            {status === SessionStatus.CUMULATIVE_REVEAL && (
              <motion.div
                key="cumulative"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="mb-1 text-xl font-bold text-white">Overall Standings</h2>
                <p className="text-text-muted mb-6 text-sm">
                  Cumulative scores shown to all screens
                </p>
                {cumulativeData && (
                  <div className="mb-6 space-y-2">
                    {(cumulativeData as CumulativeScoresPayload).finalScores
                      .slice()
                      .sort((a, b) => a.rank - b.rank)
                      .map((s) => (
                        <div
                          key={s.teamId}
                          className="bg-surface border-border flex items-center gap-3 rounded-xl border p-3"
                        >
                          <span className="text-xl">
                            {s.rank === 1
                              ? '🥇'
                              : s.rank === 2
                                ? '🥈'
                                : s.rank === 3
                                  ? '🥉'
                                  : `#${s.rank}`}
                          </span>
                          <div
                            className="h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: s.teamColor }}
                          />
                          <span className="flex-1 text-sm text-white">{s.teamName}</span>
                          <span className="text-timer-warning font-bold">{s.score} pts</span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="flex gap-3">
                  {isLastRound ? (
                    <Button variant="destructive" onClick={endSession} className="flex-1">
                      <LogOut className="mr-2 h-4 w-4" />
                      End Quiz &amp; Declare Winner
                    </Button>
                  ) : (
                    <Button onClick={nextRound} className="flex-1">
                      <SkipForward className="mr-2 h-4 w-4" />
                      Next Round
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* SESSION END */}
            {status === SessionStatus.SESSION_END && sessionEndData && (
              <motion.div
                key="end"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="mb-1 text-2xl font-bold text-white">Quiz Complete!</h2>
                <p className="text-text-muted mb-6 text-sm">Final standings</p>
                <div className="space-y-2 mb-6">
                  {sessionEndData.finalScores.map((s) => (
                    <div
                      key={s.teamId}
                      className="bg-surface border-border flex items-center gap-3 rounded-xl border p-3"
                    >
                      <span className="text-xl">
                        {s.rank === 1
                          ? '🥇'
                          : s.rank === 2
                            ? '🥈'
                            : s.rank === 3
                              ? '🥉'
                              : `#${s.rank}`}
                      </span>
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: s.teamColor }}
                      />
                      <span className="flex-1 text-sm text-white">{s.teamName}</span>
                      <span className="text-blitz-accent font-bold">{s.score} pts</span>
                    </div>
                  ))}
                </div>

                {/* Cloud sync */}
                <div className="bg-surface border-border rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-blitz-accent" />
                      <span className="text-sm font-medium text-white">Sync to Cloud</span>
                    </div>
                    <button
                      onClick={() => setShowSyncPanel((v) => !v)}
                      className="text-xs text-text-muted hover:text-white transition-colors"
                    >
                      {showSyncPanel ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showSyncPanel && (
                    <div className="space-y-2">
                      <p className="text-text-muted text-xs">Enter admin password if not already logged in as admin.</p>
                      <input
                        type="password"
                        placeholder="Admin password (if required)"
                        value={syncAdminPw}
                        onChange={(e) => setSyncAdminPw(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-white text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blitz-accent/50"
                      />
                      <Button
                        size="sm"
                        disabled={syncing}
                        onClick={() => void handleModeratorSync()}
                        className="w-full"
                      >
                        {syncing
                          ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          : <Cloud className="h-4 w-4 mr-2" />}
                        Push to Cloud
                      </Button>
                      {syncResult && (
                        <div className={`flex items-center gap-1.5 text-xs ${syncResult.ok ? 'text-correct' : 'text-wrong'}`}>
                          {syncResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {syncResult.text}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="border-border bg-surface w-72 flex-shrink-0 overflow-y-auto border-l">
          {/* Tab Switcher */}
          <div className="border-border flex border-b">
            <button
              onClick={() => setSidebarTab('scores')}
              className={cn(
                'flex-1 py-3 text-xs font-bold tracking-widest uppercase transition-colors',
                sidebarTab === 'scores' ? 'text-blitz-accent border-blitz-accent border-b-2' : 'text-text-muted hover:text-white',
              )}
            >
              Scores
            </button>
            <button
              onClick={() => setSidebarTab('audience')}
              className={cn(
                'flex-1 py-3 text-xs font-bold tracking-widest uppercase transition-colors',
                sidebarTab === 'audience' ? 'text-blitz-accent border-blitz-accent border-b-2' : 'text-text-muted hover:text-white',
              )}
            >
              Audience
            </button>
          </div>

          <div className="p-4">
            {sidebarTab === 'scores' ? (
              <>
                <p className="text-text-muted mb-3 text-xs tracking-widest uppercase">Live Scores</p>
          <div className="space-y-2">
            {scores
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((s) => (
                <div
                  key={s.teamId}
                  className="bg-background flex items-center gap-2 rounded-lg p-2.5"
                >
                  <span className="text-text-muted w-4 text-xs">#{s.rank}</span>
                  <div
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: s.teamColor }}
                  />
                  <span className="flex-1 truncate text-xs text-white">{s.teamName}</span>
                  <span className="text-blitz-accent text-xs font-bold">{s.score}</span>
                  {overrideTeamId === s.teamId ? (
                    <div className="ml-1 flex items-center gap-1">
                      <button
                        onClick={() => adjustScore(s.teamId, -50)}
                        className="text-wrong p-0.5 hover:text-red-400"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => adjustScore(s.teamId, 50)}
                        className="text-correct p-0.5 hover:text-green-400"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setOverrideTeamId(overrideTeamId === s.teamId ? null : s.teamId)
                      }
                      className="text-text-muted opacity-0 transition-colors group-hover:opacity-100 hover:text-white"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
          </div>

          {scores.length === 0 && (
            <p className="text-text-muted py-4 text-center text-xs">No teams yet</p>
          )}
        </>
      ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-4 text-sm font-bold text-white">Engagement Control</h3>
                  <p className="text-text-muted mb-4 text-xs leading-relaxed">
                    Set how often the audience is prompted to participate.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      AudienceEngagementLevel.LOW,
                      AudienceEngagementLevel.MEDIUM,
                      AudienceEngagementLevel.HIGH,
                    ].map((level) => (
                      <button
                        key={level}
                        onClick={() => setEngagementLevel(level)}
                        className={cn(
                          'rounded-lg border py-2 text-[10px] font-bold transition-all',
                          audienceLevel === level
                            ? 'bg-blitz-accent/20 border-blitz-accent text-blitz-accent'
                            : 'border-border text-text-muted hover:border-text-secondary hover:text-white',
                        )}
                      >
                        {level.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {activeInteraction && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-background border-blitz-accent/30 rounded-xl border p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-blitz-accent text-[10px] font-bold tracking-wider uppercase">
                        Active Activity
                      </span>
                      <span className="bg-blitz-accent/20 text-blitz-accent rounded-full px-2 py-0.5 text-[9px] font-bold">
                        LIVE
                      </span>
                    </div>
                    <p className="mb-3 text-xs font-medium text-white">{activeInteraction.prompt}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted text-[10px]">
                        {activeInteraction.totalSubmissions} submissions
                      </span>
                    </div>
                  </motion.div>
                )}

              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Audience list popup */}
      <Dialog
        open={audienceListOpen}
        onClose={() => setAudienceListOpen(false)}
        title={`Connected Audience (${audienceCount})`}
      >
        {audienceListLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : audienceListData.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-6">No audience members connected</p>
        ) : (
          <div className="space-y-1">
            {audienceListData.map((m, i) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-white/20 text-xs w-5 tabular-nums">{i + 1}</span>
                  <span className="text-white text-sm font-medium">{m.fullName}</span>
                </div>
                <span className="text-[#F59E0B] text-xs font-bold tabular-nums">{m.totalPoints} pts</span>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </main>
  )
}
