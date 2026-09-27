import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchUrls,
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

  it('calls onSelect with url id when url is clicked', async () => {
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

    const handleSelect = vi.fn<VitestLooseMock>()
    render(
      <TagAutocomplete
        objectType='url'
        onSelect={handleSelect}
      />,
    )
    await settleInitialQuery()
    fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
      target: { value: 'example' },
    })

    await waitFor(() => expect(screen.getByText('example.com/some/page')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })

    fireEvent.click(screen.getByText('example.com/some/page'))
    expect(handleSelect).toHaveBeenCalledWith('url-1')
  })

  it('disables input when disabled prop is true', () => {
    render(
      <TagAutocomplete
        objectType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
        disabled
      />,
    )
    // The CommandInput mock renders an <input> with the disabled prop
    const input = screen.getByPlaceholderText('Search topics...')
    expect((input as HTMLInputElement).disabled).toBe(true)
  })
})
