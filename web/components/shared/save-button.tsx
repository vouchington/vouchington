'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { toast } from 'sonner'
import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'
import { EntityActionIcons } from './entity-action-icons'
import { useTranslations } from '@/lib/i18n/use-translations'

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
  const resetKey = `${entityType}:${entityId}:${initialActive}`
  const [savedState, setSavedState] = useState({ key: resetKey, value: initialActive })
  const [pendingState, setPendingState] = useState({ key: resetKey, value: false })
  const isControlled = active !== undefined
  const isSaved = active ?? (savedState.key === resetKey ? savedState.value : initialActive)
  const isPendingControlled = pending !== undefined
  const isPending = pending ?? (pendingState.key === resetKey && pendingState.value)
  const renderedResetKeyRef = useRef(resetKey)
  const activeRequestRef = useRef<{ resetKey: string; token: symbol } | null>(null)

  useLayoutEffect(() => {
    renderedResetKeyRef.current = resetKey
  }, [resetKey])

  const setSaved = (next: boolean) => {
    if (!isControlled) setSavedState({ key: resetKey, value: next })
    onActiveChange?.(next)
  }

  const setPending = (next: boolean) => {
    if (!isPendingControlled) setPendingState({ key: resetKey, value: next })
    onPendingChange?.(next)
  }

  const handleToggle = async () => {
    if (isPending) return
    const next = !isSaved
    const request = Symbol('save request')
    activeRequestRef.current = { resetKey, token: request }
    const ownsRequest = () =>
      activeRequestRef.current?.token === request &&
      activeRequestRef.current.resetKey === resetKey &&
      renderedResetKeyRef.current === resetKey
    setSaved(next)
    setPending(true)
    try {
      if (next) {
        await bookmarkEntity(entityType, entityId, 'save')
      } else {
        await unbookmarkEntity(entityType, entityId, 'save')
      }
    } catch (error) {
      if (ownsRequest()) {
        setSaved(!next)
        if (isRateLimitError(error)) {
          /* c8 ignore next -- rate-limit branch requires injecting a rate-limit error */
          toast.error(getRateLimitMessage(error))
        } else {
          toast.error(t('extracted.shared.saveButton.failedToUpdatePleaseTryAgain_358a97b9'))
        }
      }
    } finally {
      if (ownsRequest()) {
        setPending(false)
      }
    }
  }

  const tooltip = isSaved
    ? t('extracted.shared.saveButton.removeFromSavedItems_f93380a8')
    : t('extracted.shared.saveButton.saveThisItemForLater_f9e7328b')
  const Icon = isSaved ? EntityActionIcons.saved : EntityActionIcons.save

  return { handleToggle, Icon, isPending, isSaved, tooltip }
}
