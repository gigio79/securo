import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCollectionFilter } from '@/contexts/collection-filter-context'
import { Check, ChevronsUpDown, Layers, Settings2 } from 'lucide-react'

/**
 * Global "active collection" selector (issue #105). Filters the app to the
 * accounts in the chosen collection. Hidden until the user has at least one
 * collection so it never clutters the sidebar for people who don't use it.
 */
export function CollectionSelector() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { collections, activeCollection, setActiveCollectionId } = useCollectionFilter()

  if (collections.length === 0) return null

  return (
    <div className="px-3 pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 w-full rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 px-2.5 py-1.5 text-left hover:bg-sidebar-accent/50 transition-colors">
            {activeCollection ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: activeCollection.color }} />
            ) : (
              <Layers size={13} className="shrink-0 text-sidebar-muted" />
            )}
            <span className="flex-1 min-w-0 truncate text-xs font-medium text-sidebar-foreground">
              {activeCollection?.name ?? t('collections.allAccounts')}
            </span>
            <ChevronsUpDown size={13} className="shrink-0 text-sidebar-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setActiveCollectionId(null)} className="flex items-center gap-2">
            <Layers size={14} className="text-muted-foreground" />
            <span className="flex-1">{t('collections.allAccounts')}</span>
            {!activeCollection && <Check size={14} className="text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {collections.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => setActiveCollectionId(c.id)} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-[10.5px] text-muted-foreground/70">{c.account_count}</span>
              {activeCollection?.id === c.id && <Check size={14} className="text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => nav('/collections')} className="flex items-center gap-2 text-muted-foreground">
            <Settings2 size={14} />
            {t('collections.manage')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
