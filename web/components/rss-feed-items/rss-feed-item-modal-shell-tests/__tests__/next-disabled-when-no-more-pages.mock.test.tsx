import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { RssFeedItemModalShell } from '../../rss-feed-item-modal-shell'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
mockNav.setSearchParams('rss_item=item-3')
mockNav.setPathname('/news')
const mockLoadMore = vi.fn<VitestLooseMock>()

type MockNavContext = {
  orderedItemIds: string[]
  hasNextPage: boolean
  loadingMore: boolean
  loadMore: () => void
} | null

let mockNavContext: MockNavContext = null

vi.mock(import('@/lib/rss-item-nav-context'), () => ({
  useRssItemNav: () => mockNavContext,
}))

const DEFAULT_PROPS = {
  closeUrl: '/news',
  currentItemId: 'item-3',
  title: 'Item',
} as const

describe('RssFeedItemModalShell Next button at end of list with no more pages', () => {
  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-3')
    mockNav.setPathname('/news')
    mockLoadMore.mockReset()
    mockNavContext = null
  })

  it('Next button is aria-disabled when at last item with hasNextPage=false', () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: false,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const nextButton = screen.getByRole('button', { name: /next/i })
    expect(nextButton).toHaveAttribute('aria-disabled', 'true')
  })

  it('does not call loadMore when ArrowRight is pressed with hasNextPage=false', () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: false,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockLoadMore).not.toHaveBeenCalled()
    expect(mockNav.push).not.toHaveBeenCalled()
  })

  it('Next button is NOT aria-disabled when at last item with hasNextPage=true', () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: true,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    const nextButton = screen.getByRole('button', { name: /next/i })
    expect(nextButton).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('does not call loadMore when there is no nav context', () => {
    mockNavContext = null

    render(
      <RssFeedItemModalShell
        {...DEFAULT_PROPS}
        nextUrl={null}
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockLoadMore).not.toHaveBeenCalled()
    expect(mockNav.push).not.toHaveBeenCalled()
  })
})
