import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  baseTopic,
  mockFetchTopics,
} from '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommunityListAutocomplete } from '../../community-list-autocomplete'

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no topic results', () => {
    render(
      <CommunityListAutocomplete
        itemType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search topics...'), {
      target: { value: 'chase' },
    })
    expect(screen.getByTestId('command-empty')).toBeDefined()
  })

  it('searches topics and shows results', async () => {
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

    render(
      <CommunityListAutocomplete
        itemType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search topics...'), {
      target: { value: 'chase' },
    })

    await waitFor(() => expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })
})
