import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useWorkspace } from '@/contexts/workspace-context'
import { workspaces as workspacesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, ChevronsUpDown, Plus, Briefcase, User as UserIcon, Settings } from 'lucide-react'

const ROLE_BADGE: Record<string, string> = {
  owner: 'owner',
  editor: 'editor',
  viewer: 'viewer',
  manager: 'manager',
}

export function WorkspaceSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { current, workspaces, switchWorkspace, refresh } = useWorkspace()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      workspacesApi.create({
        name: newName.trim(),
        self_membership: true,
      }),
    onSuccess: async (ws) => {
      toast.success(t('workspace.createSuccess', 'Workspace created'))
      await refresh()
      await switchWorkspace(ws.id)
      setCreateOpen(false)
      setNewName('')
      navigate('/workspace/settings')
    },
    onError: (e: unknown) => {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : 'Failed to create workspace')
      toast.error(detail)
    },
  })

  if (!current) return null

  const showSwitcher = workspaces.length > 1

  // Single-workspace users get a static label that just opens the settings
  // page on click. Multi-workspace users get the full dropdown.
  if (!showSwitcher) {
    return (
      <button
        onClick={() => navigate('/workspace/settings')}
        className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm hover:bg-sidebar-accent transition-colors text-left"
      >
        <div className="h-7 w-7 shrink-0 rounded-md bg-primary/15 flex items-center justify-center text-primary">
          {current.kind === 'personal' ? <UserIcon size={14} /> : <Briefcase size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{current.name}</p>
          <p className="text-[10px] text-sidebar-muted/70 truncate">
            {current.role && ROLE_BADGE[current.role]}
          </p>
        </div>
        <Settings size={13} className="text-sidebar-muted/60 shrink-0" />
      </button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm hover:bg-sidebar-accent transition-colors text-left">
            <div className="h-7 w-7 shrink-0 rounded-md bg-primary/15 flex items-center justify-center text-primary">
              {current.kind === 'personal' ? <UserIcon size={14} /> : <Briefcase size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{current.name}</p>
              <p className="text-[10px] text-sidebar-muted/70 truncate">
                {current.role && ROLE_BADGE[current.role]}
              </p>
            </div>
            <ChevronsUpDown size={13} className="text-sidebar-muted/60 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" side="top">
          <DropdownMenuLabel className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
            {t('workspace.switcherTitle', 'Switch workspace')}
          </DropdownMenuLabel>
          {workspaces.map((w) => {
            const isActive = w.id === current.id
            return (
              <DropdownMenuItem
                key={w.id}
                onClick={() => void switchWorkspace(w.id)}
                className="flex items-center gap-2"
              >
                <div className="h-5 w-5 shrink-0 rounded-sm bg-primary/12 flex items-center justify-center text-primary">
                  {w.kind === 'personal' ? <UserIcon size={11} /> : <Briefcase size={11} />}
                </div>
                <span className="flex-1 truncate">{w.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {w.role && ROLE_BADGE[w.role]}
                </span>
                {isActive && <Check size={12} className="text-primary ml-1" />}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => navigate('/workspace/settings')}
            className="flex items-center gap-2"
          >
            <Settings size={13} />
            <span className="flex-1">{t('workspace.settingsMenu', 'Workspace settings')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus size={13} />
            <span className="flex-1">{t('workspace.create', 'New workspace')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('workspace.createTitle', 'New workspace')}</DialogTitle>
            <DialogDescription>
              {t(
                'workspace.createDescription',
                'A workspace holds its own accounts, categories, budgets, and goals. You can invite people into it from the workspace settings page.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-create-name" className="text-[13px]">
                {t('common.name', 'Name')}
              </Label>
              <Input
                id="ws-create-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('workspace.createPlaceholder', 'e.g. Side project, Family')}
                className="h-10 rounded-lg"
                autoFocus
                maxLength={100}
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName.trim()}
              className="rounded-lg"
            >
              {createMutation.isPending ? t('common.loading') : t('common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
