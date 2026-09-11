'use client'

import { useCallback, useEffect, useEffectEvent, useRef } from 'react'
import { isInputTarget } from '@/lib/keyboard-shortcuts'
import type { TopicRecommendationDialogProps } from './topic-recommendation-dialog-types'

type NavigationProps = Pick<
  TopicRecommendationDialogProps,
  'isAdmin' | 'isSaving' | 'navigateToId' | 'onApprove' | 'onReject' | 'orderedPostIds' | 'selected'
>

export function useTopicRecommendationNavigation({
  isAdmin,
  isSaving,
  navigateToId,
  onApprove,
  onReject,
  orderedPostIds,
  selected,
}: NavigationProps) {
  const selectedId = selected?.id
  const idx = selectedId ? orderedPostIds.indexOf(selectedId) : -1
  const prevId = idx > 0 ? orderedPostIds[idx - 1] : null
  const nextId = idx >= 0 && idx < orderedPostIds.length - 1 ? orderedPostIds[idx + 1] : null

  const previousRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const pendingFocusDirectionRef = useRef<'previous' | 'next' | null>(null)

  useEffect(() => {
    const dir = pendingFocusDirectionRef.current
    if (!dir || !selectedId) return
    pendingFocusDirectionRef.current = null
    const id = requestAnimationFrame(() => focusNavigationButton(dir, previousRef, nextRef))
    return () => cancelAnimationFrame(id)
  }, [selectedId])

  const navigatePrevious = useCallback(() => {
    if (!prevId) return
    pendingFocusDirectionRef.current = 'previous'
    navigateToId(prevId)
  }, [prevId, navigateToId])

  const navigateNext = useCallback(() => {
    if (!nextId) return
    pendingFocusDirectionRef.current = 'next'
    navigateToId(nextId)
  }, [nextId, navigateToId])

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!selected) return
    const inInput = isInputTarget(event)
    if (event.key === 'ArrowLeft' && !inInput && !isSaving) {
      event.preventDefault()
      navigatePrevious()
      return
    }
    if (event.key === 'ArrowRight' && !inInput && !isSaving) {
      event.preventDefault()
      navigateNext()
      return
    }
    if (!canUseAdminShortcut(event, inInput, isAdmin, isSaving, selected)) return
    if (event.code === 'KeyA') {
      event.preventDefault()
      void onApprove(selected)
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      void onReject(selected)
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    hasPrevious: !!prevId,
    hasNext: !!nextId,
    previousRef,
    nextRef,
    handleNavigatePrevious: navigatePrevious,
    handleNavigateNext: navigateNext,
  }
}

type ButtonRef = React.RefObject<HTMLButtonElement | null>

function focusNavigationButton(
  dir: 'previous' | 'next',
  previousRef: ButtonRef,
  nextRef: ButtonRef,
) {
  if (dir === 'previous') {
    const prev = previousRef.current
    if (prev && !prev.disabled) prev.focus()
    else nextRef.current?.focus()
    return
  }
  const next = nextRef.current
  if (next && !next.disabled) next.focus()
  else previousRef.current?.focus()
}

function canUseAdminShortcut(
  event: KeyboardEvent,
  inInput: boolean,
  isAdmin: boolean,
  isSaving: boolean,
  selected: NonNullable<TopicRecommendationDialogProps['selected']>,
): boolean {
  return (
    event.altKey &&
    !event.repeat &&
    !inInput &&
    isAdmin &&
    !isSaving &&
    selected.topic_recommendation?.status === 'pending'
  )
}
