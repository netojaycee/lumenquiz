'use client'
import { useState, useRef } from 'react'
import { useQuizId } from '@/hooks/useQuizId'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  Loader2, AlertCircle, HelpCircle, Upload, Sparkles,
  CheckCircle2, XCircle, FileSpreadsheet, Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet } from '@/components/ui/sheet'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useHostStore } from '@/stores/useHostStore'
import { cn } from '@/lib/utils'
import type { Question, Round } from '@apoquiz/shared-types'
import { QuestionType, QuestionDifficulty } from '@apoquiz/shared-types'
import { AiGenerateDialog } from './ai-generate-dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MCQOption { label: string; text: string; isCorrect: boolean }

interface ParsedRow {
  row: number
  type: string
  text: string
  correctAnswer: string
  errors: string[]
  options?: Array<{ label: string; text: string; isCorrect: boolean }>
}

interface QuestionFormState {
  type:          QuestionType
  text:          string
  difficulty:    QuestionDifficulty
  points:        number | ''
  correctAnswer: string
  aliases:       string
  clues:         string[]   // ordered clue strings for Clue Reveal mode
  options:       MCQOption[]
}

const EMPTY_OPTIONS: MCQOption[] = [
  { label: 'A', text: '', isCorrect: false },
  { label: 'B', text: '', isCorrect: false },
  { label: 'C', text: '', isCorrect: false },
  { label: 'D', text: '', isCorrect: false },
]

function emptyForm(pointsDefault = 10): QuestionFormState {
  return {
    type: QuestionType.MCQ,
    text: '',
    difficulty: QuestionDifficulty.MEDIUM,
    points: pointsDefault,
    correctAnswer: '',
    aliases: '',
    clues: ['', '', '', ''],
    options: EMPTY_OPTIONS.map((o) => ({ ...o })),
  }
}

