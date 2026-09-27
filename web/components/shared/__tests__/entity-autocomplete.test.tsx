import { renderEntityAutocomplete } from '@/test-helpers/components/shared/entity-autocomplete.mock-support'

import { act, fireEvent, render, screen } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { EntityAutocomplete } from '../entity-autocomplete'

function EntityAutocompleteStoryFixture() {
  return (
    <EntityAutocomplete<Item>
      search={async () => []}
      getKey={item => item.id}
      renderItem={item => item.label}
      onSelect={() => {}}
      placeholder='Search things...'
      ariaLabel='Search things'
      emptyText='No things found.'
    />
  )
}

describe('EntityAutocomplete', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('has data-pw on the outer command wrapper', () => {
    const { container } = render(<EntityAutocompleteStoryFixture />)

    expect(container.querySelector('[data-pw="entity-autocomplete"]')).not.toBeNull()
  })

  it('debounces search requests by 300ms', async () => {
    vi.useFakeTimers()
    const { search } = renderEntityAutocomplete()

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'card' },
    })
    expect(search).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(search).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(search).toHaveBeenCalledWith('card', expect.any(AbortSignal))
  })

  it('aborts an in-flight search when a new query starts', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const search = vi.fn<VitestLooseMock>((_: string, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<Item[]>(() => {})
    })

    renderEntityAutocomplete({ search })

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'first' },
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(search).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'second' },
    })

    expect(signals[0]?.aborted).toBe(true)
  })

  it('clears results and skips search for an empty query', () => {
    const { search } = renderEntityAutocomplete({ queryLabel: 'existing' })

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: '' },
    })

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByTestId('command-empty').textContent).toBe('No things found.')
  })

  it('shows min-length guidance without searching', () => {
    const { search } = renderEntityAutocomplete({
      minQueryLength: 3,
      minQueryLengthText: 'Type at least 3 characters to search.',
    })

    fireEvent.change(screen.getByPlaceholderText('Search things...'), {
      target: { value: 'ab' },
    })

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByTestId('command-empty').textContent).toBe(
      'Type at least 3 characters to search.',
    )
  })

  it('closes the dropdown on Escape', () => {
    renderEntityAutocomplete()
    const input = screen.getByPlaceholderText('Search things...')

    fireEvent.change(input, { target: { value: 'card' } })
    expect(screen.getByTestId('command-empty')).toBeDefined()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('command-empty')).toBeNull()
  })
})
