'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, Loader2, AlertCircle, Calendar, Users, BookOpen, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useHostStore } from '@/stores/useHostStore'
import type { Quiz } from '@apoquiz/shared-types'
import { QuizStatus } from '@apoquiz/shared-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizListItem extends Quiz {
  _count?: { rounds: number; teams: number; sessions: number }
}

interface AreaItem {
  id: string
  name: string
  status: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  [QuizStatus.DRAFT]:     'default',
  [QuizStatus.READY]:     'info',
  [QuizStatus.COMPLETED]: 'success',
  [QuizStatus.ACTIVE]: 'warning',
}
const STATUS_LABEL: Record<string, string> = {
  [QuizStatus.DRAFT]:     'Draft',
  [QuizStatus.READY]:     'Ready',
  [QuizStatus.COMPLETED]: 'Completed',
  [QuizStatus.ACTIVE]: 'Live',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HostDashboardPage(): React.ReactElement {
  const router = useRouter()
  const { user } = useHostStore()
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New quiz dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDate, setNewDate] = useState('')
  const [quizScope, setQuizScope] = useState<'national' | 'area'>('national')
  const [quizAreaName, setQuizAreaName] = useState('')
  const [areas, setAreas] = useState<AreaItem[]>([])
  const [areasLoading, setAreasLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Admin area filter
  const [filterArea, setFilterArea] = useState<string>('__national__')

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (area?: string) => {
    setLoading(true)
    setError(null)
    try {
      const query = user?.role === 'ADMIN' && area && area !== '__national__'
        ? `/quiz?area=${encodeURIComponent(area)}`
        : '/quiz'
      const data = await api.get<QuizListItem[]>(query)
      setQuizzes(data.filter((q) => !q.deletedAt))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }, [user?.role])

  useEffect(() => { load(filterArea) }, [load, filterArea])

  function handleAreaFilterChange(value: string) {
    setFilterArea(value)
    if (user?.role === 'ADMIN' && areas.length === 0) {
      fetch('https://api.afmweca.org/afmchurches/api/v1/area')
        .then((r) => r.json())
        .then((json) => { if (json?.data?.data) setAreas(json.data.data) })
        .catch(() => {})
    }
  }

  // Pre-load areas for ADMIN on mount
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetch('https://api.afmweca.org/afmchurches/api/v1/area')
        .then((r) => r.json())
        .then((json) => { if (json?.data?.data) setAreas(json.data.data) })
        .catch(() => {})
    }
  }, [user?.role])

  function openNewDialog() {
    setNewName('')
    setNewDescription('')
    setNewDate('')
    setQuizScope('national')
    setQuizAreaName('')
    setCreateError(null)
    setDialogOpen(true)
    if (user?.role === 'ADMIN' && areas.length === 0) {
      setAreasLoading(true)
      fetch('https://api.afmweca.org/afmchurches/api/v1/area')
        .then((r) => r.json())
        .then((json) => { if (json?.data?.data) setAreas(json.data.data) })
        .catch(() => {})
        .finally(() => setAreasLoading(false))
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) { setCreateError('Quiz name is required'); return }
    if (user?.role === 'ADMIN' && quizScope === 'area' && !quizAreaName) {
      setCreateError('Please select an area')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const areaName =
        user?.role === 'ADMIN'
          ? (quizScope === 'national' ? null : quizAreaName)
          : (user?.areaName ?? null)

      const quiz = await api.post<Quiz>('/quiz', {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        date: newDate || undefined,
        areaName,
      })
      setDialogOpen(false)
      router.push(`/host/quiz/${quiz.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create quiz')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await api.delete<unknown>(`/quiz/${id}`)
      setDeleteId(null)
      setQuizzes((prev) => prev.filter((q) => q.id !== id))
      void load(filterArea)
    } catch {
      // Keep dialog open on error — user can retry
    } finally {
      setDeleting(false)
    }
  }

  function getRoundCount(quiz: QuizListItem): number {
    if (quiz._count) return quiz._count.rounds
    return quiz.rounds?.length ?? 0
  }

  function getTeamCount(quiz: QuizListItem): number {
    if (quiz._count) return quiz._count.teams
    return quiz.teams?.length ?? 0
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Quizzes</h1>
          <p className="text-text-muted text-sm mt-1">Manage your quiz sessions</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'ADMIN' && (
            <select
              value={filterArea}
              onChange={(e) => handleAreaFilterChange(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-blitz-accent/60"
            >
              <option value="__national__">National Quizzes</option>
              {areas.map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          )}
          {/* TODO: remove seed button before final release */}
          {/* <Button variant="ghost" onClick={handleSeed} disabled={seeding} title="Seed sample quiz data (dev only)">
            {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FlaskConical className="h-4 w-4 mr-2" />}
            Seed
          </Button> */}
          <Button onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Quiz
          </Button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-blitz-accent animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-wrong py-8">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <p className="text-text-muted mb-4">No quizzes yet. Create your first one!</p>
          <Button onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Create Quiz
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {quizzes.map((quiz, i) => (
            <motion.div
              key={quiz.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:bg-surface-elevated hover:border-blitz-accent/30 transition-all group"
            >
              <button
                className="flex-1 flex items-center gap-4 text-left min-w-0"
                onClick={() => router.push(`/host/quiz/${quiz.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium truncate">{quiz.name}</span>
                    <Badge variant={STATUS_VARIANT[quiz.status] ?? 'default'}>
                      {STATUS_LABEL[quiz.status] ?? quiz.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-text-muted">
                    {quiz.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(quiz.date).toLocaleDateString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {getRoundCount(quiz)} round{getRoundCount(quiz) !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {getTeamCount(quiz)} team{getTeamCount(quiz) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-white transition-colors flex-shrink-0" />
              </button>

              {/* Delete */}
              <button
                onClick={() => setDeleteId(quiz.id)}
                className="p-2 text-text-muted hover:text-wrong transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Delete quiz"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* New Quiz dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setCreateError(null) }}
        title="New Quiz"
        description="Create a new quiz session"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-name">Quiz Name *</Label>
            <Input
              id="quiz-name"
              placeholder="e.g. Youth Sunday Bible Challenge"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-date">Date</Label>
            <Input
              id="quiz-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="[color-scheme:dark]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-desc">Description</Label>
            <Textarea
              id="quiz-desc"
              placeholder="Optional description..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
            />
          </div>
          {user?.role === 'ADMIN' && (
            <div className="space-y-2">
              <Label>Quiz Type</Label>
              <div className="flex gap-3">
                {(['national', 'area'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setQuizScope(scope)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors capitalize ${
                      quizScope === scope
                        ? 'border-blitz-accent bg-blitz-accent/10 text-white'
                        : 'border-border text-text-secondary hover:text-white hover:border-border/80'
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
              {quizScope === 'area' && (
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-area">Area</Label>
                  <select
                    id="quiz-area"
                    value={quizAreaName}
                    onChange={(e) => setQuizAreaName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-blitz-accent/60 focus:ring-2 focus:ring-blitz-accent/20 disabled:opacity-50"
                    disabled={areasLoading}
                  >
                    <option value="">{areasLoading ? 'Loading areas…' : 'Select an area'}</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {createError && (
            <div className="flex items-center gap-2 text-wrong text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {createError}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={creating} className="flex-1">
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Quiz
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Quiz?"
        description="This action cannot be undone. The quiz and all its rounds, questions, and results will be deleted."
      >
        <div className="flex gap-3">
          <Button
            variant="destructive"
            disabled={deleting}
            className="flex-1"
            onClick={() => deleteId && handleDelete(deleteId)}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
