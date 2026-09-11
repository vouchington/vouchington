import { useEffect, useState, type ReactNode } from 'react'

import { fireEvent, render, screen } from '@testing-library/react'

import { describe, expect, it, vi } from 'vitest'

import { CuratedAsideEntityAutocomplete } from '../curated-aside-entity-autocomplete'

import { fetchCommunities } from '@/lib/api/client/community-search'
import { searchRssFeedsClient } from '@/lib/api/client/rss-feeds'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import type { ViewRssFeed } from '@/types/rss-feeds'

type AutocompleteItem = {
  id: string
  label: string
  subtitle: string
}

vi.mock(
  import('@/components/shared/entity-autocomplete'),
  () =>
    ({
      EntityAutocomplete: ({
        onSelect,
        renderItem,
        search,
      }: {
        onSelect: (item: AutocompleteItem, helpers: { setQuery: (query: string) => void }) => void
        renderItem: (item: AutocompleteItem) => ReactNode
        search: (query: string, signal: AbortSignal) => Promise<AutocompleteItem[]>
      }) => {
        const [items, setItems] = useState<AutocompleteItem[]>([])

        useEffect(() => {
          const controller = new AbortController()
          void search('rewards', controller.signal).then(setItems)
          return () => controller.abort()
        }, [search])

        return (
          <div>
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => onSelect(item, { setQuery: vi.fn<(query: string) => void>() })}
                type='button'
              >
                {renderItem(item)}
              </button>
            ))}
          </div>
        )
      },
    }) as unknown as typeof import('@/components/shared/entity-autocomplete'),
)

vi.mock(import('@/lib/api/client/community-search'), () => ({
  fetchCommunities: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/rss-feeds'), () => ({
  searchRssFeedsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: vi.fn<VitestLooseMock>(),
}))

const mockFetchCommunities = vi.mocked(fetchCommunities)
const mockSearchRssFeedsClient = vi.mocked(searchRssFeedsClient)

describe('CuratedAsideEntityAutocomplete edge cases', () => {
  it('uses the RSS URL as the source label when a feed is untitled', async () => {
    const onSelect = vi.fn<VitestLooseMock>()
    mockSearchRssFeedsClient.mockResolvedValue([
      makeFeed({
        title: null,
        rss_feed_url: { id: 'url-untitled', url: 'https://untitled.example.test/feed.xml' },
      } as unknown as Partial<ViewRssFeed>),
    ])

    render(
      <CuratedAsideEntityAutocomplete
        asideType='source'
        onSelect={onSelect}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /untitled.example.test/ }))

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'https://untitled.example.test/feed.xml',
        type: 'source',
      }),
    )
  })

  it('does not offer private or archived communities', async () => {
    mockFetchCommunities.mockResolvedValue({
      communities: {
        archived: {
          archived_at: '2024-01-02T00:00:00Z',
          id: 'archived',
          name: 'Archived Rewards Community',
          slug: 'archived-rewards-community',
          visibility: 'public',
        },
        private: {
          id: 'private',
          name: 'Private Rewards Community',
          slug: 'private-rewards-community',
          visibility: 'private',
        },
        public: {
          id: 'public',
          name: 'Rewards Community',
          slug: 'rewards-community',
          visibility: 'public',
        },
      },
      community_metrics: {},
      page_info: { has_next_page: false, has_previous_page: false },
      results: [
        { __entity_type: 'community', id: 'private' },
        { __entity_type: 'community', id: 'archived' },
        { __entity_type: 'community', id: 'public' },
      ],
      users: {},
    } as unknown as CommunitiesSearchResponseBody)

    render(
      <CuratedAsideEntityAutocomplete
        asideType='community'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )

    await screen.findByRole('button', { name: /Rewards Community/ })

    expect(mockFetchCommunities).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
    expect(screen.queryByRole('button', { name: /Private Rewards Community/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Archived Rewards Community/ })).toBeNull()
  })
})

function makeFeed(overrides: Partial<ViewRssFeed>): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    etag: null,
    feed_type: 'article',
    home_page_url: null,
    id: 'feed-untitled',
    is_discoverable: true,
    is_enabled: true,
    last_fetched_at: null,
    last_modified_at: null,
    rss_feed_url: { id: 'url-1', url: 'https://example.test/feed.xml' },
    title: 'Feed title',
    topic: { id: 'topic-1', name: 'Rewards', slug: 'rewards' },
    ...overrides,
  } as ViewRssFeed
}
