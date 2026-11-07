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
  beforeEach(() => {
    vi.mocked(getStoryMemberPage).mockReset()
  })

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

  it('keeps a page loaded for one story while the replay awaits another story', async () => {
    const primaryA = makeClusterItem('primary-a', 'Primary A')
    const primaryB = makeClusterItem('primary-b', 'Primary B')
    const peerA = makeClusterItem('peer-a', 'Peer A')
    const peerB1 = makeClusterItem('peer-b1', 'Peer B1')
    const peerB2 = makeClusterItem('peer-b2', 'Peer B2')
    const preview = (cursor: string) => ({
      item_ids: [],
      page_info: { has_next_page: true, start_cursor: null, end_cursor: cursor },
    })
    const page = {
      ...makeRssFeedItemsFeedResponse({ rssFeedItems: [primaryA, primaryB] }),
      results: [
        makeClusterResult(primaryA.id, 'story-a'),
        makeClusterResult(primaryB.id, 'story-b'),
      ],
      story_member_pages: { 'story-a': preview('a-0'), 'story-b': preview('b-0') },
    }
    const memberPage = (item: typeof peerA, endCursor: string) =>
      makeStoryMemberPageResponse({
        item_ids: [item.id],
        rss_feed_items: { [item.id]: item },
        page_info: { has_next_page: true, start_cursor: null, end_cursor: endCursor },
      })
    let holdStoryA = false
    let resolveStoryA!: (value: StoryPageResponse) => void
    const heldStoryA = new Promise<StoryPageResponse>(resolve => {
      resolveStoryA = resolve
    })
    vi.mocked(getStoryMemberPage).mockImplementation(async (...args: unknown[]) => {
      const [storyId, options] = args as [string, { after?: string }]
      if (storyId === 'story-a') return holdStoryA ? heldStoryA : memberPage(peerA, 'a-1')
      return options.after === 'b-0' ? memberPage(peerB1, 'b-1') : memberPage(peerB2, 'b-2')
    })
    let generation = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(() => useNewsItemClusters(page, '', {}), { wrapper })
    await act(async () => result.current.handleLoadStoryMore('story-a'))
    await act(async () => result.current.handleLoadStoryMore('story-b'))
    holdStoryA = true
    generation = 1
    await act(async () => rerender())
    await act(async () => result.current.handleLoadStoryMore('story-b'))
    await act(async () => {
      resolveStoryA(memberPage(peerA, 'a-1'))
      await heldStoryA
    })
    expect(result.current.visibleClusters[1]?.storyItems.map(item => item.id)).toEqual([
      peerB1.id,
      peerB2.id,
    ])
  })
})
