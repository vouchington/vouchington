import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  baseTopic,
  mockFetchHostnames,
  mockFetchTopics,
  mockFetchUrls,
} from '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommunityListAutocomplete } from '../../community-list-autocomplete'

async function settleInitialQuery() {
  await act(async () => {})
}

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls onSelect with hostname id when domain is clicked', async () => {
    mockFetchHostnames.mockResolvedValueOnce({
      results: [{ __entity_type: 'hostname', id: 'h-1' }],
      hostnames: {
        'h-1': {
          __entity_type: 'hostname',
          id: 'h-1',
          hostname: 'thepointsguy.com',
          topic_id: null,
        },
      },
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const handleSelect = vi.fn<VitestLooseMock>()
    render(
      <CommunityListAutocomplete
        itemType='url_hostname'
        onSelect={handleSelect}
      />,
    )
    await settleInitialQuery()
    fireEvent.change(screen.getByPlaceholderText('Search domains...'), {
      target: { value: 'points' },
    })
    await waitFor(() => expect(screen.getByText('thepointsguy.com')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
    fireEvent.click(screen.getByText('thepointsguy.com'))
    expect(handleSelect).toHaveBeenCalledWith('h-1')
  })

  it('searches URLs and shows hostname + pathname', async () => {
    mockFetchUrls.mockResolvedValueOnce({
      results: [
        {
          __entity_type: 'url',
          id: 'url-1',
          url: 'https://thepointsguy.com/guide/best-cards',
          pathname: '/guide/best-cards',
          hostname: { id: 'h-1', hostname: 'thepointsguy.com' },
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(
      <CommunityListAutocomplete
        itemType='url'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    await settleInitialQuery()
    fireEvent.change(screen.getByPlaceholderText('Search URLs...'), {
      target: { value: 'points' },
    })

    await waitFor(
      () => expect(screen.getByText('thepointsguy.com/guide/best-cards')).toBeDefined(),
      { timeout: AUTOCOMPLETE_WAIT_TIMEOUT },
    )
  })

  it('clears input after selection', async () => {
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
      <CommunityListAutocomplete
        itemType='topic'
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

  it('disables input when disabled prop is true', () => {
    render(
      <CommunityListAutocomplete
        itemType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
        disabled
      />,
    )
    const input = screen.getByPlaceholderText('Search topics...')
    expect((input as HTMLInputElement).disabled).toBe(true)
  })
})
