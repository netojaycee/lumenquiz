'use client'
import { useEffect, useRef, useState } from 'react'
import { useSessionId } from '@/hooks/useSessionId'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Users, Maximize, Zap, Wifi, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { TimerBar, TimerCountdown } from '@/components/game/TimerBar'
import { RoundIntroScreen } from '@/components/game/RoundIntroScreen'
import { RoundSummaryScreen } from '@/components/game/RoundSummaryScreen'
import { CumulativeScreen } from '@/components/game/CumulativeScreen'
import { WinnerScreen } from '@/components/game/WinnerScreen'
import { GoodbyeScreen } from '@/components/game/GoodbyeScreen'
import { UCRaceScreen } from '@/components/game/UCRaceScreen'
import { AnswerRevealScreen } from '@/components/game/AnswerRevealScreen'
import { cn } from '@/lib/utils'
import { soundManager } from '@/lib/sound'
import { useSocketStore } from '@/stores/useSocketStore'
import { useScreenStore } from '@/stores/useScreenStore'
import { useFullscreen } from '@/hooks/useFullscreen'
import { CONNECTION_EVENTS } from '@apoquiz/socket-events'
import { serverNow } from '@/lib/clock'
import { ReconnectOverlay } from '@/components/shared/ReconnectOverlay'
import { SessionStatus, QuestionType } from '@apoquiz/shared-types'

// ─── Floating emoji overlay ───────────────────────────────────────────────────

