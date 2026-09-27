import { renderEntityAutocomplete as renderSeededEntityAutocomplete } from '@/test-helpers/components/shared/entity-autocomplete.mock-support'

import { act, fireEvent, screen } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

function renderEntityAutocomplete(
  overrides: Parameters<typeof renderSeededEntityAutocomplete>[0] = {},
) {
  return renderSeededEntityAutocomplete(overrides, { seedEmptyQuery: true })
}

describe('EntityAutocomplete', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('searches on focus when minQueryLength is 0 and the query is empty', async () => {
    vi.useFakeTimers()
    const { search } = renderEntityAutocomplete({ minQueryLength: 0 })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.focus(input)
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(search).toHaveBeenCalledWith('', expect.any(AbortSignal))
    expect(screen.getByText('seed')).toBeDefined()
  })

  it('does not search on focus of an empty query by default', () => {
    const { search } = renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.focus(input)

    expect(search).not.toHaveBeenCalled()
  })

  it('keeps the popover open after select when closeOnSelect is false', async () => {
    vi.useFakeTimers()
    const { onSelect } = renderEntityAutocomplete({ closeOnSelect: false })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('card')).toBeDefined()

    fireEvent.click(screen.getByText('card'))

    expect(onSelect).toHaveBeenCalledOnce()
    // The popover (and its command-empty sibling) only renders while `open` is true; its
    // presence after select proves closeOnSelect=false did not close the popover.
    expect(screen.queryByTestId('command-empty')).not.toBeNull()
    expect(screen.getByText('card')).toBeDefined()
  })
})
