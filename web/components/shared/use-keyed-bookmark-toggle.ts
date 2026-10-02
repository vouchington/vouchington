'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { bookmarkEntity, unbookmarkEntity } from '@/lib/api/client/bookmarks'
import { toast } from 'sonner'
import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'

type KeyedBookmarkPredicate = 'hide' | 'save'

interface KeyedBookmarkToggleInput {
  entityType: string
  entityId: string
  predicate: KeyedBookmarkPredicate
  initialActive?: boolean
  active?: boolean
  onActiveChange?: (active: boolean) => void
  pending?: boolean
  onPendingChange?: (pending: boolean) => void
  failureMessage: string
  onActivated?: (entityId: string) => void
}

export function useKeyedBookmarkToggle({
  entityType,
  entityId,
  predicate,
  initialActive = false,
  active,
  onActiveChange,
  pending,
  onPendingChange,
  failureMessage,
  onActivated,
}: KeyedBookmarkToggleInput) {
  const resetKey = `${entityType}:${entityId}:${initialActive}`
  const [activeState, setActiveState] = useState({ key: resetKey, value: initialActive })
  const [pendingState, setPendingState] = useState({ key: resetKey, value: false })
  const isControlled = active !== undefined
  const isActive = active ?? (activeState.key === resetKey ? activeState.value : initialActive)
  const isPendingControlled = pending !== undefined
  const isPending = pending ?? (pendingState.key === resetKey && pendingState.value)
  const renderedResetKeyRef = useRef(resetKey)
  const activeRequestRef = useRef<{ resetKey: string; token: symbol } | null>(null)

  useLayoutEffect(() => {
    renderedResetKeyRef.current = resetKey
  }, [resetKey])

  const setActive = (next: boolean) => {
    if (!isControlled) setActiveState({ key: resetKey, value: next })
    onActiveChange?.(next)
  }

  const setPending = (next: boolean) => {
    if (!isPendingControlled) setPendingState({ key: resetKey, value: next })
    onPendingChange?.(next)
  }

  const handleToggle = async () => {
    if (isPending) return
    const next = !isActive
    const request = Symbol(`${predicate} request`)
    activeRequestRef.current = { resetKey, token: request }
    const ownsRequest = () =>
      activeRequestRef.current?.token === request &&
      activeRequestRef.current.resetKey === resetKey &&
      renderedResetKeyRef.current === resetKey
    setActive(next)
    setPending(true)
    try {
      if (next) {
        await bookmarkEntity(entityType, entityId, predicate)
        if (ownsRequest()) onActivated?.(entityId)
      } else {
        await unbookmarkEntity(entityType, entityId, predicate)
      }
    } catch (err) {
      if (ownsRequest()) {
        setActive(!next)
        if (isRateLimitError(err)) {
          /* c8 ignore next -- rate-limit branch requires injecting a rate-limit error */
          toast.error(getRateLimitMessage(err))
        } else {
          toast.error(failureMessage)
        }
      }
    } finally {
      if (ownsRequest()) {
        setPending(false)
      }
    }
  }

  return { handleToggle, isActive, isPending }
}
