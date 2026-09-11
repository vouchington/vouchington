import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'

import { RssFeedItemModalShell } from '../../rss-feed-item-modal-shell'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

mockNav.setSearchParams('rss_item=item-1')

mockNav.setPathname('/news')

let mockNavContext: { orderedItemIds: string[] } | null = null

vi.mock(
  import('@/lib/rss-item-nav-context'),
  () =>
    ({
      useRssItemNav: () => mockNavContext,
    }) as unknown as typeof import('@/lib/rss-item-nav-context'),
)

const DEFAULT_PROPS = {
  closeUrl: '/news',
  currentItemId: 'item-1',
  title: 'Item',
} as const

const headerDetails = <div data-testid='header-details'>source · date</div>

const actionSlot = <div data-testid='action-slot'>actions</div>

describe('RssFeedItemModalShell', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-1')
    mockNav.setPathname('/news')
    mockNavContext = null
  })

  it('focuses the Next button when ArrowRight is pressed', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const nextButton = screen.getByRole('button', { name: /next/i })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(nextButton)
  })

  it('focuses the Previous button when it is clicked', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const prevButton = screen.getByRole('button', { name: /previous/i })
    fireEvent.click(prevButton)
    expect(document.activeElement).toBe(prevButton)
  })

  it('focuses the Next button when it is clicked', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const nextButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(nextButton)
    expect(document.activeElement).toBe(nextButton)
  })

  it('renders headerDetails inside the dialog header', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        headerDetails={headerDetails}
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    expect(screen.getByTestId('header-details')).toBeDefined()
    expect(screen.getByTestId('header-details').textContent).toBe('source · date')
  })

  it('does not render headerDetails container when not provided', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    expect(screen.queryByTestId('header-details')).toBeNull()
  })

  it('renders actions slot between Previous and Next buttons', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
        actions={actionSlot}
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const actions = screen.getByTestId('action-slot')
    const prev = screen.getByRole('button', { name: /previous/i })
    const next = screen.getByRole('button', { name: /next/i })

    // actions must come after previous and before next in DOM order
    expect(prev.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actions.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('advances to the next item when rss-item-hidden fires for the current item', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    window.dispatchEvent(new window.CustomEvent('rss-item-hidden', { detail: { id: 'item-1' } }))

    expect(mockNav.push).toHaveBeenCalledWith('/news?rss_item=next', { scroll: false })
  })

  it('navigates to closeUrl when rss-item-hidden fires for the current item with no next', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl={null}
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    window.dispatchEvent(new window.CustomEvent('rss-item-hidden', { detail: { id: 'item-1' } }))

    expect(mockNav.push).toHaveBeenCalledWith('/news', { scroll: false })
  })

  it('navigates to closeUrl with scroll disabled when the dialog is closed', () => {
    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(mockNav.push).toHaveBeenCalledWith('/news', { scroll: false })
  })

  it('ignores rss-item-hidden for a different item id', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        nextUrl='/news?rss_item=next'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    window.dispatchEvent(
      new window.CustomEvent('rss-item-hidden', { detail: { id: 'other-item' } }),
    )

    expect(mockNav.push).not.toHaveBeenCalled()
  })

  it('uses a CSS grid layout for deterministic scroll area height', () => {
    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        previousUrl='/news?rss_item=prev'
        nextUrl='/news?rss_item=next'
      >
        <div data-testid='content'>article</div>
      </RssFeedItemModalShell>,
    )

    // The DialogContent element must use grid layout so the Radix ScrollArea Viewport
    // (h-full) gets a definite parent height and can scroll overflowing content.
    const dialog = document.querySelector('[role=dialog]')
    expect(dialog).not.toBeNull()
    // grid-rows-[auto_minmax(0,1fr)_auto] is applied; jsdom exposes the class
    expect(dialog?.className).toContain('grid')
  })
})
