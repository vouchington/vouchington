import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchTopics,
  topicResult,
} from '@/test-helpers/components/tags/tag-autocomplete.mock-support'

import { describe, it, expect, vi, afterEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { TagAutocomplete } from '../../tag-autocomplete'

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls onSelect with item id when topic is clicked', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: { 'topic-1': topicResult },
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
      <TagAutocomplete
        objectType='topic'
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
})
