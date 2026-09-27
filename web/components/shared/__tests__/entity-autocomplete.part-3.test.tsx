import { renderEntityAutocomplete } from '@/test-helpers/components/shared/entity-autocomplete.mock-support'

import { act, fireEvent, screen } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('EntityAutocomplete', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders caller-provided data-pw hooks', () => {
    const { container } = renderEntityAutocomplete({
      dataPw: {
        input: 'entity-autocomplete-input',
        item: 'entity-autocomplete-item',
      },
    })

    expect(container.querySelector('[data-pw="entity-autocomplete-input"]')).not.toBeNull()
  })

  it('ignores abort errors', async () => {
    vi.useFakeTimers()
    const onSearchError = vi.fn<VitestLooseMock>()
    const search = vi.fn<VitestLooseMock>(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })

    renderEntityAutocomplete({ search, onSearchError })

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'card' },
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(onSearchError).not.toHaveBeenCalled()
  })

  it('forwards input attributes and command item values', async () => {
    vi.useFakeTimers()
    renderEntityAutocomplete({
      id: 'thing-search',
      disabled: true,
      getItemValue: item => `value:${item.id}`,
    })
    const input = screen.getByPlaceholderText('Search things...')

    expect(input).toHaveAttribute('id', 'thing-search')
    expect(input).toBeDisabled()

    renderEntityAutocomplete({ getItemValue: item => `value:${item.id}` })
    const enabledInput = screen.getAllByPlaceholderText('Search things...')[1] as HTMLElement
    fireEvent.change(enabledInput, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.getByText('card').closest('li')).toHaveAttribute('data-value', 'value:card')
  })

  it('fires onQueryChange with the edited text on user input, not on programmatic select', async () => {
    vi.useFakeTimers()
    const onQueryChange = vi.fn<VitestLooseMock>()
    renderEntityAutocomplete({ onQueryChange })
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'ca' } })
    expect(onQueryChange).toHaveBeenLastCalledWith('ca')

    fireEvent.change(input, { target: { value: 'card' } })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(onQueryChange).toHaveBeenLastCalledWith('card')

    // Selecting a result updates the query via setQuery, but must NOT fire onQueryChange.
    onQueryChange.mockClear()
    fireEvent.click(screen.getByText('card'))
    expect(onQueryChange).not.toHaveBeenCalled()
  })
})
