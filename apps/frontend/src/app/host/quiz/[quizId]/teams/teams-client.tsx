'use client'
import { useRef, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Users,
  Camera,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { Dialog } from '@/components/ui/dialog'
import { api, getBaseUrl } from '@/lib/api'
import { useHostStore } from '@/stores/useHostStore'
import { cn } from '@/lib/utils'
import type { Team } from '@apoquiz/shared-types'
import { useQuizId } from '@/hooks/useQuizId'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3B82F6',
  '#44efc4',
  '#22C55E',
  '#f89d00',
  '#8B5CF6',
  '#edc878',
  '#14B8A6',
  '#f17822',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberFormState {
  name: string
  avatarUrl?: string
  avatarFile?: File
  uploading?: boolean
}

interface TeamFormState {
  name: string
  color: string
  members: MemberFormState[]
}

const EMPTY_MEMBER: MemberFormState = { name: '' }
const EMPTY_FORM: TeamFormState = { name: '', color: PRESET_COLORS[0]!, members: [EMPTY_MEMBER] }

// ─── Avatar preview component ─────────────────────────────────────────────────

function AvatarPreview({ member, size = 40 }: { member: MemberFormState; size?: number }) {
  const url = member.avatarFile
    ? URL.createObjectURL(member.avatarFile)
    : member.avatarUrl
      ? (member.avatarUrl.startsWith('/') ? `${getBaseUrl()}${member.avatarUrl}` : member.avatarUrl)
      : null

  const initials = member.name
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || '?'

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={member.name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamsClient(): React.ReactElement {
  const quizId = useQuizId()
  const { currentQuiz, loadQuiz } = useHostStore()
  const quiz = currentQuiz?.id === quizId ? currentQuiz : null
  const teams = (quiz?.teams ?? []).filter((t) => !t.deletedAt)

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTeam, setEditTeam] = useState<Team | null>(null)
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Copy join code feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [regenId, setRegenId] = useState<string | null>(null)

  // File input refs (one per member row, max 10)
  const fileRefs = useRef<Array<HTMLInputElement | null>>([])

  function refresh() {
    if (quizId !== '_') loadQuiz(quizId).catch(() => {})
  }

  function openAdd() {
    setEditTeam(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setSheetOpen(true)
  }

  function openEdit(team: Team) {
    setEditTeam(team)
    setForm({
      name: team.name,
      color: team.color,
      members: team.members?.map((m) => ({ name: m.name, avatarUrl: m.avatarUrl })) ?? [EMPTY_MEMBER],
    })
    setFormError(null)
    setSheetOpen(true)
  }

  function setMemberName(i: number, val: string) {
    setForm((f) => {
      const members = [...f.members]
      members[i] = { ...members[i]!, name: val }
      return { ...f, members }
    })
  }

  function addMember() {
    setForm((f) => ({ ...f, members: [...f.members, { ...EMPTY_MEMBER }] }))
  }

  function removeMember(i: number) {
    setForm((f) => ({ ...f, members: f.members.filter((_, idx) => idx !== i) }))
  }

  async function handleAvatarChange(i: number, file: File | undefined) {
    if (!file) return
    setForm((f) => {
      const members = [...f.members]
      members[i] = { ...members[i]!, avatarFile: file, uploading: true }
      return { ...f, members }
    })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { url } = await api.postFormData<{ url: string }>('/uploads/member-avatar', fd)
      setForm((f) => {
        const members = [...f.members]
        members[i] = { ...members[i]!, avatarUrl: url, uploading: false }
        return { ...f, members }
      })
    } catch {
      setForm((f) => {
        const members = [...f.members]
        members[i] = { ...members[i]!, uploading: false }
        return { ...f, members }
      })
      setFormError('Avatar upload failed — image saved locally for now')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Team name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      name: form.name.trim(),
      color: form.color,
      members: form.members
        .filter((m) => m.name.trim())
        .map((m) => ({ name: m.name.trim(), avatarUrl: m.avatarUrl })),
    }
    try {
      if (editTeam) {
        await api.patch<Team>(`/quiz/${quizId}/teams/${editTeam.id}`, payload)
      } else {
        await api.post<Team>(`/quiz/${quizId}/teams`, payload)
      }
      setSheetOpen(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save team')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(teamId: string) {
    setDeleting(true)
    try {
      await api.delete<unknown>(`/quiz/${quizId}/teams/${teamId}`)
      setDeleteId(null)
      refresh()
    } catch {
      // stay open
    } finally {
      setDeleting(false)
    }
  }

  async function handleRegenJoinCode(teamId: string) {
    setRegenId(teamId)
    try {
      await api.post<unknown>(`/quiz/${quizId}/teams/${teamId}/regenerate-join-code`, {})
      refresh()
    } finally {
      setRegenId(null)
    }
  }

  async function handleCopyJoinCode(team: Team) {
    const code = team.joinCode ?? ''
    await navigator.clipboard.writeText(code)
    setCopiedId(team.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Teams</h2>
            <p className="text-text-muted mt-0.5 text-sm">
              {teams.length} team{teams.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Team
          </Button>
        </div>

        {/* Team list */}
        {teams.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-16 text-center">
            <Users className="text-text-muted mx-auto mb-3 h-8 w-8" />
            <p className="text-text-muted text-sm">No teams yet.</p>
            <Button size="sm" className="mt-3" onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Team
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className="border-border bg-surface group flex items-center gap-4 rounded-xl border p-4"
              >
                {/* Color dot */}
                <div
                  className="h-4 w-4 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: team.color }}
                />

                {/* Member avatars */}
                {(team.members ?? []).length > 0 && (
                  <div className="flex -space-x-2">
                    {(team.members ?? []).slice(0, 4).map((m) => {
                      const src = m.avatarUrl
                        ? (m.avatarUrl.startsWith('/') ? `${getBaseUrl()}${m.avatarUrl}` : m.avatarUrl)
                        : null
                      return src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={m.id}
                          src={src}
                          alt={m.name}
                          title={m.name}
                          className="h-7 w-7 rounded-full border-2 border-[#1A1A24] object-cover"
                        />
                      ) : (
                        <div
                          key={m.id}
                          title={m.name}
                          className="h-7 w-7 rounded-full border-2 border-[#1A1A24] bg-white/10 flex items-center justify-center text-[9px] font-bold text-white"
                        >
                          {m.name[0]?.toUpperCase()}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{team.name}</p>
                  <p className="text-text-muted mt-0.5 truncate text-xs">
                    {team.members?.map((m) => m.name).join(', ') || 'No members'}
                  </p>
                </div>

                {/* Join Code */}
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {team.joinCode ? (
                    <span className="text-text-secondary font-mono text-sm tracking-widest">{team.joinCode}</span>
                  ) : (
                    <span className="text-text-muted text-xs italic">No code yet</span>
                  )}
                  <button
                    onClick={() => handleCopyJoinCode(team)}
                    className="text-text-muted p-1 transition-colors hover:text-white"
                    title="Copy join code"
                    disabled={!team.joinCode}
                  >
                    {copiedId === team.id ? (
                      <Check className="text-correct h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRegenJoinCode(team.id)}
                    disabled={regenId === team.id}
                    className="text-text-muted p-1 transition-colors hover:text-white disabled:opacity-50"
                    title="Regenerate join code"
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5', regenId === team.id && 'animate-spin')}
                    />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(team)}
                    className="text-text-muted p-1.5 transition-colors hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(team.id)}
                    className="text-text-muted hover:text-wrong p-1.5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit team sheet */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editTeam ? 'Edit Team' : 'Add Team'}
        description={editTeam ? 'Update team details' : 'Add a new team to this quiz'}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team Name *</Label>
            <Input
              id="team-name"
              placeholder="e.g. Team Fire"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Team Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-all',
                    form.color === c ? 'scale-110 border-white' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="border-border h-8 w-8 cursor-pointer rounded-full border-2 bg-transparent"
                  title="Custom color"
                />
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="space-y-3">
            <Label>Team Members (up to 3)</Label>
            {form.members.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Avatar preview + upload trigger */}
                <div className="relative flex-shrink-0">
                  <AvatarPreview member={m} size={40} />
                  <button
                    type="button"
                    onClick={() => fileRefs.current[i]?.click()}
                    disabled={m.uploading}
                    className="absolute -bottom-1 -right-1 rounded-full bg-white/20 p-0.5 hover:bg-white/30 transition-colors"
                    title="Upload photo"
                  >
                    {m.uploading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                    ) : (
                      <Camera className="h-3 w-3 text-white" />
                    )}
                  </button>
                  <input
                    ref={(el) => { fileRefs.current[i] = el }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => handleAvatarChange(i, e.target.files?.[0])}
                  />
                </div>

                <Input
                  placeholder={`Member ${i + 1} name`}
                  value={m.name}
                  onChange={(e) => setMemberName(i, e.target.value)}
                  className="flex-1"
                />
                {form.members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    className="text-text-muted hover:text-wrong flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {form.members.length < 3 && (
              <button
                type="button"
                onClick={addMember}
                className="text-blitz-accent flex items-center gap-1 text-sm transition-colors hover:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                Add member
              </button>
            )}
            <p className="text-text-muted text-xs">
              Tap the camera icon on each avatar to upload a photo (optional)
            </p>
          </div>

          {formError && (
            <div className="text-wrong flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editTeam ? 'Save Changes' : 'Add Team'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Team?"
        description="This will remove the team and all associated data."
      >
        <div className="flex gap-3">
          <Button
            variant="destructive"
            disabled={deleting}
            className="flex-1"
            onClick={() => deleteId && handleDelete(deleteId)}
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Delete Team
          </Button>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  )
}
