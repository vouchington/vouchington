import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { RssFeedItemModalShell } from '../../rss-feed-item-modal-shell'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

// RssFeedItemModalHeader/Footer call useTranslations(), which suspends via `use()` on the real
// dynamic import. This file's assertions depend on precise effect/commit timing across
// synchronous fireEvent + act()-wrapped rerender sequences, which a suspend-and-retry render pass
// disrupts. Mocking the hook (rather than wrapping every interaction in <Suspense>-aware waits)
// keeps that timing intact while still resolving keys against the real `en` catalog. See
// api-keys-manager.mock.test.tsx / language-form.mock.test.tsx for the same pattern.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

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

describe('RssFeedItemModalShell auto-load-more on Next', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    mockNav.reset()
    mockNav.setSearchParams('rss_item=item-3')
    mockNav.setPathname('/news')
    mockLoadMore.mockReset()
    mockNavContext = null
  })

  it('calls loadMore when ArrowRight is pressed at the end of the list with more pages', () => {
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

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockLoadMore).toHaveBeenCalledTimes(1)
  })

  it('navigates to the new next item once it appears after load', async () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: true,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    const { rerender } = render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockLoadMore).toHaveBeenCalledTimes(1)
    expect(mockNav.push).not.toHaveBeenCalled()

    // Simulate the list loading new items by updating the context
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3', 'item-4'],
      hasNextPage: false,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    await act(async () => {
      rerender(
        <RssFeedItemModalShell {...DEFAULT_PROPS}>
          <div>content</div>
        </RssFeedItemModalShell>,
      )
    })

    expect(mockNav.push).toHaveBeenCalledWith(expect.stringContaining('rss_item=item-4'), {
      scroll: false,
    })
  })

  it('does not call loadMore again while hasNextPage remains true (pendingAdvance held)', async () => {
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

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })

    expect(mockLoadMore).toHaveBeenCalledTimes(1)
  })

  it('clears pendingAdvance and retries loadMore after a failed load', async () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: true,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    const { rerender } = render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    // Trigger load
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockLoadMore).toHaveBeenCalledTimes(1)

    // Simulate load starting
    mockNavContext = { ...mockNavContext, loadingMore: true }
    await act(async () => {
      rerender(
        <RssFeedItemModalShell {...DEFAULT_PROPS}>
          <div>content</div>
        </RssFeedItemModalShell>,
      )
    })

    // Simulate load failing: loadingMore returns to false, no new items, hasNextPage still true
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: true,
      loadingMore: false,
      loadMore: mockLoadMore,
    }
    await act(async () => {
      rerender(
        <RssFeedItemModalShell {...DEFAULT_PROPS}>
          <div>content</div>
        </RssFeedItemModalShell>,
      )
    })

    // No navigation should have happened
    expect(mockNav.push).not.toHaveBeenCalled()

    // pendingAdvance should be cleared: a new ArrowRight should call loadMore again
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(mockLoadMore).toHaveBeenCalledTimes(2)
  })

  it('clears pendingAdvance when navigating Previous, so auto-advance does not fire after load', async () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: true,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    const { rerender } = render(
      <RssFeedItemModalShell {...DEFAULT_PROPS}>
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    // Start loading next page
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockLoadMore).toHaveBeenCalledTimes(1)

    // Navigate Previous — clears pendingAdvance
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const previousPushCall = mockNav.push.mock.calls.find(([url]) =>
      url.includes('rss_item=item-2'),
    )
    expect(previousPushCall).toBeDefined()

    // Simulate route change to item-2 plus new items arriving
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3', 'item-4'],
      hasNextPage: false,
      loadingMore: false,
      loadMore: mockLoadMore,
    }
    await act(async () => {
      rerender(
        <RssFeedItemModalShell
          {...DEFAULT_PROPS}
          currentItemId='item-2'
        >
          <div>content</div>
        </RssFeedItemModalShell>,
      )
    })

    // Auto-advance to item-4 should NOT happen; only the Previous push should have fired
    const autoAdvanceCalls = mockNav.push.mock.calls.filter(([url]) =>
      url.includes('rss_item=item-4'),
    )
    expect(autoAdvanceCalls).toHaveLength(0)
  })

  it('closes modal when item is hidden at last position with hasNextPage=true', async () => {
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

    await act(async () => {
      window.dispatchEvent(new CustomEvent('rss-item-hidden', { detail: { id: 'item-3' } }))
    })

    expect(mockLoadMore).not.toHaveBeenCalled()
    expect(mockNav.push).toHaveBeenCalledWith('/news', { scroll: false })
  })

  it('does not call loadMore when item is not in orderedItemIds but hasNextPage=true', () => {
    mockNavContext = {
      orderedItemIds: ['item-1', 'item-2', 'item-3'],
      hasNextPage: true,
      loadingMore: false,
      loadMore: mockLoadMore,
    }

    render(
      <RssFeedItemModalShell
        closeUrl='/news'
        currentItemId='item-99'
        title='Item'
      >
        <div>content</div>
      </RssFeedItemModalShell>,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(mockLoadMore).not.toHaveBeenCalled()
    expect(mockNav.push).not.toHaveBeenCalled()
  })
})
