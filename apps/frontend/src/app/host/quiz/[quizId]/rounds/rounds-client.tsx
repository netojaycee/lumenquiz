'use client'
import { useState } from 'react'
import { useQuizId } from '@/hooks/useQuizId'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { Dialog } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useHostStore } from '@/stores/useHostStore'
import { cn } from '@/lib/utils'
import type { Round } from '@apoquiz/shared-types'
import { GameMode } from '@apoquiz/shared-types'

// ─── Game mode metadata ───────────────────────────────────────────────────────

interface ModeInfo {
  label: string
  icon: string
  description: string
  rules: string[]
  defaultTimer: number
  defaultPts: number
  phase: 1 | 2
  isAvailable: boolean
}

const MODES: Record<GameMode, ModeInfo> = {
  [GameMode.BLITZ]: {
    label: 'Blitz',
    icon: '⚡',
    description: 'All teams race simultaneously. Speed is rewarded with more points.',
    rules: [
      'All teams see the question at the same time',
      'Answer faster to earn more points',
      'Wrong or no answer = 0 points',
    ],
    defaultTimer: 30,
    defaultPts: 10,
    phase: 1,
    isAvailable: true,
  },
  [GameMode.TILE_BLITZ]: {
    label: 'Tile Blitz',
    icon: '🎯',
    description: 'Teams take turns choosing questions from a grid. Wrong answers open a bonus buzz-in for rivals.',
    rules: [
      'Teams play in rotating order — one active team per turn',
      'Moderator picks a tile from the grid for the active team',
      'Active team changes their MCQ selection freely until time runs out',
      'Wrong answer? Moderator opens a bonus — first to buzz wins a chance',
      'Correct bonus = bonus points; wrong bonus = answer revealed',
    ],
    defaultTimer: 30,
    defaultPts: 10,
    phase: 1,
    isAvailable: true,
  },
  [GameMode.ULTIMATE_CHALLENGE]: {
    label: 'Ultimate Challenge',
    icon: '🎤',
    description: 'Teams answer rapid-fire verbal questions one at a time. The moderator marks answers correct or skips. Speed and pressure win.',
    rules: [
      'Moderator selects which team goes first',
      'Questions display one at a time on screen',
      'Team shouts answers verbally — no device input needed',
      'Moderator clicks "Correct" to award points and show next question',
      'Moderator clicks "Skip" to cycle the question to the end of the queue',
      'No penalty for wrong answers — keep trying until time runs out',
      'Round ends when time expires or all questions are answered correctly',
    ],
    defaultTimer: 60,
    defaultPts: 5,
    phase: 1,
    isAvailable: true,
  },
  [GameMode.STEAL]: {
    label: 'The Steal',
    icon: '🔔',
    description: 'One team on the hot seat. Others can steal if they get it wrong.',
    rules: [
      'One team answers first (30s)',
      'Wrong answer opens a steal window (10s)',
      'Steal correct = full points, -1 to original',
    ],
    defaultTimer: 30,
    defaultPts: 10,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.HOT_SEAT]: {
    label: 'Hot Seat',
    icon: '🪑',
    description: 'Each team faces their own question. No competition per question.',
    rules: [
      'Teams take turns — each gets their own question',
      'No other teams can answer',
      'Pass once per round = 0 pts',
    ],
    defaultTimer: 45,
    defaultPts: 10,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.CLUE_REVEAL]: {
    label: 'Clue Reveal',
    icon: '🔍',
    description: 'The answer emerges slowly. Early buzz = more points.',
    rules: [
      '3–5 clues per question revealed one at a time',
      'Buzz in when you know',
      'Earlier correct = more points; wrong = locked out',
    ],
    defaultTimer: 15,
    defaultPts: 10,
    phase: 1,
    isAvailable: true,
  },
  [GameMode.LIGHTNING]: {
    label: 'Lightning Round',
    icon: '⚡',
    description: 'One team. One timer. Questions fire rapidly.',
    rules: [
      'One selected team answers as many as possible',
      'Total round timer (not per question)',
      'Correct → next question immediately',
    ],
    defaultTimer: 90,
    defaultPts: 5,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.TRUE_FALSE_BLITZ]: {
    label: 'True/False Blitz',
    icon: '✅',
    description: 'Pure instinct. Everyone answers True or False.',
    rules: [
      'All teams answer simultaneously',
      '10s window per question',
      'Fixed 1 point per correct answer',
    ],
    defaultTimer: 10,
    defaultPts: 1,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.WAGER]: {
    label: 'Wager Round',
    icon: '🎰',
    description: 'Risk. Reward. Drama. Wager before the question is shown.',
    rules: [
      'Teams see category and difficulty only before wagering',
      'Secret wager 1–5 points',
      'Correct = gain wager; wrong = lose wager',
    ],
    defaultTimer: 30,
    defaultPts: 5,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.DUEL]: {
    label: 'One-on-One Duel',
    icon: '⚔️',
    description: 'Two teams head to head. First correct answer wins.',
    rules: [
      'Admin selects two teams to duel',
      'First correct answer wins the question',
      'Best of N questions wins the duel',
    ],
    defaultTimer: 20,
    defaultPts: 15,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.ELIMINATION]: {
    label: 'Elimination',
    icon: '🚪',
    description: 'Wrong answers earn strikes. Last team standing wins.',
    rules: [
      'All teams answer simultaneously',
      'Wrong answer = one strike',
      'Configurable strikes before elimination (default: 2)',
    ],
    defaultTimer: 20,
    defaultPts: 10,
    phase: 2,
    isAvailable: false,
  },
  [GameMode.PICTURE]: {
    label: 'Picture Round',
    icon: '🖼️',
    description: 'An image shown on all screens. Identify it.',
    rules: ['Full-screen image shown to all', 'Open answer validation', 'Time decay scoring'],
    defaultTimer: 45,
    defaultPts: 10,
    phase: 2,
    isAvailable: false,
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoundFormState {
  name: string
  gameMode: GameMode
  questionCount: number
  timerSeconds: number
  pointsPerQuestion: number
  bonusPointsPerQuestion: number
}

const AVAILABLE_MODES = Object.fromEntries(
  Object.entries(MODES).filter(([, m]) => m.isAvailable),
) as Partial<Record<GameMode, ModeInfo>>

function defaultForm(mode = GameMode.BLITZ): RoundFormState {
  const safeMode = AVAILABLE_MODES[mode] ? mode : GameMode.BLITZ

  const m = MODES[safeMode]
  return {
    name: '',
    gameMode: safeMode,
    questionCount: 5,
    timerSeconds: m.defaultTimer,
    pointsPerQuestion: m.defaultPts,
    bonusPointsPerQuestion: 5,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoundsClient(): React.ReactElement {
  const quizId = useQuizId()
  const { currentQuiz, loadQuiz } = useHostStore()
  const quiz = currentQuiz?.id === quizId ? currentQuiz : null
  const rounds = (quiz?.rounds ?? []).filter((r) => !r.deletedAt).sort((a, b) => a.order - b.order)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editRound, setEditRound] = useState<Round | null>(null)
  const [form, setForm] = useState<RoundFormState>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reordering, setReordering] = useState(false)

  function refresh() {
    if (quizId !== '_') loadQuiz(quizId).catch(() => {})
  }

  function openAdd() {
    setEditRound(null)
    setForm(defaultForm())
    setFormError(null)
    setSheetOpen(true)
  }

  function openEdit(round: Round) {
    setEditRound(round)
    setForm({
      name: round.name ?? '',
      gameMode: round.gameMode as GameMode,
      questionCount: round.questionCount,
      timerSeconds: round.timerSeconds,
      pointsPerQuestion: round.pointsPerQuestion,
      bonusPointsPerQuestion: round.bonusPointsPerQuestion ?? 5,
    })
    setFormError(null)
    setSheetOpen(true)
  }

  function onModeChange(mode: GameMode) {
    const m = MODES[mode]
    setForm((f) => ({
      ...f,
      gameMode: mode,
      timerSeconds: m.defaultTimer,
      pointsPerQuestion: m.defaultPts,
      bonusPointsPerQuestion: mode === GameMode.TILE_BLITZ ? 5 : f.bonusPointsPerQuestion,
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const payload = {
      name: form.name.trim() || undefined,
      gameMode: form.gameMode,
      questionCount: Number(form.questionCount),
      timerSeconds: Number(form.timerSeconds),
      pointsPerQuestion: Number(form.pointsPerQuestion),
      bonusPointsPerQuestion: Number(form.bonusPointsPerQuestion),
    }
    try {
      if (editRound) {
        await api.patch<Round>(`/quiz/${quizId}/rounds/${editRound.id}`, payload)
      } else {
        await api.post<Round>(`/quiz/${quizId}/rounds`, payload)
      }
      setSheetOpen(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save round')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(roundId: string) {
    setDeleting(true)
    try {
      await api.delete<unknown>(`/quiz/${quizId}/rounds/${roundId}`)
      setDeleteId(null)
      refresh()
    } catch {
      // stay open
    } finally {
      setDeleting(false)
    }
  }

  async function handleReorder(roundId: string, dir: 'up' | 'down') {
    const ids = rounds.map((r) => r.id)
    const idx = ids.indexOf(roundId)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === ids.length - 1) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
    setReordering(true)
    try {
      await api.put<unknown>(`/quiz/${quizId}/rounds/reorder`, { ids })
      refresh()
    } finally {
      setReordering(false)
    }
  }

  const selectedMode = MODES[form.gameMode]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Rounds</h2>
            <p className="text-text-muted mt-0.5 text-sm">
              {rounds.length} round{rounds.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Round
          </Button>
        </div>

        {rounds.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <BookOpen className="text-text-muted mx-auto mb-3 h-8 w-8" />
            <p className="text-text-muted text-sm">No rounds yet.</p>
            <Button size="sm" className="mt-3" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Round
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rounds.map((round, i) => {
              const info = MODES[round.gameMode as GameMode]
              const qCount = round.questions?.length ?? round.questionCount
              return (
                <div
                  key={round.id}
                  className="border-border bg-surface group flex items-center gap-3 rounded-xl border p-4"
                >
                  {/* Reorder */}
                  <div className="flex flex-shrink-0 flex-col gap-0.5">
                    <button
                      onClick={() => handleReorder(round.id, 'up')}
                      disabled={i === 0 || reordering}
                      className="text-text-muted p-0.5 transition-colors hover:text-white disabled:opacity-20"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleReorder(round.id, 'down')}
                      disabled={i === rounds.length - 1 || reordering}
                      className="text-text-muted p-0.5 transition-colors hover:text-white disabled:opacity-20"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Mode icon */}
                  <span className="flex-shrink-0 text-xl">{info?.icon ?? '?'}</span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {round.name ? round.name : `Round ${round.order}`}
                      </span>
                      {info?.phase === 2 && (
                        <span className="text-text-muted border-border rounded border px-1 text-xs">
                          Phase 2
                        </span>
                      )}
                    </div>
                    <p className="text-text-muted mt-0.5 text-xs">
                      {info?.label} · {qCount} Q · {round.timerSeconds}s · {round.pointsPerQuestion}{' '}
                      pts
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(round)}
                      className="text-text-muted p-1.5 transition-colors hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(round.id)}
                      className="text-text-muted hover:text-wrong p-1.5 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add/Edit sheet */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editRound ? 'Edit Round' : 'Add Round'}
        description={editRound ? 'Update round settings' : 'Add a new round to this quiz'}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="round-name">Round Name</Label>
            <Input
              id="round-name"
              placeholder="e.g. Opening Round (optional)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          {/* Game mode selector */}
          <div className="space-y-1.5">
            <Label htmlFor="game-mode">Game Mode</Label>
            <select
              id="game-mode"
              value={form.gameMode}
              onChange={(e) => onModeChange(e.target.value as GameMode)}
              className={cn(
                'border-border bg-surface w-full rounded-lg border px-3 py-2 text-sm text-white',
                'focus:ring-blitz-accent/50 focus:border-blitz-accent focus:ring-2 focus:outline-none',
              )}
            >
              {/* {(Object.entries(MODES) as [GameMode, ModeInfo][]).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.icon} {info.label}
                  {info.phase === 2 ? ' (Phase 2)' : ''}
                </option>
              ))} */}

              {(Object.entries(MODES) as [GameMode, ModeInfo][])
                .filter(([, info]) => info.isAvailable)
                .map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.icon} {info.label}
                  </option>
                ))}
            </select>

            {/* Mode info card */}
            {selectedMode && (
              <div className="bg-surface-elevated border-border mt-2 rounded-lg border p-3 text-xs">
                <p className="text-text-secondary mb-2">{selectedMode.description}</p>
                <ul className="space-y-1">
                  {selectedMode.rules.map((rule, i) => (
                    <li key={i} className="text-text-muted flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Numeric settings */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-count">Questions</Label>
              <Input
                id="q-count"
                type="number"
                min={1}
                max={50}
                value={form.questionCount}
                onChange={(e) => setForm((f) => ({ ...f, questionCount: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timer">Timer (s)</Label>
              <Input
                id="timer"
                type="number"
                min={5}
                max={300}
                value={form.timerSeconds}
                onChange={(e) => setForm((f) => ({ ...f, timerSeconds: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pts">Points</Label>
              <Input
                id="pts"
                type="number"
                min={1}
                max={100}
                value={form.pointsPerQuestion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pointsPerQuestion: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          {/* Tile Blitz: bonus points config */}
          {form.gameMode === GameMode.TILE_BLITZ && (
            <div className="space-y-1.5">
              <Label htmlFor="bonus-pts">Bonus Points (per correct buzz-in)</Label>
              <Input
                id="bonus-pts"
                type="number"
                min={1}
                max={100}
                value={form.bonusPointsPerQuestion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bonusPointsPerQuestion: Number(e.target.value) }))
                }
              />
            </div>
          )}

          {formError && (
            <div className="text-wrong flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editRound ? 'Save Changes' : 'Add Round'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Sheet>

      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Round?"
        description="All questions in this round will also be deleted."
      >
        <div className="flex gap-3">
          <Button
            variant="destructive"
            disabled={deleting}
            className="flex-1"
            onClick={() => deleteId && handleDelete(deleteId)}
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Delete Round
          </Button>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  )
}