const DIFFICULTY_VARIANT: Record<QuestionDifficulty, 'success' | 'warning' | 'error'> = {
  easy:   'success',
  medium: 'warning',
  hard:   'error',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestionsClient(): React.ReactElement {
  const quizId  = useQuizId()
  const { currentQuiz, loadQuiz } = useHostStore()
  const quiz   = currentQuiz?.id === quizId ? currentQuiz : null
  const rounds = (quiz?.rounds ?? []).filter((r) => !r.deletedAt).sort((a, b) => a.order - b.order)

  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)

  // Sheet state
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [editQ, setEditQ]           = useState<Question | null>(null)
  const [form, setForm]             = useState<QuestionFormState>(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  // Delete
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [deleting, setDeleting]     = useState(false)

  const [reordering, setReordering] = useState(false)

  // ─── Import state ──────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importOpen, setImportOpen]     = useState(false)
  const [aiOpen, setAiOpen]             = useState(false)
  const [importFile, setImportFile]     = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ParsedRow[] | null>(null)
  const [importing, setImporting]       = useState(false)
  const [importError, setImportError]   = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ saved: number; skipped: number } | null>(null)

  function refresh() { if (quizId !== '_') loadQuiz(quizId).catch(() => {}) }

  const activeRound: Round | undefined = rounds.find((r) => r.id === selectedRoundId) ?? rounds[0]
  const questions = (activeRound?.questions ?? [])
    .filter((q) => !q.deletedAt)
    .sort((a, b) => a.order - b.order)

  function openAdd() {
    if (!activeRound) return
    setEditQ(null)
    setForm(emptyForm(activeRound.pointsPerQuestion))
    setFormError(null)
    setSheetOpen(true)
  }

  function parseJsonField<T>(value: unknown, fallback: T): T {
    if (Array.isArray(value)) return value as T
    if (typeof value === 'string' && value) {
      try { return JSON.parse(value) as T } catch { /* ignore */ }
    }
    return fallback
  }

  function openEdit(q: Question) {
    setEditQ(q)
    const isMCQ = q.type === QuestionType.MCQ
    const opts: MCQOption[] = isMCQ && q.options?.length
      ? q.options.map((o) => ({ label: o.label, text: o.text, isCorrect: o.isCorrect }))
      : EMPTY_OPTIONS.map((o) => ({ ...o }))

    setForm({
      type:          q.type as QuestionType,
      text:          q.text,
      difficulty:    q.difficulty,
      points:        q.points,
      correctAnswer: q.correctAnswer,
      aliases:       parseJsonField<string[]>(q.aliases, []).join(', '),
      clues:         (() => { const c = parseJsonField<string[]>(q.clues, []); return c.length > 0 ? c : ['', '', '', ''] })(),
      options:       opts,
    })
    setFormError(null)
    setSheetOpen(true)
  }

  function setOption(i: number, field: keyof MCQOption, val: string | boolean) {
    setForm((f) => {
      const options = f.options.map((o, idx) => {
        if (field === 'isCorrect') return { ...o, isCorrect: idx === i }
        if (idx === i) return { ...o, [field]: val }
        return o
      })
      // If marking correct, update correctAnswer to that option's label
      const correctLabel = options.find((o) => o.isCorrect)?.label ?? ''
      return { ...f, options, correctAnswer: correctLabel }
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.text.trim()) { setFormError('Question text is required'); return }
    if (!activeRound) return

    const isMCQ = form.type === QuestionType.MCQ
    const isTF = form.type === QuestionType.TRUEFALSE
    if (isMCQ) {
      const hasOptions = form.options.every((o) => o.text.trim())
      if (!hasOptions) { setFormError('Fill in all 4 MCQ options'); return }
      if (!form.options.some((o) => o.isCorrect)) { setFormError('Mark one option as correct'); return }
    } else if (isTF) {
      if (!form.correctAnswer) { setFormError('Select True or False as the correct answer'); return }
    } else {
      if (!form.correctAnswer.trim()) { setFormError('Correct answer is required'); return }
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      type:          form.type,
      text:          form.text.trim(),
      difficulty:    form.difficulty,
      points:        Number(form.points) || 1,
      correctAnswer: isMCQ
        ? (form.options.find((o) => o.isCorrect)?.label ?? '')
        : form.correctAnswer.trim(),
      aliases:       form.aliases.split(',').map((a) => a.trim()).filter(Boolean),
      clues:         activeRound?.gameMode === 'clue_reveal'
        ? form.clues.map((c) => c.trim()).filter(Boolean)
        : undefined,
      options:       isMCQ ? form.options.map((o) => ({ label: o.label, text: o.text.trim(), isCorrect: o.isCorrect })) : undefined,
    }

    try {
      if (editQ) {
        await api.patch<Question>(`/quiz/${quizId}/rounds/${activeRound.id}/questions/${editQ.id}`, payload)
      } else {
        await api.post<Question>(`/quiz/${quizId}/rounds/${activeRound.id}/questions`, payload)
      }
      setSheetOpen(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(qId: string) {
    if (!activeRound) return
    setDeleting(true)
    try {
      await api.delete<unknown>(`/quiz/${quizId}/rounds/${activeRound.id}/questions/${qId}`)
      setDeleteId(null)
      refresh()
    } catch {
      // stay open
    } finally {
      setDeleting(false)
    }
  }

  async function handleReorder(qId: string, dir: 'up' | 'down') {
    if (!activeRound) return
    const ids = questions.map((q) => q.id)
    const idx = ids.indexOf(qId)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === ids.length - 1) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
    setReordering(true)
    try {
      await api.put<unknown>(`/quiz/${quizId}/rounds/${activeRound.id}/questions/reorder`, { ids })
      refresh()
    } finally {
      setReordering(false)
    }
  }

  // ─── Import helpers ───────────────────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeRound) return
    setImportFile(file)
    setImportError(null)
    setImportResult(null)
    setImportPreview(null)
    setImporting(true)

    try {
      const form = new FormData()
      form.append('file', file)
      const result = await api.postFormData<{ rows: ParsedRow[]; total: number; valid: number }>(
        `/quiz/${quizId}/rounds/${activeRound.id}/questions/import?preview=true`,
        form,
      )
      setImportPreview(result.rows)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setImporting(false)
    }
  }

  async function handleImportConfirm() {
    if (!importFile || !activeRound) return
    setImporting(true)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('file', importFile)
      const result = await api.postFormData<{ saved: number; skipped: number }>(
        `/quiz/${quizId}/rounds/${activeRound.id}/questions/import`,
        form,
      )
      setImportResult(result)
      setImportPreview(null)
      setImportFile(null)
      refresh()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function openImport() {
    setImportOpen(true)
    setImportFile(null)
    setImportPreview(null)
    setImportError(null)
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function downloadTemplate() {
    const header = 'type,text,correctAnswer,clues,optionA,optionB,optionC,optionD,aliases,difficulty,points'
    const rows = [
      'mcq,"Who was the first king of Israel?",A,,"Saul","David","Solomon","Moses","King Saul",medium,10',
      'open,"Name the book with the shortest verse in the Bible.",John,,,,,,,"Jn|Gospel of John",easy,10',
      'open,"Name this city (Clue Reveal)","Bethlehem","City of David|Born here: Jesus|Tribe of Judah|Micah 5:2",,,,,"city of david|bethlem",medium,10',
      'truefalse,"Goliath was a Philistine.",True,,,,,,,easy,10',
      'fillinblank,"Jesus was born in ___.","Bethlehem",,,,,,,medium,10',
    ]
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'apoquiz-questions-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex gap-6 h-full">
        {/* Left panel — round selector */}
        <div className="w-56 flex-shrink-0 space-y-1">
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-3">Rounds</p>
          {rounds.length === 0 ? (
            <p className="text-text-muted text-sm">No rounds yet.</p>
          ) : (
            rounds.map((round) => {
              const qCount = round.questions?.filter((q) => !q.deletedAt).length ?? round.questionCount
              const isActive = (activeRound?.id ?? rounds[0]?.id) === round.id
              return (
                <button
                  key={round.id}
                  onClick={() => setSelectedRoundId(round.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
                    isActive
                      ? 'bg-surface-elevated text-white'
                      : 'text-text-secondary hover:text-white hover:bg-surface',
                  )}
                >
                  <span className="truncate">{round.name ?? `Round ${round.order}`}</span>
                  <span className={cn('text-xs ml-2 flex-shrink-0', qCount === 0 ? 'text-wrong' : 'text-text-muted')}>
                    {qCount}Q
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Right panel — questions */}
        <div className="flex-1 min-w-0">
          {!activeRound ? (
            <p className="text-text-muted text-sm">Select a round to manage questions.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-white font-semibold">{activeRound.name ?? `Round ${activeRound.order}`}</h2>
                  <p className="text-text-muted text-xs mt-0.5">
                    {questions.length} question{questions.length !== 1 ? 's' : ''}
                    {' · '}{activeRound.timerSeconds}s · {activeRound.pointsPerQuestion} pts
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAiOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-text-muted text-xs hover:text-white hover:border-blitz-accent/40 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate with AI
                  </button>
                  <Button size="sm" variant="outline" onClick={openImport}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Question
                  </Button>
                </div>
              </div>

              {questions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <HelpCircle className="h-8 w-8 text-text-muted mx-auto mb-3" />
                  <p className="text-text-muted text-sm">No questions yet.</p>
                  <Button size="sm" className="mt-3" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Question
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface group"
                    >
                      {/* Reorder */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => handleReorder(q.id, 'up')}
                          disabled={i === 0 || reordering}
                          className="p-0.5 text-text-muted hover:text-white disabled:opacity-20"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleReorder(q.id, 'down')}
                          disabled={i === questions.length - 1 || reordering}
                          className="p-0.5 text-text-muted hover:text-white disabled:opacity-20"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Number */}
                      <span className="text-text-muted text-xs font-mono w-5 text-right flex-shrink-0 pt-0.5">
                        {i + 1}.
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm leading-snug">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-text-muted text-xs uppercase">{q.type}</span>
                          <Badge variant={DIFFICULTY_VARIANT[q.difficulty]}>{q.difficulty}</Badge>
                          <span className="text-text-muted text-xs">{q.points} pts</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => openEdit(q)} className="p-1.5 text-text-muted hover:text-white">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(q.id)} className="p-1.5 text-text-muted hover:text-wrong">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit question sheet */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editQ ? 'Edit Question' : 'Add Question'}
        description={activeRound ? `${activeRound.name ?? `Round ${activeRound.order}`}` : ''}
        className="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* Type + Difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-type">Question Type</Label>
              <select
                id="q-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as QuestionType, correctAnswer: '', options: EMPTY_OPTIONS.map((o) => ({ ...o })) }))}
                className={cn(
                  'w-full px-3 py-2 rounded-lg border border-border bg-surface text-white text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-blitz-accent/50',
                )}
              >
                <option value={QuestionType.MCQ}>Multiple Choice (MCQ)</option>
                <option value={QuestionType.OPEN}>Open Answer</option>
                <option value={QuestionType.TRUEFALSE}>True / False</option>
                <option value={QuestionType.FILLINBLANK}>Fill in the Blank</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-diff">Difficulty</Label>
              <select
                id="q-diff"
                value={form.difficulty}
                onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as QuestionDifficulty }))}
                className={cn(
                  'w-full px-3 py-2 rounded-lg border border-border bg-surface text-white text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-blitz-accent/50',
                )}
              >
                <option value={QuestionDifficulty.EASY}>Easy</option>
                <option value={QuestionDifficulty.MEDIUM}>Medium</option>
                <option value={QuestionDifficulty.HARD}>Hard</option>
              </select>
            </div>
          </div>

          {/* Question text */}
          <div className="space-y-1.5">
            <Label htmlFor="q-text">Question *</Label>
            <Textarea
              id="q-text"
              placeholder="Type your question here..."
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              rows={3}
              autoFocus
            />
          </div>

          {/* MCQ options */}
          {form.type === QuestionType.MCQ && (
            <div className="space-y-2">
              <Label>Options (select correct answer)</Label>
              {form.options.map((opt, i) => (
                <div key={opt.label} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={opt.isCorrect}
                    onChange={() => setOption(i, 'isCorrect', true)}
                    className="accent-blitz-accent flex-shrink-0"
                  />
                  <span className="text-text-muted text-sm w-5 flex-shrink-0">{opt.label}.</span>
                  <Input
                    placeholder={`Option ${opt.label}`}
                    value={opt.text}
                    onChange={(e) => setOption(i, 'text', e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Open answer */}
          {form.type === QuestionType.OPEN && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="correct-ans">Correct Answer *</Label>
                <Input
                  id="correct-ans"
                  placeholder="e.g. Obadiah"
                  value={form.correctAnswer}
                  onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aliases">Accepted Aliases</Label>
                <Input
                  id="aliases"
                  placeholder="e.g. King Saul, Saul of Kish (comma-separated)"
                  value={form.aliases}
                  onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                />
                <p className="text-text-muted text-xs">Exact, normalized, and fuzzy matching are automatic. Add aliases for alternate phrasings.</p>
              </div>
              {activeRound?.gameMode === 'clue_reveal' && (
                <div className="space-y-2">
                  <Label>Clues (in reveal order)</Label>
                  <p className="text-text-muted text-xs">First clue = most points. Add up to 5 clues. Empty clues are ignored.</p>
                  {form.clues.map((clue, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-xs text-text-muted">{i + 1}</span>
                      <Input
                        placeholder={`Clue ${i + 1}…`}
                        value={clue}
                        onChange={(e) => setForm((f) => {
                          const clues = [...f.clues]
                          clues[i] = e.target.value
                          return { ...f, clues }
                        })}
                      />
                    </div>
                  ))}
                  {form.clues.length < 5 && (
                    <button
                      type="button"
                      className="text-xs text-blitz-accent hover:underline"
                      onClick={() => setForm((f) => ({ ...f, clues: [...f.clues, ''] }))}
                    >
                      + Add clue
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* True / False */}
          {form.type === QuestionType.TRUEFALSE && (
            <div className="space-y-2">
              <Label>Correct Answer *</Label>
              <div className="flex gap-3">
                {(['True', 'False'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, correctAnswer: val }))}
                    className={cn(
                      'flex-1 rounded-lg border py-3 text-sm font-semibold transition-colors',
                      form.correctAnswer === val
                        ? val === 'True'
                          ? 'border-correct bg-correct/10 text-correct'
                          : 'border-wrong bg-wrong/10 text-wrong'
                        : 'border-border text-text-secondary hover:text-white',
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fill in the blank */}
          {form.type === QuestionType.FILLINBLANK && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="blank-ans">Correct Answer *</Label>
                <Input
                  id="blank-ans"
                  placeholder="e.g. Jerusalem"
                  value={form.correctAnswer}
                  onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value }))}
                />
                <p className="text-text-muted text-xs">Use <code className="text-blitz-accent">___</code> in the question text to mark the blank. e.g. &quot;Jesus wept in ___.&quot;</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fib-aliases">Accepted Aliases</Label>
                <Input
                  id="fib-aliases"
                  placeholder="e.g. Bethlehem, the city of David (comma-separated)"
                  value={form.aliases}
                  onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* Points */}
          <div className="space-y-1.5">
            <Label htmlFor="q-pts">Points</Label>
            <Input
              id="q-pts"
              type="number"
              min={1}
              max={1000}
              placeholder="e.g. 10"
              value={form.points}
              onChange={(e) => setForm((f) => ({ ...f, points: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-wrong text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editQ ? 'Save Changes' : 'Add Question'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSheetOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Sheet>

      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Question?"
        description="This question will be permanently deleted."
      >
        <div className="flex gap-3">
          <Button variant="destructive" disabled={deleting} className="flex-1" onClick={() => deleteId && handleDelete(deleteId)}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Delete
          </Button>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
        </div>
      </Dialog>

      {/* ── Import Questions dialog ──────────────────────────────────── */}
      <Dialog
        open={importOpen}
        onClose={() => { setImportOpen(false); setImportResult(null) }}
        title="Import Questions from File"
        description={activeRound ? `Uploading to: ${activeRound.name ?? `Round ${activeRound.order}`} · ${activeRound.gameMode}` : ''}
      >
        <div className="space-y-4">
          {/* File picker */}
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-blitz-accent/40 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-8 w-8 text-text-muted mx-auto mb-3" />
            <p className="text-white text-sm font-medium">
              {importFile ? importFile.name : 'Click to choose a .csv or .xlsx file'}
            </p>
            <p className="text-text-muted text-xs mt-1">
              Columns: type, text, correctAnswer, optionA–D, aliases, difficulty, points
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Template download */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); downloadTemplate() }}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV template (opens in Excel)
          </button>

          {importing && (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing file…
            </div>
          )}

          {importError && (
            <div className="flex items-center gap-2 text-wrong text-sm">
              <AlertCircle className="h-4 w-4" />
              {importError}
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="flex items-center gap-2 text-correct text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Imported {importResult.saved} question{importResult.saved !== 1 ? 's' : ''}
              {importResult.skipped > 0 && ` (${importResult.skipped} skipped due to errors)`}
            </div>
          )}

          {/* Preview table */}
          {importPreview && importPreview.length > 0 && (
            <div className="space-y-2">
              <p className="text-text-muted text-xs font-medium">
                Preview — {importPreview.filter((r) => r.errors.length === 0).length}/{importPreview.length} valid
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {importPreview.map((row) => (
                  <div
                    key={row.row}
                    className={cn(
                      'flex items-start gap-2 text-xs p-2 rounded',
                      row.errors.length > 0 ? 'bg-wrong/10' : 'bg-correct/5',
                    )}
                  >
                    {row.errors.length > 0
                      ? <XCircle className="h-3.5 w-3.5 text-wrong flex-shrink-0 mt-0.5" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-correct flex-shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0">
                      <p className="text-white truncate">{row.text || '(empty)'}</p>
                      {row.errors.length > 0 && (
                        <p className="text-wrong/80">{row.errors.join(' · ')}</p>
                      )}
                    </div>
                    <span className="text-text-muted flex-shrink-0">{row.type}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  disabled={importing || importPreview.every((r) => r.errors.length > 0)}
                  onClick={handleImportConfirm}
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Accept & Save {importPreview.filter((r) => r.errors.length === 0).length} Questions
                </Button>
                <Button variant="ghost" onClick={() => { setImportPreview(null); setImportFile(null) }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* ── AI Generation dialog ─────────────────────────────────────── */}
      {activeRound && (
        <AiGenerateDialog
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          round={activeRound}
          quizId={quizId}
          onSaved={refresh}
        />
      )}
    </>
  )
}
