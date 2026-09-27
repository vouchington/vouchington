import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchTopics,
  topicResult,
} from '@/test-helpers/components/tags/tag-autocomplete.mock-support'

import { describe, it, expect, vi, afterEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { TagAutocomplete } from '../../tag-autocomplete'

import { fetchPosts } from '@/lib/api/client/posts'

const mockFetchPosts = vi.mocked(fetchPosts)

const postResult = {
  id: 'post-1',
  title: 'Best credit card for travel',
  post_type: 'discussion' as const,
  markdown: '',
  root_id: null,
  created_by_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone' as const,
  privacy: 'public' as const,
  is_anonymous: false,

  community_id: null,

  clearance_status: 'approved' as const,
}

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('searches posts and shows results', async () => {
    mockFetchPosts.mockResolvedValueOnce({
      posts: { 'post-1': postResult },
      results: [{ __entity_type: 'post', id: 'post-1', ranking: 1, search_vector_ts: null }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      posts_metrics: {},
    })

    render(
      <TagAutocomplete
        objectType='post'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search posts...'), {
      target: { value: 'credit' },
    })

    await waitFor(() => expect(screen.getByText('Best credit card for travel')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })

  it('excludes already-selected ids from topic results', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: {
        'topic-1': topicResult,
        'topic-2': { ...topicResult, id: 'topic-2', name: 'Amex Platinum' },
      },
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
        {
          __entity_type: 'topic',
          id: 'topic-2',
          ranking: 2,
          name: 'Amex Platinum',
          slug: 'amex-platinum',
          topic_type: 'card',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics_metrics: {},
    })

    render(
      <TagAutocomplete
        objectType='topic'
        excludeIds={['topic-1']}
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search topics...'), {
      target: { value: 'card' },
    })

    await waitFor(() => expect(screen.getByText('Amex Platinum')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
    expect(screen.queryByText('Chase Sapphire Reserve')).toBeNull()
  })
})
