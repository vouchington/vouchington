/* eslint-disable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
'use client'
import { useEffect, useId, useRef, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { bookmarkEntity, getEntityBookmarks, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { emitBookmarkChange, onBookmarkChange } from '@/hooks/use-bookmark-invalidation'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { toast } from 'sonner'
import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'
import { useTranslations } from '@/lib/i18n/use-translations'

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
export function useEntityBookmarkState({
  entityType,
  entityId,
  resolvedPredicate,
  initialActive,
  resolvedErrorLabel,
  onChange,
}: {
  entityType: string
  entityId: string
  resolvedPredicate: string
  initialActive?: boolean
  resolvedErrorLabel: string
  onChange?: (isActive: boolean) => void
}) {
  const t = useTranslations()
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
    } catch (err) {
      setBookmarkState(state => (state.key === requestKey ? { ...state, isActive: !next } : state))
      toast.error(
        isRateLimitError(err)
          ? getRateLimitMessage(err)
          : t('extracted.shared.entityBookmarkButton.failedToUpdateLabelPleaseTry_fa7fe6f1', {
              label: resolvedErrorLabel,
            }),
      )
    } finally {
      setBookmarkState(state => (state.key === requestKey ? { ...state, isPending: false } : state))
    }
  }
  return { isActive, isPending, canToggle, handleToggle }
}

function makeBookmarkState(key: string, initialActive?: boolean): BookmarkButtonState {
  return {
    key,
    isActive: initialActive ?? false,
    isPending: false,
    didLoadInitial: initialActive !== undefined,
  }
}
