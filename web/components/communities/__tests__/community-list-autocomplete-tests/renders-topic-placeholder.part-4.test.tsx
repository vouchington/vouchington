import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  baseRssFeed,
  mockFetchPosts,
  mockSearchRssFeeds,
} from '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommunityListAutocomplete } from '../../community-list-autocomplete'

const basePost = {
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

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls onSelect with feed id when feed is clicked', async () => {
    mockSearchRssFeeds.mockResolvedValueOnce([baseRssFeed])

    const handleSelect = vi.fn<VitestLooseMock>()
    render(
      <CommunityListAutocomplete
        itemType='rss_feed'
        onSelect={handleSelect}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search sources...'), {
      target: { value: 'points' },
    })
    await waitFor(() => expect(screen.getByText('The Points Guy')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
    fireEvent.click(screen.getByText('The Points Guy'))
    expect(handleSelect).toHaveBeenCalledWith('feed-1')
  })

  it('searches posts and shows results', async () => {
    mockFetchPosts.mockResolvedValueOnce({
      posts: { 'post-1': basePost },
      results: [{ __entity_type: 'post', id: 'post-1', ranking: 1, search_vector_ts: null }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      posts_metrics: {},
    })

    render(
      <CommunityListAutocomplete
        itemType='post'
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
})
