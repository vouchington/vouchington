import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchTopics,
  mockFetchUrls,
  topicResult,
} from '@/test-helpers/components/tags/tag-autocomplete.mock-support'

import { describe, it, expect, vi, afterEach } from 'vitest'

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'

import { TagAutocomplete } from '../../tag-autocomplete'

async function settleInitialQuery() {
  await act(async () => {})
}

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clears input after selection', async () => {
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
    const input = screen.getByPlaceholderText('Search topics...')
    await settleInitialQuery()
    fireEvent.change(input, { target: { value: 'chase' } })

    await waitFor(() => expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })

    fireEvent.click(screen.getByText('Chase Sapphire Reserve'))
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('closes dropdown on Escape key', async () => {
    render(
      <TagAutocomplete
        objectType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    await settleInitialQuery()
    fireEvent.change(input, { target: { value: 'chase' } })
    expect(screen.getByTestId('command-empty')).toBeDefined()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('command-empty')).toBeNull()
  })

  it('renders with url objectType placeholder', () => {
    render(
      <TagAutocomplete
        objectType='url'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search urls...')).toBeDefined()
  })

  it('searches URLs and shows results by hostname + pathname', async () => {
    mockFetchUrls.mockResolvedValueOnce({
      results: [
        {
          __entity_type: 'url',
          id: 'url-1',
          url: 'https://example.com/some/page',
          pathname: '/some/page',
          hostname: { id: 'h-1', hostname: 'example.com' },
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(
      <TagAutocomplete
        objectType='url'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    await settleInitialQuery()
    fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
      target: { value: 'example' },
    })

    await waitFor(() => expect(screen.getByText('example.com/some/page')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })
})
