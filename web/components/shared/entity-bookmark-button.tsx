/* eslint-disable max-lines, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { bookmarkEntity, getEntityBookmarks, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { emitBookmarkChange, onBookmarkChange } from '@/hooks/use-bookmark-invalidation'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { toast } from 'sonner'
import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { BOOKMARK_PRESETS, type EntityBookmarkPreset } from './entity-bookmark-button-presets'
import { EntityActionIcons, type EntityActionIconKey } from './entity-action-icons'
// Mirrors backend/services/bookmarks/upsert.mts IMPLICIT_UNFOLLOW — adding a mute/block
// on these entity:predicate pairs causes the server to also remove the follow relation.
const IMPLICIT_UNFOLLOW: Record<string, string> = {
  'topic:mute': 'follow',
  'topic:block': 'follow',
  'user:block': 'follow',
  'rss_feed:mute': 'follow',
  'community:proxy_mute': 'proxy_follow',
}
interface BookmarkButtonState {
  key: string
  isActive: boolean
  isPending: boolean
  didLoadInitial: boolean
}
export interface EntityBookmarkButtonProps {
  entityType: string
  entityId: string
  preset?: EntityBookmarkPreset
  predicate?: string
  activeLabel?: string
  inactiveLabel?: string
  errorLabel?: string
  initialActive?: boolean
  variant?: 'default' | 'secondary' | 'outline'
  size?: ButtonProps['size']
  tooltip?: ReactNode
  loadingTooltip?: string
  activeTooltip?: string
  inactiveTooltip?: string
  iconKey?: EntityActionIconKey
  onChange?: (isActive: boolean) => void
  'aria-label'?: string
  'data-pw'?: string
}
export function EntityBookmarkButton({
  entityType,
  entityId,
  preset,
  predicate,
  activeLabel,
  inactiveLabel,
  errorLabel,
  initialActive,
  variant,
  size = 'sm',
  tooltip,
  loadingTooltip,
  activeTooltip,
  inactiveTooltip,
  iconKey,
  onChange,
  'aria-label': ariaLabel,
  'data-pw': dataPw = 'entity-bookmark-button',
}: EntityBookmarkButtonProps) {
  const t = useTranslations()
  const presetConfig = preset ? BOOKMARK_PRESETS[preset] : undefined
  const resolvedPredicate = predicate ?? presetConfig?.predicate
  const resolvedActiveLabel =
    activeLabel ?? (presetConfig ? t(presetConfig.activeLabel) : undefined)
  const resolvedInactiveLabel =
    inactiveLabel ?? (presetConfig ? t(presetConfig.inactiveLabel) : undefined)
  const resolvedErrorLabel =
    errorLabel ??
    (presetConfig ? t(presetConfig.errorLabel) : undefined) ??
    t('extracted.shared.entityBookmarkButton.bookmark_ffe7fcd2')
  const resolvedVariant = variant ?? presetConfig?.variant ?? 'default'
  const resolvedLoadingTooltip =
    loadingTooltip ?? (presetConfig?.loadingTooltip ? t(presetConfig.loadingTooltip) : undefined)
  const resolvedActiveTooltip = activeTooltip
  const resolvedInactiveTooltip = inactiveTooltip
  if (!resolvedPredicate || !resolvedActiveLabel || !resolvedInactiveLabel) {
    throw new Error('EntityBookmarkButton requires a preset or predicate and labels.')
  }
  const instanceId = useId()
  const bookmarkKey = `${entityType}:${entityId}:${resolvedPredicate}`
  const [bookmarkState, setBookmarkState] = useState<BookmarkButtonState>(() =>
    makeBookmarkState(bookmarkKey, initialActive),
  )
  const didHydrate = useDidHydrate()
  const didMountRef = useRef(false)
  const isStateCurrent = bookmarkState.key === bookmarkKey
  const isActive = isStateCurrent ? bookmarkState.isActive : (initialActive ?? false)
  const isPending = isStateCurrent ? bookmarkState.isPending : false
  const didLoadInitial = isStateCurrent ? bookmarkState.didLoadInitial : initialActive !== undefined
  const canToggle = didHydrate && didLoadInitial
  const buttonLabel = isActive ? resolvedActiveLabel : resolvedInactiveLabel
  const buttonVariant = isActive ? 'secondary' : resolvedVariant
  const Icon = iconKey ? EntityActionIcons[iconKey] : undefined
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    setBookmarkState(makeBookmarkState(bookmarkKey, initialActive))
  }, [bookmarkKey, initialActive])
  useEffect(() => {
    if (didLoadInitial) return
    let cancelled = false
    getEntityBookmarks(entityType, entityId)
      .then(response => {
        if (cancelled) return
        setBookmarkState({
          key: bookmarkKey,
          isActive: response.bookmarks[resolvedPredicate] === true,
          isPending: false,
          didLoadInitial: true,
        })
      })
      .catch(() => {
        if (cancelled) return
        setBookmarkState(state => ({ ...state, didLoadInitial: state.key === bookmarkKey }))
      })
    return () => {
      cancelled = true
    }
  }, [bookmarkKey, didLoadInitial, entityId, entityType, resolvedPredicate])
  useEffect(() => {
    let cancelFetch: (() => void) | undefined
    const unsubscribe = onBookmarkChange(entityType, entityId, (changedPredicate, sourceId) => {
      if (sourceId === instanceId) return
      if (changedPredicate !== resolvedPredicate) return
      cancelFetch?.()
      let cancelled = false
      cancelFetch = () => {
        cancelled = true
      }
      getEntityBookmarks(entityType, entityId)
        .then(response => {
          if (cancelled) return
          setBookmarkState(state =>
            state.key === bookmarkKey
              ? { ...state, isActive: response.bookmarks[resolvedPredicate] === true }
              : state,
          )
        })
        .catch(Sentry.captureException)
    })
    return () => {
      unsubscribe()
      cancelFetch?.()
    }
  }, [bookmarkKey, entityType, entityId, resolvedPredicate, instanceId])
  const handleToggle = async () => {
    if (isPending || !canToggle) return
    const next = !isActive
    const requestKey = bookmarkKey
    setBookmarkState(state =>
      state.key === requestKey ? { ...state, isActive: next, isPending: true } : state,
    )
    try {
      if (next) {
        await bookmarkEntity(entityType, entityId, resolvedPredicate)
      } else {
        await unbookmarkEntity(entityType, entityId, resolvedPredicate)
      }
      emitBookmarkChange(entityType, entityId, resolvedPredicate, instanceId)
      if (next) {
        const implicitUnfollow = IMPLICIT_UNFOLLOW[`${entityType}:${resolvedPredicate}`]
        if (implicitUnfollow) {
          emitBookmarkChange(entityType, entityId, implicitUnfollow, instanceId)
        }
      }
      onChange?.(next)
    } catch (error) {
      setBookmarkState(state => (state.key === requestKey ? { ...state, isActive: !next } : state))
      toast.error(
        isRateLimitError(error)
          ? getRateLimitMessage(error)
          : t('extracted.shared.entityBookmarkButton.failedToUpdateLabelPleaseTry_fa7fe6f1', {
              label: resolvedErrorLabel,
            }),
      )
    } finally {
      setBookmarkState(state => (state.key === requestKey ? { ...state, isPending: false } : state))
    }
  }
  const button = (
    <Button
      type='button'
      variant={buttonVariant}
      size={size}
      onClick={handleToggle}
      disabled={isPending || !canToggle}
      aria-pressed={isActive}
      aria-label={ariaLabel}
      data-pw={dataPw}
      data-active={isActive}
    >
      {Icon ? <Icon /> : null}
      {buttonLabel}
    </Button>
  )
  const stateTooltip =
    tooltip !== undefined ? tooltip : isActive ? resolvedActiveTooltip : resolvedInactiveTooltip
  const currentTooltip =
    resolvedLoadingTooltip && !canToggle ? resolvedLoadingTooltip : stateTooltip
  const tooltipTrigger =
    resolvedLoadingTooltip && !canToggle ? (
      <Button
        type='button'
        variant={buttonVariant}
        size={size}
        aria-disabled='true'
        className='cursor-not-allowed opacity-50'
        onClick={event => event.preventDefault()}
      >
        {Icon ? <Icon /> : null}
        {buttonLabel}
      </Button>
    ) : (
      button
    )
  if (currentTooltip) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{tooltipTrigger}</TooltipTrigger>
          <TooltipContent>{currentTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return button
}

function makeBookmarkState(key: string, initialActive?: boolean): BookmarkButtonState {
  return {
    key,
    isActive: initialActive ?? false,
    isPending: false,
    didLoadInitial: initialActive !== undefined,
  }
}
