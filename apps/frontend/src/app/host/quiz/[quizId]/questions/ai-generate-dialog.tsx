'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Sparkles, Loader2, Upload, BookOpen, FileText,
  X, Pencil, ChevronUp, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { QuestionType, GameMode } from '@apoquiz/shared-types'
import type { Round } from '@apoquiz/shared-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedQuestion {
  type: QuestionType
  text: string
  correctAnswer: string
  difficulty: 'easy' | 'medium' | 'hard'
  points: number
  aliases?: string[]
  clues?: string[]
  options?: Array<{ label: string; text: string; isCorrect: boolean }>
}

interface ProviderStatus {
  ollama: boolean
  grok: boolean
  gemini: boolean
  activeProvider: 'ollama' | 'grok' | 'gemini' | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GAME_MODE_TYPES: Partial<Record<GameMode, QuestionType[]>> = {
  [GameMode.BLITZ]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.TILE_BLITZ]: [QuestionType.MCQ],
  [GameMode.ULTIMATE_CHALLENGE]: [QuestionType.OPEN, QuestionType.TRUEFALSE],
  [GameMode.CLUE_REVEAL]: [QuestionType.OPEN],
  [GameMode.HOT_SEAT]: [QuestionType.OPEN, QuestionType.MCQ],
  [GameMode.LIGHTNING]: [QuestionType.MCQ, QuestionType.TRUEFALSE],
  [GameMode.TRUE_FALSE_BLITZ]: [QuestionType.TRUEFALSE],
  [GameMode.WAGER]: [QuestionType.OPEN, QuestionType.MCQ],
  [GameMode.STEAL]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.DUEL]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.ELIMINATION]: [QuestionType.MCQ, QuestionType.OPEN],
  [GameMode.PICTURE]: [QuestionType.MCQ],
}

const TYPE_LABELS: Record<string, string> = {
  [QuestionType.MCQ]: 'MCQ',
  [QuestionType.OPEN]: 'Open Answer',
  [QuestionType.TRUEFALSE]: 'True / False',
  [QuestionType.FILLINBLANK]: 'Fill in Blank',
}

const BIBLE_BOOKS = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
  'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
  'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
  'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians',
  '1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon',
  'Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation',
]

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  round: Round
  quizId: string
  onSaved: () => void
}

