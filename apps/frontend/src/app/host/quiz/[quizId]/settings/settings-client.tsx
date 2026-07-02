'use client'
import { useState, useEffect, useRef } from 'react'
import { useQuizId } from '@/hooks/useQuizId'
import { Loader2, AlertCircle, CheckCircle2, Upload, RotateCcw, Play, Music, Cloud, TestTube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, getBaseUrl } from '@/lib/api'
import { useHostStore } from '@/stores/useHostStore'
import { soundManager, SoundKey, DEFAULT_SOUND_MAP } from '@/lib/sound'
import { cn } from '@/lib/utils'

// ─── Sound metadata ───────────────────────────────────────────────────────────

type SoundMeta = { key: SoundKey; label: string; description: string }

const SOUND_LIST: SoundMeta[] = [
  { key: 'roundIntro',     label: 'Round Intro',        description: 'Plays when a round countdown begins' },
  { key: 'questionReveal', label: 'Question Reveal',    description: 'Plays when a question is shown' },
  { key: 'tick',           label: 'Timer Tick',         description: 'Looped during question timer (speeds up at -5s)' },
  { key: 'timeWarning',    label: 'Time Warning',       description: 'Plays when timer drops under 10 seconds' },
  { key: 'timeUp',         label: 'Time Up',            description: 'Plays when the timer reaches zero' },
  { key: 'correct',        label: 'Correct Answer',     description: 'Plays on correct reveal (Tile Blitz only)' },
  { key: 'wrong',          label: 'Wrong Answer',       description: 'Plays on wrong reveal (Tile Blitz only)' },
  { key: 'scoreUpdate',    label: 'Score Update / Reveal', description: 'Plays on Blitz reveal and score animations' },
  { key: 'rankChange',     label: 'Rank Change',        description: 'Plays when leaderboard order shifts' },
  { key: 'roundEnd',       label: 'Round End',          description: 'Plays when round summary screen shows' },
  { key: 'newLeader',      label: 'New Leader',         description: 'Plays when a team takes first place' },
  { key: 'quizEnd',        label: 'Quiz End',           description: 'Plays when the final ceremony starts' },
  { key: 'winner',         label: 'Winner',             description: 'Plays 3 seconds after drum roll on session end' },
  { key: 'drumRoll',       label: 'Drum Roll',          description: 'Plays at session end before winner reveal' },
  { key: 'audienceBonus',  label: 'Audience Bonus',     description: 'Plays when an audience activity opens' },
  { key: 'emojiPop',       label: 'Emoji Reaction',     description: 'Plays when audience members send emoji reactions' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsClient(): React.ReactElement {
  const quizId  = useQuizId()
  const { currentQuiz, loadQuiz } = useHostStore()
  const quiz = currentQuiz?.id === quizId ? currentQuiz : null

  // Quiz meta edits — initialize once quiz loads
  const [quizName, setQuizName]   = useState(quiz?.name ?? '')
  const [quizDesc, setQuizDesc]   = useState(quiz?.description ?? '')
  const [quizDate, setQuizDate]   = useState(quiz?.date ? String(quiz.date).split('T')[0] : '')

  useEffect(() => {
    if (quiz) {
      setQuizName(quiz.name)
      setQuizDesc(quiz.description ?? '')
      setQuizDate(quiz.date ? String(quiz.date).split('T')[0] : '')
    }
  }, [quiz?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaMsg, setMetaMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  // Admin password change
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [savingPw, setSavingPw]     = useState(false)
  const [pwMsg, setPwMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  // Moderator PIN change
  const [newPin, setNewPin]       = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pinMsg, setPinMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  // Sound config — which keys have custom overrides
  const [soundConfig, setSoundConfig] = useState<Record<string, string>>({})
  const [soundLoading, setSoundLoading] = useState<Partial<Record<SoundKey, boolean>>>({})
  const [soundMsg, setSoundMsg] = useState<Partial<Record<SoundKey, { ok: boolean; text: string }>>>({})
  const fileInputRefs = useRef<Partial<Record<SoundKey, HTMLInputElement | null>>>({})

  // Cloud sync config
  const [cloudUrl, setCloudUrl]     = useState('')
  const [cloudApiKey, setCloudApiKey] = useState('')
  const [cloudHasKey, setCloudHasKey] = useState(false)
  const [savingCloud, setSavingCloud] = useState(false)
  const [cloudMsg, setCloudMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [testingCloud, setTestingCloud] = useState(false)

  useEffect(() => {
    fetch(`${getBaseUrl()}/api/sync/config`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<{ cloudUrl: string; hasKey: boolean }> : null)
      .then((data) => {
        if (data) {
          setCloudUrl(data.cloudUrl)
          setCloudHasKey(data.hasKey)
        }
      })
      .catch(() => {/* non-fatal */})
  }, [])

  async function handleSaveCloud(e: React.FormEvent) {
    e.preventDefault()
    if (!cloudUrl.trim()) { setCloudMsg({ ok: false, text: 'Cloud URL is required' }); return }
    setSavingCloud(true)
    setCloudMsg(null)
    try {
      const body: Record<string, string> = { cloudUrl: cloudUrl.trim() }
      if (cloudApiKey.trim()) body.cloudApiKey = cloudApiKey.trim()
      const res = await fetch(`${getBaseUrl()}/api/sync/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (cloudApiKey.trim()) setCloudHasKey(true)
      setCloudApiKey('')
      setCloudMsg({ ok: true, text: 'Cloud sync config saved.' })
    } catch (err) {
      setCloudMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSavingCloud(false)
    }
  }

  async function handleTestCloud() {
    if (!cloudUrl.trim()) { setCloudMsg({ ok: false, text: 'Enter a Cloud URL first' }); return }
    setTestingCloud(true)
    setCloudMsg(null)
    try {
      const res = await fetch(`${cloudUrl.replace(/\/$/, '')}/api/network/info`)
      if (res.ok) {
        setCloudMsg({ ok: true, text: 'Cloud server is reachable.' })
      } else {
        setCloudMsg({ ok: false, text: `Server responded ${res.status} — check the URL.` })
      }
    } catch {
      setCloudMsg({ ok: false, text: 'Could not reach server — check the URL and network.' })
    } finally {
      setTestingCloud(false)
    }
  }

  useEffect(() => {
    fetch(`${getBaseUrl()}/api/sounds/config`, { credentials: 'include' })
      .then((r) => r.json() as Promise<Record<string, string>>)
      .then(setSoundConfig)
      .catch(() => {/* non-fatal */})
  }, [])

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault()
    if (!quizName.trim()) { setMetaMsg({ ok: false, text: 'Quiz name is required' }); return }
    setSavingMeta(true)
    setMetaMsg(null)
    try {
      await api.patch(`/quiz/${quizId}`, {
        name:        quizName.trim(),
        description: quizDesc.trim() || undefined,
        date:        quizDate || undefined,
      })
      await loadQuiz(quizId)
      setMetaMsg({ ok: true, text: 'Quiz details saved.' })
    } catch (err) {
      setMetaMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSavingMeta(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!newPw) { setPwMsg({ ok: false, text: 'New password required' }); return }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'Passwords do not match' }); return }
    setSavingPw(true)
    setPwMsg(null)
    try {
      await api.post('/auth/admin/change-password', { currentPassword: currentPw, newPassword: newPw })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setPwMsg({ ok: true, text: 'Password updated.' })
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to change password' })
    } finally {
      setSavingPw(false)
    }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{4}$/.test(newPin)) { setPinMsg({ ok: false, text: 'PIN must be exactly 4 digits' }); return }
    setSavingPin(true)
    setPinMsg(null)
    try {
      await api.post('/auth/moderator/change-pin', { newPin })
      setNewPin('')
      setPinMsg({ ok: true, text: 'Moderator PIN updated.' })
    } catch (err) {
      setPinMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to change PIN' })
    } finally {
      setSavingPin(false)
    }
  }

  async function handleSoundUpload(key: SoundKey, file: File) {
    setSoundLoading((prev) => ({ ...prev, [key]: true }))
    setSoundMsg((prev) => ({ ...prev, [key]: undefined }))
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${getBaseUrl()}/api/sounds/upload/${key}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` })) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      const newUrl = `/api/sounds/file/${key}`
      setSoundConfig((prev) => ({ ...prev, [key]: newUrl }))
      soundManager.reloadSound(key, newUrl)
      setSoundMsg((prev) => ({ ...prev, [key]: { ok: true, text: 'Custom sound saved' } }))
    } catch (err) {
      setSoundMsg((prev) => ({ ...prev, [key]: { ok: false, text: err instanceof Error ? err.message : 'Upload failed' } }))
    } finally {
      setSoundLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function handleSoundReset(key: SoundKey) {
    setSoundLoading((prev) => ({ ...prev, [key]: true }))
    setSoundMsg((prev) => ({ ...prev, [key]: undefined }))
    try {
      const res = await fetch(`${getBaseUrl()}/api/sounds/${key}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const defaultUrl = DEFAULT_SOUND_MAP[key]
      setSoundConfig((prev) => ({ ...prev, [key]: defaultUrl }))
      soundManager.reloadSound(key, defaultUrl)
      setSoundMsg((prev) => ({ ...prev, [key]: { ok: true, text: 'Reset to default' } }))
    } catch (err) {
      setSoundMsg((prev) => ({ ...prev, [key]: { ok: false, text: err instanceof Error ? err.message : 'Reset failed' } }))
    } finally {
      setSoundLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  function handlePreview(key: SoundKey) {
    // Use a plain Audio element directly with the current URL so preview always
    // reflects the just-uploaded file. soundManager.play() can fail silently here
    // because Howler may not have finished loading the new file yet, and browsers
    // block delayed autoplay outside the original user-gesture frame.
    const url = soundConfig[key] ?? DEFAULT_SOUND_MAP[key]
    const fullUrl = url.startsWith('/api/') ? `${getBaseUrl()}${url}` : url
    const audio = new Audio(fullUrl)
    void audio.play()
  }

  const inputStyle = cn(
    'w-full px-3 py-2 rounded-lg border border-border bg-surface text-white text-sm',
    'placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blitz-accent/50 focus:border-blitz-accent transition-colors',
  )

  function Feedback({ msg }: { msg: { ok: boolean; text: string } | null | undefined }) {
    if (!msg) return null
    return (
      <div className={cn('flex items-center gap-1.5 text-xs', msg.ok ? 'text-correct' : 'text-wrong')}>
        {msg.ok ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" /> : <AlertCircle className="h-3 w-3 flex-shrink-0" />}
        {msg.text}
      </div>
    )
  }

  function isCustomSound(key: SoundKey): boolean {
    return soundConfig[key]?.startsWith('/api/') ?? false
  }

  return (
    <div className="max-w-2xl space-y-8">

      {/* Quiz details */}
      <section>
        <h2 className="text-white font-semibold mb-4">Quiz Details</h2>
        <form onSubmit={handleSaveMeta} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Quiz Name *</Label>
            <Input
              id="s-name"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
              placeholder="Quiz name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-date">Date</Label>
            <Input
              id="s-date"
              type="date"
              value={quizDate}
              onChange={(e) => setQuizDate(e.target.value)}
              className="[color-scheme:dark]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-desc">Description</Label>
            <textarea
              id="s-desc"
              value={quizDesc}
              onChange={(e) => setQuizDesc(e.target.value)}
              rows={3}
              placeholder="Optional..."
              className={cn(inputStyle, 'resize-none')}
            />
          </div>
          <Feedback msg={metaMsg} />
          <Button type="submit" disabled={savingMeta} size="sm">
            {savingMeta ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Details
          </Button>
        </form>
      </section>

      <div className="border-t border-border" />

      {/* Admin password */}
      <section>
        <h2 className="text-white font-semibold mb-1">Admin Password</h2>
        <p className="text-text-muted text-sm mb-4">Change the password used to access this dashboard.</p>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="cur-pw">Current Password</Label>
            <Input
              id="cur-pw"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New Password</Label>
            <Input
              id="new-pw"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm New Password</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <Feedback msg={pwMsg} />
          <Button type="submit" disabled={savingPw} size="sm">
            {savingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Change Password
          </Button>
        </form>
      </section>

      <div className="border-t border-border" />

      {/* Moderator PIN */}
      <section>
        <h2 className="text-white font-semibold mb-1">Moderator PIN</h2>
        <p className="text-text-muted text-sm mb-4">4-digit PIN used by the moderator to access the control panel.</p>
        <form onSubmit={handleChangePin} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="new-pin">New PIN (4 digits)</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 1234"
            />
          </div>
          <Feedback msg={pinMsg} />
          <Button type="submit" disabled={savingPin} size="sm">
            {savingPin ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Update PIN
          </Button>
        </form>
      </section>

      <div className="border-t border-border" />

      {/* Sound Effects */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Music className="h-5 w-5 text-blitz-accent" />
          <h2 className="text-white font-semibold">Sound Effects</h2>
        </div>
        <p className="text-text-muted text-sm mb-4">
          Replace any bundled sound with your own audio file (mp3, wav, ogg — max 10 MB).
          Defaults are pre-loaded; custom sounds take effect immediately after upload.
        </p>

        <div className="space-y-2">
          {SOUND_LIST.map(({ key, label, description }) => {
            const custom = isCustomSound(key)
            const loading = soundLoading[key] ?? false
            return (
              <div
                key={key}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-border/80 transition-colors"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{label}</span>
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded font-medium',
                        custom
                          ? 'bg-blitz-accent/20 text-blitz-accent'
                          : 'bg-white/10 text-text-muted',
                      )}
                    >
                      {custom ? 'Custom' : 'Default'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{description}</p>
                  <Feedback msg={soundMsg[key]} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Preview */}
                  <button
                    type="button"
                    onClick={() => handlePreview(key)}
                    disabled={loading}
                    title="Preview sound"
                    className={cn(
                      'p-1.5 rounded-lg border border-border text-text-muted hover:text-white hover:border-border/60 transition-colors',
                      loading && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>

                  {/* Upload */}
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[key]?.click()}
                    disabled={loading}
                    title="Upload custom sound"
                    className={cn(
                      'p-1.5 rounded-lg border border-border text-text-muted hover:text-white hover:border-border/60 transition-colors',
                      loading && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    type="file"
                    accept=".mp3,.wav,.ogg,.m4a,.aac"
                    className="hidden"
                    ref={(el) => { fileInputRefs.current[key] = el }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleSoundUpload(key, file)
                      e.target.value = ''
                    }}
                  />

                  {/* Reset — only shown for custom sounds */}
                  {custom && (
                    <button
                      type="button"
                      onClick={() => void handleSoundReset(key)}
                      disabled={loading}
                      title="Reset to default"
                      className={cn(
                        'p-1.5 rounded-lg border border-border text-text-muted hover:text-wrong hover:border-wrong/40 transition-colors',
                        loading && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Cloud Sync */}
      <section>
        <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-blitz-accent" />
          Cloud Sync
        </h2>
        <p className="text-text-muted text-xs mb-4">
          Configure your hosted cloud instance so quizzes played locally can be synced to the cloud for history and internet play.
        </p>
        <form onSubmit={handleSaveCloud} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="cloud-url">Cloud Server URL</Label>
            <Input
              id="cloud-url"
              value={cloudUrl}
              onChange={(e) => setCloudUrl(e.target.value)}
              placeholder="https://quiz.yourdomain.com"
            />
            <p className="text-text-muted text-xs">The public URL of your self-hosted Apoquiz instance.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cloud-key">Sync API Key</Label>
            <Input
              id="cloud-key"
              type="password"
              value={cloudApiKey}
              onChange={(e) => setCloudApiKey(e.target.value)}
              placeholder={cloudHasKey ? '••••••••  (leave blank to keep existing)' : 'Your SYNC_API_KEY from the cloud .env'}
            />
            <p className="text-text-muted text-xs">Must match <code className="font-mono bg-white/5 px-1 rounded">SYNC_API_KEY</code> in the cloud server&apos;s environment.</p>
          </div>
          <Feedback msg={cloudMsg} />
          <div className="flex gap-2">
            <Button type="submit" disabled={savingCloud} size="sm">
              {savingCloud ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Save Cloud Config
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testingCloud || !cloudUrl.trim()}
              onClick={handleTestCloud}
            >
              {testingCloud ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <TestTube className="h-3.5 w-3.5 mr-1.5" />}
              Test Connection
            </Button>
          </div>
        </form>
      </section>

    </div>
  )
}
