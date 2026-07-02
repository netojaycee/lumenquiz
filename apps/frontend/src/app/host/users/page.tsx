'use client'
import { useState, useEffect } from 'react'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useHostStore } from '@/stores/useHostStore'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface UserListItem {
  id: string
  email: string
  name: string
  role: string
  areaName: string | null
  status: string
  createdAt: string
}

interface AreaItem {
  id: string
  name: string
  status: string
}

export default function UserManagementPage(): React.ReactElement {
  const { user } = useHostStore()
  const [users, setUsers] = useState<UserListItem[]>([])
  const [areas, setAreas] = useState<AreaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'OWNER' | 'MEMBER'>('MEMBER')
  const [inviteArea, setInviteArea] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null)

  const loadUsers = async () => {
    try {
      const res = await api.get<UserListItem[]>('/users')
      setUsers(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    }
  }

  const loadAreas = async () => {
    try {
      const res = await fetch('https://api.afmweca.org/afmchurches/api/v1/area')
      const json = await res.json()
      if (json?.data?.data) {
        setAreas(json.data.data)
      }
    } catch {
      // Fallback silently if public areas API goes down
    }
  }

  useEffect(() => {
    Promise.all([loadUsers(), loadAreas()]).finally(() => setLoading(false))
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !inviteName.trim()) return

    setInviting(true)
    setInviteError(null)
    setInviteSuccess(false)

    try {
      // Determine the area to assign based on role: admins assign dropdown selection, owners get their own areaName forced on backend.
      const assignedArea = user?.role === 'ADMIN' ? inviteArea : user?.areaName || undefined

      await api.post('/auth/invite', {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
        areaName: assignedArea,
      })

      setInviteSuccess(true)
      setInviteEmail('')
      setInviteName('')
      loadUsers().catch(() => {})
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  async function toggleUserStatus(target: UserListItem) {
    setProcessingId(target.id)
    const isSuspended = target.status === 'suspended'
    const endpoint = `/users/${target.id}/${isSuspended ? 'reactivate' : 'suspend'}`
    try {
      await api.post(endpoint)
      await loadUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setProcessingId(null)
    }
  }

  async function updateUserRole(target: UserListItem, newRole: 'OWNER' | 'MEMBER') {
    setProcessingId(target.id)
    try {
      await api.post(`/users/${target.id}/role`, { role: newRole })
      await loadUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080E] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#3B82F6] animate-spin" />
      </div>
    )
  }

  // Filter drop-down areas so Super Admins can only assign unregistered Areas to Owners if they want to enforce tenancy rules

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 bg-[#08080E] min-h-screen text-white">
      <div className="flex justify-between items-center border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">User Directory</h1>
          <p className="text-sm text-white/40 mt-1">
            {user?.role === 'ADMIN' ? 'Manage global platforms and invite area owners' : `Manage members for ${user?.areaName}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Invite Form */}
        <div className="lg:col-span-1 bg-white/[0.03] border border-white/10 rounded-2xl p-6 h-fit space-y-6">
          <div>
            <h3 className="text-lg font-bold">Invite User</h3>
            <p className="text-xs text-white/40 mt-0.5">Invited users receive a secure password setup link via email</p>
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs text-white/60">Full Name</Label>
              <Input
                id="name"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Jane Doe"
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-white/60">Email Address</Label>
              <Input
                id="email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jane@domain.com"
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs text-white/60">Role</Label>
              <select
                id="role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'OWNER' | 'MEMBER')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-[#3B82F6]/20 text-sm"
              >
                {user?.role === 'ADMIN' && (
                  <option value="ADMIN" className="bg-[#08080E]">Global Admin</option>
                )}
                {(user?.role === 'ADMIN' || user?.role === 'OWNER') && (
                  <option value="OWNER" className="bg-[#08080E]">Area Owner</option>
                )}
                <option value="MEMBER" className="bg-[#08080E]">Member</option>
              </select>
            </div>

            {user?.role === 'ADMIN' && (inviteRole === 'OWNER' || inviteRole === 'MEMBER') && (
              <div className="space-y-1.5">
                <Label htmlFor="area" className="text-xs text-white/60">Select Area</Label>
                <select
                  id="area"
                  required
                  value={inviteArea}
                  onChange={(e) => setInviteArea(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-[#3B82F6]/20 text-sm"
                >
                  <option value="" className="bg-[#08080E]">Choose Area...</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.name} className="bg-[#08080E]">{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {inviteError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                Invitation email dispatched!
              </div>
            )}

            <Button
              type="submit"
              disabled={inviting}
              className="w-full bg-[#3B82F6] hover:bg-blue-500 rounded-xl py-2.5 font-bold"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Send Invite'}
            </Button>
          </form>
        </div>

        {/* Right column: Users Directory Grid */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold">Registered Users</h3>

          {error ? (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : users.length === 0 ? (
            <div className="bg-white/[0.02] border border-white/5 p-12 text-center rounded-2xl text-white/30 text-sm">
              No registered users in this directory.
            </div>
          ) : (
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 text-[10px] uppercase font-bold tracking-wider bg-white/[0.02]">
                      <th className="px-6 py-4">User Details</th>
                      <th className="px-6 py-4">Area &amp; Role</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {users.map((item) => {
                      const isSelf = item.id === user?.id
                      const isSuspended = item.status === 'suspended'
                      const isUserAdmin = item.role === 'ADMIN'

                      return (
                        <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-white">{item.name}</div>
                            <div className="text-xs text-white/40">{item.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white font-medium">{item.areaName || 'Global/Admin'}</div>
                            <div className="text-xs text-white/40 uppercase tracking-wider mt-0.5">{item.role}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={isSuspended ? 'error' : 'success'}>
                              {item.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isSelf || isUserAdmin ? (
                              <span className="text-[10px] text-white/20 uppercase tracking-widest font-semibold pr-2">Protected</span>
                            ) : (
                              <div className="flex justify-end items-center gap-2">
                                {item.role === 'MEMBER' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === item.id}
                                    onClick={() => updateUserRole(item, 'OWNER')}
                                    className="h-7 text-xs px-2.5 rounded-lg border-correct/20 text-correct hover:bg-correct/10"
                                  >
                                    Make Owner
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === item.id}
                                    onClick={() => updateUserRole(item, 'MEMBER')}
                                    className="h-7 text-xs px-2.5 rounded-lg border-white/10 text-white/60 hover:text-white"
                                  >
                                    Make Member
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant={isSuspended ? 'outline' : 'destructive'}
                                  disabled={processingId === item.id}
                                  onClick={() => toggleUserStatus(item)}
                                  className="h-7 text-xs px-3 rounded-lg"
                                >
                                  {processingId === item.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : isSuspended ? (
                                    'Reactivate'
                                  ) : (
                                    'Suspend'
                                  )}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
