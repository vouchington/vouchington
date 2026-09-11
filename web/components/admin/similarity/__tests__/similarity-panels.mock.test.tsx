import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimilarityPanels } from '../similarity-panels'

// ── Hoist mocks ────────────────────────────────────────────────────────────

const { mockFetchTopics, mockFetchPosts, mockFetchRssFeedItems } = vi.hoisted(() => ({
  mockFetchTopics: vi.fn<VitestLooseMock>(),
  mockFetchPosts: vi.fn<VitestLooseMock>(),
  mockFetchRssFeedItems: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({ fetchTopics: mockFetchTopics }))
vi.mock(import('@/lib/api/client/posts'), () => ({ fetchPosts: mockFetchPosts }))
vi.mock(import('@/lib/api/client/rss-feed-items'), () => ({
  fetchRssFeedItems: mockFetchRssFeedItems,
}))
vi.mock(import('@/lib/on-error'), () => ({ default: vi.fn<VitestLooseMock>() }))

// ── Fixtures ───────────────────────────────────────────────────────────────

const TOPIC_ID = 'topic-aaa'
const POST_ID = 'post-bbb'
const NEWS_ID = 'news-ccc'

function makeTopicsResponse() {
  return {
    results: [
      {
        __entity_type: 'topic' as const,
        id: TOPIC_ID,
        name: 'Developer Tools',
        slug: 'developer-tools',
        topic_type: 'topic',
      },
    ],
    topics: {
      [TOPIC_ID]: {
        id: TOPIC_ID,
        name: 'Developer Tools',
        slug: 'developer-tools',
        topic_type: 'topic',
      },
    },
    topics_metrics: {},
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

function makePostsResponse() {
  return {
    results: [
      {
        __entity_type: 'post' as const,
        id: POST_ID,
        ranking: 1,
        search_vector_ts: null,
        post_type: 'discussion',
      },
    ],
    posts: {
      [POST_ID]: {
        id: POST_ID,
        title: 'Dev tooling landscape',
        post_type: 'discussion',
        markdown: 'Some markdown',
        root_id: null,
      },
    },
    posts_metrics: {},
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

function makeNewsResponse() {
  return {
    results: [
      {
        __entity_type: 'rss_feed_item' as const,
        id: NEWS_ID,
        published_at: '2024-01-01T00:00:00Z',
        story_id: null,
      },
    ],
    rss_feed_items: {
      [NEWS_ID]: {
        id: NEWS_ID,
        __entity_type: 'rss_feed_item' as const,
        published_at: '2024-01-01T00:00:00Z',
        lingua_rs_detected_language: null,
        data: { link: 'https://example.com/article', title: 'Dev Tools News', guid: 'guid-1' },
        url: { id: 'url-1', url: 'https://example.com/article' },
        rss_feed: {
          __entity_type: 'rss_feed' as const,
          id: 'feed-1',
          title: 'Example Blog',
          is_discoverable: true,
          topic: { id: 't1', name: 'Tech', slug: 'tech', topic_type: 'topic' },
          feed_type: 'article' as const,
        },
        rss_feed_sources: [],
        categories: [],
      },
    },
    rss_feed_item_elections: {},
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

/** Advance fake timers and flush all pending promises in one step. */
async function advanceAndFlush(ms = 400) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SimilarityPanels', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockFetchTopics.mockResolvedValue(makeTopicsResponse())
    mockFetchPosts.mockResolvedValue(makePostsResponse())
    mockFetchRssFeedItems.mockResolvedValue(makeNewsResponse())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows hint when query is too short', () => {
    render(<SimilarityPanels query='hi' />)
    expect(screen.getByText('Enter a name to check for duplicates.')).toBeInTheDocument()
    expect(screen.queryByText('Similar topics')).not.toBeInTheDocument()
  })

  it('shows panel headings while results are loading', async () => {
    render(<SimilarityPanels query='developer tools' />)
    expect(screen.getByText('Similar topics')).toBeInTheDocument()
    expect(screen.getByText('Similar news')).toBeInTheDocument()
    expect(screen.getByText('Similar posts')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-pw="similarity-panel-loading-skeleton"]')).toHaveLength(
      3,
    )
    // Results not yet available during debounce window
    expect(screen.queryByText('Developer Tools')).not.toBeInTheDocument()
  })

  it('renders topic items after fetch completes', async () => {
    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()
    expect(screen.getByText('Developer Tools')).toBeInTheDocument()
    const link = screen.getByText('Developer Tools').closest('a')
    expect(link?.getAttribute('href')).toMatch(/developer-tools/)
  })

  it('renders news items with external URL after fetch', async () => {
    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()
    expect(screen.getByText('Dev Tools News')).toBeInTheDocument()
    const link = screen.getByText('Dev Tools News').closest('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/article')
  })

  it('renders post items after fetch completes', async () => {
    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()
    expect(screen.getByText('Dev tooling landscape')).toBeInTheDocument()
  })

  it('topics fetcher receives semantic_search_query only — not q', async () => {
    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()

    expect(mockFetchTopics).toHaveBeenCalled()
    const [topicsCallArgs] = mockFetchTopics.mock.calls[0] as [Record<string, unknown>]
    expect(topicsCallArgs).toHaveProperty('semantic_search_query', 'developer tools')
    expect(topicsCallArgs).not.toHaveProperty('q')
  })

  it('posts fetcher receives semantic_search_query only — not q', async () => {
    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()

    expect(mockFetchPosts).toHaveBeenCalled()
    const [postsCallArgs] = mockFetchPosts.mock.calls[0] as [Record<string, unknown>]
    expect(postsCallArgs).toHaveProperty('semantic_search_query', 'developer tools')
    expect(postsCallArgs).not.toHaveProperty('q')
  })

  it('news fetcher receives semantic_search_query only — not q', async () => {
    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()

    expect(mockFetchRssFeedItems).toHaveBeenCalled()
    const [newsCallArgs] = mockFetchRssFeedItems.mock.calls[0] as [Record<string, unknown>]
    expect(newsCallArgs).toHaveProperty('semantic_search_query', 'developer tools')
    expect(newsCallArgs).not.toHaveProperty('q')
  })

  it('shows empty hint text when topics response has no results', async () => {
    mockFetchTopics.mockResolvedValue({
      results: [],
      topics: {},
      topics_metrics: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(<SimilarityPanels query='developer tools' />)
    await advanceAndFlush()
    expect(screen.getByText('No similar topics found.')).toBeInTheDocument()
  })
})
