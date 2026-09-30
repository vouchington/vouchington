'use client'

import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslations } from '@/lib/i18n/use-translations'
import { EntityActionIcons } from './entity-action-icons'
import { useKeyedBookmarkToggle } from './use-keyed-bookmark-toggle'

interface SaveButtonProps {
  entityType: string
  entityId: string
  initialActive?: boolean
  active?: boolean
  onActiveChange?: (active: boolean) => void
  pending?: boolean
  onPendingChange?: (pending: boolean) => void
  'data-pw'?: string
}

export function SaveButton({
  entityType,
  entityId,
  initialActive = false,
  active,
  onActiveChange,
  pending,
  onPendingChange,
  'data-pw': dataPw = 'save-button',
}: SaveButtonProps) {
  const { handleToggle, Icon, isPending, isSaved, tooltip } = useSaveToggle({
    entityType,
    entityId,
    initialActive,
    active,
    onActiveChange,
    pending,
    onPendingChange,
  })
  const t = useTranslations()

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-label={
              isSaved
                ? t('extracted.shared.saveButton.saved_b5c120b3')
                : t('extracted.shared.saveButton.save_1509f561')
            }
            aria-pressed={isSaved}
            onClick={handleToggle}
            disabled={isPending}
            data-pw={dataPw}
            className={`h-auto min-h-11 min-w-11 px-1.5 py-1 ${isSaved ? 'text-orange-500' : 'text-muted-foreground'}`}
          >
            <Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SaveMenuItem(props: SaveButtonProps) {
  const { handleToggle, Icon, isPending, isSaved } = useSaveToggle(props)
  const t = useTranslations()

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={(event: Event) => {
        event.preventDefault()
        void handleToggle()
      }}
      data-pw='save-menu-item'
    >
      <Icon />
      {isSaved
        ? t('extracted.shared.saveButton.removeFromSavedItems_f93380a8')
        : t('extracted.shared.saveButton.save_1509f561')}
    </DropdownMenuItem>
  )
}

function useSaveToggle({
  entityType,
  entityId,
  initialActive = false,
  active,
  onActiveChange,
  pending,
  onPendingChange,
}: SaveButtonProps) {
  const t = useTranslations()
  const { handleToggle, isActive, isPending } = useKeyedBookmarkToggle({
    entityType,
    entityId,
    predicate: 'save',
    initialActive,
    active,
    onActiveChange,
    pending,
    onPendingChange,
    failureMessage: t('extracted.shared.saveButton.failedToUpdatePleaseTryAgain_358a97b9'),
  })
  const tooltip = isActive
    ? t('extracted.shared.saveButton.removeFromSavedItems_f93380a8')
    : t('extracted.shared.saveButton.saveThisItemForLater_f9e7328b')
  const Icon = isActive ? EntityActionIcons.saved : EntityActionIcons.save

  return { handleToggle, Icon, isPending, isSaved: isActive, tooltip }
}
