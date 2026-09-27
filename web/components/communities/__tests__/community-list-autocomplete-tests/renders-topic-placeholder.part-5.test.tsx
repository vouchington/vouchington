import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchHostnames,
} from '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommunityListAutocomplete } from '../../community-list-autocomplete'

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('searches domains and shows hostname', async () => {
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

    render(
      <CommunityListAutocomplete
        itemType='url_hostname'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search domains...'), {
      target: { value: 'points' },
    })

    await waitFor(() => expect(screen.getByText('thepointsguy.com')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })
})
