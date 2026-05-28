'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionId } from '@/hooks/useSessionId'
import Link from 'next/link'
import {
  ArrowLeft, Trophy, Users, Download,
  Loader2, AlertCircle, Medal, CheckCircle, XCircle, Target
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  audience: {
    totalMembers: number
    leaderboard: AudienceEntry[]
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResultsClient(): React.ReactElement {
  const sessionId = useSessionId()
  const router    = useRouter()

  const [results, setResults] = useState<SessionResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

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

  const { session, teams, audience } = results
  const winner = teams[0]
  const maxScore = Math.max(...teams.map((t) => t.totalScore), 1)

  function medalIcon(rank: number) {
    if (rank === 0) return <Medal className="h-4 w-4 text-yellow-400" />
    if (rank === 1) return <Medal className="h-4 w-4 text-slate-300" />
    if (rank === 2) return <Medal className="h-4 w-4 text-amber-600" />
    return <span className="text-text-muted font-mono text-sm w-4 text-center">{rank + 1}</span>
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
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
            <div className="flex items-center gap-3 mt-0.5 text-text-muted text-sm flex-wrap">
              {session.sessionCode && (
                <span className="font-mono">Code: <span className="text-text-secondary">{session.sessionCode}</span></span>
              )}
              <span>·</span>
              <span>{formatDate(session.createdAt)}</span>
              {session.endedAt && (
                <>
                  <span>·</span>
                  <span>Ended {formatDate(session.endedAt)}</span>
                </>
              )}
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

      {/* Winner banner */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
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
            <p className="text-text-secondary text-sm mt-0.5">{winner.totalScore} pts · {winner.accuracy}% accuracy</p>
          </div>
        </motion.div>
      )}

      {/* Team standings */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Team Standings</h2>
        <div className="space-y-3">
          {teams.map((team, i) => {
            const pct = Math.round((team.totalScore / maxScore) * 100)
            return (
              <motion.div
                key={team.teamId}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="space-y-1"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-5 flex items-center justify-center">{medalIcon(i)}</span>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.teamColor }} />
                  <span className="text-white font-medium flex-1 truncate">{team.teamName}</span>
                  <div className="flex items-center gap-4 text-sm flex-shrink-0">
                    <span className="text-text-secondary font-mono font-bold">{team.totalScore} pts</span>
                    <span className="flex items-center gap-1 text-correct">
                      <CheckCircle className="h-3.5 w-3.5" />{team.answeredCorrect}
                    </span>
                    <span className="flex items-center gap-1 text-wrong">
                      <XCircle className="h-3.5 w-3.5" />{team.answeredWrong}
                    </span>
                    <span className="flex items-center gap-1 text-text-muted">
                      <Target className="h-3.5 w-3.5" />{team.accuracy}%
                    </span>
                  </div>
                </div>
                <div className="ml-8 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: team.teamColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.06 + 0.2 }}
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Audience section */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Audience</h2>
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
                transition={{ delay: i * 0.04 }}
                className={`grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2 rounded-lg ${i === 0 ? 'bg-yellow-400/10 border border-yellow-400/20' : 'bg-surface-elevated'}`}
              >
                <span className={`w-6 text-center font-mono text-sm ${i === 0 ? 'text-yellow-400 font-bold' : 'text-text-muted'}`}>{i + 1}</span>
                <span className={`text-sm truncate ${i === 0 ? 'text-white font-semibold' : 'text-text-secondary'}`}>{entry.fullName}</span>
                <span className="font-mono text-sm text-text-secondary">{entry.totalPoints} pts</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
