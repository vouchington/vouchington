'use client'

/* oxlint-disable react-you-might-not-need-an-effect/no-event-handler -- active queue state is derived during render from current items plus a keyboard-managed index; the rule false-positives on this lookup */

import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { isInputTarget } from '@/lib/keyboard-shortcuts'

export interface ModerationQueueHotkeyItem {
  key: string
  tab?: ModerationQueueTab
  onApprove?: () => void
  onDismiss?: () => void
  onRemove?: () => void
  onReview?: () => void
}

export type ModerationQueueTab = 'reports' | 'posts' | 'escalated'

interface UseModerationQueueHotkeysOptions {
  disabled?: boolean
  fallbackTab?: ModerationQueueTab
  items: ModerationQueueHotkeyItem[]
  initialTab?: ModerationQueueTab
  initialTabIsExplicit?: boolean
  onSelectionToggle: (key: string) => void
}

export function useModerationQueueHotkeys({
  disabled = false,
  fallbackTab,
  items,
  initialTab = 'reports',
  initialTabIsExplicit = false,
  onSelectionToggle,
}: UseModerationQueueHotkeysOptions) {
  const [activeIndexOverride, setActiveIndexOverride] = useState<number | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [keyboardTabOverride, setKeyboardTabOverride] = useState<ModerationQueueTab | null>(null)
  const [selectedTabOverride, setSelectedTabOverride] = useState<ModerationQueueTab | null>(null)
  const hasTabbedItems = items.some(item => item.tab !== undefined)
  const populatedFallbackTab =
    fallbackTab ??
    (items.some(item => item.tab === initialTab) ? initialTab : (items[0]?.tab ?? initialTab))
  const populatedKeyboardTab =
    keyboardTabOverride && items.some(item => item.tab === keyboardTabOverride)
      ? keyboardTabOverride
      : null
  const activeTab =
    selectedTabOverride ??
    populatedKeyboardTab ??
    (initialTabIsExplicit ? initialTab : populatedFallbackTab)
  const firstIndexInActiveTab = items.findIndex(item => item.tab === activeTab)
  const defaultActiveIndex = hasTabbedItems ? firstIndexInActiveTab : 0
  const overrideItem = activeIndexOverride === null ? undefined : items[activeIndexOverride]
  const requestedActiveIndex =
    !hasTabbedItems || overrideItem?.tab === activeTab
      ? (activeIndexOverride ?? defaultActiveIndex)
      : defaultActiveIndex
  const activeIndex =
    requestedActiveIndex < 0 ? -1 : Math.min(requestedActiveIndex, items.length - 1)
  const activeKey = activeIndex >= 0 ? (items[activeIndex]?.key ?? null) : null

  const selectTab = useCallback(
    (tab: ModerationQueueTab) => {
      setSelectedTabOverride(tab)
      setKeyboardTabOverride(null)
      const firstIndex = items.findIndex(item => item.tab === tab)
      setActiveIndexOverride(firstIndex === -1 ? null : firstIndex)
    },
    [items],
  )

  const setActiveKey = useCallback(
    (key: string | null) => {
      if (!key) {
        setActiveIndexOverride(null)
        return
      }

      const index = items.findIndex(item => item.key === key)
      if (index !== -1) setActiveIndexOverride(index)
    },
    [items],
  )

  const scrollActiveIntoView = useEffectEvent((key: string) => {
    const item = document.querySelector<HTMLElement>(`[data-moderation-queue-key="${key}"]`)
    item?.scrollIntoView?.({ block: 'nearest' })
    item?.focus({ preventScroll: true })
  })

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isInputTarget(event)) return

    if (event.key === '?' && items.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      setHelpOpen(true)
      return
    }

    if (disabled || event.repeat || items.length === 0) return

    const key = event.key.toLowerCase()
    const direction = { j: 1, k: -1 }[key]

    if (direction !== undefined) {
      event.preventDefault()
      const nextIndex = Math.max(0, Math.min(activeIndex + direction, items.length - 1))
      const nextItem = items[nextIndex]!
      setActiveIndexOverride(nextIndex)
      if (nextItem.tab) setKeyboardTabOverride(nextItem.tab)
      scrollActiveIntoView(nextItem.key)
      return
    }

    const activeItem = items[activeIndex]
    if (!activeItem) return

    const action = {
      a: activeItem.onApprove,
      d: activeItem.onDismiss,
      r: activeItem.onRemove ?? activeItem.onReview,
      x: () => onSelectionToggle(activeItem.key),
    }[key]
    if (!action) return

    event.preventDefault()
    action()
  })

  useEffect(() => {
    if (!activeKey || document.activeElement !== document.body) return

    const item = document.querySelector<HTMLElement>(`[data-moderation-queue-key="${activeKey}"]`)
    item?.focus({ preventScroll: true })
  }, [activeKey])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  return { activeKey, activeTab, helpOpen, selectTab, setActiveKey, setHelpOpen }
}