interface FloatingEmoji {
  id: string
  emoji: string
  x: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScreenClient(): React.ReactElement {
  const sessionId = useSessionId()

  const { connect, emit, midSessionDisconnect } = useSocketStore()
  const {
    sessionStatus,
    sessionCode,
    currentRound,
    currentRoundId,

    currentQuestion,
    questionIndex,
    totalQuestions,
    timerData,
    scores,
    connectedTeamIds,
    submittedTeamIds,
    allAnswered,
    timerElapsed,
    voteData,
    positionTally,
    totalVotes,
    revealData,
    roundSummary,
    sessionEndData,
    emojiCounts,
    audienceCount,
    tileBlitz,
    cumulativeData,
    ucState,
    clueState,
    activeInteraction,
    qrOverlay,
    rulesOverlay,
  } = useScreenStore()

  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([])
  const prevEmojiCount = useRef<Record<string, number>>({})
  const { isFullscreen, isSupported, enter: enterFullscreen } = useFullscreen()
  const [ucTimeLeft, setUCTimeLeft] = useState(0)
  const [clueTimeLeft, setClueTimeLeft] = useState(0)
  const [answeringTimeLeft, setAnsweringTimeLeft] = useState(0)
  const [showGoodbye, setShowGoodbye] = useState(false)
  const [networkInfo, setNetworkInfo] = useState<{ ip: string; port: number; joinURL: string } | null>(null)
  const [qrDataURL, setQrDataURL] = useState<string | null>(null)
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

  // Auto-fullscreen on round start
  useEffect(() => {
    if (sessionStatus === SessionStatus.ROUND_INTRO && isSupported && !isFullscreen) {
      enterFullscreen()
    }
  }, [sessionStatus, isSupported, isFullscreen, enterFullscreen])

  // ─── Connection + sound init ─────────────────────────────────────────────

  useEffect(() => {
    void soundManager.initWithRemoteConfig()

    const socket = connect()

    const doJoin = () => {
      emit(CONNECTION_EVENTS.REJOIN, { role: 'screen', sessionId })
    }

    socket.on('connect', doJoin)
    if (socket.connected) doJoin()

    return () => {
      socket.off('connect', doJoin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const isTileBlitz = currentRound?.gameMode === 'tile_blitz'

  // UC countdown for projector
  useEffect(() => {
    if (sessionStatus !== SessionStatus.UC_ACTIVE || !ucState?.timerDeadline) return
    const tick = () =>
      setUCTimeLeft(Math.max(0, Math.ceil((ucState.timerDeadline - serverNow()) / 1000)))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [sessionStatus, ucState?.timerDeadline])

  // Clue Reveal countdowns
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

  // ─── Sound effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionStatus === SessionStatus.ROUND_INTRO) {
      soundManager.play('roundIntro')
    }
  }, [sessionStatus])

  useEffect(() => {
    if (sessionStatus === SessionStatus.QUESTION_OPEN && timerData) {
      soundManager.startTick(timerData.durationMs)
    }
    if (
      sessionStatus === SessionStatus.QUESTION_LOCKED ||
      sessionStatus === SessionStatus.ANSWER_REVEAL
    ) {
      soundManager.stopTick()
    }
  }, [sessionStatus, timerData])

  // Stop tick immediately when all teams answer early
  useEffect(() => {
    if (allAnswered) soundManager.stopTick()
  }, [allAnswered])

  useEffect(() => {
    if (!revealData) return
    if (isTileBlitz) {
      // Turn-based: active team's individual result — correct/wrong feedback is appropriate
      const activeCorrect = revealData.teamAnswers.some((a) => a.isCorrect)
      soundManager.play(activeCorrect ? 'correct' : 'wrong')
    } else {
      // Blitz: all teams answer simultaneously — avoid clashing correct/wrong per team.
      // Play a single uniform reveal sound instead.
      soundManager.play('scoreUpdate')
    }
  }, [revealData, isTileBlitz])

  useEffect(() => {
    if (roundSummary) soundManager.play('roundEnd')
  }, [roundSummary])

  useEffect(() => {
    if (sessionEndData) {
      soundManager.play('drumRoll')
      setTimeout(() => soundManager.play('winner'), 3000)
      setTimeout(() => {
        setShowGoodbye(true)
        soundManager.play('quizEnd')
      }, 30_000)
    }
  }, [sessionEndData])

  // Bonus reveal sound
  useEffect(() => {
    if (sessionStatus !== SessionStatus.BONUS_REVEAL || !tileBlitz?.bonusResult) return
    soundManager.play(tileBlitz.bonusResult.isCorrect ? 'correct' : 'wrong')
  }, [sessionStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch network info + QR for lobby display.
  // QR encodes the audience deep-link: /join?session=<code>&role=audience so scanning
  // skips role selection and lands straight on the name-entry form.
  // Re-runs once sessionCode arrives from the state snapshot.
  useEffect(() => {
    api.get<{ ip: string; port: number; joinURL: string }>('/network/info')
      .then((info) => {
        setNetworkInfo(info)
        const code = sessionCode || sessionId
        const audienceURL = `${info.joinURL}?session=${code}&role=audience`
        return api.get<{ dataURL: string; url: string }>(`/network/qr?url=${encodeURIComponent(audienceURL)}`)
      })
      .then((qr) => setQrDataURL(qr.dataURL))
      .catch(() => {})
  }, [sessionCode, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Emoji animations ─────────────────────────────────────────────────────

  useEffect(() => {
    for (const [emoji, count] of Object.entries(emojiCounts)) {
      const prev = prevEmojiCount.current[emoji] ?? 0
      if (count > prev) {
        for (let i = prev; i < count; i++) {
          const id = `${emoji}-${Date.now()}-${i}`
          const x = Math.random() * 80 + 10
          setFloatingEmojis((f) => [...f, { id, emoji, x }])
          setTimeout(() => setFloatingEmojis((f) => f.filter((e) => e.id !== id)), 3000)
        }
      }
    }
    prevEmojiCount.current = { ...emojiCounts }
  }, [emojiCounts])

  const status = sessionStatus
  const question = currentQuestion

  // Round-scoped scores: during an active round show round score, not cumulative
  const activeRoundId = currentRoundId ?? currentRound?.id
  const roundScores = scores.map((s) => ({
    ...s,
    displayScore: activeRoundId ? (s.roundScores?.[activeRoundId] ?? 0) : s.score,
  }))

  const revealedClues = clueState?.clues.slice(0, clueState?.currentClueIndex + 1)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="bg-background relative flex min-h-screen flex-col overflow-hidden select-none">
      <ReconnectOverlay show={midSessionDisconnect} variant="banner" />
      {/* Moderator-triggered QR overlay — shown on top of any game state */}
      <AnimatePresence>
        {qrOverlay && (
          <motion.div
            key="qr-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#08080E]/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 40 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              className="flex flex-col items-center gap-8"
            >
              <div>
                <h2 className="text-center text-5xl font-black text-white tracking-tight">
                  APO<span className="text-[#3B82F6]">QUIZ</span>
                </h2>
                <p className="text-center text-white/40 mt-2 text-lg">Audience — scan to join</p>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-2xl" style={{ width: 280, height: 280 }}>
                <img src={qrOverlay.dataURL} alt="Join QR" className="w-full h-full" />
              </div>
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium mb-1">or type in browser</p>
                <p className="font-mono text-3xl font-black text-[#3B82F6]">
                  {qrOverlay.url.replace(/^https?:\/\//, '')}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Moderator-triggered rules overlay — shown over round intro */}
      <AnimatePresence>
        {rulesOverlay && (
          <motion.div
            key="rules-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#08080E]/88 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.88, y: 32 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 32 }}
              transition={{ type: 'spring', stiffness: 110, damping: 16 }}
              className="w-full max-w-2xl mx-8"
            >
              <div className="rounded-3xl border border-white/10 bg-[#1A1A24] p-10 shadow-2xl">
                <p className="text-[#3B82F6] text-sm font-bold uppercase tracking-[0.25em] mb-2">
                  How It Works
                </p>
                <h2 className="text-white text-4xl font-black mb-8">
                  {rulesOverlay.roundName ?? 'Round Rules'}
                </h2>
                <ul className="space-y-4">
                  {rulesOverlay.rules.map((rule, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-4"
                    >
                      <span className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#3B82F6]/20 text-[#3B82F6] text-sm font-black">
                        {i + 1}
                      </span>
                      <span className="text-white/90 text-xl leading-relaxed">{rule}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating emojis — start at bottom edge, float upward and fade */}
      {floatingEmojis.map((fe) => (
        <motion.div
          key={fe.id}
          initial={{ opacity: 1, y: 0, scale: 0.6 }}
          animate={{ opacity: 0, y: '-75vh', scale: 1.6 }}
          transition={{ duration: 2.8, ease: 'easeOut' }}
          className="pointer-events-none fixed bottom-6 z-50 text-5xl"
          style={{ left: `${fe.x}%` }}
        >
          {fe.emoji}
        </motion.div>
      ))}

      <AnimatePresence mode="wait">
        {/* ── LOBBY ──────────────────────────────────────────────────── */}
        {(status === SessionStatus.LOBBY || !status) && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex min-h-screen flex-col overflow-hidden bg-[#08080E]"
          >
            {/* Background radial glow */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse 70% 50% at 50% 35%, rgba(59,130,246,0.09) 0%, transparent 65%)',
              }}
            />
            {/* Animated grid */}
            <motion.div
              animate={{ backgroundPositionY: ['0px', '60px'] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="pointer-events-none absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
                backgroundSize: '60px 60px',
              }}
            />
            {/* Top accent line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 2, ease: 'easeOut' }}
              className="absolute top-0 left-0 h-px w-full origin-left"
              style={{ background: 'linear-gradient(90deg, transparent, #3B82F6, transparent)' }}
            />

            <div className="relative z-10 flex flex-1 flex-col">
              {/* Main content: logo left, QR right */}
              <div className="flex flex-1 items-center justify-between px-20 gap-16">
                {/* Left: branding + join instructions */}
                <div className="flex flex-col gap-8 flex-1">
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                  >
                    <h1 className="text-[88px] font-black tracking-tight leading-none text-white">
                      APO<span className="text-[#3B82F6]">QUIZ</span>
                    </h1>
                    <p className="text-white/35 mt-3 text-2xl font-medium tracking-wider">
                      Live Bible Quiz Platform
                    </p>
                  </motion.div>

                  {networkInfo && (() => {
                    const serverBase = networkInfo.joinURL.replace(/\/join\/?$/, '')
                    const isCloud = serverBase.startsWith('https://')
                    const displayHost = isCloud
                      ? serverBase.replace(/^https?:\/\//, '')
                      : `${networkInfo.ip}:${networkInfo.port}`
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col gap-4"
                      >
                        {/* Manual join instructions */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4 text-[#3B82F6]" />
                            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Open in browser</p>
                          </div>
                          <p className="font-mono text-4xl font-black text-white break-all">
                            {isCloud
                              ? displayHost
                              : <>{networkInfo.ip}<span className="text-[#3B82F6]">:{networkInfo.port}</span></>}
                          </p>
                        </div>
                        {sessionCode && (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Enter session code</p>
                            <p className="font-mono text-5xl font-black tracking-[0.15em] text-[#F59E0B]">
                              {sessionCode}
                            </p>
                          </div>
                        )}
                        <p className="text-white/25 text-sm">
                          Audience: go to{' '}
                          <span className="font-mono text-white/40">{displayHost}</span>{' '}
                          → select <span className="text-white/40">Audience</span> → enter code + your name
                        </p>
                      </motion.div>
                    )
                  })()}

                  {/* Live stats badges */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-center gap-4"
                  >
                    <div className="flex items-center gap-2 rounded-2xl border border-[#22C55E]/20 bg-[#22C55E]/08 px-5 py-3">
                      <div className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
                      <span className="text-[#22C55E] font-bold text-lg">{connectedTeamIds.length}</span>
                      <span className="text-white/40 text-sm">teams ready</span>
                    </div>
                    <button
                      onClick={openAudienceList}
                      className="flex items-center gap-2 rounded-2xl border border-[#F59E0B]/20 bg-[#F59E0B]/08 px-5 py-3 transition-colors hover:bg-[#F59E0B]/15 cursor-pointer"
                      title="View connected audience"
                    >
                      <Users className="h-4 w-4 text-[#F59E0B]" />
                      <span className="text-[#F59E0B] font-bold text-lg">{audienceCount}</span>
                      <span className="text-white/40 text-sm">audience</span>
                    </button>
                    {isSupported && !isFullscreen && (
                      <button
                        onClick={enterFullscreen}
                        className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-white/30 text-sm transition-colors hover:text-white/60"
                      >
                        <Maximize className="h-4 w-4" />
                        Fullscreen
                      </button>
                    )}
                  </motion.div>
                </div>

                {/* Right: QR code */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 70 }}
                  className="flex flex-col items-center gap-5"
                >
                  <div className="rounded-3xl border-2 border-white/10 bg-white p-4 shadow-2xl" style={{ width: 240, height: 240 }}>
                    {qrDataURL ? (
                      <img src={qrDataURL} alt="Join QR" className="w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="h-12 w-12 rounded-full border-4 border-[#3B82F6]/20 border-t-[#3B82F6] animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-white/30 text-sm font-medium tracking-wider uppercase">Audience — scan to join</p>
                </motion.div>
              </div>

              {/* Team cards at the bottom */}
              {scores.length > 0 && (
                <div className="px-20 pb-12">
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${Math.min(scores.length, 6)}, 1fr)` }}
                  >
                    {scores
                      .slice()
                      .sort((a, b) => a.rank - b.rank)
                      .map((s, i) => {
                        const online = connectedTeamIds.includes(s.teamId)
                        return (
                          <motion.div
                            key={s.teamId}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 + i * 0.06, type: 'spring', stiffness: 80 }}
                            className="relative flex flex-col items-center gap-2.5 rounded-2xl border-2 p-4 overflow-hidden transition-all"
                            style={{
                              borderColor: online ? s.teamColor : 'rgba(255,255,255,0.08)',
                              backgroundColor: online ? `${s.teamColor}0E` : 'rgba(255,255,255,0.02)',
                            }}
                          >
                            {/* Top stripe */}
                            <div
                              className="absolute top-0 left-0 right-0 h-0.5 transition-all"
                              style={{ backgroundColor: online ? s.teamColor : 'transparent' }}
                            />
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: s.teamColor }} />
                              <motion.div
                                animate={online ? { scale: [1, 1.3, 1] } : {}}
                                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: online ? '#22C55E' : '#374151' }}
                              />
                            </div>
                            <p className="text-center text-sm font-black text-white">{s.teamName}</p>
                            <p className="text-xs font-medium" style={{ color: online ? '#22C55E' : 'rgba(255,255,255,0.25)' }}>
                              {online ? 'Connected' : 'Waiting…'}
                            </p>
                          </motion.div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── AUDIENCE VOTE ───────────────────────────────────────────── */}
        {status === SessionStatus.AUDIENCE_VOTE && voteData && (
          <motion.div
            key="vote"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex min-h-screen flex-col overflow-hidden bg-[#08080E]"
          >
            {/* Background radial */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 30%, rgba(245,158,11,0.07) 0%, transparent 65%)' }}
            />

            {/* Header */}
            <div className="relative z-10 flex flex-col items-center pt-14 pb-6">
              <motion.p
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-[#F59E0B] text-sm font-bold uppercase tracking-[0.3em] mb-2"
              >
                🔮 Audience Ranking Prediction
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="text-6xl font-black text-white tracking-tight"
              >
                Who wins this round?
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-white/30 mt-3 text-xl"
              >
                Audience ranks all teams — who do they believe will finish first?
              </motion.p>
            </div>

            {/* Position legend */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="relative z-10 flex justify-center gap-6 mb-8"
            >
              {[
                { label: '🥇 1st pick', color: '#F59E0B' },
                { label: '🥈 2nd pick', color: '#94A3B8' },
                { label: '🥉 3rd pick', color: '#92400E' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-white/50 text-sm font-medium">{item.label}</span>
                </div>
              ))}
            </motion.div>

            {/* Team ranking bars */}
            <div className="relative z-10 flex-1 flex flex-col justify-center px-20 gap-5">
              {voteData.teams.map((t, teamIdx) => {
                const teamPositions = positionTally[t.id] ?? {}
                // How many ranked this team at each position
                const pos1 = teamPositions['1'] ?? 0
                const pos2 = teamPositions['2'] ?? 0
                const pos3 = teamPositions['3'] ?? 0
                const posRest = Object.entries(teamPositions)
                  .filter(([k]) => Number(k) > 3)
                  .reduce((s, [, v]) => s + v, 0)
                const totalForTeam = pos1 + pos2 + pos3 + posRest

                // Each segment as % of total voters
                const pct1 = totalVotes > 0 ? (pos1 / totalVotes) * 100 : 0
                const pct2 = totalVotes > 0 ? (pos2 / totalVotes) * 100 : 0
                const pct3 = totalVotes > 0 ? (pos3 / totalVotes) * 100 : 0
                const pctRest = totalVotes > 0 ? (posRest / totalVotes) * 100 : 0
                const totalPct = pct1 + pct2 + pct3 + pctRest

                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + teamIdx * 0.08, type: 'spring', stiffness: 70 }}
                    className="flex items-center gap-6"
                  >
                    {/* Team identity */}
                    <div className="flex items-center gap-3 w-44 flex-shrink-0">
                      <div className="h-5 w-5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-black text-white text-xl truncate">{t.name}</span>
                    </div>

                    {/* Stacked position bar */}
                    <div className="flex-1 relative">
                      <div className="h-12 rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.06] flex">
                        {/* 1st pick — gold */}
                        <motion.div
                          animate={{ width: `${pct1}%` }}
                          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                          className="h-full flex items-center justify-end overflow-hidden"
                          style={{ backgroundColor: '#F59E0B', minWidth: pct1 > 0 ? 4 : 0 }}
                        />
                        {/* 2nd pick — silver */}
                        <motion.div
                          animate={{ width: `${pct2}%` }}
                          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                          className="h-full overflow-hidden"
                          style={{ backgroundColor: '#94A3B8', minWidth: pct2 > 0 ? 4 : 0 }}
                        />
                        {/* 3rd pick — bronze */}
                        <motion.div
                          animate={{ width: `${pct3}%` }}
                          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                          className="h-full overflow-hidden"
                          style={{ backgroundColor: '#92400E', minWidth: pct3 > 0 ? 4 : 0 }}
                        />
                        {/* 4th+ pick — dimmer team color */}
                        <motion.div
                          animate={{ width: `${pctRest}%` }}
                          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                          className="h-full overflow-hidden"
                          style={{ backgroundColor: `${t.color}55`, minWidth: pctRest > 0 ? 4 : 0 }}
                        />
                      </div>

                      {/* Segment labels shown inside bar when large enough */}
                      <div className="absolute inset-0 flex items-center pointer-events-none">
                        <div className="flex h-full w-full">
                          {pct1 >= 8 && (
                            <div
                              className="flex items-center justify-center text-xs font-black text-black/70"
                              style={{ width: `${pct1}%` }}
                            >
                              {Math.round(pct1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats column */}
                    <div className="w-28 flex-shrink-0 text-right">
                      <p className="text-xl font-black tabular-nums" style={{ color: t.color }}>
                        {totalForTeam}
                      </p>
                      <p className="text-white/30 text-xs font-medium">
                        {totalVotes > 0 ? `${Math.round(totalPct)}% voted` : '—'}
                      </p>
                      {pos1 > 0 && (
                        <p className="text-[#F59E0B] text-xs font-bold">
                          {pos1} × 🥇
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Footer vote count */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="relative z-10 flex justify-center items-center gap-4 pb-12 pt-6"
            >
              <div className="flex items-center gap-2 rounded-2xl border border-[#F59E0B]/20 bg-[#F59E0B]/08 px-6 py-3">
                <Users className="h-4 w-4 text-[#F59E0B]" />
                <span className="text-[#F59E0B] font-black text-2xl tabular-nums">{totalVotes}</span>
                <span className="text-white/40 text-sm">votes cast</span>
              </div>
              <button
                onClick={openAudienceList}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3 transition-colors hover:bg-white/[0.08] cursor-pointer"
                title="View connected audience"
              >
                <span className="text-white/40 text-sm">audience on phone</span>
                <span className="text-white/60 font-bold text-xl tabular-nums">{audienceCount}</span>
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── ROUND INTRO ─────────────────────────────────────────────── */}
        {status === SessionStatus.ROUND_INTRO && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
            <RoundIntroScreen
              teams={scores}
              roundName={currentRound?.name ?? undefined}
              roundOrder={currentRound?.order}
            />
          </motion.div>
        )}

        {/* ── TILE BLITZ: TILE SELECT ─────────────────────────────────── */}
        {status === SessionStatus.TILE_SELECT && tileBlitz && (
          <motion.div
            key="tile-select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col p-10"
          >
            {/* Header: active team + turn counter */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-text-secondary mb-1 text-sm tracking-widest uppercase">
                  Tile Blitz
                </p>
                <h2 className="text-4xl font-bold text-white">
                  <span
                    style={{
                      color: scores.find((s) => s.teamId === tileBlitz.activeTeamId)?.teamColor,
                    }}
                  >
                    {scores.find((s) => s.teamId === tileBlitz.activeTeamId)?.teamName ?? '—'}
                  </span>{' '}
                  — Choose a Tile
                </h2>
              </div>
              <div className="text-right">
                <p className="text-text-muted text-sm">Turn</p>
                <p className="text-3xl font-bold text-white tabular-nums">
                  {tileBlitz.turnsCompleted + 1}
                  <span className="text-text-muted text-lg"> / {tileBlitz.totalTurns}</span>
                </p>
              </div>
            </div>

            {/* Tile grid */}
            <div className="flex flex-1 items-center justify-center">
              <div
                className="grid w-full gap-3"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(tileBlitz.tiles.length, 6)}, 1fr)`,
                }}
              >
                {tileBlitz.tiles.map((tile, i) => {
                  const teamColor = tile.activeTeamId
                    ? scores.find((s) => s.teamId === tile.activeTeamId)?.teamColor
                    : undefined
                  return (
                    <motion.div
                      key={tile.questionId}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-2xl font-bold transition-all',
                        tile.used
                          ? 'border-white/15 bg-white/[0.03]'
                          : 'bg-[#3B82F6]/20 border-[#3B82F6] shadow-lg',
                      )}
                      style={
                        tile.used && teamColor
                          ? { borderColor: `${teamColor}70`, backgroundColor: `${teamColor}18` }
                          : !tile.used
                            ? { boxShadow: '0 0 16px rgba(59,130,246,0.25)' }
                            : undefined
                      }
                    >
                      {tile.used ? (
                        <span
                          className="text-2xl font-black"
                          style={{ color: teamColor ? `${teamColor}80` : 'rgba(255,255,255,0.2)' }}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-white font-black">{i + 1}</span>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Turn order row */}
            <div className="mt-8 flex items-center justify-center gap-6">
              {tileBlitz.turnOrderTeamIds.map((tid, i) => {
                const s = scores.find((t) => t.teamId === tid)
                const isActive = tid === tileBlitz.activeTeamId
                const roundScore = activeRoundId ? (s?.roundScores?.[activeRoundId] ?? 0) : 0
                return (
                  <div
                    key={tid}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-4 py-2 transition-all',
                      isActive ? 'scale-110 border-2' : 'border-border opacity-70',
                    )}
                    style={{
                      borderColor: isActive ? s?.teamColor : undefined,
                      backgroundColor: isActive ? `${s?.teamColor}15` : undefined,
                    }}
                  >
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: s?.teamColor }}
                    />
                    <span className="text-sm font-semibold text-white">{s?.teamName}</span>
                    <span className="text-blitz-accent font-bold tabular-nums">{roundScore}</span>
                    {i === tileBlitz.currentTurnIndex && (
                      <span className="text-blitz-accent text-xs">▶</span>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ── QUESTION OPEN ───────────────────────────────────────────── */}
        {(status === SessionStatus.QUESTION_OPEN || status === SessionStatus.QUESTION_LOCKED) &&
          question && (
            <motion.div
              key={`question-${question.id}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              className="flex flex-1 flex-col p-12"
            >
              {/* Header: active team (Tile Blitz) or progress (Blitz) + timer */}
              <div className="mb-6 flex items-center gap-6">
                {isTileBlitz && tileBlitz ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{
                        backgroundColor: scores.find(
                          (s) => s.teamId === tileBlitz.activeQuestionTeamId,
                        )?.teamColor,
                      }}
                    />
                    <span className="text-lg font-bold text-white">
                      {scores.find((s) => s.teamId === tileBlitz.activeQuestionTeamId)?.teamName}
                    </span>
                    <span className="text-text-muted text-sm">is answering</span>
                  </div>
                ) : (
                  <span className="text-text-muted font-mono text-sm">
                    {questionIndex + 1} / {totalQuestions}
                  </span>
                )}
                {timerData && status === SessionStatus.QUESTION_OPEN && (
                  <div className="flex flex-1 items-center gap-3">
                    <TimerBar startTime={timerData.startTime} durationMs={timerData.durationMs} />
                    <span className="font-mono text-3xl font-bold">
                      <TimerCountdown
                        startTime={timerData.startTime}
                        durationMs={timerData.durationMs}
                      />
                    </span>
                  </div>
                )}
                {status === SessionStatus.QUESTION_LOCKED && (
                  <div className="flex-1">
                    <div className="bg-surface h-2 w-full rounded-full">
                      <div className="bg-wrong h-full w-0 rounded-full" />
                    </div>
                  </div>
                )}
              </div>

              {/* Question text */}
              <div className="flex flex-1 flex-col justify-center">
                <p className="mb-10 text-4xl leading-tight font-bold text-white">{question.text}</p>

                {/* MCQ options */}
                {question.type === QuestionType.MCQ && question.options && (
                  <div className="grid grid-cols-2 gap-4">
                    {question.options.map((opt) => (
                      <div
                        key={opt.id}
                        className="bg-surface border-border flex items-center gap-4 rounded-2xl border-2 p-5"
                      >
                        <span className="bg-background flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white">
                          {opt.label}
                        </span>
                        <span className="text-xl text-white">{opt.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Round score strip for Tile Blitz / submitted dots for Blitz */}
              {isTileBlitz ? (
                <div className="mt-8 flex justify-center gap-4">
                  {roundScores
                    .slice()
                    .sort((a, b) => b.displayScore - a.displayScore)
                    .map((s) => (
                      <div
                        key={s.teamId}
                        className="bg-surface border-border flex items-center gap-2 rounded-xl border px-4 py-2"
                      >
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: s.teamColor }}
                        />
                        <span className="text-sm text-white">{s.teamName}</span>
                        <span className="text-blitz-accent font-bold tabular-nums">
                          {s.displayScore}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                scores.length > 0 && (
                  <div className="mt-8 flex items-center gap-4">
                    <span className="text-text-muted text-sm">
                      {submittedTeamIds.length}/{scores.length} answered
                    </span>
                    <div className="flex gap-2">
                      {scores.map((s) => (
                        <div
                          key={s.teamId}
                          className={cn(
                            'h-3 w-3 rounded-full transition-all duration-300',
                            submittedTeamIds.includes(s.teamId) ? 'scale-125' : 'opacity-30',
                          )}
                          style={{ backgroundColor: s.teamColor }}
                          title={s.teamName}
                        />
                      ))}
                    </div>
                    {(allAnswered || timerElapsed) && (
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          allAnswered ? 'text-correct' : 'text-wrong',
                        )}
                      >
                        {allAnswered ? '✓ All answered' : "⏰ Time's up"}
                      </span>
                    )}
                  </div>
                )
              )}

              {/* Audience Prediction Summary Bar (Overlay during Play) */}
              {activeInteraction && (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-surface/80 border-blitz-accent/30 absolute right-12 bottom-12 z-40 w-64 rounded-2xl border p-4 backdrop-blur-md"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Zap className="text-blitz-accent h-3 w-3" />
                    <span className="text-blitz-accent text-[10px] font-bold tracking-widest uppercase">
                      Audience Pulse
                    </span>
                  </div>
                  <p className="mb-3 text-[11px] font-medium text-white leading-tight">
                    {activeInteraction.prompt}
                  </p>
                  <div className="space-y-1.5">
                    {activeInteraction.tally && Object.keys(activeInteraction.tally).length > 0 ? (
                      Object.entries(activeInteraction.tally).slice(0, 3).map(([key, count]) => {
                        const team = scores.find(s => s.teamId === key);
                        const pct = activeInteraction.totalSubmissions > 0 
                          ? (count / activeInteraction.totalSubmissions) * 100 
                          : 0;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <div className="bg-background h-1.5 flex-1 overflow-hidden rounded-full">
                              <motion.div 
                                className="h-full rounded-full"
                                style={{ backgroundColor: team?.teamColor ?? '#888' }}
                                animate={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-text-muted w-6 text-right text-[9px]">{Math.round(pct)}%</span>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-text-muted text-[10px] italic">
                        {activeInteraction.totalSubmissions} interactions...
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

        {/* ── ANSWER REVEAL ───────────────────────────────────────────── */}
        {status === SessionStatus.ANSWER_REVEAL && revealData && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col"
          >
            {isTileBlitz ? (
              /* Tile Blitz reveal: hide correct answer if wrong — bonus may follow */
              revealData.teamAnswers[0]?.isCorrect === false ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-8 p-16">
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 150, damping: 12 }}
                    className="text-9xl"
                  >
                    ❌
                  </motion.div>
                  <div className="text-center">
                    <div className="mb-3 flex items-center justify-center gap-3">
                      <div
                        className="h-5 w-5 rounded-full"
                        style={{ backgroundColor: revealData.teamAnswers[0]?.teamColor }}
                      />
                      <h2 className="text-5xl font-bold text-white">
                        {revealData.teamAnswers[0]?.teamName}
                      </h2>
                    </div>
                    <p className="text-wrong text-3xl font-bold">Wrong!</p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-text-muted mt-3 text-xl"
                    >
                      Bonus round opening…
                    </motion.p>
                  </div>
                  <div className="flex justify-center gap-4">
                    {roundScores.slice().sort((a, b) => b.displayScore - a.displayScore).map((s) => (
                      <div key={s.teamId} className="bg-surface border-border flex items-center gap-2 rounded-xl border px-4 py-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.teamColor }} />
                        <span className="text-sm text-white">{s.teamName}</span>
                        <span className="text-blitz-accent font-bold tabular-nums">{s.displayScore}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col p-12">
                  <div className="mb-8 flex items-center justify-between">
                    <h2 className="text-3xl font-bold text-white">Answer Revealed</h2>
                    <div className="bg-surface border-border rounded-xl border px-4 py-2">
                      <span className="text-text-secondary text-sm">Correct: </span>
                      <span className="font-bold text-white">{revealData.correctAnswer}</span>
                    </div>
                  </div>
                  <div className="flex flex-1 items-center justify-center">
                    <AnswerRevealScreen
                      correctAnswer={revealData.correctAnswer}
                      teamAnswers={revealData.teamAnswers}
                      updatedScores={roundScores.slice().sort((a, b) => b.displayScore - a.displayScore).map((s, i) => ({
                        teamId: s.teamId, teamName: s.teamName, teamColor: s.teamColor, score: s.displayScore, rank: i + 1,
                      }))}
                      questionText={question?.text}
                    />
                  </div>
                </div>
              )
            ) : (
              /* Standard Blitz — use the new dramatic reveal component */
              <AnswerRevealScreen
                correctAnswer={revealData.correctAnswer}
                teamAnswers={revealData.teamAnswers}
                updatedScores={revealData.updatedScores}
                questionText={question?.text}
              />
            )}
          </motion.div>
        )}

        {/* ── TILE BLITZ: BONUS OPEN ──────────────────────────────────── */}
        {status === SessionStatus.BONUS_OPEN && tileBlitz && (
          <motion.div
            key="bonus-open"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-8 p-16"
          >
            <div className="text-8xl">⚡</div>
            <h2 className="text-6xl font-bold text-white">BONUS ROUND</h2>
            <p className="text-timer-warning text-2xl">
              {tileBlitz.bonusBuzzTeamId
                ? `${scores.find((s) => s.teamId === tileBlitz.bonusBuzzTeamId)?.teamName ?? '—'} buzzed in!`
                : 'Teams are buzzing in…'}
            </p>
            <p className="text-text-muted text-lg">Press the buzz button on your device</p>
          </motion.div>
        )}

        {/* ── TILE BLITZ: BONUS ANSWERING ─────────────────────────────── */}
        {status === SessionStatus.BONUS_ANSWERING && tileBlitz && question && (
          <motion.div
            key="bonus-answering"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col p-12"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-5 w-5 rounded-full"
                  style={{
                    backgroundColor: scores.find((s) => s.teamId === tileBlitz.bonusBuzzTeamId)
                      ?.teamColor,
                  }}
                />
                <p className="text-timer-warning text-2xl font-bold">
                  {scores.find((s) => s.teamId === tileBlitz.bonusBuzzTeamId)?.teamName} — Bonus
                  Attempt
                </p>
              </div>
              {/* Bonus countdown timer */}
              {tileBlitz.bonusTimerStartTime !== null &&
                tileBlitz.bonusTimerDurationMs !== null && (
                  <div className="flex items-center gap-3">
                    <TimerBar
                      startTime={tileBlitz.bonusTimerStartTime}
                      durationMs={tileBlitz.bonusTimerDurationMs}
                    />
                    <span className="font-mono text-3xl font-bold">
                      <TimerCountdown
                        startTime={tileBlitz.bonusTimerStartTime}
                        durationMs={tileBlitz.bonusTimerDurationMs}
                      />
                    </span>
                  </div>
                )}
            </div>
            <div className="flex flex-1 flex-col justify-center">
              <p className="mb-10 text-4xl leading-tight font-bold text-white">{question.text}</p>
              {question.type === QuestionType.MCQ && question.options && (
                <div className="grid grid-cols-2 gap-4">
                  {question.options.map((opt) => (
                    <div
                      key={opt.id}
                      className="bg-surface border-border flex items-center gap-4 rounded-2xl border-2 p-5"
                    >
                      <span className="bg-background flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white">
                        {opt.label}
                      </span>
                      <span className="text-xl text-white">{opt.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── TILE BLITZ: BONUS REVEAL ────────────────────────────────── */}
        {status === SessionStatus.BONUS_REVEAL && tileBlitz?.bonusResult && (
          <motion.div
            key="bonus-reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-8 p-16"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 60 }}
              className={cn(
                'flex h-32 w-32 items-center justify-center rounded-full',
                tileBlitz.bonusResult.isCorrect ? 'bg-correct/20' : 'bg-wrong/20',
              )}
            >
              {tileBlitz.bonusResult.isCorrect ? (
                <CheckCircle2 className="text-correct h-16 w-16" />
              ) : (
                <XCircle className="text-wrong h-16 w-16" />
              )}
            </motion.div>
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center gap-3">
                <div
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: tileBlitz.bonusResult.teamColor }}
                />
                <h2 className="text-5xl font-bold text-white">{tileBlitz.bonusResult.teamName}</h2>
              </div>
              <p
                className={cn(
                  'text-3xl font-bold',
                  tileBlitz.bonusResult.isCorrect ? 'text-correct' : 'text-wrong',
                )}
              >
                {tileBlitz.bonusResult.isCorrect
                  ? `+${tileBlitz.bonusResult.pointsEarned} Bonus Points!`
                  : 'Bonus Wrong'}
              </p>
              {/* Reveal correct answer after wrong bonus */}
              {!tileBlitz.bonusResult.isCorrect && revealData?.correctAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-2 rounded-2xl border border-correct/30 bg-correct/10 px-8 py-3 text-center"
                >
                  <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/30 mb-1">Correct Answer</p>
                  <p className="text-3xl font-black text-correct">{revealData.correctAnswer}</p>
                </motion.div>
              )}
            </div>
            {/* Updated round scores */}
            <div className="flex justify-center gap-4">
              {roundScores
                .slice()
                .sort((a, b) => b.displayScore - a.displayScore)
                .map((s) => (
                  <div
                    key={s.teamId}
                    className="bg-surface border-border flex items-center gap-2 rounded-xl border px-4 py-2"
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.teamColor }}
                    />
                    <span className="text-sm text-white">{s.teamName}</span>
                    <span className="text-blitz-accent font-bold tabular-nums">
                      {s.displayScore}
                    </span>
                  </div>
                ))}
            </div>
          </motion.div>
        )}

        {/* ── ULTIMATE CHALLENGE: TEAM SELECT ─────────────────────────── */}
        {status === SessionStatus.UC_TEAM_SELECT && (
          <motion.div
            key="uc-team-select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-8 p-16"
          >
            <div className="text-center">
              <p className="text-correct mb-3 text-lg tracking-widest uppercase">
                Ultimate Challenge
              </p>
              <h2 className="mb-4 text-6xl font-bold text-white">Team Select</h2>
              <p className="text-text-muted text-xl">The moderator is selecting the next team...</p>
            </div>
            {/* Scoreboard preview */}
            <div className="flex flex-wrap justify-center gap-6">
              {scores.map((s) => (
                <div
                  key={s.teamId}
                  className="bg-surface border-border flex min-w-40 flex-col items-center gap-2 rounded-2xl border px-8 py-6"
                >
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: s.teamColor }} />
                  <p className="text-center text-lg font-bold text-white">{s.teamName}</p>
                  <p className="text-blitz-accent text-2xl font-bold">{s.score}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── ULTIMATE CHALLENGE: ACTIVE ───────────────────────────────── */}

        {status === SessionStatus.UC_ACTIVE && ucState && (
          <motion.div
            key="uc-active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1"
          >
            <UCRaceScreen
              teams={ucState.teams}
              currentQuestion={ucState.currentQuestion}
              timeLeft={ucTimeLeft}
              lastAction={ucState.lastAction}
              activeTeamName={ucState.teams.find((t) => t.isActive)?.teamName}
            />
          </motion.div>
        )}

        {/* ── CLUE REVEAL: CLUE OPEN ──────────────────────────────────── */}
        {(status === SessionStatus.CLUE_OPEN || status === SessionStatus.CLUE_ANSWERING) &&
          clueState && (
            <motion.div
              key="clue-open"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col gap-8 p-12"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-text-secondary text-sm tracking-widest uppercase">
                    Clue Reveal — Question {clueState.questionIndex + 1}/{clueState.totalQuestions}
                  </span>
                  <span className="text-blitz-accent text-lg font-bold">
                    {clueState.pointsAvailable} pts available
                  </span>
                </div>

                {/* ⏱ Timer Display */}
                {(status === SessionStatus.CLUE_OPEN || status === SessionStatus.CLUE_ANSWERING) && (
                  <div
                    className={cn(
                      'rounded-xl px-6 py-2 font-mono text-3xl font-bold',
                      status === SessionStatus.CLUE_ANSWERING
                        ? 'bg-timer-warning/20 text-timer-warning'
                        : clueTimeLeft <= 5
                          ? 'bg-wrong/20 text-wrong'
                          : 'bg-surface text-white',
                    )}
                  >
                    {status === SessionStatus.CLUE_OPEN ? clueTimeLeft : answeringTimeLeft}s
                  </div>
                )}

                <div className="flex gap-2">
                  {Array.from({ length: clueState.clues.length }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-2 w-8 rounded-full transition-colors',
                        i <= clueState.currentClueIndex ? 'bg-blitz-accent' : 'bg-surface',
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Clue text */}
              {/* <AnimatePresence mode="wait">
                <motion.div
                  key={clueState.currentClueIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ type: 'spring', stiffness: 80 }}
                  className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
                >
                  <p className="text-text-muted text-lg tracking-widest uppercase">
                    Clue {clueState.currentClueIndex + 1}
                  </p>
                  <h2 className="max-w-4xl text-5xl leading-tight font-bold text-white">
                    {clueState.currentClueText}
                  </h2>
                </motion.div>
              </AnimatePresence> */}

              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                <p className="text-text-muted text-lg tracking-widest uppercase">
                  Clue {clueState.currentClueIndex + 1}
                </p>

                <div className="flex max-w-4xl flex-col gap-4">
                  {revealedClues?.map((clue, index) => {
                    const isLatest = index === clueState.currentClueIndex

                    return (
                      <AnimatePresence key={index}>
                        {isLatest ? (
                          <motion.h2
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-5xl leading-tight font-bold text-white"
                          >
                            {clue}
                          </motion.h2>
                        ) : (
                          <p className="text-text-muted text-2xl opacity-60">{clue}</p>
                        )}
                      </AnimatePresence>
                    )
                  })}
                </div>
              </div>

              {/* Buzzing team highlight */}
              {status === SessionStatus.CLUE_ANSWERING && clueState.buzzingTeamId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mx-auto flex items-center justify-center gap-4 rounded-2xl border-2 px-8 py-4"
                  style={{ borderColor: clueState.buzzingTeamColor ?? '#888' }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: clueState.buzzingTeamColor ?? '#888' }}
                  />
                  <span className="text-2xl font-bold text-white">
                    {clueState.buzzingTeamName} is answering...
                  </span>
                </motion.div>
              )}

              {/* Score strip */}
              <div className="flex justify-center gap-4">
                {clueState.scores.map((s) => {
                  const isLocked = clueState.lockedTeamIds.includes(s.teamId)
                  return (
                    <div
                      key={s.teamId}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-4 py-2 transition-opacity',
                        isLocked ? 'border-wrong opacity-40' : 'border-border',
                        s.teamId === clueState.buzzingTeamId && 'border-current',
                      )}
                      style={
                        s.teamId === clueState.buzzingTeamId ? { borderColor: s.teamColor } : {}
                      }
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.teamColor }}
                      />
                      <span className="text-sm font-medium text-white">{s.teamName}</span>
                      {isLocked && <span className="text-wrong text-xs">locked</span>}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

        {/* ── ROUND SUMMARY ───────────────────────────────────────────── */}
        {status === SessionStatus.ROUND_SUMMARY && roundSummary && (
          <motion.div key="rsummary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
            <RoundSummaryScreen
              roundName={roundSummary.roundName ?? undefined}
              standings={Object.entries(roundSummary.roundPoints)
                .sort(([, a], [, b]) => b - a)
                .map(([teamId, pts]) => {
                  const s = roundSummary.teamScores.find((t) => t.teamId === teamId)
                  return { teamId, teamName: s?.teamName ?? teamId, teamColor: s?.teamColor ?? '#888', roundPoints: pts, totalScore: s?.score ?? 0 }
                })}
              audienceStats={roundSummary.audienceStats}
              audienceLeaderboard={roundSummary.audienceLeaderboard}
            />
          </motion.div>
        )}

        {/* ── CUMULATIVE REVEAL ────────────────────────────────────────── */}
        {status === SessionStatus.CUMULATIVE_REVEAL && cumulativeData && (
          <motion.div key="cumulative" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
            <CumulativeScreen
              finalScores={cumulativeData.finalScores}
              audienceLeaderboard={cumulativeData.audienceLeaderboard}
            />
          </motion.div>
        )}

        {/* ── SESSION END: WINNER ─────────────────────────────────────── */}
        {status === SessionStatus.SESSION_END && sessionEndData && !showGoodbye && (
          <motion.div key="end-winner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
            <WinnerScreen
              finalScores={sessionEndData.finalScores}
              audienceWinner={sessionEndData.audienceWinner}
              audienceStats={sessionEndData.audienceStats}
            />
          </motion.div>
        )}

        {/* ── SESSION END: GOODBYE ─────────────────────────────────────── */}
        {status === SessionStatus.SESSION_END && showGoodbye && (
          <motion.div key="end-goodbye" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
            <GoodbyeScreen winner={sessionEndData?.finalScores[0]} />
          </motion.div>
        )}
      </AnimatePresence>

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
