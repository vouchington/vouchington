import { act, fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useModerationQueueHotkeys } from './use-moderation-queue-hotkeys'

const onSelectionToggle = () => vi.fn<(key: string) => void>()

describe('useModerationQueueHotkeys', () => {
  it('rebases the active item when a tab is selected manually', () => {
    const reviewEscalated = vi.fn<() => void>()
    const { result } = renderHook(() =>
      useModerationQueueHotkeys({
        initialTab: 'reports',
        items: [
          { key: 'report:pending', tab: 'reports' },
          { key: 'report:escalated', tab: 'escalated', onReview: reviewEscalated },
          { key: 'post:pending', tab: 'posts' },
        ],
        onSelectionToggle: onSelectionToggle(),
      }),
    )

    fireEvent.keyDown(window, { key: 'j' })
    fireEvent.keyDown(window, { key: 'j' })
    expect(result.current.activeKey).toBe('post:pending')

    act(() => result.current.selectTab('escalated'))
    expect(result.current.activeKey).toBe('report:escalated')

    fireEvent.keyDown(window, { key: 'r' })
    expect(reviewEscalated).toHaveBeenCalledOnce()
  })

  it('keeps an explicitly selected empty tab active without targeting a hidden item', () => {
    const { result } = renderHook(() =>
      useModerationQueueHotkeys({
        items: [{ key: 'report:pending', tab: 'reports' }],
        onSelectionToggle: onSelectionToggle(),
      }),
    )

    act(() => result.current.selectTab('posts'))

    expect(result.current.activeTab).toBe('posts')
    expect(result.current.activeKey).toBeNull()
  })

  it('clamps an un-tabbed active index after items shrink', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useModerationQueueHotkeys({ items, onSelectionToggle: onSelectionToggle() }),
      {
        initialProps: {
          items: [{ key: 'first' }, { key: 'second' }, { key: 'third' }],
        },
      },
    )

    fireEvent.keyDown(window, { key: 'j' })
    fireEvent.keyDown(window, { key: 'j' })
    expect(result.current.activeKey).toBe('third')

    rerender({ items: [{ key: 'first' }] })
    expect(result.current.activeKey).toBe('first')
  })

  it('keeps an explicitly requested empty initial tab active', () => {
    const { result } = renderHook(() =>
      useModerationQueueHotkeys({
        initialTab: 'posts',
        initialTabIsExplicit: true,
        items: [{ key: 'report:pending', tab: 'reports' }],
        onSelectionToggle: onSelectionToggle(),
      }),
    )

    expect(result.current.activeTab).toBe('posts')
    expect(result.current.activeKey).toBeNull()
  })

  it('falls back after a keyboard-navigated tab empties', () => {
    const removePost = vi.fn<() => void>()
    const { result, rerender } = renderHook(
      ({ items }) => useModerationQueueHotkeys({ items, onSelectionToggle: onSelectionToggle() }),
      {
        initialProps: {
          items: [
            { key: 'report:first', tab: 'reports' as const },
            { key: 'report:second', tab: 'reports' as const },
            { key: 'post:pending', tab: 'posts' as const, onRemove: removePost },
          ],
        },
      },
    )

    fireEvent.keyDown(window, { key: 'j' })
    expect(result.current.activeKey).toBe('report:second')

    rerender({ items: [{ key: 'post:pending', tab: 'posts', onRemove: removePost }] })
    expect(result.current.activeTab).toBe('posts')
    expect(result.current.activeKey).toBe('post:pending')

    fireEvent.keyDown(window, { key: 'r' })
    expect(removePost).toHaveBeenCalledOnce()
  })
})
