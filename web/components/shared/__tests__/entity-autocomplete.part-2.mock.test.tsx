import { act, fireEvent, render, screen } from '@testing-library/react'

import { createContext, use } from 'react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { EntityAutocomplete } from '../entity-autocomplete'

vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const open = use(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({
        children,
        shouldFilter: _shouldFilter,
        ...props
      }: {
        children: React.ReactNode
        shouldFilter?: boolean
        [key: string]: unknown
      }) => <div {...props}>{children}</div>,
      CommandInput: ({
        placeholder,
        value,
        onValueChange,
        onFocus,
        onKeyDown,
        disabled,
        id,
        'aria-label': ariaLabel,
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
        disabled?: boolean
        id?: string
        'aria-label'?: string
      }) => (
        <input
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          id={id}
          aria-label={ariaLabel}
          onChange={e => onValueChange?.(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />
      ),
      CommandList: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
      CommandEmpty: ({ children }: { children: React.ReactNode }) => (
        <li data-testid='command-empty'>{children}</li>
      ),
      CommandItem: ({
        children,
        onSelect,
        value,
      }: {
        children: React.ReactNode
        onSelect?: () => void
        value?: string
      }) => (
        <li data-value={value}>
          <button
            type='button'
            onClick={onSelect}
          >
            {children}
          </button>
        </li>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

interface Item {
  id: string
  label: string
}

function renderEntityAutocomplete(
  overrides: Partial<React.ComponentProps<typeof EntityAutocomplete<Item>>> = {},
) {
  const search = vi.fn<VitestLooseMock>(async (query: string): Promise<Item[]> => [
    { id: query, label: query },
  ])
  const onSelect = vi.fn<VitestLooseMock>(
    (item: Item, { setQuery }: { setQuery: (query: string) => void }) => {
      setQuery(item.label)
    },
  )

  render(
    <EntityAutocomplete
      search={search}
      getKey={(item: Item) => item.id}
      renderItem={(item: Item) => item.label}
      onSelect={onSelect}
      placeholder='Search things...'
      ariaLabel='Search things'
      emptyText='No things found.'
      {...overrides}
    />,
  )

  return { search, onSelect }
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
