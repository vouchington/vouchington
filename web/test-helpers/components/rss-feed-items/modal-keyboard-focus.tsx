import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { RssFeedItemModalShell } from '@/components/rss-feed-items/rss-feed-item-modal-shell'

const DEFAULT_PROPS = {
  closeUrl: '/news',
  currentItemId: 'item-1',
  title: 'Item',
} as const

type RssFeedItemModalKeyboardTarget = {
  currentItemId: string
  nextUrl: string
  previousUrl: string | null
}

type RssFeedItemModalKeyboardFocusOptions = {
  buttonName: RegExp
  initial: RssFeedItemModalKeyboardTarget
  key: 'ArrowLeft' | 'ArrowRight'
  next: RssFeedItemModalKeyboardTarget
}

export function focusRssFeedItemModalButtonAfterKey({
  buttonName,
  initial,
  key,
  next,
}: RssFeedItemModalKeyboardFocusOptions): HTMLElement {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame'] })

  const { rerender } = render(
    <RssFeedItemModalShell
      {...DEFAULT_PROPS}
      {...initial}
    >
      <div>content</div>
    </RssFeedItemModalShell>,
  )

  // The arrow key sets pendingFocusDirectionRef before the item id changes.
  fireEvent.keyDown(window, { key })

  // Simulate navigation completing: re-render with a new currentItemId.
  rerender(
    <RssFeedItemModalShell
      {...DEFAULT_PROPS}
      {...next}
    >
      <div>content</div>
    </RssFeedItemModalShell>,
  )

  const button = screen.getByRole('button', { name: buttonName })

  // Flush the rAF scheduled by the focus-recovery effect.
  vi.runAllTimers()
  return button
}
