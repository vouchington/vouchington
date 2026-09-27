import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  baseRssFeed,
  baseTopic,
  mockFetchTopics,
  mockSearchRssFeeds,
} from '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommunityListAutocomplete } from '../../community-list-autocomplete'

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls onSelect with topic id when topic is clicked', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: { 'topic-1': baseTopic },
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics_metrics: {},
    })

    const handleSelect = vi.fn<VitestLooseMock>()
    render(
      <CommunityListAutocomplete
        itemType='topic'
        onSelect={handleSelect}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search topics...'), {
      target: { value: 'chase' },
    })
    await waitFor(() => expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
    fireEvent.click(screen.getByText('Chase Sapphire Reserve'))
    expect(handleSelect).toHaveBeenCalledWith('topic-1')
  })

  it('searches rss feeds and shows results', async () => {
    mockSearchRssFeeds.mockResolvedValueOnce([baseRssFeed])

    render(
      <CommunityListAutocomplete
        itemType='rss_feed'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search sources...'), {
      target: { value: 'points' },
    })

    await waitFor(() => expect(screen.getByText('The Points Guy')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })
})
