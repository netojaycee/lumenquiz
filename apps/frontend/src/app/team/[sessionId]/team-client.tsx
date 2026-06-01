'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionId } from '@/hooks/useSessionId'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  WifiOff,
  CheckCircle2,
  XCircle,
  Trophy,
  Clock,
  LogOut,
  Maximize,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimerBar, TimerCountdown } from '@/components/game/TimerBar'
import { cn } from '@/lib/utils'
import { storage } from '@/lib/storage'
import { soundManager } from '@/lib/sound'
import { useSocketStore } from '@/stores/useSocketStore'
import { useTeamStore } from '@/stores/useTeamStore'
import { useFullscreen } from '@/hooks/useFullscreen'
import { TEAM_EVENTS, CONNECTION_EVENTS, JOIN_EVENTS } from '@apoquiz/socket-events'
import { serverNow } from '@/lib/clock'
import { ReconnectOverlay } from '@/components/shared/ReconnectOverlay'
import { SessionStatus, QuestionType } from '@apoquiz/shared-types'
import type { CumulativeScoresPayload } from '@apoquiz/socket-events'

type ConnectPhase = 'checking' | 'connecting' | 'connected' | 'failed' | 'not_started'

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamClient(): React.ReactElement {
  const sessionId = useSessionId()
  const router = useRouter()

  const { connect, emit, midSessionDisconnect } = useSocketStore()
  const {
    teamId,
    teamName,
    teamColor,
    score,
    rank,
    sessionStatus,
    currentQuestion,
    timerData,
    submittedAnswer,
    answerLocked,
    timerElapsed,
    revealData,
    roundSummary,
    sessionEndData,
    setIdentity,
    submitAnswer,
    tileBlitzActiveTeamId,
    tileBlitzBonusClaimed,
    tileBlitzBonusResult,
    tileBlitzTiles,
    tileBlitzTurnsCompleted,
    tileBlitzTotalTurns,
    bonusTimerStartTime,
    bonusTimerDurationMs,
    bonusTimerElapsed,
    cumulativeData,
    ucState,
    clueState,
    clueLockedOut,
  } = useTeamStore()

  const [phase, setPhase] = useState<ConnectPhase>('checking')
  const [openAnswer, setOpenAnswer] = useState('')
  const [ucTimeLeft, setUCTimeLeft] = useState(0)
  const [clueTimeLeft, setClueTimeLeft] = useState(0)
  const [answeringTimeLeft, setAnsweringTimeLeft] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { isFullscreen, isSupported, enter: enterFullscreen } = useFullscreen()

  useEffect(() => {
    if (sessionStatus !== SessionStatus.UC_ACTIVE || !ucState?.timerDeadline) return
    const tick = () =>
      setUCTimeLeft(Math.max(0, Math.ceil((ucState.timerDeadline - serverNow()) / 1000)))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [sessionStatus, ucState?.timerDeadline])

  useEffect(() => {
    if (
      (sessionStatus !== SessionStatus.CLUE_OPEN &&
        sessionStatus !== SessionStatus.CLUE_ANSWERING) ||
      !clueState
    )
      return
    const tick = () => {
      setClueTimeLeft(Math.max(0, Math.ceil((clueState.timerDeadline - serverNow()) / 1000)))
      setAnsweringTimeLeft(
        Math.max(0, Math.ceil((clueState.answeringTimerDeadline - serverNow()) / 1000)),
      )
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [sessionStatus, clueState?.timerDeadline, clueState?.answeringTimerDeadline])

  useEffect(() => {
    // Auto-submit clue answer when the answering window closes.
    // Check the server deadline directly rather than the local countdown to avoid
    // a false-fire on the initial answeringTimeLeft=0 before the interval starts.
    if (
      sessionStatus === SessionStatus.CLUE_ANSWERING &&
      clueState?.answeringTimerDeadline &&
      clueState.answeringTimerDeadline > 0 &&
      Date.now() >= clueState.answeringTimerDeadline &&
      clueState?.buzzingTeamId === teamId &&
      openAnswer.trim()
    ) {
      emit(TEAM_EVENTS.ANSWER_SUBMIT, {
        teamId,
        sessionId,
        questionId: clueState.questionId,
        answer: openAnswer.trim(),
      })
      setOpenAnswer('')
    }
  }, [
    sessionStatus,
    answeringTimeLeft,
    clueState?.buzzingTeamId,
    clueState?.answeringTimerDeadline,
    teamId,
    openAnswer,
    sessionId,
    emit,
    clueState?.questionId,
  ])

  // Auto-submit open answer when the main question timer elapses — even if field is empty.
  // If the team already hit Submit manually (submittedAnswer is set, openAnswer was cleared),
  // the backend already has their pendingAnswer — skip to avoid overwriting with an empty string.
  useEffect(() => {
    if (
      timerElapsed &&
      !answerLocked &&
      currentQuestion &&
      (currentQuestion.type === QuestionType.OPEN || currentQuestion.type === QuestionType.FILLINBLANK) &&
      teamId
    ) {
      const ans = openAnswer.trim()
      if (!ans && submittedAnswer) return // already submitted manually — backend has the answer
      submitAnswer(ans)
      emit(TEAM_EVENTS.ANSWER_SUBMIT, {
        teamId,
        questionId: currentQuestion.id,
        sessionId,
        answer: ans,
        clientTimestamp: Date.now(),
      })
      sessionStorage.removeItem(`draft:${currentQuestion.id}`)
      setOpenAnswer('')
      soundManager.stopTick()
    }
  // Only re-run when timerElapsed transitions to true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerElapsed])

  // Auto-submit bonus open answer when the bonus timer elapses — even if field is empty
  useEffect(() => {
    if (
      bonusTimerElapsed &&
      isBonusAnswering &&
      !answerLocked &&
      currentQuestion &&
      (currentQuestion.type === QuestionType.OPEN || currentQuestion.type === QuestionType.FILLINBLANK) &&
      teamId
    ) {
      const ans = openAnswer.trim()
      if (!ans && submittedAnswer) return // already submitted manually — backend has the answer
      submitAnswer(ans)
      emit(TEAM_EVENTS.ANSWER_SUBMIT, {
        teamId,
        questionId: currentQuestion.id,
        sessionId,
        answer: ans,
        clientTimestamp: Date.now(),
      })
      setOpenAnswer('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonusTimerElapsed])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionStatus === SessionStatus.CLUE_OPEN && e.code === 'Space') {
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault()
          if (!clueLockedOut && !clueState?.buzzingTeamId) {
            emit(TEAM_EVENTS.CLUE_BUZZ, { teamId, sessionId })
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sessionStatus, clueLockedOut, clueState?.buzzingTeamId, teamId, sessionId, emit])

  useEffect(() => {
    if (sessionStatus === SessionStatus.ROUND_INTRO && isSupported && !isFullscreen) {
      enterFullscreen()
    }
  }, [sessionStatus, isSupported, isFullscreen, enterFullscreen])

  // ─── Connection ───────────────────────────────────────────────────────────

  useEffect(() => {
    void soundManager.initWithRemoteConfig()

    const stored = storage.getTeam()
    if (!stored || stored.sessionId !== sessionId) {
      router.replace('/join')
      return
    }

    setPhase('connecting')
    const socket = connect()

    const doJoin = () => {
      emit(CONNECTION_EVENTS.REJOIN, {
        role: 'team',
        teamCode: stored.joinCode,
      })
    }

    const onJoined = (data: { teamId: string; name: string; color: string; sessionId: string }) => {
      setIdentity({
        teamId: data.teamId,
        sessionId: data.sessionId,
        name: data.name,
        color: data.color,
        pin: stored.joinCode,
      })
      setPhase('connected')
    }

    socket.on('connect', doJoin)
    if (socket.connected) doJoin()

    socket.on(JOIN_EVENTS.TEAM_JOINED, onJoined)

    const onError = (data: { code?: string }) => {
      // These codes all mean "quiz isn't live yet" — show the friendly waiting screen
      const prelaunchCodes = ['SESSION_NOT_FOUND', 'SESSION_NOT_STARTED', 'NO_ACTIVE_SESSION', 'TEAM_NOT_IN_SESSION']
      if (data?.code && prelaunchCodes.includes(data.code)) {
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
      socket.off(JOIN_EVENTS.TEAM_JOINED, onJoined)
      socket.off('error', onError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Draft answer — restore from sessionStorage if we're mid-question on the same question
  useEffect(() => {
    if (sessionStatus === SessionStatus.QUESTION_OPEN && currentQuestion) {
      const draft = sessionStorage.getItem(`draft:${currentQuestion.id}`)
      setOpenAnswer(draft ?? '')
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setOpenAnswer('')
    }
  }, [sessionStatus, currentQuestion?.id])

  // Persist open-answer draft to sessionStorage as the user types
  useEffect(() => {
    if (!currentQuestion || sessionStatus !== SessionStatus.QUESTION_OPEN) return
    if (openAnswer) {
      sessionStorage.setItem(`draft:${currentQuestion.id}`, openAnswer)
    } else {
      sessionStorage.removeItem(`draft:${currentQuestion.id}`)
    }
  }, [openAnswer, currentQuestion?.id, sessionStatus])

  // Wake lock — keep screen on during active play so phones don't sleep mid-question
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

  useEffect(() => {
    if (
      sessionStatus === SessionStatus.QUESTION_OPEN &&
      currentQuestion?.type === QuestionType.OPEN
    ) {
      inputRef.current?.focus()
    }
  }, [currentQuestion?.id])

  useEffect(() => {
    if (!revealData) return
    const myResult = revealData.teamAnswers.find((a) => a.teamId === teamId)
    if (!myResult) return // spectator in a turn-based mode — no personal sound
    if (myResult.isCorrect) {
      soundManager.play('correct')
    } else {
      soundManager.play('wrong')
    }
  }, [revealData, teamId])

  // ─── Submit helpers ───────────────────────────────────────────────────────

  function handleMCQSelect(answer: string) {
    if (!currentQuestion || !teamId) return
    if (status === SessionStatus.BONUS_ANSWERING) {
      // Bonus answering: ignore main-question timerElapsed; use bonus-specific guard
      if (bonusTimerElapsed) return
    } else {
      if (timerElapsed) return
      const isTileBlitzMode = !!tileBlitzActiveTeamId
      if (!isTileBlitzMode && answerLocked) return
    }
    submitAnswer(answer)
    emit(TEAM_EVENTS.ANSWER_SUBMIT, {
      teamId,
      questionId: currentQuestion.id,
      sessionId,
      answer,
      clientTimestamp: Date.now(),
    })
    if (status !== SessionStatus.BONUS_ANSWERING && !tileBlitzActiveTeamId) soundManager.stopTick()
  }

  function handleBonusBuzz() {
    if (!teamId) return
    emit(TEAM_EVENTS.TILEBLITZ_BONUS_BUZZ, { teamId, sessionId })
  }

  function handleOpenSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (answerLocked || timerElapsed || !currentQuestion || !teamId || !openAnswer.trim()) return
    if (status === SessionStatus.BONUS_ANSWERING && bonusTimerElapsed) return
    const ans = openAnswer.trim()
    submitAnswer(ans)
    emit(TEAM_EVENTS.ANSWER_SUBMIT, {
      teamId,
      questionId: currentQuestion.id,
      sessionId,
      answer: ans,
      clientTimestamp: Date.now(),
    })
    sessionStorage.removeItem(`draft:${currentQuestion.id}`)
    setOpenAnswer('')
    soundManager.stopTick()
  }

  // ─── Loading states ───────────────────────────────────────────────────────

  if (phase === 'checking' || phase === 'connecting') {
    return (
      <main className="min-h-screen bg-[#08080E] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="h-12 w-12 rounded-full border-4 border-[#3B82F6]/15 border-t-[#3B82F6] animate-spin" />
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
          <p className="text-xl font-black text-white mb-1">Quiz hasn&apos;t started yet</p>
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
  const question = currentQuestion
  const myReveal = revealData?.teamAnswers.find((a) => a.teamId === teamId)
  const isMCQ = question?.type === QuestionType.MCQ
  const isOpen = question?.type === QuestionType.OPEN || question?.type === QuestionType.FILLINBLANK
  const teamColorHex = teamColor ?? '#3B82F6'

  const isTileBlitzTurn = tileBlitzActiveTeamId === teamId && status === SessionStatus.QUESTION_OPEN
  const isBonusWinner = tileBlitzBonusClaimed?.teamId === teamId
  const isBonusAnswering = status === SessionStatus.BONUS_ANSWERING && isBonusWinner
  const revealedClues = clueState?.clues.slice(0, clueState?.currentClueIndex + 1)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#08080E] flex flex-col">
      <ReconnectOverlay show={midSessionDisconnect} />
      {/* Header */}
      <header
        className="relative flex-shrink-0 border-b border-white/[0.07] overflow-hidden"
        style={{ borderTopColor: teamColorHex, borderTopWidth: 4 }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 120% 200% at -5% 50%, ${teamColorHex}14 0%, transparent 55%)`,
          }}
        />
        <div className="relative flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-base font-black text-white leading-tight">{teamName ?? 'My Team'}</p>
            {rank != null && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: teamColorHex }} />
                <p className="text-white/40 text-xs font-semibold">Rank #{rank}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums leading-none" style={{ color: teamColorHex }}>
                {score}
              </p>
              <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest mt-0.5">pts</p>
            </div>
            <button
              onClick={() => {
                storage.clearTeam()
                emit(CONNECTION_EVENTS.LEAVE, {})
                router.push('/join')
              }}
              className="text-white/20 p-1.5 rounded-lg hover:text-white/50 transition-colors"
              title="Leave session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col mx-auto w-full max-w-md p-5">
        <AnimatePresence mode="wait">

          {/* ── TILE BLITZ: tile select ─────────────────────────────────── */}
          {status === SessionStatus.TILE_SELECT && (
            <motion.div
              key="tile-select-wait"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col gap-4"
            >
              <div
                className={cn(
                  'rounded-2xl border-2 px-4 py-4 text-center',
                  tileBlitzActiveTeamId === teamId
                    ? 'border-[#3B82F6]/50 bg-[#3B82F6]/10'
                    : 'border-white/8 bg-white/[0.03]',
                )}
              >
                {tileBlitzActiveTeamId === teamId ? (
                  <>
                    <p className="text-[#3B82F6] text-sm font-black">🎯 It&apos;s your turn!</p>
                    <p className="text-white/40 mt-0.5 text-xs">Moderator is selecting a tile…</p>
                  </>
                ) : (
                  <p className="text-white/40 text-sm">Another team&apos;s turn — stand by</p>
                )}
              </div>

              {tileBlitzTotalTurns > 0 && (
                <div className="text-white/30 flex items-center justify-between px-1 text-xs font-medium">
                  <span>Turn {tileBlitzTurnsCompleted + 1} of {tileBlitzTotalTurns}</span>
                  <span>{tileBlitzTiles.filter((t) => t.used).length} / {tileBlitzTiles.length} tiles used</span>
                </div>
              )}

              {tileBlitzTiles.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {tileBlitzTiles.map((tile, i) => (
                    <motion.div
                      key={tile.questionId}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        'flex aspect-square items-center justify-center rounded-xl border-2 text-base font-bold select-none transition-all',
                        tile.used
                          ? 'border-white/10 bg-white/[0.03] text-white/20'
                          : 'border-[#3B82F6] bg-[#3B82F6]/20 text-white',
                      )}
                    >
                      {tile.used ? <span className="text-white/20 text-xs">✓</span> : i + 1}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── TILE BLITZ: bonus open ──────────────────────────────────── */}
          {status === SessionStatus.BONUS_OPEN && (
            <motion.div
              key="bonus-open"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-6 py-16"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="text-6xl"
              >
                ⚡
              </motion.div>
              <p className="text-[#F59E0B] text-xl font-black tracking-wide">BONUS ROUND</p>
              {tileBlitzBonusClaimed ? (
                <p className="text-white/40 text-center text-sm">
                  {tileBlitzBonusClaimed.teamId === teamId
                    ? 'You buzzed in! Waiting for moderator…'
                    : `${tileBlitzBonusClaimed.teamName} buzzed in first.`}
                </p>
              ) : tileBlitzActiveTeamId === teamId ? (
                <p className="text-white/40 text-center text-sm">
                  Another team can buzz in on your question.
                </p>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleBonusBuzz}
                  className="h-48 w-48 rounded-full text-2xl font-black text-black shadow-xl"
                  style={{ backgroundColor: '#F59E0B', boxShadow: '0 0 40px rgba(245,158,11,0.4)' }}
                >
                  BUZZ IN
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── TILE BLITZ: bonus answering ─────────────────────────────── */}
          {status === SessionStatus.BONUS_ANSWERING && (
            <motion.div
              key="bonus-answering"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col gap-4"
            >
              <p className="text-[#F59E0B] text-center text-xs tracking-widest uppercase font-bold">
                Bonus Question
              </p>

              {bonusTimerStartTime !== null && bonusTimerDurationMs !== null && (
                <div className="flex items-center gap-2">
                  <TimerBar startTime={bonusTimerStartTime} durationMs={bonusTimerDurationMs} />
                  <TimerCountdown startTime={bonusTimerStartTime} durationMs={bonusTimerDurationMs} />
                  <span className="text-white/30 text-xs">s</span>
                </div>
              )}

              {isBonusAnswering ? (
                <>
                  <p className="font-semibold text-white text-base">{question?.text}</p>
                  {bonusTimerElapsed ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
                        <Clock className="h-6 w-6 text-red-400" />
                      </div>
                      <p className="text-red-400 font-semibold">Bonus time&apos;s up!</p>
                      {submittedAnswer && (
                        <p className="text-white/30 text-sm">Answer: &quot;{submittedAnswer}&quot;</p>
                      )}
                    </div>
                  ) : answerLocked ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4">
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                        className="flex h-16 w-16 items-center justify-center rounded-full"
                        style={{ backgroundColor: '#F59E0B18', border: '3px solid #F59E0B' }}
                      >
                        <CheckCircle2 className="h-8 w-8 text-[#F59E0B]" />
                      </motion.div>
                      <div className="text-center">
                        <p className="text-lg font-black text-white">Bonus Answer Locked!</p>
                        <p className="mt-1 text-sm italic text-white/50">&ldquo;{submittedAnswer}&rdquo;</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isMCQ && question?.options && (
                        <div className="space-y-3">
                          {question.options.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => handleMCQSelect(opt.label)}
                              className={cn(
                                'w-full rounded-2xl border-2 p-4 text-left text-sm font-semibold transition-all',
                                submittedAnswer === opt.label
                                  ? 'border-[#F59E0B] bg-[#F59E0B]/15 text-white'
                                  : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white',
                              )}
                            >
                              <span className="mr-2 font-mono font-black">{opt.label}.</span>
                              {opt.text}
                            </button>
                          ))}
                        </div>
                      )}
                      {isOpen && (
                        submittedAnswer ? (
                          <div className="flex flex-1 flex-col gap-3">
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-5 py-4 text-center"
                            >
                              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-[#F59E0B]/70 mb-1">
                                ✓ Bonus Answer Submitted
                              </p>
                              <p className="text-xl font-black text-white">{submittedAnswer}</p>
                            </motion.div>
                            <p className="text-center text-white/30 text-xs">
                              You can change your answer until time runs out
                            </p>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault()
                                if (!openAnswer.trim() || !currentQuestion || !teamId) return
                                if (bonusTimerElapsed) return
                                const ans = openAnswer.trim()
                                submitAnswer(ans)
                                emit(TEAM_EVENTS.ANSWER_SUBMIT, {
                                  teamId,
                                  questionId: currentQuestion.id,
                                  sessionId,
                                  answer: ans,
                                  clientTimestamp: Date.now(),
                                })
                                setOpenAnswer('')
                              }}
                              className="flex flex-col gap-2"
                            >
                              <Input
                                ref={inputRef}
                                value={openAnswer}
                                onChange={(e) => setOpenAnswer(e.target.value)}
                                placeholder="Type a different answer…"
                                className="h-12 text-base"
                                autoComplete="off"
                              />
                              <motion.button
                                type="submit"
                                disabled={!openAnswer.trim()}
                                whileTap={{ scale: 0.97 }}
                                className="h-11 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                style={{ backgroundColor: openAnswer.trim() ? '#F59E0B' : 'rgba(255,255,255,0.06)' }}
                              >
                                <Send className="h-4 w-4" />
                                Change Answer
                              </motion.button>
                            </form>
                          </div>
                        ) : (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              if (!openAnswer.trim() || !currentQuestion || !teamId) return
                              if (bonusTimerElapsed) return
                              const ans = openAnswer.trim()
                              submitAnswer(ans)
                              emit(TEAM_EVENTS.ANSWER_SUBMIT, {
                                teamId,
                                questionId: currentQuestion.id,
                                sessionId,
                                answer: ans,
                                clientTimestamp: Date.now(),
                              })
                              setOpenAnswer('')
                            }}
                            className="flex flex-1 flex-col gap-3"
                          >
                            <Input
                              ref={inputRef}
                              value={openAnswer}
                              onChange={(e) => setOpenAnswer(e.target.value)}
                              placeholder="Type your answer…"
                              className="h-14 text-lg"
                              autoComplete="off"
                            />
                            <Button type="submit" size="lg" disabled={!openAnswer.trim()}>
                              Submit Answer
                            </Button>
                          </form>
                        )
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <p className="text-white/40 text-center text-sm">
                    {tileBlitzBonusClaimed?.teamName} is answering the bonus…
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── TILE BLITZ: bonus reveal ─────────────────────────────────── */}
          {status === SessionStatus.BONUS_REVEAL && tileBlitzBonusResult && (
            <motion.div
              key="bonus-reveal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-4 py-8"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                className="text-7xl"
              >
                {tileBlitzBonusResult.isCorrect ? '✅' : '❌'}
              </motion.div>
              <p className={cn('text-2xl font-black', tileBlitzBonusResult.isCorrect ? 'text-[#22C55E]' : 'text-red-400')}>
                {tileBlitzBonusResult.isCorrect ? 'Bonus Correct!' : 'Bonus Wrong!'}
              </p>
              <p className="text-white/40 text-sm">{tileBlitzBonusResult.teamName}</p>
              {tileBlitzBonusResult.isCorrect && (
                <p className="text-[#22C55E] text-2xl font-black">+{tileBlitzBonusResult.pointsEarned} pts</p>
              )}
            </motion.div>
          )}

          {/* ── LOBBY / ROUND INTRO — waiting ───────────────────────────── */}
          {(status === SessionStatus.LOBBY ||
            status === SessionStatus.ROUND_INTRO ||
            status === SessionStatus.AUDIENCE_VOTE ||
            (!status && phase === 'connected')) && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-7 py-10"
            >
              {/* Pulsing team avatar */}
              <div className="relative flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                  className="absolute h-32 w-32 rounded-full border-2"
                  style={{ borderColor: teamColorHex }}
                />
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                  className="relative h-24 w-24 rounded-full flex items-center justify-center text-4xl font-black text-white shadow-2xl"
                  style={{
                    backgroundColor: teamColorHex,
                    boxShadow: `0 0 40px ${teamColorHex}50`,
                  }}
                >
                  {teamName?.[0]?.toUpperCase() ?? '?'}
                </motion.div>
              </div>

              <div className="text-center">
                <p className="text-2xl font-black text-white">{teamName}</p>
                <p className="text-white/35 mt-1.5 text-sm font-medium">Waiting for the quiz to start…</p>
              </div>

              {/* Animated dots */}
              <div className="flex gap-2.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scale: [1, 1.6, 1], opacity: [0.25, 0.8, 0.25] }}
                    transition={{ repeat: Infinity, duration: 1.3, delay: i * 0.22 }}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: teamColorHex }}
                  />
                ))}
              </div>

              {isSupported && !isFullscreen && (
                <button
                  onClick={enterFullscreen}
                  className="flex items-center gap-2 text-white/20 text-xs hover:text-white/45 transition-colors"
                >
                  <Maximize className="h-3 w-3" /> Go fullscreen
                </button>
              )}
            </motion.div>
          )}

          {/* ── QUESTION OPEN ───────────────────────────────────────────── */}
          {status === SessionStatus.QUESTION_OPEN && question && timerData && !revealData && (
            <motion.div
              key={`question-${question.id}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ type: 'spring', stiffness: 90, damping: 18 }}
              className="flex flex-1 flex-col gap-4"
            >
              {/* Timer row */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white/35 text-xs font-medium">
                    {tileBlitzActiveTeamId
                      ? isTileBlitzTurn ? '🎯 Your turn' : '👀 Watching'
                      : 'Answer quickly for more points'}
                  </p>
                  <div className="flex items-center gap-1.5 text-white/50">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-sm font-black tabular-nums">
                      <TimerCountdown startTime={timerData.startTime} durationMs={timerData.durationMs} />
                    </span>
                    <span className="text-white/30 text-xs">s</span>
                  </div>
                </div>
                <TimerBar startTime={timerData.startTime} durationMs={timerData.durationMs} />
              </div>

              {/* Question text */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4"
              >
                <p className="text-lg font-bold text-white leading-snug">{question.text}</p>
              </motion.div>

              {/* MCQ options */}
              {isMCQ && question.options && !timerElapsed && (
                <div className="flex-1 space-y-2.5">
                  {question.options.map((opt, idx) => {
                    const isInteractive = !tileBlitzActiveTeamId || isTileBlitzTurn
                    const isSelected = submittedAnswer === opt.label
                    return (
                      <motion.button
                        key={opt.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 + idx * 0.07, type: 'spring', stiffness: 120 }}
                        onClick={() => isInteractive && !answerLocked ? handleMCQSelect(opt.label) : undefined}
                        disabled={!isInteractive || (answerLocked && !tileBlitzActiveTeamId)}
                        className={cn(
                          'relative w-full flex items-center gap-3.5 rounded-2xl border-2 p-4 text-left transition-all overflow-hidden',
                          isSelected
                            ? 'border-current'
                            : isInteractive
                              ? 'border-white/10 bg-white/[0.025] hover:border-white/25 active:scale-[0.97]'
                              : 'border-white/5 bg-white/[0.015] cursor-default',
                        )}
                        style={isSelected ? {
                          borderColor: teamColorHex,
                          backgroundColor: `${teamColorHex}12`,
                        } : {}}
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-black border-2',
                          )}
                          style={isSelected
                            ? { borderColor: teamColorHex, backgroundColor: `${teamColorHex}20`, color: teamColorHex }
                            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
                        >
                          {opt.label}
                        </span>
                        <span className={cn('flex-1 text-base font-semibold', isSelected ? 'text-white' : 'text-white/65')}>
                          {opt.text}
                        </span>
                        {isSelected && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                            <CheckCircle2 className="h-5 w-5" style={{ color: teamColorHex }} />
                          </motion.div>
                        )}
                      </motion.button>
                    )
                  })}
                  {isTileBlitzTurn && submittedAnswer && (
                    <p className="text-white/25 mt-1 text-center text-xs">
                      You can change your selection until time runs out
                    </p>
                  )}
                </div>
              )}

              {/* Open answer */}
              {isOpen && !answerLocked && !timerElapsed && (() => {
                const isTileBlitzNonActiveTurn = !!tileBlitzActiveTeamId && !isTileBlitzTurn
                if (isTileBlitzNonActiveTurn) {
                  return (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3">
                      <p className="text-white/30 text-sm">👀 Watching — not your turn</p>
                    </div>
                  )
                }

                // Tile Blitz active turn: after first submit show confirmation + re-edit option
                if (isTileBlitzTurn && submittedAnswer) {
                  return (
                    <div className="flex flex-1 flex-col gap-3">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-[#22C55E]/40 bg-[#22C55E]/10 px-5 py-4 text-center"
                      >
                        <p className="text-[10px] font-black tracking-[0.2em] uppercase text-[#22C55E]/70 mb-1">
                          ✓ Answer Submitted
                        </p>
                        <p className="text-xl font-black text-white">{submittedAnswer}</p>
                      </motion.div>
                      <p className="text-center text-white/30 text-xs">
                        You can change your answer until time runs out
                      </p>
                      <form onSubmit={handleOpenSubmit} className="flex flex-col gap-2">
                        <Input
                          ref={inputRef}
                          value={openAnswer}
                          onChange={(e) => setOpenAnswer(e.target.value)}
                          placeholder="Type a different answer…"
                          className="h-12 text-base"
                          autoComplete="off"
                        />
                        <motion.button
                          type="submit"
                          disabled={!openAnswer.trim()}
                          whileTap={{ scale: 0.97 }}
                          className="h-11 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ backgroundColor: openAnswer.trim() ? teamColorHex : 'rgba(255,255,255,0.06)' }}
                        >
                          <Send className="h-4 w-4" />
                          Change Answer
                        </motion.button>
                      </form>
                    </div>
                  )
                }

                return (
                  <form onSubmit={handleOpenSubmit} className="flex flex-1 flex-col gap-3">
                    <Input
                      ref={inputRef}
                      value={openAnswer}
                      onChange={(e) => setOpenAnswer(e.target.value)}
                      placeholder="Type your answer…"
                      className="h-14 text-lg"
                      autoComplete="off"
                    />
                    <motion.button
                      type="submit"
                      disabled={!openAnswer.trim()}
                      whileTap={{ scale: 0.97 }}
                      className="h-14 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: openAnswer.trim() ? teamColorHex : 'rgba(255,255,255,0.06)' }}
                    >
                      <Send className="h-5 w-5" />
                      Submit Answer
                    </motion.button>
                  </form>
                )
              })()}

              {/* Answer locked */}
              {answerLocked && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-1 flex-col items-center justify-center gap-4"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${teamColorHex}15`, border: `3px solid ${teamColorHex}` }}
                  >
                    <CheckCircle2 className="h-10 w-10" style={{ color: teamColorHex }} />
                  </motion.div>
                  <div className="text-center">
                    <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                      className="text-xl font-black text-white">Answer Locked!</motion.p>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                      className="mt-2 text-base italic text-white/50">&ldquo;{submittedAnswer}&rdquo;</motion.p>
                  </div>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
                    className="text-white/25 text-sm">Waiting for others to answer…</motion.p>
                </motion.div>
              )}

              {/* Timer elapsed without submit */}
              {timerElapsed && !answerLocked && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-1 flex-col items-center justify-center gap-3"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                    <Clock className="h-8 w-8 text-red-400" />
                  </div>
                  <p className="text-red-400 text-xl font-black">Time&apos;s Up!</p>
                  <p className="text-white/30 text-sm">Better luck next question</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── QUESTION LOCKED — waiting for reveal ────────────────────── */}
          {status === SessionStatus.QUESTION_LOCKED && !revealData && (
            <motion.div
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-3"
            >
              {answerLocked ? (
                <>
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${teamColorHex}15`, border: `3px solid ${teamColorHex}` }}
                  >
                    <CheckCircle2 className="h-10 w-10" style={{ color: teamColorHex }} />
                  </motion.div>
                  <div className="text-center">
                    <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                      className="text-xl font-black text-white">Answer Locked!</motion.p>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                      className="mt-2 text-base italic text-white/50">&ldquo;{submittedAnswer}&rdquo;</motion.p>
                  </div>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="text-white/25 text-sm">Waiting for reveal…</motion.p>
                </>
              ) : (
                <>
                  <Loader2 className="text-white/20 h-6 w-6 animate-spin" />
                  <p className="text-white/30 text-sm">Waiting for reveal…</p>
                </>
              )}
            </motion.div>
          )}

          {/* ── ANSWER REVEAL ────────────────────────────────────────────── */}
          {status === SessionStatus.ANSWER_REVEAL && myReveal && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-5 relative overflow-hidden"
            >
              {/* Background glow */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: myReveal.isCorrect
                    ? 'radial-gradient(ellipse 90% 70% at 50% 45%, rgba(34,197,94,0.14) 0%, transparent 70%)'
                    : 'radial-gradient(ellipse 90% 70% at 50% 45%, rgba(239,68,68,0.10) 0%, transparent 70%)',
                }}
              />

              {/* Result emoji */}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 180, damping: 12 }}
                className="relative z-10 text-8xl"
              >
                {myReveal.isCorrect ? '✅' : '❌'}
              </motion.div>

              {/* Result text + points */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative z-10 text-center"
              >
                <p
                  className="text-3xl font-black"
                  style={{ color: myReveal.isCorrect ? '#22C55E' : '#EF4444' }}
                >
                  {myReveal.isCorrect ? 'Correct!' : 'Wrong'}
                </p>
                {myReveal.isCorrect && (
                  <motion.p
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.38, type: 'spring', stiffness: 200 }}
                    className="mt-1 text-4xl font-black tabular-nums"
                    style={{ color: teamColorHex }}
                  >
                    +{myReveal.pointsEarned} pts
                  </motion.p>
                )}
              </motion.div>

              {/* Correct answer badge — hidden in Tile Blitz wrong-answer reveal until bonus resolves */}
              {(myReveal.isCorrect || !tileBlitzActiveTeamId) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="relative z-10 rounded-2xl border border-[#22C55E]/30 bg-[#22C55E]/10 px-6 py-3 text-center"
                >
                  <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35 mb-1">
                    Correct Answer
                  </p>
                  <p className="text-xl font-black text-[#22C55E]">{revealData?.correctAnswer}</p>
                </motion.div>
              )}

              {/* Your wrong answer */}
              {!myReveal.isCorrect && myReveal.submittedAnswer && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="relative z-10 text-sm text-white/30 italic"
                >
                  You answered: &ldquo;{myReveal.submittedAnswer}&rdquo;
                </motion.p>
              )}

              {/* Score card */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="relative z-10 w-full rounded-2xl border border-white/8 bg-white/[0.04] px-6 py-4 text-center"
              >
                <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest mb-1">Total Score</p>
                <p className="text-3xl font-black tabular-nums text-white">{score}</p>
                {rank != null && <p className="text-white/35 text-xs mt-0.5">Rank #{rank}</p>}
              </motion.div>
            </motion.div>
          )}

          {/* ── SPECTATOR REVEAL (turn-based: this team didn't answer) ─── */}
          {status === SessionStatus.ANSWER_REVEAL && revealData && !myReveal && (() => {
            const ar = revealData.teamAnswers[0] ?? null
            const showAnswer = ar?.isCorrect || !tileBlitzActiveTeamId
            return (
              <motion.div
                key="reveal-spectator"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col gap-4"
              >
                {/* Clear "not your question" banner */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 flex items-center gap-3"
                >
                  <span className="text-2xl">👀</span>
                  <div>
                    <p className="text-white/60 text-xs font-black uppercase tracking-widest">
                      Not your turn
                    </p>
                    <p className="text-white/35 text-xs mt-0.5">
                      Watch the projector — no points earned this question
                    </p>
                  </div>
                </motion.div>

                {ar ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex flex-col items-center gap-4 py-4"
                  >
                    {/* Active team label */}
                    <div className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                        style={{ backgroundColor: ar.teamColor }}
                      >
                        {ar.teamName.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Their result</p>
                        <p className="text-base font-black text-white leading-tight">{ar.teamName}</p>
                      </div>
                    </div>

                    {/* Their outcome */}
                    <motion.p
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.25, type: 'spring', stiffness: 180 }}
                      className={cn('text-4xl font-black', ar.isCorrect ? 'text-[#22C55E]' : 'text-red-400')}
                    >
                      {ar.isCorrect ? '✅ Correct!' : '❌ Wrong'}
                    </motion.p>

                    {ar.isCorrect && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-[#22C55E] text-xl font-black"
                      >
                        +{ar.pointsEarned} pts (theirs)
                      </motion.p>
                    )}

                    {showAnswer && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.45 }}
                        className="rounded-2xl border border-[#22C55E]/30 bg-[#22C55E]/10 px-6 py-3 text-center"
                      >
                        <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/35 mb-1">Correct Answer</p>
                        <p className="text-lg font-black text-[#22C55E]">{revealData.correctAnswer}</p>
                      </motion.div>
                    )}
                  </motion.div>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-white/30 text-sm">Watch the projector for the result</p>
                  </div>
                )}

                {/* Your own score — clearly separated and labelled as unchanged */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-auto w-full rounded-2xl border border-white/8 bg-white/[0.04] px-6 py-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest">
                        Your score — unchanged
                      </p>
                      <p className="text-3xl font-black tabular-nums text-white mt-0.5">{score}</p>
                      {rank != null && <p className="text-white/35 text-xs mt-0.5">Rank #{rank}</p>}
                    </div>
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-base font-black text-white flex-shrink-0"
                      style={{ backgroundColor: teamColorHex }}
                    >
                      {teamName?.[0]?.toUpperCase()}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}

          {/* ── ROUND SUMMARY ────────────────────────────────────────────── */}
          {status === SessionStatus.ROUND_SUMMARY && roundSummary && (
            <motion.div
              key="rsummary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col"
            >
              <div className="mb-5">
                <h2 className="text-xl font-black text-white">
                  {roundSummary.roundName ?? 'Round'} Over
                </h2>
                <p className="text-white/35 mt-0.5 text-sm">Standings after this round</p>
              </div>

              <div className="space-y-2">
                {roundSummary.teamScores
                  .slice()
                  .sort(
                    (a, b) =>
                      (roundSummary.roundPoints[b.teamId] ?? 0) -
                      (roundSummary.roundPoints[a.teamId] ?? 0),
                  )
                  .map((s, i) => (
                    <motion.div
                      key={s.teamId}
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.09, type: 'spring', stiffness: 90 }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border-2 p-3.5',
                        s.teamId === teamId
                          ? 'border-current'
                          : 'border-white/8 bg-white/[0.025]',
                      )}
                      style={s.teamId === teamId ? {
                        borderColor: teamColorHex,
                        backgroundColor: `${teamColorHex}10`,
                      } : {}}
                    >
                      <span className="text-lg w-7 text-center">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: s.teamColor }} />
                      <span className="flex-1 text-sm font-semibold text-white">{s.teamName}</span>
                      <span className="font-black tabular-nums" style={{ color: s.teamColor }}>
                        {roundSummary.roundPoints[s.teamId] ?? 0}
                      </span>
                    </motion.div>
                  ))}
              </div>
            </motion.div>
          )}

          {/* ── CLUE REVEAL: CLUE OPEN ───────────────────────────────────── */}
          {status === SessionStatus.CLUE_OPEN && clueState && (
            <motion.div
              key="clue-open"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-6 py-8"
            >
              <div className="text-center">
                <p className="text-white/35 mb-2 text-xs tracking-widest uppercase font-bold">
                  Clue {clueState.currentClueIndex + 1} — {clueState.pointsAvailable} pts
                </p>
                <div className="flex flex-col gap-2">
                  {revealedClues?.map((clue, index) => (
                    <p
                      key={index}
                      className={cn(
                        'text-lg leading-snug font-semibold',
                        index === clueState.currentClueIndex ? 'text-white' : 'text-white/40',
                      )}
                    >
                      {clue}
                    </p>
                  ))}
                </div>
              </div>
              {clueLockedOut ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-center">
                  <XCircle className="text-red-400 mx-auto mb-2 h-8 w-8" />
                  <p className="text-red-400 font-black">Locked Out</p>
                  <p className="text-white/30 mt-1 text-xs">Wait for next clue or question</p>
                </div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className="relative h-24 w-full max-w-xs rounded-2xl font-black text-3xl text-black flex items-center justify-center"
                  style={{
                    backgroundColor: clueTimeLeft === 0 ? 'rgba(255,255,255,0.1)' : teamColorHex,
                    boxShadow: clueTimeLeft > 0 ? `0 0 30px ${teamColorHex}40` : 'none',
                  }}
                  onClick={() => emit(TEAM_EVENTS.CLUE_BUZZ, { teamId, sessionId })}
                  disabled={clueTimeLeft === 0}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className={clueTimeLeft === 0 ? 'text-white/40' : 'text-black'}>BUZZ IN</span>
                    <span className={cn('text-xs font-semibold', clueTimeLeft === 0 ? 'text-white/25' : 'text-black/60')}>
                      {clueTimeLeft === 0 ? 'Timer Elapsed' : 'Press Space or Tap'}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'absolute -top-3 -right-3 flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg bg-[#08080E]',
                      clueTimeLeft === 0 ? 'border-red-500/50 text-red-400' : 'border-white text-white',
                    )}
                  >
                    {clueTimeLeft}
                  </div>
                </motion.button>
              )}
              <div className="text-center">
                <p className="text-white/30 text-xs">Your score</p>
                <p className="text-xl font-black" style={{ color: teamColorHex }}>{score} pts</p>
              </div>
            </motion.div>
          )}

          {/* ── CLUE REVEAL: CLUE ANSWERING ──────────────────────────────── */}
          {status === SessionStatus.CLUE_ANSWERING && clueState && (
            <motion.div
              key="clue-answering"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-6 py-8"
            >
              {clueState.buzzingTeamId === teamId ? (
                <>
                  <div className="text-center">
                    <motion.p
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-xl font-black mb-1"
                      style={{ color: teamColorHex }}
                    >
                      You buzzed in!
                    </motion.p>
                    <p className="text-white/40 text-sm">Type your answer quickly</p>
                    <motion.div
                      key={answeringTimeLeft}
                      initial={{ scale: 1.3, opacity: 0.6 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-3 font-mono text-5xl font-black"
                      style={{ color: answeringTimeLeft <= 5 ? '#EF4444' : '#F59E0B' }}
                    >
                      {answeringTimeLeft}s
                    </motion.div>
                  </div>
                  <form
                    className="flex w-full max-w-xs flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!openAnswer.trim()) return
                      emit(TEAM_EVENTS.ANSWER_SUBMIT, {
                        teamId,
                        sessionId,
                        questionId: clueState.questionId,
                        answer: openAnswer.trim(),
                      })
                      setOpenAnswer('')
                    }}
                  >
                    <Input
                      autoFocus
                      placeholder="Your answer…"
                      value={openAnswer}
                      onChange={(e) => setOpenAnswer(e.target.value)}
                      className="h-14 text-center text-lg"
                    />
                    <Button type="submit" size="lg" className="h-14 font-black">
                      Submit Answer
                    </Button>
                  </form>
                </>
              ) : (
                <div className="space-y-4 text-center">
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black text-white"
                    style={{ backgroundColor: clueState.buzzingTeamColor ?? '#888' }}
                  >
                    {clueState.buzzingTeamName?.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xl font-black text-white">{clueState.buzzingTeamName}</p>
                    <p className="text-white/35 text-sm mt-0.5">is answering…</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── ULTIMATE CHALLENGE: TEAM SELECT ─────────────────────────── */}
          {status === SessionStatus.UC_TEAM_SELECT && (
            <motion.div
              key="uc-team-select"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-7 py-8"
            >
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  className="absolute h-28 w-28 rounded-full border-2"
                  style={{ borderColor: teamColorHex }}
                />
                <div
                  className="relative h-20 w-20 rounded-full flex items-center justify-center text-3xl font-black text-white"
                  style={{ backgroundColor: teamColorHex }}
                >
                  {teamName?.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black text-white">Get Ready!</h2>
                <p className="text-white/35 mt-1 text-sm">Moderator is selecting the next team</p>
              </div>
              <div className="w-full rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-4 text-center">
                <p className="text-white/35 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Your score
                </p>
                <p className="text-3xl font-black tabular-nums" style={{ color: teamColorHex }}>{score} pts</p>
              </div>
            </motion.div>
          )}

          {/* ── ULTIMATE CHALLENGE: ACTIVE ───────────────────────────────── */}
          {status === SessionStatus.UC_ACTIVE && ucState && (
            <motion.div
              key="uc-active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col gap-4 py-4"
            >
              {ucState.activeTeamId === teamId ? (
                /* This team is ON */
                <div className="flex flex-1 flex-col items-center justify-center gap-6">
                  {/* Explosive "YOU'RE ON" banner */}
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 150, damping: 12 }}
                    className="w-full rounded-2xl p-5 text-center"
                    style={{
                      backgroundColor: `${teamColorHex}15`,
                      border: `2px solid ${teamColorHex}`,
                      boxShadow: `0 0 40px ${teamColorHex}25`,
                    }}
                  >
                    <p className="text-3xl font-black tracking-wider text-white">🎤 YOU&apos;RE ON!</p>
                    <p className="text-white/50 mt-1 text-sm font-medium">
                      Answer out loud — moderator judges
                    </p>
                  </motion.div>

                  {/* Giant countdown */}
                  <motion.div
                    key={ucTimeLeft}
                    initial={{ scale: 1.2, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-3xl px-10 py-6 font-mono font-black tabular-nums"
                    style={{
                      fontSize: 72,
                      color: ucTimeLeft <= 10 ? '#EF4444' : ucTimeLeft <= 20 ? '#F59E0B' : '#22C55E',
                      backgroundColor: ucTimeLeft <= 10 ? 'rgba(239,68,68,0.1)' : ucTimeLeft <= 20 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
                    }}
                  >
                    {ucTimeLeft}
                  </motion.div>

                  <div className="w-full rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-center">
                    <p className="text-white/30 text-xs uppercase tracking-wider mb-0.5">Score</p>
                    <p className="text-2xl font-black text-[#22C55E]">
                      {ucState.teams.find((t) => t.teamId === teamId)?.score ?? 0}
                    </p>
                  </div>
                </div>
              ) : (
                /* Another team is active */
                <div className="flex flex-1 flex-col items-center justify-center gap-5">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black text-white"
                    style={{ backgroundColor: ucState.activeTeamColor ?? '#888' }}
                  >
                    {ucState.activeTeamName?.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black" style={{ color: ucState.activeTeamColor ?? '#fff' }}>
                      {ucState.activeTeamName}
                    </p>
                    <p className="text-white/35 mt-1 text-sm">is answering right now</p>
                  </div>
                  <motion.div
                    key={ucTimeLeft}
                    initial={{ scale: 1.15, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="font-mono text-5xl font-black tabular-nums"
                    style={{
                      color: ucTimeLeft <= 10 ? '#EF4444' : ucTimeLeft <= 20 ? '#F59E0B' : '#22C55E',
                    }}
                  >
                    {ucTimeLeft}s
                  </motion.div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-3 text-center">
                    <p className="text-white/30 text-xs uppercase tracking-wider mb-0.5">Your score</p>
                    <p className="text-2xl font-black tabular-nums" style={{ color: teamColorHex }}>
                      {score} pts
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── CUMULATIVE REVEAL ────────────────────────────────────────── */}
          {status === SessionStatus.CUMULATIVE_REVEAL && cumulativeData && (
            <motion.div
              key="cumulative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col"
            >
              <div className="mb-5">
                <h2 className="text-xl font-black text-white">Overall Standings</h2>
                <p className="text-white/35 mt-0.5 text-sm">Cumulative scores across all rounds</p>
              </div>
              <div className="space-y-2">
                {(cumulativeData as CumulativeScoresPayload).finalScores
                  .slice()
                  .sort((a, b) => a.rank - b.rank)
                  .map((s, i) => (
                    <motion.div
                      key={s.teamId}
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08, type: 'spring', stiffness: 90 }}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border-2 p-3.5',
                        s.teamId === teamId ? 'border-current' : 'border-white/8 bg-white/[0.025]',
                      )}
                      style={s.teamId === teamId ? {
                        borderColor: teamColorHex,
                        backgroundColor: `${teamColorHex}10`,
                      } : {}}
                    >
                      <span className="text-lg w-7 text-center">
                        {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                      </span>
                      <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: s.teamColor }} />
                      <span className="flex-1 text-sm font-semibold text-white">{s.teamName}</span>
                      <span className="font-black tabular-nums" style={{ color: s.teamColor }}>{s.score} pts</span>
                    </motion.div>
                  ))}
              </div>
            </motion.div>
          )}

          {/* ── SESSION END ──────────────────────────────────────────────── */}
          {status === SessionStatus.SESSION_END && sessionEndData && (
            <motion.div
              key="end"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-6 py-8"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 150, damping: 12 }}
              >
                <Trophy className="h-16 w-16 text-[#F59E0B]" strokeWidth={1.5} />
              </motion.div>
              <div className="text-center">
                <h2 className="text-2xl font-black text-white">Quiz Complete!</h2>
                <p className="text-white/35 mt-1 text-sm">Final standings</p>
              </div>

              <div className="w-full space-y-2">
                {sessionEndData.finalScores.map((s, i) => (
                  <motion.div
                    key={s.teamId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, type: 'spring', stiffness: 90 }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border-2 p-3.5',
                      s.teamId === teamId ? 'border-current' : 'border-white/8 bg-white/[0.025]',
                    )}
                    style={s.teamId === teamId ? {
                      borderColor: teamColorHex,
                      backgroundColor: `${teamColorHex}10`,
                    } : {}}
                  >
                    <span className="text-lg w-7 text-center">
                      {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                    </span>
                    <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: s.teamColor }} />
                    <span className="flex-1 text-sm font-semibold text-white">{s.teamName}</span>
                    <span className="font-black tabular-nums" style={{ color: s.teamColor }}>{s.score}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
  )
}
