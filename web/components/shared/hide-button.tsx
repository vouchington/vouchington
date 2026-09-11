'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { toast } from 'sonner'
import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'
import { RSS_ITEM_HIDDEN_EVENT } from '@/lib/rss-item-modal'
import { EntityActionIcons } from './entity-action-icons'
import { useTranslations } from '@/lib/i18n/use-translations'

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
  const resetKey = `${entityType}:${entityId}:${initialActive}`
  const [hiddenState, setHiddenState] = useState({ key: resetKey, value: initialActive })
  const [pendingState, setPendingState] = useState({ key: resetKey, value: false })
  const isControlled = active !== undefined
  const isHidden = active ?? (hiddenState.key === resetKey ? hiddenState.value : initialActive)
  const isPendingControlled = pending !== undefined
  const isPending = pending ?? (pendingState.key === resetKey && pendingState.value)
  const renderedResetKeyRef = useRef(resetKey)
  const activeRequestRef = useRef<{ resetKey: string; token: symbol } | null>(null)

  useLayoutEffect(() => {
    renderedResetKeyRef.current = resetKey
  }, [resetKey])

  const setHidden = (next: boolean) => {
    if (!isControlled) setHiddenState({ key: resetKey, value: next })
    onActiveChange?.(next)
  }

  const setPending = (next: boolean) => {
    if (!isPendingControlled) setPendingState({ key: resetKey, value: next })
    onPendingChange?.(next)
  }

  const handleToggle = async () => {
    if (isPending) return
    const next = !isHidden
    const request = Symbol('hide request')
    activeRequestRef.current = { resetKey, token: request }
    const ownsRequest = () =>
      activeRequestRef.current?.token === request &&
      activeRequestRef.current.resetKey === resetKey &&
      renderedResetKeyRef.current === resetKey
    setHidden(next)
    setPending(true)
    try {
      if (next) {
        await bookmarkEntity(entityType, entityId, 'hide')
        if (ownsRequest() && entityType === 'rss_feed_item') {
          window.dispatchEvent(new CustomEvent(RSS_ITEM_HIDDEN_EVENT, { detail: { id: entityId } }))
        }
        if (ownsRequest()) onHide?.(entityId)
      } else {
        await unbookmarkEntity(entityType, entityId, 'hide')
      }
    } catch (error) {
      if (ownsRequest()) {
        setHidden(!next)
        if (isRateLimitError(error)) {
          /* c8 ignore next -- rate-limit branch requires injecting a rate-limit error */
          toast.error(getRateLimitMessage(error))
        } else {
          toast.error(t('extracted.shared.hideButton.failedToUpdatePleaseTryAgain_358a97b9'))
        }
      }
    } finally {
      if (ownsRequest()) {
        setPending(false)
      }
    }
  }

  const tooltip = isHidden
    ? t('extracted.shared.hideButton.unhide_eb2780f7')
    : t('extracted.shared.hideButton.hide_ac20a57b')

  return { handleToggle, isHidden, isPending, tooltip }
}
