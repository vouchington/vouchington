import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import {
  makeClusterItem,
  makeClusterResult,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import {
  makeRssFeedItemsFeedResponse,
  makeStoryMemberPageResponse,
} from '@/test-helpers/api-responses/rss-feed-items'
import { getStoryMemberPage } from '@/lib/api/client/stories'
import { useNewsItemClusters } from '@/components/news/use-news-item-clusters'
import { HackerNewsReferenceRefreshGenerationContext } from '@/components/hacker-news/hacker-news-config-context'
import type { StoryPageResponse } from '@/types/rss-feed-items'

vi.mock(import('@/lib/api/client/stories'), async importOriginal => ({
  ...(await importOriginal()),
  getStoryMemberPage: vi.fn<VitestLooseMock>(),
}))

describe('story continuation retry ownership', () => {
  beforeEach(() => vi.mocked(getStoryMemberPage).mockReset())

  it.each([false, true])(
    'retries the failed next cursor after a loaded page, refreshed first: %s',
    async refreshFirst => {
      const primary = makeClusterItem('primary', 'Primary')
      const firstPeer = makeClusterItem('peer-1', 'First peer')
      const nextPeer = makeClusterItem('peer-2', 'Next peer')
      const page = {
        ...makeRssFeedItemsFeedResponse({ rssFeedItems: [primary] }),
        results: [makeClusterResult(primary.id, 'story-1')],
        story_member_pages: {
          'story-1': {
            item_ids: [],
            page_info: { has_next_page: true, start_cursor: null, end_cursor: 'preview' },
          },
        },
      }
      const continuation = makeStoryMemberPageResponse({
        item_ids: [firstPeer.id],
        rss_feed_items: { [firstPeer.id]: firstPeer },
        page_info: { has_next_page: true, start_cursor: 'preview', end_cursor: 'failed-next' },
      })
      let generation = 0
      const wrapper = ({ children }: { children: ReactNode }) => (
        <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
          {children}
        </HackerNewsReferenceRefreshGenerationContext.Provider>
      )
      const { result, rerender } = renderHook(() => useNewsItemClusters(page, '', {}), { wrapper })
      vi.mocked(getStoryMemberPage).mockResolvedValueOnce(continuation)
      await act(async () => result.current.handleLoadStoryMore('story-1'))
      if (refreshFirst) {
        vi.mocked(getStoryMemberPage).mockResolvedValueOnce(continuation)
        generation = 1
        await act(async () => rerender())
      }
      vi.mocked(getStoryMemberPage).mockRejectedValueOnce(new Error('next page failed'))
      await act(async () => result.current.handleLoadStoryMore('story-1'))
      vi.mocked(getStoryMemberPage).mockResolvedValueOnce(
        makeStoryMemberPageResponse({
          item_ids: [nextPeer.id],
          rss_feed_items: { [nextPeer.id]: nextPeer },
        }),
      )
      await act(async () => result.current.handleLoadStoryMore('story-1'))
      expect(getStoryMemberPage).toHaveBeenLastCalledWith('story-1', {
        after: 'failed-next',
        excludeItemId: primary.id,
      })
      expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([
        firstPeer.id,
        nextPeer.id,
      ])
      expect(result.current.visibleClusters[0]?.storyLoadError).toBe(false)
    },
  )

  it('retries an acknowledged first-page replay that failed before any continuation existed', async () => {
    const primary = makeClusterItem('primary', 'Primary')
    const peer = makeClusterItem('peer', 'Peer')
    const page = {
      ...makeRssFeedItemsFeedResponse({ rssFeedItems: [primary] }),
      results: [makeClusterResult(primary.id, 'story-1')],
      story_member_pages: {
        'story-1': {
          item_ids: [],
          page_info: { has_next_page: true, start_cursor: null, end_cursor: 'preview' },
        },
      },
    }
    let generation = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    let resolveOld!: (value: StoryPageResponse) => void
    const old = new Promise<StoryPageResponse>(resolve => {
      resolveOld = resolve
    })
    vi.mocked(getStoryMemberPage)
      .mockReturnValueOnce(old)
      .mockRejectedValueOnce(new Error('replay failed'))
    const { result, rerender } = renderHook(() => useNewsItemClusters(page, '', {}), { wrapper })
    act(() => {
      void result.current.handleLoadStoryMore('story-1')
    })
    generation = 1
    await act(async () => rerender())
    expect(result.current.visibleClusters[0]?.storyLoadError).toBe(true)
    const recovered = makeStoryMemberPageResponse({
      item_ids: [peer.id],
      rss_feed_items: { [peer.id]: peer },
    })
    vi.mocked(getStoryMemberPage).mockResolvedValueOnce(recovered)
    await act(async () => result.current.handleLoadStoryMore('story-1'))
    expect(getStoryMemberPage).toHaveBeenLastCalledWith('story-1', {
      after: 'preview',
      excludeItemId: primary.id,
    })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([peer.id])
    await act(async () => {
      resolveOld(makeStoryMemberPageResponse())
      await old
    })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([peer.id])
  })
})
