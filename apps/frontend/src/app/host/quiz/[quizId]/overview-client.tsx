'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuizId } from '@/hooks/useQuizId'
import { AlertTriangle, CheckCircle2, BookOpen, Users, Clock, Award, Copy, Check, QrCode, Cloud, Wifi, Loader2, XCircle } from 'lucide-react'
import { useHostStore } from '@/stores/useHostStore'
import { useQuizValidation } from '@/hooks/useQuizValidation'
import { Button } from '@/components/ui/button'
import { getBaseUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { QuizStatus } from '@apoquiz/shared-types'

function CodeBox({ label, code, description }: { label: string; code: string | null | undefined; description: string }) {
  const [copied, setCopied] = useState(false)
  if (!code) return null

  function copyCode() {
    void navigator.clipboard.writeText(code!).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-surface border-border rounded-xl border p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-text-muted text-xs mb-1">{label}</p>
        <p className="text-white font-mono text-2xl font-bold tracking-widest">{code}</p>
        <p className="text-text-muted text-xs mt-1">{description}</p>
      </div>
      <button
        onClick={copyCode}
        className="p-2 rounded-lg border border-border hover:border-blitz-accent/40 text-text-muted hover:text-white transition-colors flex-shrink-0"
        title="Copy code"
      >
        {copied ? <Check className="h-4 w-4 text-correct" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function OverviewClient(): React.ReactElement {
  const quizId  = useQuizId()
  const router  = useRouter()
  const { currentQuiz, networkInfo } = useHostStore()

  const [syncing, setSyncing]         = useState(false)
  const [syncResult, setSyncResult]   = useState<{ ok: boolean; text: string } | null>(null)
  const [urlCopied, setUrlCopied]     = useState(false)

  const serverUrl = networkInfo?.joinURL
    ? networkInfo.joinURL.replace(/\/join\/?$/, '')
    : null

    console.log(networkInfo)
  const isCloud = serverUrl?.startsWith('https://')

  const quiz = currentQuiz?.id === quizId ? currentQuiz : null

  const { warnings, canLaunch } = useQuizValidation(quiz)

  if (!quiz) {
    return <div className="text-text-muted text-sm">Loading quiz overview...</div>
  }

  const rounds = quiz.rounds ?? []
  const teams = (quiz.teams ?? []).filter((t) => !t.deletedAt)
  const questions = rounds.flatMap((r) => r.questions ?? [])
  const totalTime = rounds.reduce(
    (acc, r) => acc + r.timerSeconds * (r.questions?.length ?? r.questionCount),
    0,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (quiz as any).sessions?.[0] as { id: string; sessionCode: string | null; status: string } | undefined

  async function handleSyncToCloud() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`${getBaseUrl()}/api/sync/push`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId }),
      })
      const data = await res.json() as { ok: boolean; message?: string; error?: string }
      setSyncResult({ ok: data.ok, text: data.ok ? (data.message ?? 'Synced!') : (data.error ?? 'Sync failed') })
    } catch (err) {
      setSyncResult({ ok: false, text: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setSyncing(false)
    }
  }

  function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s === 0 ? `${m}m` : `${m}m ${s}s`
  }

  function copyUrl() {
    if (!serverUrl) return
    void navigator.clipboard.writeText(serverUrl).then(() => {
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    })
  }

  return (
    <div className="w-full space-y-4">
      {/* Server connection info */}
      {serverUrl && (
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-text-muted text-xs mb-1 flex items-center gap-1.5">
              {isCloud
                ? <Cloud className="h-3 w-3 flex-shrink-0" />
                : <Wifi className="h-3 w-3 flex-shrink-0" />}
              {isCloud ? 'Cloud Server' : 'LAN Address'}
            </p>
            <p className="text-white font-mono text-sm font-semibold truncate">{serverUrl}</p>
            <p className="text-text-muted text-xs mt-0.5">
              {isCloud
                ? 'Participants join via the internet'
                : 'Participants must be on the same Wi-Fi network'}
            </p>
          </div>
          <button
            onClick={copyUrl}
            title="Copy server address"
            className="p-2 rounded-lg border border-border hover:border-blitz-accent/40 text-text-muted hover:text-white transition-colors flex-shrink-0"
          >
            {urlCopied ? <Check className="h-4 w-4 text-correct" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* Session code — shown from day one, permanent */}
      {session?.sessionCode && (
        <div className="space-y-2">
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Session Code — Fixed for this quiz</p>
          <CodeBox
            label="Session Code"
            code={session.sessionCode}
            description="Everyone uses this to join — moderator, audience, and projector screen"
          />
          <p className="text-text-muted text-xs">Team join codes are shown per-team in the Teams tab.</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { icon: BookOpen, label: 'Rounds',    value: rounds.length },
          { icon: Award,    label: 'Questions', value: questions.length },
          { icon: Users,    label: 'Teams',     value: teams.length },
          { icon: Clock,    label: 'Est. Time', value: formatTime(totalTime) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-surface border-border rounded-xl border p-4">
            <Icon className="text-text-muted mb-2 h-4 w-4" />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-text-muted mt-0.5 text-xs">{label}</p>
          </div>
        ))}
      </div>

      {/* Quiz info */}
      <div className="bg-surface border-border space-y-3 rounded-xl border p-5">
        <h2 className="font-semibold text-white">Quiz Details</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-text-muted">Name</span>
            <p className="mt-0.5 text-white">{quiz.name}</p>
          </div>
          <div>
            <span className="text-text-muted">Status</span>
            <p className={cn('mt-0.5 capitalize font-medium', {
              'text-correct': quiz.status === 'completed',
              'text-blitz-accent': quiz.status === QuizStatus.ACTIVE,
              'text-text-secondary': quiz.status === 'draft' || quiz.status === 'ready',
            })}>{quiz.status}</p>
          </div>
          {quiz.date && (
            <div>
              <span className="text-text-muted">Date</span>
              <p className="mt-0.5 text-white">{new Date(quiz.date).toLocaleDateString()}</p>
            </div>
          )}
          {quiz.description && (
            <div className="col-span-2">
              <span className="text-text-muted">Description</span>
              <p className="mt-0.5 text-white">{quiz.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Completed notice */}
      {quiz.status === 'completed' && session && (
        <div className="bg-correct/5 border-correct/20 flex items-center justify-between gap-3 rounded-xl border p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-correct h-5 w-5 flex-shrink-0" />
            <span className="text-correct text-sm font-medium">Quiz completed. Results are saved.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/host/live/${session.id}`)}
          >
            <QrCode className="h-4 w-4 mr-2" />
            View Results
          </Button>
        </div>
      )}

      {/* Warnings / ready state */}
      {quiz.status !== 'completed' && (
        warnings.length > 0 ? (
          <div className="bg-wrong/5 border-wrong/20 rounded-xl border p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="text-wrong h-4 w-4 flex-shrink-0" />
              <span className="text-wrong text-sm font-semibold">Fix before launching</span>
            </div>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-wrong/80 flex items-center gap-2 text-sm">
                  <span className="bg-wrong/60 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-correct/5 border-correct/20 flex items-center gap-3 rounded-xl border p-5">
            <CheckCircle2 className="text-correct h-5 w-5 flex-shrink-0" />
            <span className="text-correct text-sm font-medium">Quiz is ready to launch!</span>
          </div>
        )
      )}

      {/* Rounds summary */}
      {rounds.length > 0 && (
        <div className="bg-surface border-border rounded-xl border p-5">
          <h2 className="mb-3 font-semibold text-white">Rounds</h2>
          <div className="space-y-2">
            {rounds.map((round) => (
              <div
                key={round.id}
                className="border-border flex items-center justify-between border-b py-2 text-sm last:border-0"
              >
                <div>
                  <span className="text-white">{round.name ?? `Round ${round.order}`}</span>
                  <span className="text-text-muted ml-2 capitalize">
                    {round.gameMode.replace('_', ' ')}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-xs',
                    (round.questions?.length ?? round.questionCount) === 0
                      ? 'text-wrong'
                      : 'text-text-muted',
                  )}
                >
                  {round.questions?.length ?? round.questionCount} Q
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 items-center">
        {!canLaunch && quiz.status !== 'completed' && (
          <>
            {teams.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/host/quiz/${quizId}/teams`)}
              >
                <Users className="mr-2 h-4 w-4" />
                Add Teams
              </Button>
            )}
            {rounds.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/host/quiz/${quizId}/rounds`)}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Add Rounds
              </Button>
            )}
          </>
        )}

        {/* Sync to cloud — always available */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={() => void handleSyncToCloud()}
          >
            {syncing
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Cloud className="mr-2 h-4 w-4" />}
            Sync to Cloud
          </Button>
          {syncResult && (
            <span className={cn('text-xs flex items-center gap-1', syncResult.ok ? 'text-correct' : 'text-wrong')}>
              {syncResult.ok
                ? <CheckCircle2 className="h-3 w-3" />
                : <XCircle className="h-3 w-3" />}
              {syncResult.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
