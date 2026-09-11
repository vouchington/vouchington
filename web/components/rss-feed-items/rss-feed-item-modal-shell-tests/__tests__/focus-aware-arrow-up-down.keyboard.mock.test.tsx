import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { RssFeedItemModalShell } from '../../rss-feed-item-modal-shell'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setSearchParams('rss_item=item-1')
mockNav.setPathname('/news')

vi.mock(import('@/lib/rss-item-nav-context'), () => ({
  useRssItemNav: () => null,
}))

const DEFAULT_PROPS = {
  closeUrl: '/news',
  currentItemId: 'item-1',
  title: 'Item',
  previousUrl: '/news?rss_item=prev',
  nextUrl: '/news?rss_item=next',
} as const

describe('RssFeedItemModalShell focus-aware ArrowUp/Down', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-1')
    mockNav.setPathname('/news')
  })

  it('navigates to the previous item on ArrowUp', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowUp' })

    expect(mockNav.push).toHaveBeenCalledWith('/news?rss_item=prev', { scroll: false })
  })

  it('navigates to the next item on ArrowDown', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(mockNav.push).toHaveBeenCalledWith('/news?rss_item=next', { scroll: false })
  })

  it('does not navigate on ArrowUp or ArrowDown when focus is inside the scroll content', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const viewport = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
    expect(viewport).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(viewport, { key: 'ArrowUp' })
    fireEvent.keyDown(viewport, { key: 'ArrowDown' })

    expect(mockNav.push).not.toHaveBeenCalled()
  })

  it('navigates on ArrowLeft even when focus is inside the scroll content', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const viewport = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' })

    expect(mockNav.push).toHaveBeenCalledWith('/news?rss_item=prev', { scroll: false })
  })

  it('does not navigate when another handler already called preventDefault on ArrowUp/Down', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    // Simulate a widget (e.g. Radix DropdownMenu trigger) that calls preventDefault for Up/Down.
    const trigger = document.createElement('button')
    trigger.setAttribute('aria-haspopup', 'menu')
    document.body.append(trigger)
    trigger.addEventListener('keydown', e => e.preventDefault())

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })

    expect(mockNav.push).not.toHaveBeenCalled()

    document.body.removeChild(trigger)
  })

  it('does not navigate on ArrowUp or ArrowDown when focus is inside a secondary dialog', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    // Simulate a portaled secondary dialog (e.g. "Send to followers")
    const secondaryDialog = document.createElement('div')
    secondaryDialog.setAttribute('role', 'dialog')
    const button = document.createElement('button')
    secondaryDialog.append(button)
    document.body.append(secondaryDialog)

    fireEvent.keyDown(button, { key: 'ArrowUp' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })

    expect(mockNav.push).not.toHaveBeenCalled()

    document.body.removeChild(secondaryDialog)
  })
})
