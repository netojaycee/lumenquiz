'use client'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Trophy, Users, Maximize } from 'lucide-react'
import { TimerBar, TimerCountdown } from '@/components/game/TimerBar'
import { cn } from '@/lib/utils'
import { useScreenStore } from '@/stores/useScreenStore'
import { QuestionType } from '@apoquiz/shared-types'
import type { CumulativeScoresPayload } from '@apoquiz/socket-events'

// ─── Shared prop types ────────────────────────────────────────────────────────

export interface RoundScore {
  teamId: string
  teamName: string
  teamColor: string
  score: number
  rank: number
  displayScore: number
  roundScores?: Record<string, number>
}

// ─── LOBBY ───────────────────────────────────────────────────────────────────

interface LobbyProps {
  isFullscreen: boolean
  isSupported: boolean
  enterFullscreen: () => void
}

export function ScreenLobbyPanel({ isFullscreen, isSupported, enterFullscreen }: LobbyProps) {
  const { scores, connectedTeamIds, audienceCount } = useScreenStore()

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="text-center">
          <h1 className="text-8xl font-bold text-white tracking-tight">
            APO<span className="text-blitz-accent">QUIZ</span>
          </h1>
          <p className="text-text-muted text-xl mt-3">Live Bible Quiz Platform</p>
        </div>
        <div className="flex items-center gap-4 text-text-secondary">
          <Users className="h-5 w-5" />
          <span className="text-lg">{audienceCount} audience connected</span>
          {isSupported && !isFullscreen && (
            <button
              onClick={enterFullscreen}
              className="flex items-center gap-1.5 text-sm text-text-muted hover:text-white transition-colors ml-4 border border-border rounded-lg px-3 py-1.5"
            >
              <Maximize className="h-4 w-4" /> Fullscreen
            </button>
          )}
        </div>
      </div>

      {scores.length > 0 && (
        <div className="px-16 pb-12">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${scores.length}, 1fr)` }}>
            {scores.slice().sort((a, b) => a.rank - b.rank).map((s) => {
              const online = connectedTeamIds.includes(s.teamId)
              return (
                <div
                  key={s.teamId}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-surface border transition-colors"
                  style={{ borderColor: online ? s.teamColor : 'var(--border)' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.teamColor }} />
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: online ? '#22C55E' : '#6b7280' }} />
                  </div>
                  <p className="text-white font-bold text-sm text-center">{s.teamName}</p>
                  <p className={online ? 'text-blitz-accent text-xl font-bold' : 'text-text-muted text-sm'}>
                    {online ? `${s.score} pts` : 'not connected'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AUDIENCE VOTE ────────────────────────────────────────────────────────────

const POSITION_MEDALS = ['🥇', '🥈', '🥉']
const POSITION_LABELS = ['1st Place', '2nd Place', '3rd Place']
const POSITION_COLORS = ['#F59E0B', '#9CA3AF', '#CD7F32']

export function ScreenAudienceVotePanel() {
  const { voteData, positionTally, totalVotes } = useScreenStore()
  if (!voteData) return null

  const teams = voteData.teams
  const positions = Array.from({ length: teams.length }, (_, i) => i + 1)

  // For each position, find the team with the most votes at that position
  function getPositionLeader(pos: number): { team: (typeof teams)[0]; votes: number; pct: number } | null {
    let best: (typeof teams)[0] | null = null
    let bestVotes = 0
    for (const t of teams) {
      const v = positionTally[t.id]?.[pos] ?? 0
      if (v > bestVotes) { bestVotes = v; best = t }
    }
    if (!best) return null
    return { team: best, votes: bestVotes, pct: totalVotes > 0 ? (bestVotes / totalVotes) * 100 : 0 }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 gap-10">
      {/* Header */}
      <div className="text-center">
        <p className="text-[#F59E0B] text-sm uppercase tracking-[0.25em] font-bold mb-2">
          Audience Ranking Prediction
        </p>
        <h2 className="text-white text-5xl font-black">
          {voteData.roundName ? `Round ${voteData.roundName}` : 'Who finishes where?'}
        </h2>
        <p className="text-white/40 mt-2 text-lg">Audience is ranking all teams from 1st to last</p>
      </div>

      {/* Position columns */}
      <div
        className="w-full max-w-4xl grid gap-4"
        style={{ gridTemplateColumns: `repeat(${Math.min(positions.length, 3)}, 1fr)` }}
      >
        {positions.slice(0, 3).map((pos) => {
          const leader = getPositionLeader(pos)
          const posColor = POSITION_COLORS[pos - 1] ?? '#6B7280'
          return (
            <div
              key={pos}
              className="rounded-3xl border bg-white/[0.03] p-6 flex flex-col items-center gap-4"
              style={{ borderColor: `${posColor}40` }}
            >
              {/* Position badge */}
              <div className="flex items-center gap-2">
                <span className="text-3xl">{POSITION_MEDALS[pos - 1] ?? `#${pos}`}</span>
                <span className="text-lg font-black" style={{ color: posColor }}>
                  {POSITION_LABELS[pos - 1] ?? `Position ${pos}`}
                </span>
              </div>

              {/* Per-team bars for this position */}
              <div className="w-full space-y-2">
                {teams.map((t) => {
                  const votes = positionTally[t.id]?.[pos] ?? 0
                  const pct = totalVotes > 0 ? (votes / totalVotes) * 100 : 0
                  const isLeading = leader?.team.id === t.id && votes > 0
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="w-24 truncate text-xs font-semibold text-white/70">{t.name}</span>
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-white/[0.06]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: isLeading ? t.color : `${t.color}60` }}
                          animate={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums" style={{ color: isLeading ? posColor : 'rgba(255,255,255,0.3)' }}>
                        {pct > 0 ? `${pct.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Leading team highlight */}
              {leader && (
                <motion.div
                  key={leader.team.id}
                  layout
                  className="w-full rounded-2xl px-4 py-2.5 flex items-center gap-3"
                  style={{ backgroundColor: `${leader.team.color}20`, border: `1px solid ${leader.team.color}50` }}
                >
                  <div className="h-3 w-3 rounded-full animate-pulse" style={{ backgroundColor: leader.team.color }} />
                  <span className="font-black text-white text-sm flex-1 truncate">{leader.team.name}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: leader.team.color }}>
                    {leader.votes} vote{leader.votes !== 1 ? 's' : ''}
                  </span>
                </motion.div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <p className="text-white/30 text-sm tabular-nums">
        {totalVotes} {totalVotes === 1 ? 'prediction' : 'predictions'} submitted
      </p>
    </div>
  )
}

// ─── ROUND INTRO ──────────────────────────────────────────────────────────────

export function ScreenRoundIntroPanel() {
  const { currentRound, roundRules } = useScreenStore()

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-16 text-center">
      <p className="text-blitz-accent uppercase tracking-widest text-lg mb-4">Round Starting</p>
      <h2 className="text-white text-7xl font-bold mb-8">
        {currentRound?.name ?? `Round ${currentRound?.order ?? ''}`}
      </h2>
      {roundRules && roundRules.rules.length > 0 && (
        <div className="max-w-xl bg-surface border border-border rounded-2xl p-6 text-left">
          <p className="text-text-secondary text-sm uppercase tracking-widest mb-3">How it works</p>
          <ul className="space-y-2">
            {roundRules.rules.map((rule, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.12 }}
                className="text-white flex items-start gap-2"
              >
                <span className="text-blitz-accent mt-0.5">▸</span>
                {rule}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── QUESTION OPEN / LOCKED ───────────────────────────────────────────────────

interface QuestionPanelProps {
  roundScores: RoundScore[]
  isTileBlitz: boolean
}

export function ScreenQuestionPanel({ roundScores, isTileBlitz }: QuestionPanelProps) {
  const {
    sessionStatus, currentQuestion, questionIndex, totalQuestions,
    timerData, scores, submittedTeamIds, allAnswered, timerElapsed, tileBlitz,
  } = useScreenStore()

  const question = currentQuestion
  if (!question) return null

  const isLocked = sessionStatus === 'question_locked'

  return (
    <div className="flex-1 flex flex-col p-12">
      <div className="flex items-center gap-6 mb-6">
        {isTileBlitz && tileBlitz ? (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: scores.find(s => s.teamId === tileBlitz.activeQuestionTeamId)?.teamColor }} />
            <span className="text-white font-bold text-lg">{scores.find(s => s.teamId === tileBlitz.activeQuestionTeamId)?.teamName}</span>
            <span className="text-text-muted text-sm">is answering</span>
          </div>
        ) : (
          <span className="text-text-muted text-sm font-mono">{questionIndex + 1} / {totalQuestions}</span>
        )}
        {timerData && !isLocked && (
          <div className="flex items-center gap-3 flex-1">
            <TimerBar startTime={timerData.startTime} durationMs={timerData.durationMs} />
            <span className="text-3xl font-mono font-bold">
              <TimerCountdown startTime={timerData.startTime} durationMs={timerData.durationMs} />
            </span>
          </div>
        )}
        {isLocked && (
          <div className="flex-1">
            <div className="h-2 w-full bg-surface rounded-full">
              <div className="h-full w-0 bg-wrong rounded-full" />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <p className="text-white text-4xl font-bold leading-tight mb-10">{question.text}</p>
        {question.type === QuestionType.MCQ && question.options && (
          <div className="grid grid-cols-2 gap-4">
            {question.options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-4 p-5 rounded-2xl bg-surface border-2 border-border">
                <span className="w-12 h-12 rounded-full bg-background flex items-center justify-center font-bold text-xl text-white">{opt.label}</span>
                <span className="text-white text-xl">{opt.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isTileBlitz ? (
        <div className="mt-8 flex gap-4 justify-center">
          {roundScores.slice().sort((a, b) => b.displayScore - a.displayScore).map((s) => (
            <div key={s.teamId} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.teamColor }} />
              <span className="text-white text-sm">{s.teamName}</span>
              <span className="text-blitz-accent font-bold tabular-nums">{s.displayScore}</span>
            </div>
          ))}
        </div>
      ) : (
        scores.length > 0 && (
          <div className="mt-8 flex items-center gap-4">
            <span className="text-text-muted text-sm">{submittedTeamIds.length}/{scores.length} answered</span>
            <div className="flex gap-2">
              {scores.map((s) => (
                <div
                  key={s.teamId}
                  className={cn('w-3 h-3 rounded-full transition-all duration-300', submittedTeamIds.includes(s.teamId) ? 'scale-125' : 'opacity-30')}
                  style={{ backgroundColor: s.teamColor }}
                  title={s.teamName}
                />
              ))}
            </div>
            {(allAnswered || timerElapsed) && (
              <span className={cn('text-sm font-semibold', allAnswered ? 'text-correct' : 'text-wrong')}>
                {allAnswered ? '✓ All answered' : "⏰ Time's up"}
              </span>
            )}
          </div>
        )
      )}
    </div>
  )
}

// ─── ANSWER REVEAL ────────────────────────────────────────────────────────────

export function ScreenAnswerRevealPanel({ roundScores, isTileBlitz }: QuestionPanelProps) {
  const { revealData } = useScreenStore()
  if (!revealData) return null

  return (
    <div className="flex-1 flex flex-col p-12">
      {isTileBlitz ? (
        <>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-white text-3xl font-bold">Answer Revealed</h2>
            <div className="px-4 py-2 rounded-xl bg-surface border border-border">
              <span className="text-text-secondary text-sm">Correct: </span>
              <span className="text-white font-bold">{revealData.correctAnswer}</span>
            </div>
          </div>
          {revealData.teamAnswers.map((a) => (
            <motion.div
              key={a.teamId}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring' }}
              className={cn('mx-auto p-8 rounded-3xl border-2 flex flex-col items-center gap-4 text-center max-w-lg w-full', a.isCorrect ? 'border-correct bg-correct/10' : 'border-wrong/40 bg-wrong/5')}
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: a.teamColor }} />
                <span className="text-white text-2xl font-bold">{a.teamName}</span>
              </div>
              <p className="text-text-secondary text-xl italic">&quot;{a.submittedAnswer || '—'}&quot;</p>
              {a.isCorrect ? <CheckCircle2 className="h-16 w-16 text-correct" /> : <XCircle className="h-16 w-16 text-wrong" />}
              {a.isCorrect && <span className="text-correct font-bold text-3xl">+{a.pointsEarned}</span>}
            </motion.div>
          ))}
          <div className="mt-auto pt-8 flex gap-4 justify-center">
            {roundScores.slice().sort((a, b) => b.displayScore - a.displayScore).map((s) => (
              <div key={s.teamId} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.teamColor }} />
                <span className="text-white text-sm">{s.teamName}</span>
                <span className="text-blitz-accent font-bold tabular-nums">{s.displayScore}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-white text-3xl font-bold">Answers</h2>
            <div className="px-4 py-2 rounded-xl bg-surface border border-border">
              <span className="text-text-secondary text-sm">Correct: </span>
              <span className="text-white font-bold">{revealData.correctAnswer}</span>
            </div>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(revealData.teamAnswers.length, 3)}, 1fr)` }}>
            {revealData.teamAnswers.map((a, i) => (
              <motion.div
                key={a.teamId}
                initial={{ opacity: 0, scale: 0.8, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.15, type: 'spring' }}
                className={cn('p-6 rounded-2xl border-2 flex flex-col items-center gap-3 text-center', a.isCorrect ? 'border-correct bg-correct/10' : 'border-wrong/40 bg-wrong/5')}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.teamColor }} />
                  <span className="text-white font-bold">{a.teamName}</span>
                </div>
                <p className="text-text-secondary text-sm italic">&quot;{a.submittedAnswer || '—'}&quot;</p>
                {a.isCorrect ? <CheckCircle2 className="h-8 w-8 text-correct" /> : <XCircle className="h-8 w-8 text-wrong" />}
                {a.isCorrect && <span className="text-correct font-bold text-lg">+{a.pointsEarned}</span>}
              </motion.div>
            ))}
          </div>
          <div className="mt-auto pt-8 flex gap-4 justify-center">
            {revealData.updatedScores.slice().sort((a, b) => a.rank - b.rank).map((s) => (
              <div key={s.teamId} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border">
                <span className="text-text-muted text-xs">#{s.rank}</span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.teamColor }} />
                <span className="text-white text-sm">{s.teamName}</span>
                <span className="text-blitz-accent font-bold">{s.score}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── ROUND SUMMARY ────────────────────────────────────────────────────────────

export function ScreenRoundSummaryPanel() {
  const { roundSummary } = useScreenStore()
  if (!roundSummary) return null

  return (
    <div className="flex-1 flex p-16 gap-12">
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-text-secondary uppercase tracking-widest text-lg mb-2">Round Summary</p>
        <h2 className="text-white text-5xl font-bold mb-8">{roundSummary.roundName ?? 'Round'} Results</h2>
        <div className="space-y-4">
          {Object.entries(roundSummary.roundPoints)
            .sort(([, a], [, b]) => b - a)
            .map(([teamId, pts], i) => {
              const s = roundSummary.teamScores.find(t => t.teamId === teamId)
              if (!s) return null
              return (
                <motion.div
                  key={teamId}
                  initial={{ opacity: 0, x: -60 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.15, type: 'spring', stiffness: 60 }}
                  className="flex items-center gap-6 p-5 rounded-2xl bg-surface border border-border"
                >
                  <span className="text-4xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                  <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: s.teamColor }} />
                  <span className="text-white text-2xl font-bold flex-1">{s.teamName}</span>
                  <div className="text-right">
                    <span className="text-blitz-accent text-3xl font-bold">{pts}</span>
                    <p className="text-text-muted text-xs">this round</p>
                  </div>
                </motion.div>
              )
            })}
        </div>
      </div>

      {roundSummary.audienceLeaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 60 }}
          className="w-72 flex flex-col justify-center"
        >
          <p className="text-timer-warning uppercase tracking-widest text-sm mb-4">Audience Leaderboard</p>
          <div className="space-y-3">
            {roundSummary.audienceLeaderboard.slice(0, 5).map((a) => (
              <div key={a.memberId} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border">
                <span className="text-text-muted text-sm w-5">#{a.rank}</span>
                <span className="text-white text-sm flex-1 truncate">{a.nickname}</span>
                <span className="text-timer-warning font-bold">{a.totalPoints}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── CUMULATIVE REVEAL ────────────────────────────────────────────────────────

export function ScreenCumulativePanel() {
  const { cumulativeData } = useScreenStore()
  if (!cumulativeData) return null

  const data = cumulativeData as CumulativeScoresPayload

  return (
    <div className="flex-1 flex p-16 gap-12">
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-timer-warning uppercase tracking-widest text-lg mb-2">Cumulative Scores</p>
        <h2 className="text-white text-5xl font-bold mb-8">Overall Standings</h2>
        <div className="space-y-4">
          {data.finalScores.slice().sort((a, b) => a.rank - b.rank).map((s, i) => (
            <motion.div
              key={s.teamId}
              initial={{ opacity: 0, x: -60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, type: 'spring', stiffness: 60 }}
              className={cn('flex items-center gap-6 p-5 rounded-2xl border', i === 0 ? 'border-timer-warning bg-timer-warning/10 border-2' : 'bg-surface border-border')}
            >
              <span className="text-4xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${s.rank}`}</span>
              <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: s.teamColor }} />
              <span className="text-white text-2xl font-bold flex-1">{s.teamName}</span>
              <span className="text-blitz-accent text-3xl font-bold tabular-nums">{s.score}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {data.audienceLeaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="w-72 flex flex-col justify-center"
        >
          <p className="text-timer-warning uppercase tracking-widest text-sm mb-4">Audience Leaderboard</p>
          <div className="space-y-3">
            {data.audienceLeaderboard.slice(0, 8).map((a) => (
              <div key={a.memberId} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border">
                <span className="text-text-muted text-sm w-5">#{a.rank}</span>
                <span className="text-white text-sm flex-1 truncate">{a.nickname}</span>
                <span className="text-timer-warning font-bold">{a.totalPoints}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── SESSION END ──────────────────────────────────────────────────────────────

export function ScreenSessionEndPanel() {
  const { sessionEndData } = useScreenStore()
  if (!sessionEndData) return null

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-16">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 60, delay: 0.3 }}>
        <Trophy className="h-24 w-24 text-timer-warning mx-auto mb-6" />
      </motion.div>
      <h1 className="text-white text-7xl font-bold text-center mb-2">{sessionEndData.finalScores[0]?.teamName}</h1>
      <p className="text-timer-warning text-2xl mb-12">WINS!</p>

      <div className="flex gap-6 justify-center">
        {sessionEndData.finalScores.slice(0, 3).map((s, i) => (
          <motion.div
            key={s.teamId}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.15 }}
            className={cn('flex flex-col items-center gap-3 p-6 rounded-2xl border-2', i === 0 ? 'border-timer-warning bg-timer-warning/10' : 'border-border bg-surface')}
            style={{ minWidth: 160 }}
          >
            <span className="text-4xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: s.teamColor }} />
            <span className="text-white font-bold text-lg text-center">{s.teamName}</span>
            <span className="text-blitz-accent text-2xl font-bold">{s.score}</span>
          </motion.div>
        ))}
      </div>

      {sessionEndData.audienceWinner && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }} className="mt-12 text-center">
          <p className="text-text-muted text-sm uppercase tracking-widest mb-1">Audience Winner</p>
          <p className="text-timer-warning text-3xl font-bold">{sessionEndData.audienceWinner.nickname}</p>
          <p className="text-text-secondary">{sessionEndData.audienceWinner.totalPoints} pts</p>
        </motion.div>
      )}
    </div>
  )
}
