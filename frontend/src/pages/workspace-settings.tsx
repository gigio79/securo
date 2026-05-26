import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { workspaces as workspacesApi } from '@/lib/api'
import { useWorkspace } from '@/contexts/workspace-context'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'
import { Plus, Trash2, UserCog, Save, Users } from 'lucide-react'
import type { WorkspaceMember, WorkspaceRole } from '@/types'

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
  manager: 'Manager',
}

const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: 'Full access — can manage members, settings, and all data',
  editor: 'Can read and write all financial data',
  viewer: 'Read-only access',
  manager: 'External administrator — effective owner without being a member',
}

export default function WorkspaceSettingsPage() {
  const { t } = useTranslation()
  const { current, canManage, refresh } = useWorkspace()
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const [editName, setEditName] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [editLocale, setEditLocale] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('editor')
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)

  // Initialize edit fields when the active workspace changes.
  useEffect(() => {
    if (!current) return
    setEditName(current.name)
    setEditCurrency(current.default_currency)
    setEditLocale(current.locale ?? '')
  }, [current?.id, current?.name, current?.default_currency, current?.locale])

  const membersQuery = useQuery({
    queryKey: ['workspace-members', current?.id],
    queryFn: () => (current ? workspacesApi.listMembers(current.id) : Promise.resolve([])),
    enabled: !!current,
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('No workspace')
      return workspacesApi.update(current.id, {
        name: editName,
        default_currency: editCurrency,
        locale: editLocale || null as unknown as string,
      })
    },
    onSuccess: () => {
      toast.success('Workspace updated')
      void refresh()
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Update failed'
      toast.error(msg)
    },
  })

  const inviteMutation = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('No workspace')
      return workspacesApi.invite(current.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
        password: invitePassword || undefined,
      })
    },
    onSuccess: () => {
      toast.success('Member added')
      setInviteOpen(false)
      setInviteEmail('')
      setInvitePassword('')
      setInviteRole('editor')
      queryClient.invalidateQueries({ queryKey: ['workspace-members', current?.id] })
    },
    onError: (e: unknown) => {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : 'Invite failed')
      toast.error(detail)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (member: WorkspaceMember) => {
      if (!current) throw new Error('No workspace')
      return workspacesApi.removeMember(current.id, member.user_id)
    },
    onSuccess: () => {
      toast.success('Member removed')
      setRemoveTarget(null)
      queryClient.invalidateQueries({ queryKey: ['workspace-members', current?.id] })
    },
    onError: (e: unknown) => {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : 'Remove failed')
      toast.error(detail)
    },
  })

  const roleChangeMutation = useMutation({
    mutationFn: ({ member, role }: { member: WorkspaceMember; role: WorkspaceRole }) => {
      if (!current) throw new Error('No workspace')
      return workspacesApi.changeRole(current.id, member.user_id, role)
    },
    onSuccess: () => {
      toast.success('Role updated')
      queryClient.invalidateQueries({ queryKey: ['workspace-members', current?.id] })
    },
    onError: (e: unknown) => {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : 'Update failed')
      toast.error(detail)
    },
  })

  if (!current) {
    return (
      <div className="container max-w-4xl py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const members = membersQuery.data ?? []
  const isManaged = !!current.managed_by_user_id
  const isManagerSelf = isManaged && current.managed_by_user_id === currentUser?.id

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <PageHeader
        title={t('workspace.settings', 'Workspace settings')}
        description={t('workspace.settingsDescription', 'Manage workspace details and who has access.')}
      />

      {/* Workspace details */}
      <section className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Details</h2>
          {isManaged && (
            <Badge variant="secondary">
              {isManagerSelf ? 'You manage this workspace' : 'Externally managed'}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={!canManage}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-currency">Default currency</Label>
            <Input
              id="ws-currency"
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value.toUpperCase())}
              disabled={!canManage}
              maxLength={3}
              placeholder="USD"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-locale">Locale</Label>
            <Input
              id="ws-locale"
              value={editLocale}
              onChange={(e) => setEditLocale(e.target.value)}
              disabled={!canManage}
              maxLength={10}
              placeholder="en, pt-BR"
            />
          </div>
          <div className="space-y-2">
            <Label>Kind</Label>
            <Input value={current.kind} disabled />
          </div>
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Members</h2>
            <Badge variant="outline">{members.length}</Badge>
          </div>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add member
            </Button>
          )}
        </div>

        {membersQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No members yet. {canManage && 'Click "Add member" to invite someone.'}
          </p>
        ) : (
          <ul className="divide-y">
            {members.map((m) => {
              const isMe = m.user_id === currentUser?.id
              return (
                <li key={m.id} className="py-3 flex items-center gap-4">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>
                      {(m.display_name || m.email).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {m.display_name || m.email}
                      {isMe && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {canManage && !isMe ? (
                    <Select
                      value={m.role}
                      onValueChange={(value) =>
                        roleChangeMutation.mutate({
                          member: m,
                          role: value as WorkspaceRole,
                        })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['owner', 'editor', 'viewer'] as WorkspaceRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                  )}
                  {canManage && !isMe && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoveTarget(m)}
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Invite an existing user by email, or create a new one by providing a password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as WorkspaceRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['owner', 'editor', 'viewer'] as WorkspaceRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      <div className="flex flex-col">
                        <span>{ROLE_LABELS[r]}</span>
                        <span className="text-xs text-muted-foreground">
                          {ROLE_DESCRIPTIONS[r]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">Password (only for new users)</Label>
              <Input
                id="invite-password"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Leave empty if user already exists"
              />
              <p className="text-xs text-muted-foreground">
                If the email isn't already registered, this password will be used to
                create their account. They can change it after first login.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
            >
              <UserCog className="mr-2 h-4 w-4" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm remove dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove {removeTarget?.email} from this workspace? They'll lose access to all
              data inside it. This does not delete their user account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && removeMutation.mutate(removeTarget)}
              disabled={removeMutation.isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
