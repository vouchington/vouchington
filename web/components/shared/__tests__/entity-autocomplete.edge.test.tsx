import {
  mockPreventDefault,
  renderEntityAutocomplete,
} from '@/test-helpers/components/shared/entity-autocomplete.edge.mock-support'

import { act, fireEvent, screen } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('EntityAutocomplete Edge Cases', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('prevents default focus behavior when popover opens', async () => {
    vi.useFakeTimers()
    renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(mockPreventDefault).toHaveBeenCalled()
  })

  it('supports emptyText as a function', () => {
    const emptyTextFn = vi.fn<(query: string) => string>().mockReturnValue('Nothing matches query')
    renderEntityAutocomplete({
      emptyText: emptyTextFn,
    })

    const input = screen.getByPlaceholderText('Search things...')
    fireEvent.change(input, { target: { value: 'abc' } })

    expect(screen.getByTestId('command-empty').textContent).toBe('Nothing matches query')
    expect(emptyTextFn).toHaveBeenCalledWith('abc')
  })

  it('ignores successful search result when signal is aborted', async () => {
    vi.useFakeTimers()
    let resolveFirstSearch!: (results: Item[]) => void
    const search = vi.fn<VitestLooseMock>()
    search.mockImplementationOnce(
      () =>
        new Promise<Item[]>(resolve => {
          resolveFirstSearch = resolve
        }),
    )
    search.mockResolvedValueOnce([{ id: 'second', label: 'second' }])

    renderEntityAutocomplete({ search })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'first' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    fireEvent.change(input, { target: { value: 'second' } })

    await act(async () => {
      resolveFirstSearch([{ id: 'first', label: 'first' }])
    })

    expect(screen.queryByText('first')).toBeNull()
  })

  it('handles focus when query is truthy or empty, and ignores non-Escape keys on keydown', () => {
    renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'card' } })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByRole('list')).toBeInTheDocument()
  })
})
