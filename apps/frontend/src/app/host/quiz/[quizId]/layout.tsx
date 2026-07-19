'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuizId } from '@/hooks/useQuizId'
import Link from 'next/link'
import { ArrowLeft, Rocket, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useHostStore } from '@/stores/useHostStore'
import { useQuizValidation } from '@/hooks/useQuizValidation'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { QuizStatus, type Session } from '@apoquiz/shared-types'

const TABS = [
  { label: 'Overview',  path: '' },
  { label: 'Teams',     path: '/teams' },
  { label: 'Rounds',    path: '/rounds' },
  { label: 'Questions', path: '/questions' },
  { label: 'Settings',  path: '/settings' },
]

export default function QuizWorkspaceLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const quizId  = useQuizId()
  const pathname = usePathname()
  const router  = useRouter()

  const { currentQuiz, loadQuiz, setCurrentSession } = useHostStore()
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!quizId || quizId === '_') return
    setLoadError(null)
    loadQuiz(quizId).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Failed to load quiz')
    })
  }, [quizId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show load error in place of children
  if (loadError) {
    return (
      <div className="min-h-full flex flex-col">
        <div className="border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/host" className="text-text-muted hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-white font-bold">Quiz</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-2 text-wrong text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {loadError}
          </div>
        </div>
      </div>
    )
  }

  const quizForValidation = currentQuiz?.id === quizId ? currentQuiz : null
  const { warnings, canLaunch } = useQuizValidation(quizForValidation)

  async function handleLaunch() {
    setLaunching(true)
    setLaunchError(null)
    try {
      const session = await api.post<Session>(`/quiz/${quizId}/sessions`, {})
      setCurrentSession(session)
      router.push(`/host/live/${session.id}`)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to launch quiz')
    } finally {
      setLaunching(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quizSession = (currentQuiz as any)?.sessions?.[0] as { id: string; status: string } | undefined

  const isCompleted  = currentQuiz?.status === QuizStatus.COMPLETED
  const isActive     = currentQuiz?.status === QuizStatus.ACTIVE

  const baseHref = `/host/quiz/${quizId}`

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Workspace header ── */}
      <div className="border-b border-border bg-surface px-4 py-4 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/host" className="text-text-muted hover:text-white transition-colors flex-shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white truncate">
                {currentQuiz?.id === quizId ? currentQuiz.name : 'Loading...'}
              </h1>
              <p className="text-text-muted text-xs capitalize">
                {currentQuiz?.id === quizId ? currentQuiz.status : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {launchError && (
              <span className="flex items-center gap-1 text-wrong text-xs">
                <AlertTriangle className="h-3 w-3" />
                {launchError}
              </span>
            )}
            {isCompleted ? (
              <Button
                variant="outline"
                onClick={() => quizSession && router.push(`/host/results/${quizSession.id}`)}
              >
                View Results
              </Button>
            ) : isActive && quizSession ? (
              <Button onClick={() => router.push(`/host/live/${quizSession.id}`)}>
                <Rocket className="h-4 w-4 mr-2" />
                Continue Live
              </Button>
            ) : (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span needed so tooltip fires on disabled buttons */}
                    <span>
                      <Button
                        onClick={handleLaunch}
                        disabled={launching || !canLaunch}
                      >
                        {launching
                          ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          : <Rocket className="h-4 w-4 mr-2" />}
                        Launch Quiz
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canLaunch && (
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      <p className="font-semibold mb-1">Fix before launching:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {warnings.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
                        {warnings.length > 3 && <li>+{warnings.length - 3} more — see Overview tab</li>}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex gap-0.5 -mb-4 pb-0 overflow-x-auto">
          {TABS.map((tab) => {
            const href = `${baseHref}${tab.path}`
            const isActive = tab.path === ''
              ? (pathname === baseHref || pathname === `${baseHref}/`)
              : (pathname === href || pathname?.startsWith(`${href}/`))
            return (
              <Link
                key={tab.path}
                href={href}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
                  isActive
                    ? 'bg-background text-white border-t border-l border-r border-border -mb-px'
                    : 'text-text-secondary hover:text-white hover:bg-surface-elevated',
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  )
}
