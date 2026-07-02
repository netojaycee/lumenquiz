'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionId } from '@/hooks/useSessionId'
import Link from 'next/link'
import {
  ArrowLeft, Trophy, Users, Download, ChevronDown, ChevronRight,
  Loader2, AlertCircle, Medal, CheckCircle, XCircle, Target,
  Clock, Hash
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamAnswerDetail {
  teamId: string
  teamName: string
  teamColor: string
  submittedAnswer: string
  isCorrect: boolean
  pointsEarned: number
  timeRemaining: number
  submittedAt: string
}

interface QuestionDetail {
  id: string
  order: number
  text: string
  type: string
  correctAnswer: string
  points: number
  options: { label: string; text: string; isCorrect: boolean }[]
  teamAnswers: TeamAnswerDetail[]
}

interface RoundDetail {
  id: string
  name: string | null
  gameMode: string
  order: number
  timerSeconds: number
  pointsPerQuestion: number
  questions: QuestionDetail[]
}

interface TeamResult {
  teamId: string
  teamName: string
  teamColor: string
  totalScore: number
  roundScores: Record<string, number>
  rank: number | null
  answeredCorrect: number
  answeredWrong: number
  unanswered: number
  fastestAnswerMs: number | null
  accuracy: number
}

interface AudienceEntry {
  id: string
  fullName: string
  totalPoints: number
}

interface SessionResults {
  session: {
    id: string
    sessionCode: string | null
    quizName: string
    status: string
    createdAt: string
    endedAt: string | null
  }
  teams: TeamResult[]
  rounds: RoundDetail[]
  audience: {
    totalMembers: number
    leaderboard: AudienceEntry[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function medalIcon(rank: number) {
  if (rank === 0) return <Medal className="h-4 w-4 text-yellow-400" />
  if (rank === 1) return <Medal className="h-4 w-4 text-slate-300" />
  if (rank === 2) return <Medal className="h-4 w-4 text-amber-600" />
  return <span className="text-text-muted font-mono text-sm w-4 text-center">{rank + 1}</span>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function gameModeLabel(mode: string): string {
  const map: Record<string, string> = {
    blitz: 'Blitz',
    tile_blitz: 'Tile Blitz',
    ultimate_challenge: 'Ultimate Challenge',
    clue_reveal: 'Clue Reveal',
  }
  return map[mode] ?? mode
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuestionRow({
  question,
  teams,
}: {
  question: QuestionDetail
  teams: TeamResult[]
}) {
  const [open, setOpen] = useState(false)
  const answeredTeams = new Set(question.teamAnswers.map((a) => a.teamId))
  const correctCount = question.teamAnswers.filter((a) => a.isCorrect).length

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface hover:bg-surface-elevated transition-colors"
      >
        <span className="text-text-muted font-mono text-xs w-5 flex-shrink-0">Q{question.order}</span>
        <span className="flex-1 text-sm text-white line-clamp-1">{question.text}</span>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
          <span className="flex items-center gap-1 text-correct">
            <CheckCircle className="h-3.5 w-3.5" />{correctCount}/{teams.length}
          </span>
          <span className="text-text-muted">{question.points} pts</span>
          {open ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 bg-surface-elevated space-y-3">
              {/* Question info */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-text-muted text-xs">Correct answer:</span>
                <span className="text-correct text-xs font-semibold bg-correct/10 border border-correct/20 rounded px-2 py-0.5">
                  {question.correctAnswer}
                </span>
                {question.options.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 w-full">
                    {question.options.map((o) => (
                      <span
                        key={o.label}
                        className={cn(
                          'text-xs rounded px-2 py-0.5 border',
                          o.isCorrect
                            ? 'bg-correct/10 border-correct/30 text-correct'
                            : 'bg-surface border-border text-text-muted',
                        )}
                      >
                        {o.label}: {o.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Team answers table */}
              <div className="space-y-1.5">
                {teams.map((team) => {
                  const ans = question.teamAnswers.find((a) => a.teamId === team.teamId)
                  if (!ans && !answeredTeams.size) return null
                  return (
                    <div
                      key={team.teamId}
                      className={cn(
                        'grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center rounded-lg px-3 py-2 text-sm',
                        ans?.isCorrect
                          ? 'bg-correct/8 border border-correct/15'
                          : ans
                          ? 'bg-wrong/8 border border-wrong/15'
                          : 'bg-surface border border-border opacity-60',
                      )}
                    >
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.teamColor }} />
                      <span className="text-text-secondary truncate text-xs">{team.teamName}</span>
                      <span className={cn('text-xs font-mono', ans?.isCorrect ? 'text-correct' : 'text-wrong')}>
                        {ans ? `"${ans.submittedAnswer}"` : '—'}
                      </span>
                      {ans && (
                        <>
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatMs(ans.timeRemaining)}
                          </span>
                          <span className={cn('text-xs font-bold', ans.isCorrect ? 'text-correct' : 'text-wrong')}>
                            {ans.isCorrect ? `+${ans.pointsEarned}` : '✗'}
                          </span>
                        </>
                      )}
                      {!ans && <span className="text-xs text-text-muted col-span-2">no answer</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RoundSection({
  round,
  teams,
}: {
  round: RoundDetail
  teams: TeamResult[]
}) {
  const [open, setOpen] = useState(false)
  const roundScore = (team: TeamResult) => team.roundScores[round.id] ?? 0
  const sortedTeams = [...teams].sort((a, b) => roundScore(b) - roundScore(a))
  const topScore = roundScore(sortedTeams[0] ?? teams[0])

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-elevated transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold">{round.name ?? `Round ${round.order}`}</span>
            <Badge variant="default" className="text-xs font-normal">{gameModeLabel(round.gameMode)}</Badge>
            <span className="text-text-muted text-xs">{round.questions.length} question{round.questions.length !== 1 ? 's' : ''}</span>
          </div>
          {/* Mini team bar for this round */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {sortedTeams.map((t) => (
              <span key={t.teamId} className="flex items-center gap-1 text-xs text-text-muted">
                <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: t.teamColor }} />
                {roundScore(t)} pts
              </span>
            ))}
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-text-muted flex-shrink-0" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 py-4 space-y-4">
              {/* Round score bar */}
              <div className="space-y-2">
                <p className="text-text-muted text-xs uppercase tracking-wider">Round Scores</p>
                {sortedTeams.map((team) => {
                  const rs = roundScore(team)
                  const pct = topScore > 0 ? Math.round((rs / topScore) * 100) : 0
                  return (
                    <div key={team.teamId} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.teamColor }} />
                        <span className="text-text-secondary text-xs flex-1">{team.teamName}</span>
                        <span className="text-white text-xs font-mono font-bold">{rs} pts</span>
                      </div>
                      <div className="ml-4 h-1 bg-surface rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: team.teamColor }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Question breakdown */}
              <div className="space-y-2">
                <p className="text-text-muted text-xs uppercase tracking-wider">Questions</p>
                {round.questions.map((q) => (
                  <QuestionRow key={q.id} question={q} teams={teams} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'overview' | 'rounds' | 'audience'

export function ResultsClient(): React.ReactElement {
  const sessionId = useSessionId()
  const router = useRouter()

  const [results, setResults] = useState<SessionResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    if (sessionId === '_') return
    api.get<SessionResults>(`/sessions/${sessionId}/results`)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load results'))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-blitz-accent animate-spin" />
      </div>
    )
  }

  if (error || !results) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-wrong mb-4">
          <AlertCircle className="h-5 w-5" />
          {error ?? 'Results not found'}
        </div>
        <Button variant="ghost" onClick={() => router.push('/host')} size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    )
  }

  const { session, teams, rounds, audience } = results
  const winner = teams[0]
  const maxScore = Math.max(...teams.map((t) => t.totalScore), 1)
  const durationMs = session.endedAt
    ? new Date(session.endedAt).getTime() - new Date(session.createdAt).getTime()
    : null
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'rounds', label: 'Rounds', count: rounds.length },
    { id: 'audience', label: 'Audience', count: audience.totalMembers },
  ]

  return (
    <div className="p-6 max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/host" className="text-text-muted hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{session.quizName}</h1>
              <Badge variant="default">Completed</Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-text-muted text-xs flex-wrap">
              {session.sessionCode && (
                <span className="font-mono">Code: <span className="text-text-secondary">{session.sessionCode}</span></span>
              )}
              <span>·</span>
              <span>{formatDate(session.createdAt)}</span>
              {durationMin && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{durationMin} min
                  </span>
                </>
              )}
              <span>·</span>
              <span>{rounds.length} round{rounds.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/sessions/${sessionId}/results/export`}
          download
          className="flex-shrink-0"
        >
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-blitz-accent text-blitz-accent'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-xs bg-surface-elevated rounded-full px-1.5 py-0.5">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Winner banner */}
          {winner && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl border p-5 flex items-center gap-4"
              style={{
                borderColor: winner.teamColor,
                background: `linear-gradient(135deg, ${winner.teamColor}18 0%, transparent 60%)`,
              }}
            >
              <Trophy className="h-10 w-10 flex-shrink-0" style={{ color: winner.teamColor }} />
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wider font-medium mb-0.5">Winner</p>
                <p className="text-white text-2xl font-bold">{winner.teamName}</p>
                <p className="text-text-secondary text-sm mt-0.5">
                  {winner.totalScore} pts · {winner.answeredCorrect} correct · {winner.accuracy}% accuracy
                </p>
              </div>
            </motion.div>
          )}

          {/* Team standings */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Final Standings</h2>
            <div className="space-y-3">
              {teams.map((team, i) => {
                const pct = Math.round((team.totalScore / maxScore) * 100)
                return (
                  <motion.div
                    key={team.teamId}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="space-y-1"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-5 flex items-center justify-center">{medalIcon(i)}</span>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.teamColor }} />
                      <span className="text-white font-medium flex-1 truncate">{team.teamName}</span>
                      <div className="flex items-center gap-3 text-xs flex-shrink-0">
                        <span className="text-text-secondary font-mono font-bold">{team.totalScore} pts</span>
                        <span className="flex items-center gap-1 text-correct">
                          <CheckCircle className="h-3 w-3" />{team.answeredCorrect}
                        </span>
                        <span className="flex items-center gap-1 text-wrong">
                          <XCircle className="h-3 w-3" />{team.answeredWrong}
                        </span>
                        <span className="flex items-center gap-1 text-text-muted">
                          <Target className="h-3 w-3" />{team.accuracy}%
                        </span>
                      </div>
                    </div>
                    <div className="ml-8 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: team.teamColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.55, ease: 'easeOut', delay: i * 0.05 + 0.15 }}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Round-by-round matrix */}
          {rounds.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-5 overflow-x-auto">
              <h2 className="text-white font-semibold mb-4">Round Scores</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-text-muted font-normal pb-2 pr-4">Team</th>
                    {rounds.map((r) => (
                      <th key={r.id} className="text-right text-text-muted font-normal pb-2 px-3 whitespace-nowrap">
                        {r.name ?? `R${r.order}`}
                      </th>
                    ))}
                    <th className="text-right text-white font-semibold pb-2 pl-4">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teams.map((team) => (
                    <tr key={team.teamId}>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.teamColor }} />
                          <span className="text-text-secondary">{team.teamName}</span>
                        </div>
                      </td>
                      {rounds.map((r) => (
                        <td key={r.id} className="text-right text-text-secondary py-2 px-3 font-mono">
                          {team.roundScores[r.id] ?? 0}
                        </td>
                      ))}
                      <td className="text-right text-white font-bold py-2 pl-4 font-mono">{team.totalScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Session stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Questions played', value: rounds.reduce((sum, r) => sum + r.questions.length, 0), icon: Hash },
              { label: 'Teams', value: teams.length, icon: Users },
              { label: 'Audience', value: audience.totalMembers, icon: Users },
              { label: 'Duration', value: durationMin ? `${durationMin} min` : '—', icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-1">
                <Icon className="h-4 w-4 text-text-muted" />
                <span className="text-white text-xl font-bold">{value}</span>
                <span className="text-text-muted text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROUNDS TAB */}
      {tab === 'rounds' && (
        <div className="space-y-3">
          {rounds.length === 0 ? (
            <p className="text-text-muted text-sm">No round data available.</p>
          ) : (
            rounds.map((round) => (
              <RoundSection key={round.id} round={round} teams={teams} />
            ))
          )}
        </div>
      )}

      {/* AUDIENCE TAB */}
      {tab === 'audience' && (
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Audience Leaderboard</h2>
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Users className="h-4 w-4" />
              <span>{audience.totalMembers} participants</span>
            </div>
          </div>

          {audience.leaderboard.length === 0 ? (
            <p className="text-text-muted text-sm">No audience participated.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_auto] gap-3 text-text-muted text-xs uppercase tracking-wider font-medium px-1 mb-2">
                <span className="w-6 text-center">#</span>
                <span>Name</span>
                <span>Points</span>
              </div>
              {audience.leaderboard.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className={`grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2.5 rounded-lg ${i === 0 ? 'bg-yellow-400/10 border border-yellow-400/20' : 'bg-surface-elevated'}`}
                >
                  <span className={`w-6 text-center font-mono text-sm ${i === 0 ? 'text-yellow-400 font-bold' : 'text-text-muted'}`}>{i + 1}</span>
                  <span className={`text-sm truncate ${i === 0 ? 'text-white font-semibold' : 'text-text-secondary'}`}>{entry.fullName}</span>
                  <span className="font-mono text-sm text-text-secondary">{entry.totalPoints} pts</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