export function AiGenerateDialog({ open, onClose, round, quizId, onSaved }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const allowedTypes = GAME_MODE_TYPES[round.gameMode as GameMode] ?? [QuestionType.MCQ, QuestionType.OPEN]

  // provider status
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  // mode
  const [mode, setMode] = useState<'document' | 'bible'>('document')

  // document
  const [file, setFile] = useState<File | null>(null)

  // bible
  const [bibleBook, setBibleBook] = useState('Genesis')
  const [bibleChapterStart, setBibleChapterStart] = useState('1')
  const [bibleChapterEnd, setBibleChapterEnd] = useState('')
  const [bibleVerseStart, setBibleVerseStart] = useState('')
  const [bibleVerseEnd, setBibleVerseEnd] = useState('')

  // common
  const [count, setCount] = useState(8)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed')
  const [instructions, setInstructions] = useState('')

  // generation
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedQuestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // save
  const [saving, setSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setStatusLoading(true)
    api.get<ProviderStatus>('/ai/status')
      .then(setProviderStatus)
      .catch(() => setProviderStatus(null))
      .finally(() => setStatusLoading(false))
  }, [open])

  function resetDialog() {
    setFile(null)
    setGenerated(null)
    setError(null)
    setGenerating(false)
    setSaving(false)
    setEditingIdx(null)
    setBibleChapterStart('1')
    setBibleChapterEnd('')
    setBibleVerseStart('')
    setBibleVerseEnd('')
    setInstructions('')
  }

  function handleClose() {
    resetDialog()
    onClose()
  }

  async function handleGenerate() {
    setError(null)
    setGenerated(null)
    setGenerating(true)
    try {
      let result: { questions: GeneratedQuestion[] }
      if (mode === 'document') {
        if (!file) { setError('Please upload a PDF or DOCX file'); setGenerating(false); return }
        const form = new FormData()
        form.append('file', file)
        form.append('gameMode', round.gameMode)
        form.append('roundName', round.name ?? `Round ${round.order}`)
        form.append('count', String(count))
        form.append('difficulty', difficulty)
        if (instructions.trim()) form.append('instructions', instructions.trim())
        result = await api.postFormData<{ questions: GeneratedQuestion[] }>('/ai/generate/document', form)
      } else {
        if (!bibleChapterStart.trim()) { setError('Enter a chapter number'); setGenerating(false); return }
        result = await api.post<{ questions: GeneratedQuestion[] }>('/ai/generate/bible', {
          book: bibleBook,
          chapterStart: parseInt(bibleChapterStart) || 1,
          chapterEnd: bibleChapterEnd ? parseInt(bibleChapterEnd) : undefined,
          verseStart: bibleVerseStart ? parseInt(bibleVerseStart) : undefined,
          verseEnd: bibleVerseEnd ? parseInt(bibleVerseEnd) : undefined,
          gameMode: round.gameMode,
          roundName: round.name ?? `Round ${round.order}`,
          count,
          difficulty,
          instructions: instructions.trim() || undefined,
        })
      }
      setGenerated(result.questions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleAcceptAll() {
    if (!generated || generated.length === 0) return
    setSaving(true)
    setError(null)
    try {
      for (const q of generated) {
        await api.post(`/quiz/${quizId}/rounds/${round.id}/questions`, {
          type: q.type,
          text: q.text,
          correctAnswer: q.correctAnswer,
          difficulty: q.difficulty,
          points: q.points,
          aliases: q.aliases ?? [],
          clues: q.clues,
          options: q.options,
        })
      }
      onSaved()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save questions')
    } finally {
      setSaving(false)
    }
  }

  function removeQuestion(idx: number) {
    setGenerated((prev) => prev?.filter((_, i) => i !== idx) ?? null)
    if (editingIdx === idx) setEditingIdx(null)
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1)
  }

  function updateQuestion(idx: number, updates: Partial<GeneratedQuestion>) {
    setGenerated((prev) => prev ? prev.map((q, i) => (i === idx ? { ...q, ...updates } : q)) : prev)
  }

  // ─── Provider status bar ─────────────────────────────────────────────────

  const activeLabel =
    providerStatus?.activeProvider === 'ollama' ? '🟢 Ollama (local, offline)'
    : providerStatus?.activeProvider === 'grok' ? '🟡 Groq API'
    : providerStatus?.activeProvider === 'gemini' ? '🔵 Gemini Flash'
    : providerStatus ? null
    : null

  const noProvider = providerStatus && !providerStatus.activeProvider

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Generate Questions with AI"
      description={`${round.name ?? `Round ${round.order}`} · ${allowedTypes.map((t) => TYPE_LABELS[t]).join(', ')}`}
    >
      <div className="space-y-4">

        {/* Provider status row */}
        <div className="flex items-center gap-3 flex-wrap">
          {statusLoading ? (
            <span className="text-xs text-text-muted flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking providers…
            </span>
          ) : (
            <>
              <div className="flex gap-1.5">
                {([
                  { key: 'ollama', label: 'Ollama', activeColor: 'border-correct/40 text-correct bg-correct/5' },
                  { key: 'grok', label: 'Groq', activeColor: 'border-yellow-400/40 text-yellow-400 bg-yellow-400/5' },
                  { key: 'gemini', label: 'Gemini', activeColor: 'border-blitz-accent/40 text-blitz-accent bg-blitz-accent/5' },
                ] as const).map(({ key, label, activeColor }) => (
                  <span
                    key={key}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border font-medium',
                      providerStatus?.[key] ? activeColor : 'border-border text-text-muted',
                    )}
                  >
                    {label} {providerStatus?.[key] ? '●' : '○'}
                  </span>
                ))}
              </div>
              {activeLabel && <span className="text-xs text-text-muted">{activeLabel}</span>}
            </>
          )}
        </div>

        {/* ── Configuration / form (hidden after generation) ── */}
        {!generated && (
          <>
            {/* Mode tabs */}
            <div className="flex gap-1.5 p-1 bg-surface-elevated rounded-xl">
              <button
                onClick={() => setMode('document')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm transition-colors',
                  mode === 'document' ? 'bg-surface text-white shadow-sm' : 'text-text-muted hover:text-white',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                PDF / DOCX
              </button>
              <button
                onClick={() => setMode('bible')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm transition-colors',
                  mode === 'bible' ? 'bg-surface text-white shadow-sm' : 'text-text-muted hover:text-white',
                )}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Bible Knowledge
              </button>
            </div>

            {/* ─ Document mode ─ */}
            {mode === 'document' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors',
                    file
                      ? 'border-correct/40 bg-correct/5'
                      : 'border-border hover:border-blitz-accent/40 hover:bg-surface-elevated',
                  )}
                >
                  {file ? (
                    <div className="space-y-1">
                      <CheckCircle2 className="h-6 w-6 text-correct mx-auto" />
                      <p className="text-white text-sm font-medium truncate max-w-xs mx-auto">{file.name}</p>
                      <p className="text-text-muted text-xs">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="h-6 w-6 text-text-muted mx-auto" />
                      <p className="text-text-muted text-sm">Click to upload PDF or DOCX</p>
                      <p className="text-text-muted text-xs">Max 20 MB · Text will be extracted and sent to the AI</p>
                    </div>
                  )}
                </button>
              </>
            )}

            {/* ─ Bible mode ─ */}
            {mode === 'bible' && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Book</Label>
                  <select
                    value={bibleBook}
                    onChange={(e) => setBibleBook(e.target.value)}
                    className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blitz-accent/60"
                  >
                    {BIBLE_BOOKS.map((b) => (
                      <option key={b} value={b} className="bg-[#1A1A24]">{b}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Chapter from <span className="text-wrong">*</span></Label>
                    <Input
                      type="number"
                      min="1"
                      value={bibleChapterStart}
                      onChange={(e) => setBibleChapterStart(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Chapter to <span className="text-text-muted">(optional)</span></Label>
                    <Input
                      type="number"
                      min="1"
                      value={bibleChapterEnd}
                      onChange={(e) => setBibleChapterEnd(e.target.value)}
                      placeholder="Same chapter"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Verse from <span className="text-text-muted">(optional)</span></Label>
                    <Input
                      type="number"
                      min="1"
                      value={bibleVerseStart}
                      onChange={(e) => setBibleVerseStart(e.target.value)}
                      placeholder="All verses"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Verse to <span className="text-text-muted">(optional)</span></Label>
                    <Input
                      type="number"
                      min="1"
                      value={bibleVerseEnd}
                      onChange={(e) => setBibleVerseEnd(e.target.value)}
                      placeholder="All verses"
                    />
                  </div>
                </div>
                <p className="text-text-muted text-xs">
                  Leave chapters/verses blank for the full book. Uses local KJV Bible; falls back to bible-api.com if not found.
                </p>
              </div>
            )}

            {/* Common options */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Number of questions (1–20)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={count}
                    onChange={(e) => setCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Difficulty</Label>
                  <div className="flex gap-1">
                    {(['easy', 'medium', 'hard', 'mixed'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={cn(
                          'flex-1 py-1.5 text-[11px] rounded-lg border capitalize transition-colors',
                          difficulty === d
                            ? 'border-blitz-accent/60 text-blitz-accent bg-blitz-accent/10'
                            : 'border-border text-text-muted hover:text-white',
                        )}
                      >
                        {d === 'mixed' ? 'Mix' : d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Additional instructions <span className="text-text-muted">(optional)</span></Label>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Focus on names and places. Avoid questions about exact verse numbers."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-wrong/10 border border-wrong/30 rounded-lg">
                <AlertCircle className="h-4 w-4 text-wrong flex-shrink-0 mt-0.5" />
                <p className="text-wrong text-xs leading-relaxed">{error}</p>
              </div>
            )}

            {/* Generate button */}
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generating || noProvider === true}
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating {count} questions…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate {count} Questions</>
              )}
            </Button>

            {noProvider && (
              <p className="text-center text-xs text-text-muted leading-relaxed">
                No AI provider is available. Start Ollama locally, or add{' '}
                <code className="text-blitz-accent">GROK_API_KEY</code> /{' '}
                <code className="text-blitz-accent">GEMINI_API_KEY</code> to the backend{' '}
                <code className="text-blitz-accent">.env</code> file.
              </p>
            )}
          </>
        )}

        {/* ── Review section ── */}
        {generated && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-medium text-sm">
                {generated.length} question{generated.length !== 1 ? 's' : ''} generated
              </p>
              <button
                onClick={() => { setGenerated(null); setError(null) }}
                className="text-xs text-blitz-accent hover:text-blitz-accent/80 transition-colors"
              >
                ← Change settings
              </button>
            </div>

            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-0.5">
              {generated.map((q, idx) => (
                <ReviewCard
                  key={idx}
                  question={q}
                  expanded={editingIdx === idx}
                  onToggleEdit={() => setEditingIdx(editingIdx === idx ? null : idx)}
                  onUpdate={(updates) => updateQuestion(idx, updates)}
                  onDelete={() => removeQuestion(idx)}
                />
              ))}
              {generated.length === 0 && (
                <p className="text-text-muted text-sm text-center py-6">
                  All questions removed. Go back and regenerate.
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-wrong/10 border border-wrong/30 rounded-lg">
                <AlertCircle className="h-4 w-4 text-wrong flex-shrink-0 mt-0.5" />
                <p className="text-wrong text-xs">{error}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAcceptAll}
                disabled={saving || generated.length === 0}
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                  `Save All ${generated.length} Questions`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ─── Review card ──────────────────────────────────────────────────────────────

interface ReviewCardProps {
  question: GeneratedQuestion
  expanded: boolean
  onToggleEdit: () => void
  onUpdate: (updates: Partial<GeneratedQuestion>) => void
  onDelete: () => void
}

const TYPE_COLORS: Record<string, string> = {
  [QuestionType.MCQ]: 'bg-blitz-accent/15 text-blitz-accent',
  [QuestionType.OPEN]: 'bg-green-500/15 text-green-400',
  [QuestionType.TRUEFALSE]: 'bg-yellow-500/15 text-yellow-400',
  [QuestionType.FILLINBLANK]: 'bg-purple-500/15 text-purple-400',
}

const DIFF_COLORS: Record<string, string> = {
  easy: 'text-correct',
  medium: 'text-timer-warning',
  hard: 'text-wrong',
}

function ReviewCard({ question: q, expanded, onToggleEdit, onUpdate, onDelete }: ReviewCardProps) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-2 p-3">
        <div className="flex gap-1.5 flex-shrink-0 mt-0.5">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium uppercase', TYPE_COLORS[q.type] ?? 'bg-surface text-text-muted')}>
            {TYPE_LABELS[q.type] ?? q.type}
          </span>
          <span className={cn('text-[10px] font-medium capitalize', DIFF_COLORS[q.difficulty])}>
            {q.difficulty}
          </span>
        </div>
        <p className="flex-1 text-white text-sm leading-snug min-w-0">{q.text}</p>
        <div className="flex gap-0.5 flex-shrink-0 ml-1">
          <button
            onClick={onToggleEdit}
            className="p-1.5 text-text-muted hover:text-white transition-colors rounded"
            title="Edit"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-text-muted hover:text-wrong transition-colors rounded"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsed: show correct answer hint */}
      {!expanded && (
        <div className="px-3 pb-2.5">
          {q.type === QuestionType.MCQ && q.options ? (
            <div className="flex gap-1.5 flex-wrap">
              {q.options.map((opt) => (
                <span
                  key={opt.label}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border',
                    opt.isCorrect
                      ? 'border-correct/40 text-correct bg-correct/10'
                      : 'border-border text-text-muted',
                  )}
                >
                  {opt.label}. {opt.text}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-xs">
              Answer: <span className="text-correct">{q.correctAnswer}</span>
            </p>
          )}
        </div>
      )}

      {/* Expanded edit form */}
      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-surface-elevated">
          {/* Question text */}
          <div>
            <Label className="text-xs mb-1 block">Question text</Label>
            <Textarea
              value={q.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* MCQ options */}
          {q.type === QuestionType.MCQ && q.options && (
            <div>
              <Label className="text-xs mb-1.5 block">Options — click letter to mark correct</Label>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => (
                  <div key={opt.label} className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onUpdate({
                          options: q.options!.map((o, i) => ({ ...o, isCorrect: i === oi })),
                          correctAnswer: opt.label,
                        })
                      }
                      className={cn(
                        'w-6 h-6 rounded-full border flex-shrink-0 flex items-center justify-center text-[10px] font-bold transition-colors',
                        opt.isCorrect
                          ? 'border-correct bg-correct/20 text-correct'
                          : 'border-border text-text-muted hover:border-correct/50',
                      )}
                    >
                      {opt.label}
                    </button>
                    <Input
                      value={opt.text}
                      onChange={(e) =>
                        onUpdate({
                          options: q.options!.map((o, i) => (i === oi ? { ...o, text: e.target.value } : o)),
                        })
                      }
                      className="text-sm h-8 flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correct answer for non-MCQ */}
          {q.type !== QuestionType.MCQ && (
            <div>
              <Label className="text-xs mb-1 block">Correct answer</Label>
              {q.type === QuestionType.TRUEFALSE ? (
                <div className="flex gap-2">
                  {(['True', 'False'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => onUpdate({ correctAnswer: v })}
                      className={cn(
                        'flex-1 py-1.5 text-sm rounded-lg border transition-colors',
                        q.correctAnswer === v
                          ? 'border-correct/60 text-correct bg-correct/10'
                          : 'border-border text-text-muted hover:text-white',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  value={q.correctAnswer}
                  onChange={(e) => onUpdate({ correctAnswer: e.target.value })}
                  className="text-sm"
                />
              )}
            </div>
          )}

          {/* Difficulty + Points */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Difficulty</Label>
              <div className="flex gap-1">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => onUpdate({ difficulty: d })}
                    className={cn(
                      'flex-1 py-1 text-[11px] rounded-lg border capitalize transition-colors',
                      q.difficulty === d
                        ? 'border-blitz-accent/60 text-blitz-accent bg-blitz-accent/10'
                        : 'border-border text-text-muted hover:text-white',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Points</Label>
              <Input
                type="number"
                min="1"
                value={q.points}
                onChange={(e) => onUpdate({ points: parseInt(e.target.value) || 10 })}
                className="text-sm h-9"
              />
            </div>
          </div>

          {/* Aliases (for open/fillinblank) */}
          {(q.type === QuestionType.OPEN || q.type === QuestionType.FILLINBLANK) && (
            <div>
              <Label className="text-xs mb-1 block">
                Aliases <span className="text-text-muted">(comma-separated alternative answers)</span>
              </Label>
              <Input
                value={(q.aliases ?? []).join(', ')}
                onChange={(e) =>
                  onUpdate({ aliases: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })
                }
                placeholder="e.g. King Saul, Saul of Benjamin"
                className="text-sm"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
