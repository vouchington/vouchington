import { renderEntityAutocomplete } from '@/test-helpers/components/shared/entity-autocomplete.mock-support'

import { act, fireEvent, screen } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

interface Item {
  id: string
  label: string
}

describe('EntityAutocomplete', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('selects a result and lets the caller update the query', async () => {
    vi.useFakeTimers()
    const { onSelect } = renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('card')).toBeDefined()

    fireEvent.click(screen.getByText('card'))

    expect(onSelect).toHaveBeenCalledWith(
      { id: 'card', label: 'card' },
      expect.objectContaining({ setQuery: expect.any(Function) }),
    )
    expect(input.value).toBe('card')
    expect(screen.queryByTestId('command-empty')).toBeNull()

    fireEvent.focus(input)
    expect(screen.getByText('card')).toBeDefined()
  })

  it('clears results on select when configured', async () => {
    vi.useFakeTimers()
    renderEntityAutocomplete({ clearResultsOnSelect: true })
    const input = screen.getByPlaceholderText('Search things...') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    fireEvent.click(screen.getByText('card'))
    fireEvent.focus(input)

    expect(screen.queryByText('card')).toBeNull()
    expect(screen.getByTestId('command-empty').textContent).toBe('No things found.')
  })

  it('ignores stale non-abort errors after a later query aborts the request signal', async () => {
    vi.useFakeTimers()
    const onSearchError = vi.fn<VitestLooseMock>()
    let rejectFirstSearch: ((error: Error) => void) | undefined
    const search = vi.fn<VitestLooseMock>()
    search.mockImplementationOnce(
      () =>
        new Promise<Item[]>((_, reject) => {
          rejectFirstSearch = reject
        }),
    )
    search.mockResolvedValue([{ id: 'second', label: 'second' }])

    renderEntityAutocomplete({ search, onSearchError })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    fireEvent.change(input, { target: { value: 'second' } })

    await act(async () => {
      rejectFirstSearch?.(new Error('request failed'))
    })

    expect(onSearchError).not.toHaveBeenCalled()
  })

  it('reports non-abort search errors', async () => {
    vi.useFakeTimers()
    const onSearchError = vi.fn<VitestLooseMock>()
    const search = vi.fn<VitestLooseMock>(async () => {
      throw new Error('request failed')
    })

    renderEntityAutocomplete({ search, onSearchError })

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'card' },
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onSearchError).toHaveBeenCalledOnce()
  })
})
