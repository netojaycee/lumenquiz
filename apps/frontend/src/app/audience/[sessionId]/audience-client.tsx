'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionId } from '@/hooks/useSessionId'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { WifiOff, CheckCircle2, LogOut, Maximize, Sparkles, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { storage } from '@/lib/storage'
import { soundManager } from '@/lib/sound'
import { useSocketStore } from '@/stores/useSocketStore'
import { useAudienceStore } from '@/stores/useAudienceStore'
import { SessionStatus } from '@apoquiz/shared-types'
import { useFullscreen } from '@/hooks/useFullscreen'
import { AudienceInteractionOverlay } from '@/components/audience/AudienceInteractionOverlay'
import { ReconnectOverlay } from '@/components/shared/ReconnectOverlay'
import { SERVER_EVENTS, AUDIENCE_EVENTS, CONNECTION_EVENTS, JOIN_EVENTS } from '@apoquiz/socket-events'

const EMOJIS = ['🔥', '⭐', '😮', '👏', '💯', '🚀', '❤️', '😂']

type ConnectPhase = 'checking' | 'connecting' | 'connected' | 'failed' | 'not_started'

interface FlyingEmoji {
  id: number
  emoji: string
  x: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AudienceClient(): React.ReactElement {
  const sessionId = useSessionId()
  const router = useRouter()

  const { connect, emit, midSessionDisconnect } = useSocketStore()
  const {
    audienceId,
    fullName,
    sessionStatus,
    voteData,
    hasVoted,
    voteTally,
    currentQuestion,
    hasPredicted,
    predictionTeamId,
    revealData,
    roundSummary,
    sessionEndData,
    totalPoints,
    rank,
    setIdentity,
    lockVote,
    setAudienceInteractionStart,
    closeAudienceInteraction,
    updatePoints,
  } = useAudienceStore()

  const [phase, setPhase] = useState<ConnectPhase>('checking')
  const [ranking, setRanking] = useState<string[]>([])
  const [emojiCooldown, setEmojiCooldown] = useState(false)
  const [flyingEmojis, setFlyingEmojis] = useState<FlyingEmoji[]>([])
  const flyingIdRef = useRef(0)

  const { isFullscreen, isSupported, enter: enterFullscreen } = useFullscreen()

  useEffect(() => {
    if (sessionStatus === SessionStatus.ROUND_INTRO && isSupported && !isFullscreen) {
      enterFullscreen()
    }
  }, [sessionStatus, isSupported, isFullscreen, enterFullscreen])

  // Wake lock — audience phones must stay awake during voting / predictions
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    if (phase === 'connected') {
      ;(navigator as any).wakeLock.request('screen').then((l: WakeLockSentinel) => {
        lock = l
      }).catch(() => {})
    }
    return () => { lock?.release().catch(() => {}) }
  }, [phase])

  // ─── Connection ───────────────────────────────────────────────────────────

  useEffect(() => {
    void soundManager.initWithRemoteConfig()

    const stored = storage.getAudience()
    if (!stored || stored.sessionId !== sessionId) {
      router.replace('/join')
      return
    }

    setPhase('connecting')
    const socket = connect()

    const doJoin = () => {
      emit(CONNECTION_EVENTS.REJOIN, {
        role: 'audience',
        sessionId,
        audienceId: stored.audienceId,
        fingerprint: stored.fingerprint,
      })
    }

    const onJoined = (data: { audienceId: string; sessionId: string }) => {
      setIdentity({
        audienceId: data.audienceId,
        sessionId: data.sessionId,
        fullName: stored.fullName,
        fingerprint: stored.fingerprint,
      })
      setPhase('connected')
    }

    socket.on('connect', doJoin)
    if (socket.connected) doJoin()

    socket.on(JOIN_EVENTS.AUDIENCE_JOINED, onJoined)
    socket.on(SERVER_EVENTS.AUDIENCE_INTERACTION_START, setAudienceInteractionStart)
    socket.on(SERVER_EVENTS.AUDIENCE_INTERACTION_CLOSE, closeAudienceInteraction)
    socket.on(SERVER_EVENTS.AUDIENCE_POINTS_UPDATE, updatePoints)

    const onError = (data: { code?: string }) => {
      if (data?.code === 'SESSION_NOT_STARTED') {
        setPhase('not_started')
      } else {
        setPhase('failed')
      }
    }
    socket.on('error', onError)

    const timeout = setTimeout(() => {
      setPhase((current) => (current === 'connected' ? 'connected' : 'failed'))
    }, 10000)

    return () => {
      clearTimeout(timeout)
      socket.off('connect', doJoin)
      socket.off(JOIN_EVENTS.AUDIENCE_JOINED, onJoined)
      socket.off(SERVER_EVENTS.AUDIENCE_INTERACTION_START, setAudienceInteractionStart)
      socket.off(SERVER_EVENTS.AUDIENCE_INTERACTION_CLOSE, closeAudienceInteraction)
      socket.off(SERVER_EVENTS.AUDIENCE_POINTS_UPDATE, updatePoints)
      socket.off('error', onError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (voteData?.teams) setRanking([])
  }, [voteData])

  useEffect(() => {
    if (roundSummary) soundManager.play('roundEnd')
  }, [roundSummary])

  // ─── Actions ─────────────────────────────────────────────────────────────

  function toggleRanking(teamId: string) {
    setRanking((r) => {
      if (r.includes(teamId)) return r.filter((id) => id !== teamId)
      return [...r, teamId]
    })
  }

  function submitVote() {
    if (!audienceId || ranking.length < (voteData?.teams.length ?? Infinity) || !voteData) return
    emit(AUDIENCE_EVENTS.VOTE_SUBMIT, {
      audienceId,
      sessionId,
      roundId: voteData.roundId,
      predictedRanking: ranking,
    })
    lockVote(voteData.roundId, ranking)
  }

  function sendEmoji(emoji: string) {
    if (!audienceId || emojiCooldown) return
    emit(AUDIENCE_EVENTS.REACT, { audienceId, sessionId, emoji })
    soundManager.play('emojiPop')
    setEmojiCooldown(true)
    setTimeout(() => setEmojiCooldown(false), 1500)

    const id = ++flyingIdRef.current
    const x = 10 + Math.random() * 80
    setFlyingEmojis((prev) => [...prev, { id, emoji, x }])
    setTimeout(() => setFlyingEmojis((prev) => prev.filter((e) => e.id !== id)), 1200)
  }

  // ─── Loading states ───────────────────────────────────────────────────────

  if (phase === 'checking' || phase === 'connecting') {
    return (
      <main className="min-h-screen bg-[#08080E] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="h-12 w-12 rounded-full border-4 border-[#F59E0B]/15 border-t-[#F59E0B] animate-spin" />
          <p className="text-white/40 text-sm font-medium tracking-wide">Joining session…</p>
        </div>
      </main>
    )
  }

  if (phase === 'not_started') {
    return (
      <main className="min-h-screen bg-[#08080E] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/20">
            <Clock className="h-8 w-8 text-[#F59E0B]" />
          </div>
          <p className="text-xl font-black text-white mb-1">Quiz hasn't started yet</p>
          <p className="text-white/40 text-sm mb-5">Wait for the host to launch the session</p>
          <Button onClick={() => router.replace('/join')} variant="outline">Back to Join</Button>
        </div>
      </main>
    )
  }

  if (phase === 'failed') {
    return (
      <main className="min-h-screen bg-[#08080E] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
            <WifiOff className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-white/50 mb-5 text-sm">Could not connect to session</p>
          <Button onClick={() => router.replace('/join')}>Back to Join</Button>
        </div>
      </main>
    )
  }

  const status = sessionStatus

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#08080E] flex flex-col">
      <ReconnectOverlay show={midSessionDisconnect} />
      {/* Header */}
      <header className="relative flex-shrink-0 border-b border-white/[0.07] bg-[#0F0F13]">
        <div className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-base font-black text-white leading-tight">{fullName}</p>
            <p className="text-white/35 text-xs font-medium mt-0.5">Audience</p>
          </div>
          <div className="flex items-center gap-3">
            {isSupported && !isFullscreen && (
              <button
                onClick={enterFullscreen}
                className="text-white/25 hover:text-white/50 transition-colors p-1.5 rounded-lg"
                title="Go Fullscreen"
              >
                <Maximize className="h-4 w-4" />
              </button>
            )}
            <div className="text-right">
              <p className="text-xl font-black tabular-nums text-[#F59E0B] leading-none">{totalPoints}</p>
              <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                pts{rank != null ? ` · #${rank}` : ''}
              </p>
            </div>
            <button
              onClick={() => router.push('/join')}
              className="text-white/20 p-1.5 rounded-lg hover:text-white/50 transition-colors"
              title="Back to Join"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col mx-auto w-full max-w-sm overflow-y-auto px-5 py-6">
        <AnimatePresence mode="wait">

          {/* ── LOBBY / ROUND INTRO — waiting ───────────────────────────── */}
          {(status === SessionStatus.LOBBY || status === SessionStatus.ROUND_INTRO || !status) && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-7 py-10"
            >
              {/* Animated icon */}
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0, 0.2] }}
                  transition={{ repeat: Infinity, duration: 2.4 }}
                  className="absolute h-28 w-28 rounded-full border-2 border-[#F59E0B]"
                />
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#F59E0B]/15"
                  style={{ boxShadow: '0 0 30px rgba(245,158,11,0.2)' }}
                >
                  <Sparkles className="h-10 w-10 text-[#F59E0B]" strokeWidth={1.5} />
                </motion.div>
              </div>

              <div className="text-center">
                <p className="text-2xl font-black text-white">You&apos;re in, {fullName?.split(' ')[0]}!</p>
                <p className="text-white/35 mt-1.5 text-sm font-medium">
                  Waiting for the quiz to start…
                </p>
              </div>

              {/* Animated dots */}
              <div className="flex gap-2.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.6, 1], opacity: [0.2, 0.7, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1.3, delay: i * 0.22 }}
                    className="h-2 w-2 rounded-full bg-[#F59E0B]"
                  />
                ))}
              </div>

              <p className="text-white/20 text-xs text-center">
                React with emojis when the action starts
              </p>
            </motion.div>
          )}

          {/* ── AUDIENCE VOTE ────────────────────────────────────────────── */}
          {status === SessionStatus.AUDIENCE_VOTE && voteData && (
            <motion.div
              key="vote"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="mb-6">
                <h2 className="text-xl font-black text-white">Predict the Rankings!</h2>
                <p className="text-white/35 mt-1 text-sm">Tap teams in order from 1st to last — rank all {voteData.teams.length} teams to submit</p>
              </div>

              {hasVoted ? (
                <div className="flex flex-col items-center gap-5 py-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22C55E]/15"
                  >
                    <CheckCircle2 className="h-8 w-8 text-[#22C55E]" />
                  </motion.div>
                  <p className="font-black text-white text-lg">Vote submitted!</p>
                  <div className="w-full space-y-2">
                    {ranking.map((tid, i) => {
                      const t = voteData.teams.find((x) => x.id === tid)
                      return (
                        <motion.div
                          key={tid}
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3"
                        >
                          <span className="text-white/30 font-mono text-sm w-6">#{i + 1}</span>
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t?.color }} />
                          <span className="text-sm font-semibold text-white">{t?.name}</span>
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* Live tally */}
                  <div className="w-full mt-2">
                    <p className="text-white/25 text-center text-xs font-bold uppercase tracking-widest mb-3">
                      Live Tallies
                    </p>
                    {voteData.teams.map((t) => {
                      const votes = voteTally[t.id] ?? 0
                      return (
                        <div key={t.id} className="flex items-center gap-2 mb-2">
                          <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                          <span className="w-20 truncate text-xs text-white/60">{t.name}</span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/5">
                            <motion.div
                              animate={{ width: `${Math.min(votes * 4, 100)}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                          </div>
                          <span className="text-white/30 w-4 text-xs font-mono">{votes}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <LayoutGroup>
                  {/* ── Ranked slots (in order, top to bottom) ── */}
                  {ranking.length > 0 && (
                    <div className="mb-4">
                      <p className="text-white/25 text-[10px] font-black tracking-[0.2em] uppercase mb-2">
                        Your Prediction
                      </p>
                      <div className="space-y-2">
                        {ranking.map((tid, i) => {
                          const t = voteData.teams.find((x) => x.id === tid)
                          if (!t) return null
                          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                          return (
                            <motion.button
                              key={tid}
                              layout
                              layoutId={`team-${tid}`}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => toggleRanking(tid)}
                              className="flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left"
                              style={{ borderColor: t.color, backgroundColor: `${t.color}15` }}
                            >
                              <span className="w-8 text-center text-lg flex-shrink-0">
                                {medal ?? <span className="text-white/40 text-sm font-black">#{i + 1}</span>}
                              </span>
                              <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                              <span className="flex-1 font-black text-white">{t.name}</span>
                              <span className="text-white/30 text-xs">tap to remove</span>
                            </motion.button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Unranked teams ── */}
                  {voteData.teams.some((t) => !ranking.includes(t.id)) && (
                    <div className="mb-5">
                      <p className="text-white/25 text-[10px] font-black tracking-[0.2em] uppercase mb-2">
                        {ranking.length === 0 ? 'Tap to rank (1st → last)' : `Next: #${ranking.length + 1}`}
                      </p>
                      <div className="space-y-2">
                        {voteData.teams
                          .filter((t) => !ranking.includes(t.id))
                          .map((t) => (
                            <motion.button
                              key={t.id}
                              layout
                              layoutId={`team-${t.id}`}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => toggleRanking(t.id)}
                              className="flex w-full items-center gap-4 rounded-2xl border-2 border-white/10 bg-white/[0.025] p-4 text-left"
                            >
                              <span className="w-8 text-center text-white/20 text-sm font-black flex-shrink-0">
                                #{ranking.length + 1}
                              </span>
                              <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                              <span className="flex-1 font-black text-white">{t.name}</span>
                            </motion.button>
                          ))}
                      </div>
                    </div>
                  )}

                  <motion.button
                    layout
                    whileTap={{ scale: 0.97 }}
                    className="w-full h-13 rounded-2xl font-black text-base py-3.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: ranking.length === voteData.teams.length ? '#F59E0B' : 'rgba(255,255,255,0.06)',
                      color: ranking.length === voteData.teams.length ? '#000' : 'rgba(255,255,255,0.3)',
                    }}
                    disabled={ranking.length < voteData.teams.length}
                    onClick={submitVote}
                  >
                    {ranking.length < voteData.teams.length
                      ? `Rank all teams (${ranking.length}/${voteData.teams.length})`
                      : 'Lock in my prediction!'}
                  </motion.button>
                </LayoutGroup>
              )}
            </motion.div>
          )}

          {/* ── QUESTION OPEN — watching state (predictions via overlay) ── */}
          {status === SessionStatus.QUESTION_OPEN && (
            <motion.div
              key="question-open"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-7 py-10"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-[#3B82F6]/15"
                style={{ boxShadow: '0 0 30px rgba(59,130,246,0.15)' }}
              >
                <span className="text-4xl">👀</span>
              </motion.div>
              <div className="text-center">
                <p className="text-xl font-black text-white">Question in Progress</p>
                <p className="text-white/35 mt-1.5 text-sm">Watch the projector screen</p>
              </div>
              {currentQuestion && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-3 text-center"
                >
                  <p className="text-white/25 text-[10px] font-black tracking-widest uppercase mb-1">Question</p>
                  <p className="text-sm font-semibold text-white/70">{currentQuestion.text}</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── QUESTION LOCKED — waiting for reveal ─────────────────────── */}
          {status === SessionStatus.QUESTION_LOCKED && (
            <motion.div
              key="question-locked"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-7 py-10"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F59E0B]/15"
                style={{ boxShadow: '0 0 30px rgba(245,158,11,0.15)' }}
              >
                <span className="text-4xl">⏳</span>
              </motion.div>
              <div className="text-center">
                <p className="text-xl font-black text-white">All Answers In</p>
                <p className="text-white/35 mt-1.5 text-sm">Waiting for the reveal…</p>
              </div>
            </motion.div>
          )}

          {/* ── ANSWER REVEAL ────────────────────────────────────────────── */}
          {status === SessionStatus.ANSWER_REVEAL && revealData && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-5 py-4"
            >
              {hasPredicted ? (
                (() => {
                  const predictedResult = revealData.teamAnswers.find(
                    (a) => a.teamId === predictionTeamId,
                  )
                  const wasRight = predictedResult?.isCorrect ?? false
                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-4 py-3"
                    >
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: wasRight
                            ? 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(34,197,94,0.12) 0%, transparent 70%)'
                            : 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(239,68,68,0.09) 0%, transparent 70%)',
                        }}
                      />
                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 180, damping: 12 }}
                        className="relative z-10 text-7xl"
                      >
                        {wasRight ? '🎯' : '😬'}
                      </motion.div>
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="relative z-10 text-2xl font-black"
                        style={{ color: wasRight ? '#22C55E' : '#EF4444' }}
                      >
                        {wasRight ? 'Right prediction!' : 'Wrong prediction'}
                      </motion.p>
                    </motion.div>
                  )
                })()
              ) : (
                <p className="text-white/35 text-sm text-center py-3">You didn&apos;t predict this one</p>
              )}

              {/* Correct answer */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="rounded-2xl border border-[#22C55E]/30 bg-[#22C55E]/10 px-5 py-4"
              >
                <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35 mb-1">Correct Answer</p>
                <p className="text-xl font-black text-[#22C55E]">{revealData.correctAnswer}</p>
              </motion.div>

              {/* Team results */}
              <div className="space-y-2">
                {revealData.teamAnswers.map((a, i) => (
                  <motion.div
                    key={a.teamId}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + i * 0.07 }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border p-3',
                      a.isCorrect ? 'border-[#22C55E]/25 bg-[#22C55E]/08' : 'border-white/8 bg-white/[0.025]',
                    )}
                  >
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: a.teamColor }} />
                    <span className="flex-1 text-sm font-semibold text-white">{a.teamName}</span>
                    <span className={cn('text-sm font-black', a.isCorrect ? 'text-[#22C55E]' : 'text-red-400/70')}>
                      {a.isCorrect ? `+${a.pointsEarned}` : '✗'}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── ROUND SUMMARY ────────────────────────────────────────────── */}
          {status === SessionStatus.ROUND_SUMMARY && roundSummary && (
            <motion.div
              key="rsummary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="mb-5">
                <h2 className="text-xl font-black text-white">
                  {roundSummary.roundName ?? 'Round'} Over
                </h2>
                <p className="text-white/35 mt-0.5 text-sm">Team standings this round</p>
              </div>

              <div className="space-y-2 mb-7">
                {roundSummary.teamScores
                  .slice()
                  .sort((a, b) => (roundSummary.roundPoints[b.teamId] ?? 0) - (roundSummary.roundPoints[a.teamId] ?? 0))
                  .map((s, i) => (
                    <motion.div
                      key={s.teamId}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5"
                    >
                      <span className="text-lg w-7 text-center">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.teamColor }} />
                      <span className="flex-1 text-sm font-semibold text-white">{s.teamName}</span>
                      <span className="font-black tabular-nums" style={{ color: s.teamColor }}>
                        {roundSummary.roundPoints[s.teamId] ?? 0}
                      </span>
                    </motion.div>
                  ))}
              </div>

              {roundSummary.audienceLeaderboard.length > 0 && (
                <>
                  <p className="text-white/25 text-xs tracking-widest uppercase font-black mb-3">
                    Audience Leaderboard
                  </p>
                  <div className="space-y-2">
                    {roundSummary.audienceLeaderboard.slice(0, 5).map((a, i) => (
                      <motion.div
                        key={a.memberId}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.07 }}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-3 text-sm',
                          a.memberId === audienceId
                            ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]'
                            : 'border-white/8 bg-white/[0.02] text-white',
                        )}
                      >
                        <span className="text-white/30 w-5 text-xs font-mono">#{a.rank}</span>
                        <span className="flex-1 font-semibold">{a.nickname}</span>
                        <span className="font-black tabular-nums">{a.totalPoints}</span>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── SESSION END ──────────────────────────────────────────────── */}
          {status === SessionStatus.SESSION_END && sessionEndData && (
            <motion.div
              key="end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 py-6"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 150 }}
                className="text-6xl"
              >
                🏆
              </motion.div>
              <div className="text-center">
                <p className="text-2xl font-black text-white">Quiz Complete!</p>
                <p className="text-white/35 mt-1 text-sm">Final standings</p>
              </div>

              <div className="w-full space-y-2">
                {sessionEndData.finalScores.map((s, i) => (
                  <motion.div
                    key={s.teamId}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5"
                  >
                    <span className="text-lg w-7 text-center">
                      {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                    </span>
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.teamColor }} />
                    <span className="flex-1 text-sm font-semibold text-white">{s.teamName}</span>
                    <span className="font-black tabular-nums" style={{ color: s.teamColor }}>{s.score}</span>
                  </motion.div>
                ))}
              </div>

              {sessionEndData.audienceWinner && (
                sessionEndData.audienceWinner.memberId === audienceId ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 180, damping: 12 }}
                    className="w-full rounded-2xl border-2 border-[#F59E0B] bg-[#F59E0B]/15 p-6 text-center"
                    style={{ boxShadow: '0 0 40px rgba(245,158,11,0.25)' }}
                  >
                    <motion.div
                      animate={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ delay: 0.8, duration: 0.6 }}
                      className="text-5xl mb-3"
                    >
                      🏆
                    </motion.div>
                    <p className="text-[10px] font-black tracking-[0.25em] uppercase text-[#F59E0B]/60 mb-1">
                      You&apos;re the
                    </p>
                    <p className="text-2xl font-black text-[#F59E0B]">Audience Winner!</p>
                    <p className="text-white/50 text-sm mt-1">Congratulations, {fullName?.split(' ')[0]}!</p>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="w-full rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-5 text-center"
                  >
                    <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35 mb-1">
                      Audience Winner
                    </p>
                    <p className="text-xl font-black text-[#F59E0B]">
                      {sessionEndData.audienceWinner.nickname}
                    </p>
                  </motion.div>
                )
              )}

              {audienceId && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-6 py-5 text-center"
                >
                  <p className="text-white/25 text-xs font-bold uppercase tracking-widest mb-1">Your final score</p>
                  <p className="text-4xl font-black tabular-nums text-[#F59E0B]">{totalPoints}</p>
                  {rank != null && <p className="text-white/30 text-xs mt-1">Rank #{rank}</p>}
                </motion.div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Emoji bar ─────────────────────────────────────────────────────── */}
      {phase === 'connected' &&
        status !== SessionStatus.LOBBY &&
        status !== SessionStatus.SESSION_END && (
          <div className="relative flex-shrink-0 border-t border-white/[0.07] bg-[#0F0F13] px-4 py-3">
            {/* Flying emoji animations */}
            <AnimatePresence>
              {flyingEmojis.map((fe) => (
                <motion.span
                  key={fe.id}
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -90, scale: 1.8 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                  className="pointer-events-none absolute bottom-full text-3xl select-none"
                  style={{ left: `${fe.x}%` }}
                >
                  {fe.emoji}
                </motion.span>
              ))}
            </AnimatePresence>

            <div className="flex justify-center gap-1">
              {EMOJIS.map((e) => (
                <motion.button
                  key={e}
                  whileTap={{ scale: 1.35 }}
                  onClick={() => sendEmoji(e)}
                  disabled={emojiCooldown}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition-all',
                    emojiCooldown
                      ? 'opacity-30'
                      : 'hover:bg-white/5 active:bg-white/10',
                  )}
                >
                  {e}
                </motion.button>
              ))}
            </div>
          </div>
        )}

      <AudienceInteractionOverlay />
    </main>
  )
}
