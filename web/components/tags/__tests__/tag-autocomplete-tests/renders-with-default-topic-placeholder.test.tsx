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

  it('renders with default topic placeholder', () => {
    render(
      <TagAutocomplete
        objectType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search topics...')).toBeDefined()
  })

  it('renders with custom placeholder', () => {
    render(
      <TagAutocomplete
        objectType='post'
        placeholder='Find a post'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Find a post')).toBeDefined()
  })

  it('shows empty state when no results for topic search', () => {
    render(
      <TagAutocomplete
        objectType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    fireEvent.change(input, { target: { value: 'chase' } })
    expect(screen.getByTestId('command-empty')).toBeDefined()
  })

  it('searches topics and shows results', async () => {
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

    render(
      <TagAutocomplete
        objectType='topic'
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
