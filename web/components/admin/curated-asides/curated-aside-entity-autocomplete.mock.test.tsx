import { useEffect, useState, type ReactNode } from 'react'

import { fireEvent, render, screen } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CuratedAsideEntityAutocomplete } from './curated-aside-entity-autocomplete'

import { fetchCommunities } from '@/lib/api/client/community-search'
import { searchRssFeedsClient } from '@/lib/api/client/rss-feeds'
import { fetchTopics } from '@/lib/api/client/topics'
import type { CuratedAsideType } from '@/types/api-responses/curated-aside-items'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import type { ViewRssFeed } from '@/types/rss-feeds'
import type { Topic } from '@/types/topics'

type AutocompleteItem = {
  id: string
  label: string
  subtitle: string
}

interface EntityAutocompleteMockProps {
  ariaLabel: string
  dataPw?: {
    input?: string
    item?: string
  }
  disabled?: boolean
  emptyText: (query: string) => ReactNode
  minQueryLengthText: ReactNode
  onSelect: (item: AutocompleteItem, helpers: { setQuery: (query: string) => void }) => void
  placeholder: string
  renderItem: (item: AutocompleteItem) => ReactNode
  search: (query: string, signal: AbortSignal) => Promise<AutocompleteItem[]>
}

vi.mock(import('@/components/shared/entity-autocomplete'), () => {
  return {
    EntityAutocomplete: ({
      ariaLabel,
      dataPw,
      disabled,
      emptyText,
      minQueryLengthText,
      onSelect,
      placeholder,
      renderItem,
      search,
    }: EntityAutocompleteMockProps) => {
      const [items, setItems] = useState<AutocompleteItem[]>([])

      useEffect(() => {
        const controller = new AbortController()
        void search('rewards', controller.signal).then(setItems)
        return () => controller.abort()
      }, [search])

      return (
        <div>
          <input
            aria-label={ariaLabel}
            data-pw={dataPw?.input}
            disabled={disabled}
            placeholder={placeholder}
          />
          <span>{emptyText('')}</span>
          <span>{emptyText('missing')}</span>
          <span>{minQueryLengthText}</span>
          {items.map(item => (
            <button
              key={item.id}
              data-pw={dataPw?.item}
              onClick={() => onSelect(item, { setQuery: vi.fn<(query: string) => void>() })}
              type='button'
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )
    },
  } as unknown as typeof import('@/components/shared/entity-autocomplete')
})

vi.mock(import('@/lib/api/client/community-search'), () => ({
  fetchCommunities: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/rss-feeds'), () => ({
  searchRssFeedsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: vi.fn<VitestLooseMock>(),
}))

const mockFetchTopics = vi.mocked(fetchTopics)
const mockSearchRssFeedsClient = vi.mocked(searchRssFeedsClient)
const mockFetchCommunities = vi.mocked(fetchCommunities)

function makeTopic(overrides?: Partial<Topic>): Topic {
  return {
    __entity_type: 'topic',
    id: 'topic-1',
    name: 'Rewards Cards',
    slug: 'rewards-cards',
    markdown: '',
    aliases: [],
    topic_type: 'topic',
    noindex: false,
    allow_reviews: true,
    created_at: '2024-01-01T00:00:00Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'user-1', username: 'admin' },
    updated_by: { id: 'user-1', username: 'admin' },
    ...overrides,
  } as Topic
}

function makeFeed(overrides?: Partial<ViewRssFeed>): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id: 'feed-1',
    title: 'Rewards Feed',
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'article',
    rss_feed_url: { id: 'url-1', url: 'https://example.test/feed.xml' },
    home_page_url: { id: 'url-2', url: 'https://example.test' },
    topic: { id: 'topic-1', name: 'Rewards', slug: 'rewards' },
    ...overrides,
  } as ViewRssFeed
}

function makeCommunitiesResponse(): CommunitiesSearchResponseBody {
  return {
    results: [
      { __entity_type: 'community', id: 'community-1' },
      { __entity_type: 'community', id: 'missing-community' },
    ],
    page_info: { has_next_page: false, has_previous_page: false },
    communities: {
      'community-1': {
        id: 'community-1',
        name: 'Rewards Community',
        slug: 'rewards-community',
        visibility: 'public',
      },
    },
    users: {},
    community_metrics: {},
  } as unknown as CommunitiesSearchResponseBody
}

function renderAutocomplete(asideType: CuratedAsideType, onSelect = vi.fn<VitestLooseMock>()) {
  render(
    <CuratedAsideEntityAutocomplete
      asideType={asideType}
      onSelect={onSelect}
    />,
  )
  return { onSelect }
}

describe('CuratedAsideEntityAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchTopics.mockResolvedValue({
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          name: 'Rewards Cards',
          slug: 'rewards-cards',
          topic_type: 'topic',
        },
        {
          __entity_type: 'topic',
          id: 'missing-topic',
          name: 'Missing Topic',
          slug: 'missing-topic',
          topic_type: 'topic',
        },
      ],
      topics: {
        'topic-1': makeTopic(),
      },
      topics_metrics: {},
      page_info: {
        end_cursor: null,
        has_next_page: false,
        start_cursor: null,
      },
    })
    mockSearchRssFeedsClient.mockResolvedValue([
      makeFeed(),
      makeFeed({
        id: 'feed-2',
        title: 'RSS Only Feed',
        home_page_url: null,
      }),
    ])
    mockFetchCommunities.mockResolvedValue(makeCommunitiesResponse())
  })

  it('searches and selects topics with label metadata', async () => {
    const { onSelect } = renderAutocomplete('topic')

    expect(screen.getByLabelText('Search topics')).toHaveAttribute(
      'placeholder',
      'Search topics...',
    )
    expect(screen.getByText('Start typing to search.')).toBeInTheDocument()
    expect(screen.getByText('No matches found.')).toBeInTheDocument()
    expect(screen.getByText('Type at least 2 characters.')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /Rewards Cards/ }))

    expect(mockFetchTopics).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'rewards', limit: 10 }),
    )
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'topic-1',
        label: 'Rewards Cards',
        subtitle: 'rewards-cards',
        type: 'topic',
      }),
    )
  })

  it('searches sources and falls back to RSS URL subtitles', async () => {
    const { onSelect } = renderAutocomplete('source')

    expect(screen.getByLabelText('Search sources')).toHaveAttribute(
      'placeholder',
      'Search sources...',
    )
    fireEvent.click(await screen.findByRole('button', { name: /RSS Only Feed/ }))

    expect(mockSearchRssFeedsClient).toHaveBeenCalledWith('rewards', expect.any(AbortSignal))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'feed-2',
        label: 'RSS Only Feed',
        subtitle: 'https://example.test/feed.xml',
        type: 'source',
      }),
    )
  })

  it('searches communities with label metadata', async () => {
    const { onSelect } = renderAutocomplete('community')

    expect(screen.getByLabelText('Search communities')).toHaveAttribute(
      'placeholder',
      'Search communities...',
    )
    fireEvent.click(await screen.findByRole('button', { name: /Rewards Community/ }))

    expect(mockFetchCommunities).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        q: 'rewards',
      }),
    )
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'community-1',
        label: 'Rewards Community',
        subtitle: 'rewards-community',
        type: 'community',
      }),
    )
  })
})
