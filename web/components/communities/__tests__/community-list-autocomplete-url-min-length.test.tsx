import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchUrls,
} from '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { describe, expect, it, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { CommunityListAutocomplete } from '../community-list-autocomplete'

import { registerUrlMinLengthGuardCases } from '@/test-helpers/components/shared/url-min-length-guard-cases'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'

describe('CommunityListAutocomplete URL min-length guard', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  registerUrlMinLengthGuardCases({
    renderControl: () =>
      render(
        <CommunityListAutocomplete
          itemType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      ),
    placeholder: 'Search URLs...',
    clearedEmptyText: 'No URLs found.',
    mockFetch: mockFetchUrls,
    waitTimeout: AUTOCOMPLETE_WAIT_TIMEOUT,
  })

  it('labels the URL field from the item-type catalog', () => {
    expect(communityListItemTypeCatalog.url.searchLabel).toBe('URLs')
    const { container } = render(
      <CommunityListAutocomplete
        itemType='url'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(
      container.querySelector('[data-pw="community-list-autocomplete-input-url"]'),
    ).not.toBeNull()
  })
})
