import {
  AUTOCOMPLETE_WAIT_TIMEOUT,
  mockFetchUrls,
} from '@/test-helpers/components/tags/tag-autocomplete.mock-support'

import { describe, it, expect, vi, afterEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { TagAutocomplete } from '../../tag-autocomplete'

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('URL min-length guard', () => {
    it('does not call fetchUrls for a 1-character query', () => {
      render(
        <TagAutocomplete
          objectType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      )
      fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
        target: { value: 'h' },
      })
      expect(mockFetchUrls).not.toHaveBeenCalled()
    })

    it('does not call fetchUrls for a 2-character query', () => {
      render(
        <TagAutocomplete
          objectType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      )
      fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
        target: { value: 'ht' },
      })
      expect(mockFetchUrls).not.toHaveBeenCalled()
    })

    it('shows "Type at least 3 characters" hint for a 1-2 character query', () => {
      render(
        <TagAutocomplete
          objectType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      )
      fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
        target: { value: 'ht' },
      })
      expect(screen.getByTestId('command-empty').textContent).toContain(
        'Type at least 3 characters',
      )
    })

    it('calls fetchUrls once the query reaches 3 characters', async () => {
      render(
        <TagAutocomplete
          objectType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      )
      fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
        target: { value: 'htt' },
      })
      await waitFor(() => expect(mockFetchUrls).toHaveBeenCalledOnce(), {
        timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
      })
    })

    it('shows default empty text when query is cleared after typing', () => {
      render(
        <TagAutocomplete
          objectType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      )
      const input = screen.getByPlaceholderText('Search urls...')
      fireEvent.change(input, { target: { value: 'ht' } })
      fireEvent.change(input, { target: { value: '' } })
      // query='', open=true: ternary false branch → "No urls found."
      expect(screen.getByTestId('command-empty').textContent).toContain('No urls found.')
    })
  })
})
