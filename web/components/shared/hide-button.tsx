'use client'

import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'
import { useTranslations } from '@/lib/i18n/use-translations'
import { EntityActionIcons } from './entity-action-icons'
import { useKeyedBookmarkToggle } from './use-keyed-bookmark-toggle'

interface HideButtonProps {
  entityType: string
  entityId: string
  initialActive?: boolean
  active?: boolean
  onActiveChange?: (active: boolean) => void
  pending?: boolean
  onPendingChange?: (pending: boolean) => void
  onHide?: (entityId: string) => void
}

export function HideButton({
  entityType,
  entityId,
  initialActive = false,
  active,
  onActiveChange,
  pending,
  onPendingChange,
  onHide,
}: HideButtonProps) {
  const t = useTranslations()
  const { handleToggle, isHidden, isPending, tooltip } = useHideToggle({
    entityType,
    entityId,
    initialActive,
    active,
    onActiveChange,
    pending,
    onPendingChange,
    onHide,
  })
  const HideIcon = EntityActionIcons.hide

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-label={
              isHidden
                ? t('extracted.shared.hideButton.unhide_eb2780f7')
                : t('extracted.shared.hideButton.hide_ac20a57b')
            }
            aria-pressed={isHidden}
            onClick={handleToggle}
            disabled={isPending}
            data-pw='hide-button'
            className={`h-auto min-h-11 min-w-11 px-1.5 py-1 ${isHidden ? 'text-orange-500' : 'text-muted-foreground'}`}
          >
            <HideIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function HideMenuItem(props: HideButtonProps) {
  const t = useTranslations()
  const { handleToggle, isHidden, isPending } = useHideToggle(props)
  const HideIcon = EntityActionIcons.hide

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={(event: Event) => {
        event.preventDefault()
        void handleToggle()
      }}
      data-pw='hide-menu-item'
    >
      <HideIcon />
      {isHidden
        ? t('extracted.shared.hideButton.unhide_eb2780f7')
        : t('extracted.shared.hideButton.hide_ac20a57b')}
    </DropdownMenuItem>
  )
}

function useHideToggle({
  entityType,
  entityId,
  initialActive = false,
  active,
  onActiveChange,
  pending,
  onPendingChange,
  onHide,
}: HideButtonProps) {
  const t = useTranslations()
  const { handleToggle, isActive, isPending } = useKeyedBookmarkToggle({
    entityType,
    entityId,
    predicate: 'hide',
    initialActive,
    active,
    onActiveChange,
    pending,
    onPendingChange,
    failureMessage: t('extracted.shared.hideButton.failedToUpdatePleaseTryAgain_358a97b9'),
    onActivated(id) {
      if (entityType === 'rss_feed_item') {
        window.dispatchEvent(new CustomEvent(RSS_ITEM_HIDDEN_EVENT, { detail: { id } }))
      }
      onHide?.(id)
    },
  })
  const tooltip = isActive
    ? t('extracted.shared.hideButton.unhide_eb2780f7')
    : t('extracted.shared.hideButton.hide_ac20a57b')

  return { handleToggle, isHidden: isActive, isPending, tooltip }
}
