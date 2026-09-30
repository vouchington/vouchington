import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchUrls,
} from '@/test-helpers/components/tags/tag-autocomplete.mock-support'
import { registerUrlMinLengthGuardCases } from '@/test-helpers/components/shared/url-min-length-guard-cases'

import { describe, vi, afterEach } from 'vitest'

import { render } from '@testing-library/react'

import { TagAutocomplete } from '../../tag-autocomplete'

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('URL min-length guard', () => {
    registerUrlMinLengthGuardCases({
      renderControl: () =>
        render(
          <TagAutocomplete
            objectType='url'
            onSelect={vi.fn<VitestLooseMock>()}
          />,
        ),
      placeholder: 'Search urls...',
      clearedEmptyText: 'No urls found.',
      mockFetch: mockFetchUrls,
      waitTimeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })
})
